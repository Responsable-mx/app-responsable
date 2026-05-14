import "server-only";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { chunkMarkdown } from "@/lib/documents/relevance";
import { logAiCall } from "@/lib/ai/logging";

// ── Embeddings de chunks (Wave 7 — F prep) ──────────────────
//
// Hoy: helpers + tabla listas, embeddings = NULL.
// Mañana: VOYAGE_API_KEY en Vercel → cron pobla embeddings → swap
// retrieval BM25 por similarity vector.
//
// Punto de swap: searchSimilarChunks() devuelve top chunks; hoy stub
// que cae a BM25 si no hay embeddings; mañana usa pgvector cosine.
// ───────────────────────────────────────────────────────────

export type EmbeddingsConfig = {
  /** Modelo Voyage (voyage-2 = 1024 dims, voyage-3-lite = 512 dims, voyage-3 = 1024) */
  model: string;
  apiKey: string;
};

type VoyageResponse = {
  data?: Array<{ embedding: number[] }>;
  usage?: { total_tokens?: number };
  model?: string;
};

type VoyageRerankResponse = {
  data?: Array<{ index: number; relevance_score: number }>;
  usage?: { total_tokens?: number };
};

type VoyageMeta = { userEmail?: string; clientId?: string | null };

/** Voyage API — 1 o N inputs en una sola llamada HTTP. */
async function callVoyageRaw(
  inputs: string[],
  inputType: "document" | "query",
  meta?: VoyageMeta
): Promise<number[][] | null> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) return null;
  const model = process.env.VOYAGE_MODEL || "voyage-2";
  const cap = inputType === "document" ? 30_000 : 4_000;
  const startedAt = Date.now();
  try {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      signal: AbortSignal.timeout(30_000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        input: inputs.map((s) => s.slice(0, cap)),
        model,
        input_type: inputType,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("[embeddings] voyage error:", res.status, errText);
      void logAiCall({ userEmail: meta?.userEmail ?? "cron@embeddings", role: "embeddings", clientId: meta?.clientId ?? null, model, inputTokens: 0, outputTokens: 0, latencyMs: Date.now() - startedAt, error: `voyage ${res.status}: ${errText.slice(0, 200)}`, workflowStage: "embeddings" });
      return null;
    }
    const json = (await res.json()) as VoyageResponse;
    const tokens = json.usage?.total_tokens ?? 0;
    void logAiCall({ userEmail: meta?.userEmail ?? "cron@embeddings", role: "embeddings", clientId: meta?.clientId ?? null, model: json.model ?? model, inputTokens: tokens, outputTokens: 0, latencyMs: Date.now() - startedAt, error: null , workflowStage: "embeddings" });
    return json.data?.map((d) => d.embedding) ?? null;
  } catch (e) {
    void logAiCall({ userEmail: meta?.userEmail ?? "cron@embeddings", role: "embeddings", clientId: meta?.clientId ?? null, model, inputTokens: 0, outputTokens: 0, latencyMs: Date.now() - startedAt, error: e instanceof Error ? e.message : "Voyage fetch failed" , workflowStage: "embeddings" });
    console.error("[embeddings] voyage fetch failed:", e);
    return null;
  }
}

async function callVoyage(input: string, inputType: "document" | "query", meta?: VoyageMeta): Promise<number[] | null> {
  const results = await callVoyageRaw([input], inputType, meta);
  return results?.[0] ?? null;
}

/**
 * Genera embeddings para un lote de textos en una sola llamada Voyage.
 * Usado por el cron embed-chunks (32× menos HTTP calls vs 1-por-1).
 */
export async function generateEmbeddingsBatch(
  texts: string[],
  meta?: VoyageMeta
): Promise<(number[] | null)[]> {
  if (texts.length === 0) return [];
  const BATCH_SIZE = 32;
  const results: (number[] | null)[] = new Array(texts.length).fill(null);
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const slice = texts.slice(i, i + BATCH_SIZE);
    const embeddings = await callVoyageRaw(slice, "document", meta);
    if (embeddings) {
      embeddings.forEach((emb, j) => { results[i + j] = emb; });
    }
  }
  return results;
}

/**
 * Genera embedding para texto vía Voyage API. Retorna null si key falta.
 * Documentación: https://docs.voyageai.com/reference/embeddings-api
 */
export async function generateEmbedding(
  text: string,
  meta?: { userEmail?: string; clientId?: string | null }
): Promise<number[] | null> {
  return callVoyage(text, "document", meta);
}

/**
 * Genera embedding para query del usuario (input_type = "query" — distinto
 * de "document" en Voyage, optimiza para search).
 */
export async function generateQueryEmbedding(
  query: string,
  meta?: { userEmail?: string; clientId?: string | null }
): Promise<number[] | null> {
  return callVoyage(query, "query", meta);
}

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

export type ChunkRow = {
  id: string;
  document_id: string;
  client_id: string;
  chunk_index: number;
  content: string;
  content_hash: string;
};

/**
 * Persiste chunks de un documento en document_chunks. Idempotente vía
 * (document_id, chunk_index) unique constraint + content_hash dedupe.
 * embedding queda NULL — cron lo populará si VOYAGE_API_KEY existe.
 */
export async function persistDocumentChunks(opts: {
  documentId: string;
  clientId: string;
  markdownContent: string;
}): Promise<{ inserted: number; skipped: number }> {
  const chunks = chunkMarkdown(opts.markdownContent, { chunkSize: 1200, overlap: 150 });
  if (chunks.length === 0) return { inserted: 0, skipped: 0 };

  const admin = createAdminClient();
  const rows = chunks.map((content, i) => ({
    document_id: opts.documentId,
    client_id: opts.clientId,
    chunk_index: i,
    content: content.slice(0, 3000),
    content_hash: sha256(content),
  }));

  const { error } = await admin
    .from("document_chunks")
    .upsert(rows, { onConflict: "document_id,chunk_index", ignoreDuplicates: false });

  if (error) {
    console.error("[embeddings] persist chunks failed:", error.message);
    return { inserted: 0, skipped: rows.length };
  }
  return { inserted: rows.length, skipped: 0 };
}

/**
 * Búsqueda semántica de chunks via pgvector RPC (mig 0090).
 * Cosine similarity calculado en Postgres — 0 bytes de embeddings en la red.
 * Fallback null si VOYAGE_API_KEY falta → caller usa BM25.
 */
export async function searchSimilarChunks(opts: {
  query: string;
  clientId: string;
  limit?: number;
}): Promise<ChunkRow[] | null> {
  const queryEmbedding = await generateQueryEmbedding(opts.query, { clientId: opts.clientId });
  if (!queryEmbedding) return null;

  const admin = createAdminClient();
  const vec = `[${queryEmbedding.join(",")}]`;
  const k = opts.limit ?? 10;

  const { data, error } = await admin.rpc("match_document_chunks", {
    query_vec: vec,
    p_client_id: opts.clientId,
    k,
  });

  if (error || !data) return null;

  return (data as Array<ChunkRow & { score: number }>).map(({ score: _score, ...rest }) => rest);
}

/**
 * Reordena chunks por relevancia semántica via Voyage Rerank API (rerank-2).
 * Toma hasta 20 chunks del vector search y devuelve los topK más relevantes.
 * Fallback silencioso: si falla, retorna chunks en orden original sin interrumpir el flujo.
 */
export async function rerankChunks(opts: {
  query: string;
  chunks: string[];
  topK?: number;
  meta?: VoyageMeta;
}): Promise<string[]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey || opts.chunks.length <= 1) return opts.chunks;

  const topK = opts.topK ?? Math.min(opts.chunks.length, 8);
  const model = "rerank-2";
  const startedAt = Date.now();

  try {
    const res = await fetch("https://api.voyageai.com/v1/rerank", {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        query: opts.query.slice(0, 4_000),
        documents: opts.chunks.map((c) => c.slice(0, 3_000)),
        model,
        top_k: topK,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("[embeddings] rerank error:", res.status, errText);
      void logAiCall({
        userEmail: opts.meta?.userEmail ?? "system@rerank",
        role: "embeddings",
        clientId: opts.meta?.clientId ?? null,
        model,
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: Date.now() - startedAt,
        error: `rerank ${res.status}: ${errText.slice(0, 200)}`,
        workflowStage: "embeddings",
      });
      return opts.chunks; // fallback silencioso
    }
    const json = (await res.json()) as VoyageRerankResponse;
    const tokens = json.usage?.total_tokens ?? 0;
    void logAiCall({
      userEmail: opts.meta?.userEmail ?? "system@rerank",
      role: "embeddings",
      clientId: opts.meta?.clientId ?? null,
      model,
      inputTokens: tokens,
      outputTokens: 0,
      latencyMs: Date.now() - startedAt,
      error: null,
      workflowStage: "embeddings",
    });
    if (!json.data || json.data.length === 0) return opts.chunks;
    // Voyage devuelve items ya ordenados por relevance_score desc
    return json.data
      .map((item) => opts.chunks[item.index])
      .filter((c): c is string => typeof c === "string");
  } catch (e) {
    console.error("[embeddings] rerank failed:", e);
    void logAiCall({
      userEmail: opts.meta?.userEmail ?? "system@rerank",
      role: "embeddings",
      clientId: opts.meta?.clientId ?? null,
      model,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: Date.now() - startedAt,
      error: e instanceof Error ? e.message : "rerank fetch failed",
      workflowStage: "embeddings",
    });
    return opts.chunks; // fallback: orden original
  }
}

/** Exportada para uso en competitor.ts — evita duplicar el algoritmo. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
