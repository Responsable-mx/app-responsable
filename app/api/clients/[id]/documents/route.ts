import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { extname } from "node:path";
import { requireConsultorForClient } from "@/lib/auth";
import { getClient } from "@/lib/clients";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  listDocumentsByClient,
  uploadAndParseDocument,
  checkDocumentHash,
  processStoredDocument,
  DuplicateDocError,
} from "@/lib/documents/queries";
import { DOCUMENT_KIND_SCHEMA, type DocumentKind } from "@/lib/documents/types";
import { logChange } from "@/lib/audit-log";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const MAX_SIZE = 25 * 1024 * 1024;       // 25MB por archivo individual
const MAX_ZIP_SIZE = 100 * 1024 * 1024;  // 100MB para ZIPs

const ALLOWED_MIMES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/plain",
  "text/markdown",
]);

const ZIP_EXT_TO_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".ppt": "application/vnd.ms-powerpoint",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".txt": "text/plain",
  ".md": "text/markdown",
};

type Ctx = { params: Promise<{ id: string }> };

type ZipEntry = { baseName: string; mimeType: string; fileBuffer: Buffer };
type ZipResult = { docs: object[]; failures: string[] };

async function processZipBuffer(
  buffer: Buffer,
  opts: { clientId: string; actorEmail: string; kind: DocumentKind; serviceIds: string[] }
): Promise<ZipResult> {
  const JSZip = (await import("jszip")).default;
  let zip: InstanceType<typeof JSZip>;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new Error("ZIP inválido o corrupto");
  }

  const validEntries: ZipEntry[] = [];
  const failures: string[] = [];

  for (const [entryPath, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const baseName = entryPath.split("/").pop() ?? entryPath;
    if (baseName.startsWith("__MACOSX") || baseName.startsWith(".")) continue;
    const mimeType = ZIP_EXT_TO_MIME[extname(baseName).toLowerCase()];
    if (!mimeType) continue;
    const fileBuffer = Buffer.from(await entry.async("arraybuffer"));
    if (fileBuffer.length > MAX_SIZE) { failures.push(`${baseName}: excede 25MB`); continue; }
    validEntries.push({ baseName, mimeType, fileBuffer });
  }

  const docs: object[] = [];
  const BATCH = 5;
  const { clientId, actorEmail, kind, serviceIds } = opts;

  async function processEntry({ baseName, mimeType, fileBuffer }: ZipEntry): Promise<void> {
    const contentHash = createHash("md5").update(fileBuffer).digest("hex");
    const existingDoc = await checkDocumentHash(clientId, contentHash);
    if (existingDoc) { failures.push(`${baseName}: ya existe`); return; }
    const doc = await uploadAndParseDocument({ clientId, uploadedBy: actorEmail, fileName: baseName, mimeType, buffer: fileBuffer, kind, serviceIds });
    void logChange({ actorEmail, entityType: "client_document", entityId: doc.id, action: "create", before: null, after: { client_id: clientId, file_name: doc.file_name, kind: doc.kind, size_bytes: doc.size_bytes, service_ids: serviceIds } });
    docs.push({ id: doc.id, file_name: doc.file_name, file_type: doc.file_type, kind: doc.kind, size_bytes: doc.size_bytes, parse_status: doc.parse_status, parse_error: doc.parse_error, has_content: !!doc.markdown_content, service_ids: doc.service_ids ?? [], created_at: doc.created_at });
  }

  for (let i = 0; i < validEntries.length; i += BATCH) {
    const batch = validEntries.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map(processEntry));
    results.forEach((r, j) => {
      if (r.status === "rejected") failures.push(`${batch[j]?.baseName ?? "archivo"}: ${r.reason instanceof Error ? r.reason.message : "error"}`);
    });
  }

  return { docs, failures };
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const [user, client] = await Promise.all([
    requireConsultorForClient(id),
    getClient(id).catch(() => null),
  ]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!client) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

  const docs = await listDocumentsByClient(id);
  const data = docs.map((d) => ({
    id: d.id,
    client_id: d.client_id,
    uploaded_by: d.uploaded_by,
    kind: d.kind,
    file_name: d.file_name,
    file_type: d.file_type,
    mime_type: d.mime_type,
    size_bytes: d.size_bytes,
    source_url: d.source_url,
    parse_status: d.parse_status,
    parse_error: d.parse_error,
    has_content: !!d.markdown_content,
    service_ids: d.service_ids ?? [],
    content_hash: d.content_hash ?? null,
    created_at: d.created_at,
    updated_at: d.updated_at,
  }));
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const [user, client] = await Promise.all([
    requireConsultorForClient(id),
    getClient(id).catch(() => null),
  ]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!client) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

  const contentType = req.headers.get("content-type") ?? "";

  // ── Path B: archivo pre-subido vía presigned URL (body JSON con storagePath) ──
  if (contentType.includes("application/json")) {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
    }

    const { storagePath, filename, mimeType: rawMimeType, kind: rawKind, serviceIds: rawServiceIds } = body;
    if (typeof storagePath !== "string" || !storagePath) {
      return NextResponse.json({ error: "Falta storagePath" }, { status: 400 });
    }
    if (typeof filename !== "string" || !filename) {
      return NextResponse.json({ error: "Falta filename" }, { status: 400 });
    }
    // Anti-IDOR: el storagePath debe pertenecer a ESTE cliente. Sin esto, un
    // consultor autorizado para el cliente A podría pasar el path de otro
    // cliente B y descargar su informe (el download usa service-role y salta
    // RLS). El presign siempre emite `${id}/...`; rechazamos cualquier otro.
    if (!storagePath.startsWith(`${id}/`)) {
      return NextResponse.json({ error: "storagePath no pertenece a este cliente" }, { status: 400 });
    }
    const mimeType = typeof rawMimeType === "string" ? rawMimeType : "application/octet-stream";
    const kindParsed = DOCUMENT_KIND_SCHEMA.safeParse(rawKind);
    const kind = kindParsed.success ? kindParsed.data : "general";
    const serviceIds = Array.isArray(rawServiceIds)
      ? rawServiceIds.filter((s): s is string => typeof s === "string")
      : [];

    const isZip =
      mimeType === "application/zip" ||
      mimeType === "application/x-zip-compressed" ||
      (filename.toLowerCase().endsWith(".zip") && mimeType === "application/octet-stream");

    if (isZip) {
      // Descargar ZIP desde Supabase, extraer y procesar
      const sb = createAdminClient();
      const { data: blob, error: dlError } = await sb.storage.from("client-documents").download(storagePath);
      if (dlError || !blob) {
        return NextResponse.json({ error: `Error descargando ZIP: ${dlError?.message ?? "sin datos"}` }, { status: 500 });
      }
      const buffer = Buffer.from(await blob.arrayBuffer());

      let result: ZipResult;
      try {
        result = await processZipBuffer(buffer, { clientId: id, actorEmail: user, kind, serviceIds });
      } catch (e) {
        // Limpiar ZIP del storage antes de retornar error
        await sb.storage.from("client-documents").remove([storagePath]).catch(() => undefined);
        return NextResponse.json({ error: e instanceof Error ? e.message : "Error procesando ZIP" }, { status: 400 });
      }

      // Limpiar ZIP del storage (los archivos extraídos ya se subieron individualmente)
      await sb.storage.from("client-documents").remove([storagePath]).catch(() => undefined);

      if (result.docs.length === 0 && result.failures.length > 0) {
        return NextResponse.json({ error: `Ningún archivo procesado: ${result.failures.join("; ")}` }, { status: 422 });
      }
      if (result.docs.length === 0) {
        return NextResponse.json({ error: "ZIP sin archivos soportados (PDF, DOCX, XLSX, PPTX, TXT, MD)" }, { status: 422 });
      }
      return NextResponse.json({ data: result.docs, count: result.docs.length, failures: result.failures });
    }

    // Archivo individual pre-subido (no ZIP)
    let doc;
    try {
      doc = await processStoredDocument({ clientId: id, uploadedBy: user, storagePath, fileName: filename, mimeType, kind, serviceIds });
    } catch (e) {
      if (e instanceof DuplicateDocError) {
        return NextResponse.json(
          { error: "Documento idéntico ya existe", existing: { id: e.existing.id, file_name: e.existing.file_name, created_at: e.existing.created_at } },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: e instanceof Error ? e.message : "Error procesando documento" }, { status: 500 });
    }

    void logChange({
      actorEmail: user,
      entityType: "client_document",
      entityId: doc.id,
      action: "create",
      before: null,
      after: { client_id: id, file_name: doc.file_name, kind: doc.kind, size_bytes: doc.size_bytes, service_ids: serviceIds },
    });

    // Generar embeddings inline para que el chat semántico los use inmediatamente.
    // Fire-and-forget: el cron 6:30 AM como red de seguridad para cualquier fallo.
    if (doc.parse_status === "ok" && doc.markdown_content && process.env.VOYAGE_API_KEY) {
      void (async () => {
        try {
          const { persistDocumentChunks, generateEmbeddingsBatch } = await import("@/lib/documents/embeddings");
          const result = await persistDocumentChunks({ documentId: doc.id, clientId: id, markdownContent: doc.markdown_content! });
          if (result.inserted > 0) {
            // Leer los chunks recién insertados para generar embeddings en batch
            const { createAdminClient: getAdmin } = await import("@/lib/supabase/admin");
            const sb = getAdmin();
            const { data: freshChunks } = await sb
              .from("document_chunks")
              .select("id, content")
              .eq("document_id", doc.id)
              .is("embedding", null)
              .limit(500);
            if (freshChunks && freshChunks.length > 0) {
              const embeddings = await generateEmbeddingsBatch(
                freshChunks.map((c) => c.content),
                { userEmail: user, clientId: id }
              );
              for (let i = 0; i < freshChunks.length; i++) {
                if (!embeddings[i]) continue;
                const vec = `[${embeddings[i]!.join(",")}]`;
                await sb.from("document_chunks").update({ embedding: vec }).eq("id", freshChunks[i]!.id);
              }
            }
          }
        } catch (e) {
          console.error("[documents] inline embed failed:", e instanceof Error ? e.message : e);
        }
      })();
    }

    return NextResponse.json({
      data: {
        id: doc.id,
        file_name: doc.file_name,
        file_type: doc.file_type,
        kind: doc.kind,
        size_bytes: doc.size_bytes,
        parse_status: doc.parse_status,
        parse_error: doc.parse_error,
        has_content: !!doc.markdown_content,
        service_ids: doc.service_ids ?? [],
        created_at: doc.created_at,
      },
      count: 1,
    });
  }

  // ── Path A: upload directo multipart/form-data (archivos ≤ 4MB) ──
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Multipart inválido" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Falta archivo" }, { status: 400 });
  }

  const isZip =
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed" ||
    (file.name.toLowerCase().endsWith(".zip") && file.type === "application/octet-stream");

  if (isZip && file.size > MAX_ZIP_SIZE) {
    return NextResponse.json({ error: "ZIP excede 100MB" }, { status: 413 });
  }
  if (!isZip && file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Archivo excede 25MB" }, { status: 413 });
  }
  if (!isZip && !ALLOWED_MIMES.has(file.type)) {
    return NextResponse.json({ error: `Tipo no soportado: ${file.type || "desconocido"}` }, { status: 415 });
  }

  const kindParsed = DOCUMENT_KIND_SCHEMA.safeParse(formData.get("kind"));
  const kind = kindParsed.success ? kindParsed.data : "general";

  const rawServiceIds = formData.get("service_ids");
  const serviceIds = typeof rawServiceIds === "string" && rawServiceIds.trim()
    ? rawServiceIds.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const buffer = Buffer.from(await file.arrayBuffer());

  if (isZip) {
    let result: ZipResult;
    try {
      result = await processZipBuffer(buffer, { clientId: id, actorEmail: user, kind, serviceIds });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Error procesando ZIP" }, { status: 400 });
    }

    if (result.docs.length === 0 && result.failures.length > 0) {
      return NextResponse.json({ error: `Ningún archivo procesado: ${result.failures.join("; ")}` }, { status: 422 });
    }
    if (result.docs.length === 0) {
      return NextResponse.json({ error: "ZIP sin archivos soportados (PDF, DOCX, XLSX, PPTX, TXT, MD)" }, { status: 422 });
    }
    return NextResponse.json({ data: result.docs, count: result.docs.length, failures: result.failures });
  }

  // Archivo individual — dedup + upload
  const contentHash = createHash("md5").update(buffer).digest("hex");
  const existing = await checkDocumentHash(id, contentHash);
  if (existing) {
    return NextResponse.json(
      { error: "Documento idéntico ya existe", existing: { id: existing.id, file_name: existing.file_name, created_at: existing.created_at } },
      { status: 409 }
    );
  }

  let doc;
  try {
    doc = await uploadAndParseDocument({
      clientId: id,
      uploadedBy: user,
      fileName: file.name,
      mimeType: file.type,
      buffer,
      kind,
      serviceIds,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error subiendo documento";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  void logChange({
    actorEmail: user,
    entityType: "client_document",
    entityId: doc.id,
    action: "create",
    before: null,
    after: { client_id: id, file_name: doc.file_name, kind: doc.kind, size_bytes: doc.size_bytes, service_ids: serviceIds },
  });

  return NextResponse.json({
    data: {
      id: doc.id,
      file_name: doc.file_name,
      file_type: doc.file_type,
      kind: doc.kind,
      size_bytes: doc.size_bytes,
      parse_status: doc.parse_status,
      parse_error: doc.parse_error,
      has_content: !!doc.markdown_content,
      service_ids: doc.service_ids ?? [],
      created_at: doc.created_at,
    },
    count: 1,
  });
}
