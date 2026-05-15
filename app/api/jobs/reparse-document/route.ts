import { NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth";
import { parseToMarkdown, truncateMarkdown, type FileType } from "@/lib/documents/parsers";
import { chunkMarkdown } from "@/lib/documents/relevance";
import { persistDocumentChunks, generateEmbeddingsBatch } from "@/lib/documents/embeddings";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Job handler: re-parsea UN solo documento por llamada.
// Recibe mensajes de QStash — cada doc tiene su propio timeout (300s) + 2 reintentos.
// Pipeline: descarga Storage → LlamaParse visión → update DB → re-chunk → re-embed.

const BUCKET = "client-documents";
const INTER_BATCH_DELAY_MS = 200;

type JobPayload = { docId: string };

export async function POST(req: Request) {
  const body = await req.text();

  // 1. QStash signature (camino ideal)
  const signingKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (signingKey && nextSigningKey) {
    const receiver = new Receiver({ currentSigningKey: signingKey, nextSigningKey });
    const signature = req.headers.get("upstash-signature") ?? "";
    const isValid = await receiver.verify({ body, signature }).catch(() => false);
    if (isValid) {
      return parseAndProcess(body);
    }
  }

  // 2. CRON_SECRET en header X-Reparse-Secret (QStash lo reenvía como custom header)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const secret = req.headers.get("x-reparse-secret");
    if (secret === cronSecret) {
      return parseAndProcess(body);
    }
  }

  // 3. Sesión admin (llamadas manuales desde el browser)
  const user = await requireAdmin();
  if (user) {
    return parseAndProcess(body);
  }

  return NextResponse.json({ error: "No autorizado" }, { status: 401 });
}

function parseAndProcess(body: string): Promise<NextResponse> {
  let payload: JobPayload;
  try {
    payload = JSON.parse(body) as JobPayload;
  } catch {
    return Promise.resolve(NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 }));
  }
  return processDoc(payload);
}

async function processDoc({ docId }: JobPayload): Promise<NextResponse> {
  if (!docId) return NextResponse.json({ error: "docId requerido" }, { status: 400 });

  const admin = createAdminClient();

  const { data: doc, error: dbErr } = await admin
    .from("client_documents")
    .select("id, client_id, file_type, storage_path, file_name")
    .eq("id", docId)
    .maybeSingle();

  if (dbErr || !doc) {
    return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
  }

  // Virtual splits no tienen archivo real en Storage — saltar
  if ((doc.storage_path as string).includes("virtual-split-")) {
    return NextResponse.json({ ok: true, skipped: true, reason: "virtual-split" });
  }

  // Descargar archivo desde Supabase Storage
  const { data: blob, error: dlErr } = await admin.storage
    .from(BUCKET)
    .download(doc.storage_path as string);

  if (dlErr || !blob) {
    // 500 → QStash reintenta automáticamente (hasta 2 veces)
    return NextResponse.json(
      { error: `Descarga fallida: ${dlErr?.message ?? "sin datos"}` },
      { status: 500 }
    );
  }

  const buffer = Buffer.from(await blob.arrayBuffer());

  // Re-parsear con la pipeline completa: LlamaParse → Mistral OCR → pdf-parse/mammoth/jszip
  let markdown = "";
  let parseStatus: "ok" | "failed" = "ok";
  let parseError: string | null = null;
  try {
    const md = await parseToMarkdown(buffer, doc.file_type as FileType);
    markdown = truncateMarkdown(md);
    if (markdown.trim().length === 0) {
      parseStatus = "failed";
      parseError = "El parser no extrajo texto del archivo.";
      markdown = "";
    }
  } catch (e) {
    parseStatus = "failed";
    parseError = e instanceof Error ? e.message : String(e);
    markdown = "";
    console.error(`[reparse-document] parse failed for ${docId}:`, parseError);
  }

  // Re-chunking para BM25
  let chunksCache: string[] | null = null;
  let chunksComputedAt: string | null = null;
  if (parseStatus === "ok" && markdown) {
    chunksCache = chunkMarkdown(markdown, { chunkSize: 1200, overlap: 150 });
    chunksComputedAt = new Date().toISOString();
  }

  // Actualizar markdown + chunks en la fila principal
  const { error: updateErr } = await admin
    .from("client_documents")
    .update({
      markdown_content: markdown || null,
      chunks_cache: chunksCache,
      chunks_computed_at: chunksComputedAt,
      parse_status: parseStatus,
      parse_error: parseError,
      updated_at: new Date().toISOString(),
    })
    .eq("id", docId);

  if (updateErr) {
    return NextResponse.json(
      { error: `DB update failed: ${updateErr.message}` },
      { status: 500 }
    );
  }

  if (parseStatus === "failed" || !markdown) {
    return NextResponse.json({ ok: true, docId, parseStatus, parseError });
  }

  // Borrar chunks viejos (del parser anterior) e insertar nuevos
  await admin.from("document_chunks").delete().eq("document_id", docId);

  const { inserted } = await persistDocumentChunks({
    documentId: docId,
    clientId: doc.client_id as string,
    markdownContent: markdown,
  });

  // Embeddings inline — no esperar el cron para tener búsqueda semántica inmediata
  let chunksEmbedded = 0;
  let embedFailures = 0;

  if (process.env.VOYAGE_API_KEY) {
    const { data: pendingChunks } = await admin
      .from("document_chunks")
      .select("id, content")
      .eq("document_id", docId)
      .is("embedding", null);

    const chunks = pendingChunks ?? [];
    if (chunks.length > 0) {
      const BATCH_SIZE = 32;
      const texts = chunks.map((c) => c.content as string);
      const allEmbeddings: (number[] | null)[] = [];

      for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        if (i > 0) await new Promise<void>((r) => setTimeout(r, INTER_BATCH_DELAY_MS));
        const slice = await generateEmbeddingsBatch(texts.slice(i, i + BATCH_SIZE));
        allEmbeddings.push(...slice);
      }

      const embModel = process.env.VOYAGE_MODEL ?? "voyage-2";
      const embeddedAt = new Date().toISOString();

      await Promise.all(
        chunks.map(async (chunk, i) => {
          const embedding = allEmbeddings[i];
          if (!embedding) { embedFailures++; return; }
          const { error } = await admin
            .from("document_chunks")
            .update({
              embedding: embedding as unknown as string,
              embedding_model: embModel,
              embedded_at: embeddedAt,
            })
            .eq("id", chunk.id as string);
          if (error) { embedFailures++; }
          else chunksEmbedded++;
        })
      );
    }
  }

  return NextResponse.json({
    ok: true,
    docId,
    parseStatus,
    chunksInserted: inserted,
    chunksEmbedded,
    embedFailures,
  });
}
