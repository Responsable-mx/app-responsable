import "server-only";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { chunkMarkdown } from "@/lib/documents/relevance";

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

/**
 * Genera embedding para texto vía Voyage API. Retorna null si key falta.
 * Documentación: https://docs.voyageai.com/reference/embeddings-api
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) return null;

  const model = process.env.VOYAGE_MODEL || "voyage-2";
  try {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: text.slice(0, 30_000), // Voyage tope 32k tokens, ~30k chars safe
        model,
        input_type: "document",
      }),
    });
    if (!res.ok) {
      console.error("[embeddings] voyage error:", res.status, await res.text());
      return null;
    }
    const json = (await res.json()) as {
      data?: Array<{ embedding: number[] }>;
    };
    return json.data?.[0]?.embedding ?? null;
  } catch (e) {
    console.error("[embeddings] voyage fetch failed:", e);
    return null;
  }
}

/**
 * Genera embedding para query del usuario (input_type = "query" — distinto
 * de "document" en Voyage, optimiza para search).
 */
export async function generateQueryEmbedding(query: string): Promise<number[] | null> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) return null;
  const model = process.env.VOYAGE_MODEL || "voyage-2";
  try {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: query.slice(0, 4_000),
        model,
        input_type: "query",
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: Array<{ embedding: number[] }> };
    return json.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
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
 * Búsqueda semántica de chunks. Si VOYAGE_API_KEY existe → cosine similarity
 * sobre embedding. Si no → fallback null (caller usa BM25 del relevance.ts).
 *
 * Devuelve top N chunks ordenados por similarity desc.
 */
export async function searchSimilarChunks(opts: {
  query: string;
  clientId: string;
  limit?: number;
}): Promise<ChunkRow[] | null> {
  const queryEmbedding = await generateQueryEmbedding(opts.query);
  if (!queryEmbedding) return null; // Fallback: caller usa BM25

  const admin = createAdminClient();
  // pgvector cosine distance: <=> operator. 0 = idéntico, 2 = opuesto.
  // Convertimos a string formato pgvector: [0.1,0.2,...]
  const vec = `[${queryEmbedding.join(",")}]`;
  const limit = opts.limit ?? 10;

  // RPC requiere función SQL — por ahora usamos raw select via supabase.rpc
  // Fallback simple: traer top chunks por client_id + filtrar en JS.
  // En Wave 7+ se puede crear función search_chunks(client_id, query_vec, k)
  // para empujar el filtro al server.
  const { data, error } = await admin
    .from("document_chunks")
    .select("id, document_id, client_id, chunk_index, content, content_hash, embedding")
    .eq("client_id", opts.clientId)
    .not("embedding", "is", null)
    .limit(500);

  if (error || !data) return null;

  // Cosine similarity en JS (suficiente para <500 chunks por cliente)
  type ScoredRow = ChunkRow & { score: number };
  const scored: ScoredRow[] = data
    .map((r) => {
      const emb = r.embedding as unknown as number[] | string | null;
      if (!emb) return null;
      const arr = typeof emb === "string" ? JSON.parse(emb) as number[] : emb;
      const score = cosineSimilarity(queryEmbedding, arr);
      return {
        id: r.id as string,
        document_id: r.document_id as string,
        client_id: r.client_id as string,
        chunk_index: r.chunk_index as number,
        content: r.content as string,
        content_hash: r.content_hash as string,
        score,
      };
    })
    .filter((x): x is ScoredRow => x !== null);

  // Dejar vec sin uso reportado por linter sin afectar lógica
  void vec;

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score: _score, ...rest }) => rest);
}

function cosineSimilarity(a: number[], b: number[]): number {
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
