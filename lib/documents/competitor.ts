import "server-only";
import { uploadAndParseDocument } from "@/lib/documents/queries";
import { isPublicHttpUrl } from "@/lib/documents/ssrf";
import { createAdminClient } from "@/lib/supabase/admin";

// ── Persistencia reportes competidores (Wave 7 C) ──────────
//
// Cuando benchmark ingiere report de empresa competidora, lo guarda como
// client_document kind='competitor_report' linked vía benchmark_company_id.
// Cron embed-chunks lo procesa automáticamente (mismo pipeline que docs
// del cliente) → reusable entre benchmarks distintos.
// ───────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 90_000;
const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/markdown",
  "text/html",
]);

function fileNameFromUrl(u: string, contentType: string): string {
  try {
    const url = new URL(u);
    let name = url.pathname.split("/").filter(Boolean).pop() ?? "competitor-report";
    name = name.split("?")[0]!.split("#")[0]!;
    if (!name.includes(".")) {
      if (contentType.includes("pdf")) name += ".pdf";
      else if (contentType.includes("html")) name += ".html";
      else name += ".bin";
    }
    return decodeURIComponent(name).slice(0, 120);
  } catch {
    return "competitor-report.bin";
  }
}

export type PersistCompetitorReportOpts = {
  benchmarkCompanyId: string;
  clientId: string; // cliente que disparó el benchmark (atribución)
  uploadedBy: string; // user email
  sourceUrl: string;
};

export type PersistCompetitorReportResult = {
  ok: boolean;
  documentId?: string;
  fileName?: string;
  parseStatus?: "ok" | "failed";
  error?: string;
  /** Si el reporte ya estaba persistido para este competidor, devuelve documentId existente sin re-fetch */
  cached?: boolean;
};

/**
 * Descarga + parsea + persiste un report de competidor. Idempotente:
 * si ya existe un client_document con kind=competitor_report + mismo
 * benchmark_company_id + parse_status=ok, devuelve cached:true sin re-fetch.
 */
export async function persistCompetitorReport(
  opts: PersistCompetitorReportOpts
): Promise<PersistCompetitorReportResult> {
  // 1. SSRF guard
  const ssrf = isPublicHttpUrl(opts.sourceUrl);
  if (!ssrf.ok) {
    return { ok: false, error: `URL bloqueada: ${ssrf.reason}` };
  }

  // 2. Idempotencia: chequear si ya tenemos report para este competidor
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("client_documents")
    .select("id, file_name, parse_status")
    .eq("benchmark_company_id", opts.benchmarkCompanyId)
    .eq("kind", "competitor_report")
    .eq("parse_status", "ok")
    .limit(1)
    .maybeSingle();

  if (existing) {
    return {
      ok: true,
      cached: true,
      documentId: existing.id as string,
      fileName: existing.file_name as string,
      parseStatus: "ok",
    };
  }

  // 3. Fetch con timeout + size cap
  let response: Response;
  try {
    response = await fetch(opts.sourceUrl, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": "ResponSable-Benchmark/1.0" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Fetch falló" };
  }

  if (!response.ok) {
    return { ok: false, error: `HTTP ${response.status} desde ${opts.sourceUrl}` };
  }

  const contentType = (response.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    return { ok: false, error: `Content-Type no permitido: ${contentType}` };
  }

  const contentLengthHeader = response.headers.get("content-length");
  if (contentLengthHeader && Number(contentLengthHeader) > MAX_BYTES) {
    return { ok: false, error: `Archivo excede 25MB (${contentLengthHeader} bytes)` };
  }

  const buf = Buffer.from(await response.arrayBuffer());
  if (buf.length > MAX_BYTES) {
    return { ok: false, error: `Archivo excede 25MB (${buf.length} bytes post-download)` };
  }
  if (buf.length === 0) {
    return { ok: false, error: "Archivo vacío" };
  }

  // 4. Pipeline normal: upload + parse + chunk + (cron embedderá después)
  try {
    const doc = await uploadAndParseDocument({
      clientId: opts.clientId,
      uploadedBy: opts.uploadedBy,
      fileName: fileNameFromUrl(opts.sourceUrl, contentType),
      mimeType: contentType,
      buffer: buf,
      kind: "competitor_report",
      sourceUrl: opts.sourceUrl,
      benchmarkCompanyId: opts.benchmarkCompanyId,
    });
    return {
      ok: true,
      documentId: doc.id,
      fileName: doc.file_name,
      parseStatus: doc.parse_status === "ok" ? "ok" : "failed",
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error pipeline upload" };
  }
}

/**
 * Busca chunks ya embeddidos de un competidor específico por query semántica.
 * Devuelve null si Voyage API key falta o si no hay chunks embeddidos aún.
 */
export async function searchCompetitorChunks(opts: {
  query: string;
  benchmarkCompanyId: string;
  limit?: number;
}): Promise<Array<{ content: string; score: number }> | null> {
  const { generateQueryEmbedding } = await import("@/lib/documents/embeddings");
  const queryEmbedding = await generateQueryEmbedding(opts.query);
  if (!queryEmbedding) return null;

  const admin = createAdminClient();
  const { data: docs } = await admin
    .from("client_documents")
    .select("id")
    .eq("benchmark_company_id", opts.benchmarkCompanyId)
    .eq("kind", "competitor_report");

  const docIds = (docs ?? []).map((d) => d.id as string);
  if (docIds.length === 0) return null;

  // pgvector RPC: cosine en Postgres — 0 bytes de embeddings en la red
  const vec = `[${queryEmbedding.join(",")}]`;
  const { data, error } = await admin.rpc("match_competitor_chunks", {
    query_vec: vec,
    p_doc_ids: docIds,
    k: opts.limit ?? 10,
  });

  if (error || !data) return null;

  return data as Array<{ content: string; score: number }>;
}
