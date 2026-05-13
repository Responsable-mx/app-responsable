import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateEmbeddingsBatch, persistDocumentChunks } from "@/lib/documents/embeddings";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Cron Wave 7: cada 6h, popula embeddings de chunks pendientes.
//
// Flujo:
// 1. Itera client_documents con parse_status=ok que NO tienen chunks aún
//    → persistDocumentChunks() inserta filas con embedding=NULL
// 2. Itera document_chunks con embedding=NULL (tope 50/ciclo, respeta Voyage rate limit)
//    → generateEmbedding() llama Voyage → UPDATE row
//
// Seguro contra duplicados: persistDocumentChunks upsert por (document_id, chunk_index).
// Idempotente: si Voyage falla a mitad, próximo ciclo retoma desde último NULL.

const BATCH_LIMIT = 50;

export async function GET(req: Request) {
  // Vercel cron envía Authorization: Bearer <CRON_SECRET>
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.VOYAGE_API_KEY) {
    return NextResponse.json(
      { ok: false, error: "VOYAGE_API_KEY no configurada" },
      { status: 500 }
    );
  }

  const admin = createAdminClient();
  const startedAt = Date.now();
  let docsChunked = 0;
  let chunksEmbedded = 0;
  let failures = 0;

  // ── Paso 1: chunkear docs que aún no tienen chunks ──
  const { data: pendingDocs } = await admin
    .from("client_documents")
    .select("id, client_id, markdown_content")
    .eq("parse_status", "ok")
    .not("markdown_content", "is", null)
    .limit(20);

  for (const doc of pendingDocs ?? []) {
    // Skip si ya tiene chunks (cheap check)
    const { count } = await admin
      .from("document_chunks")
      .select("id", { count: "exact", head: true })
      .eq("document_id", doc.id as string);
    if ((count ?? 0) > 0) continue;

    if (!doc.markdown_content) continue;
    const res = await persistDocumentChunks({
      documentId: doc.id as string,
      clientId: doc.client_id as string,
      markdownContent: doc.markdown_content as string,
    });
    if (res.inserted > 0) docsChunked++;
  }

  // ── Paso 2: embedder chunks pendientes (batch Voyage — 1 HTTP call por 32 chunks) ──
  const { data: pendingChunks } = await admin
    .from("document_chunks")
    .select("id, content")
    .is("embedding", null)
    .limit(BATCH_LIMIT);

  const chunks = pendingChunks ?? [];
  if (chunks.length > 0) {
    const texts = chunks.map((c) => c.content as string);
    const embeddings = await generateEmbeddingsBatch(texts);
    const embModel = process.env.VOYAGE_MODEL ?? "voyage-2";
    const embeddedAt = new Date().toISOString();

    await Promise.all(
      chunks.map(async (chunk, i) => {
        const embedding = embeddings[i];
        if (!embedding) { failures++; return; }
        const { error } = await admin
          .from("document_chunks")
          .update({ embedding: embedding as unknown as string, embedding_model: embModel, embedded_at: embeddedAt })
          .eq("id", chunk.id as string);
        if (error) { failures++; console.error("[cron embed-chunks] update failed:", error.message); }
        else chunksEmbedded++;
      })
    );
  }

  const latencyMs = Date.now() - startedAt;
  return NextResponse.json({
    ok: true,
    docs_chunked: docsChunked,
    chunks_embedded: chunksEmbedded,
    failures,
    latency_ms: latencyMs,
  });
}
