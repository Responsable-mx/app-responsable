import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { detectFileType, parseToMarkdown, truncateMarkdown, type FileType } from "@/lib/documents/parsers";
import { randomUUID } from "node:crypto";

const BUCKET = "client-documents";

export type ClientDocument = {
  id: string;
  client_id: string;
  uploaded_by: string | null;
  kind: "general" | "sustainability_report" | "financial_report";
  file_name: string;
  file_type: FileType;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  markdown_content: string | null;
  source_url: string | null;
  parse_status: "pending" | "ok" | "failed";
  parse_error: string | null;
  service_tag: string | null;
  created_at: string;
  updated_at: string;
};

export type UploadDocOpts = {
  clientId: string;
  uploadedBy: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  kind?: "general" | "sustainability_report" | "financial_report";
  sourceUrl?: string;
};

export async function uploadAndParseDocument(opts: UploadDocOpts): Promise<ClientDocument> {
  const fileType = detectFileType(opts.mimeType, opts.fileName);
  if (!fileType) {
    throw new Error(`Tipo de archivo no soportado: ${opts.mimeType} (${opts.fileName})`);
  }

  const sb = createAdminClient();
  const safeName = opts.fileName.replace(/[^\w\-.]+/g, "_").slice(0, 120);
  const storagePath = `${opts.clientId}/${randomUUID()}-${safeName}`;

  // 1. Subir a Storage
  const upload = await sb.storage.from(BUCKET).upload(storagePath, opts.buffer, {
    contentType: opts.mimeType,
    upsert: false,
  });
  if (upload.error) {
    throw new Error(`Error subiendo archivo: ${upload.error.message}`);
  }

  // 2. Parse en background — se hace en línea, pero atrapamos errores para no romper el upload
  let markdown: string | null = null;
  let parseStatus: "ok" | "failed" = "ok";
  let parseError: string | null = null;
  try {
    const md = await parseToMarkdown(opts.buffer, fileType);
    markdown = truncateMarkdown(md);
    if (markdown.trim().length === 0) {
      parseStatus = "failed";
      parseError = "El parser no extrajo texto del archivo.";
    }
  } catch (e) {
    parseStatus = "failed";
    parseError = e instanceof Error ? e.message : String(e);
    console.error(`[documents] parse failed for ${opts.fileName}:`, parseError);
  }

  // 3. Insertar fila
  const { data, error } = await sb
    .from("client_documents")
    .insert({
      client_id: opts.clientId,
      uploaded_by: opts.uploadedBy,
      kind: opts.kind ?? "general",
      file_name: opts.fileName,
      file_type: fileType,
      mime_type: opts.mimeType,
      size_bytes: opts.buffer.length,
      storage_path: storagePath,
      markdown_content: markdown,
      source_url: opts.sourceUrl ?? null,
      parse_status: parseStatus,
      parse_error: parseError,
    })
    .select("*")
    .single();

  if (error) {
    // Cleanup: borrar archivo en storage si la fila falló
    await sb.storage.from(BUCKET).remove([storagePath]).catch(() => undefined);
    throw new Error(`Error guardando metadata: ${error.message}`);
  }

  return data as ClientDocument;
}

export async function listDocumentsByClient(
  clientId: string,
  opts?: { kind?: "general" | "sustainability_report" | "financial_report" }
): Promise<ClientDocument[]> {
  const sb = createAdminClient();
  let query = sb
    .from("client_documents")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  if (opts?.kind) query = query.eq("kind", opts.kind);
  const { data, error } = await query;
  if (error) {
    console.error("[documents] list failed:", error.message);
    return [];
  }
  return (data ?? []) as ClientDocument[];
}

export async function getDocument(id: string): Promise<ClientDocument | null> {
  const sb = createAdminClient();
  const { data, error } = await sb.from("client_documents").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error("[documents] get failed:", error.message);
    return null;
  }
  return data as ClientDocument | null;
}

export async function getDocumentsByIds(clientId: string, ids: string[]): Promise<ClientDocument[]> {
  if (ids.length === 0) return [];
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("client_documents")
    .select("*")
    .eq("client_id", clientId)
    .in("id", ids);
  if (error) {
    console.error("[documents] getByIds failed:", error.message);
    return [];
  }
  return (data ?? []) as ClientDocument[];
}

export async function deleteDocument(id: string): Promise<{ ok: boolean; error?: string }> {
  const sb = createAdminClient();
  const doc = await getDocument(id);
  if (!doc) return { ok: false, error: "Documento no encontrado" };

  const remove = await sb.storage.from("client-documents").remove([doc.storage_path]);
  if (remove.error) {
    console.error("[documents] storage remove failed:", remove.error.message);
  }

  const { error } = await sb.from("client_documents").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function getSignedUrl(storagePath: string, expiresInSec = 600): Promise<string | null> {
  const sb = createAdminClient();
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(storagePath, expiresInSec);
  if (error || !data) {
    console.error("[documents] signed url failed:", error?.message);
    return null;
  }
  return data.signedUrl;
}
