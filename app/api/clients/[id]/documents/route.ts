import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { extname } from "node:path";
import { requireConsultorForClient } from "@/lib/auth";
import { getClient } from "@/lib/clients";
import { listDocumentsByClient, uploadAndParseDocument, checkDocumentHash } from "@/lib/documents/queries";
import { DOCUMENT_KIND_SCHEMA } from "@/lib/documents/types";
import { logChange } from "@/lib/audit-log";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAX_SIZE = 25 * 1024 * 1024; // 25MB

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

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const [user, client] = await Promise.all([
    requireConsultorForClient(id),
    getClient(id).catch(() => null),
  ]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!client) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

  const docs = await listDocumentsByClient(id);
  // No exponemos markdown_content en list — solo metadata (puede ser pesado)
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

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Archivo excede 25MB" }, { status: 413 });
  }

  const isZip =
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed" ||
    (file.name.toLowerCase().endsWith(".zip") && file.type === "application/octet-stream");

  if (!isZip && !ALLOWED_MIMES.has(file.type)) {
    return NextResponse.json({ error: `Tipo no soportado: ${file.type || "desconocido"}` }, { status: 415 });
  }

  const kindParsed = DOCUMENT_KIND_SCHEMA.safeParse(formData.get("kind"));
  const kind = kindParsed.success ? kindParsed.data : "general";

  // service_ids: array de UUIDs separados por coma (FormData no soporta arrays nativos)
  const rawServiceIds = formData.get("service_ids");
  const serviceIds = typeof rawServiceIds === "string" && rawServiceIds.trim()
    ? rawServiceIds.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const buffer = Buffer.from(await file.arrayBuffer());

  // ZIP: extraer y procesar cada archivo interno por separado
  if (isZip) {
    const JSZip = (await import("jszip")).default;
    let zip: InstanceType<typeof JSZip>;
    try {
      zip = await JSZip.loadAsync(buffer);
    } catch {
      return NextResponse.json({ error: "ZIP inválido o corrupto" }, { status: 400 });
    }

    const docs: object[] = [];
    const failures: string[] = [];

    for (const [entryPath, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      const baseName = entryPath.split("/").pop() ?? entryPath;
      // Ignorar metadata macOS y archivos ocultos
      if (baseName.startsWith("__MACOSX") || baseName.startsWith(".")) continue;

      const mimeType = ZIP_EXT_TO_MIME[extname(baseName).toLowerCase()];
      if (!mimeType) continue;

      const fileBuffer = Buffer.from(await entry.async("arraybuffer"));
      if (fileBuffer.length > MAX_SIZE) {
        failures.push(`${baseName}: excede 25MB`);
        continue;
      }

      const contentHash = createHash("md5").update(fileBuffer).digest("hex");
      const existingDoc = await checkDocumentHash(id, contentHash);
      if (existingDoc) {
        failures.push(`${baseName}: ya existe`);
        continue;
      }

      try {
        const doc = await uploadAndParseDocument({
          clientId: id,
          uploadedBy: user,
          fileName: baseName,
          mimeType,
          buffer: fileBuffer,
          kind,
          serviceIds,
        });
        void logChange({
          actorEmail: user,
          entityType: "client_document",
          entityId: doc.id,
          action: "create",
          before: null,
          after: { client_id: id, file_name: doc.file_name, kind: doc.kind, size_bytes: doc.size_bytes, service_ids: serviceIds },
        });
        docs.push({
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
        });
      } catch (e) {
        failures.push(`${baseName}: ${e instanceof Error ? e.message : "error"}`);
      }
    }

    if (docs.length === 0 && failures.length > 0) {
      return NextResponse.json({ error: `Ningún archivo procesado: ${failures.join("; ")}` }, { status: 422 });
    }
    if (docs.length === 0) {
      return NextResponse.json({ error: "ZIP sin archivos soportados (PDF, DOCX, XLSX, PPTX, TXT, MD)" }, { status: 422 });
    }

    return NextResponse.json({ data: docs, count: docs.length, failures });
  }

  // Dedup: mismo contenido para el mismo cliente → 409 con referencia al doc existente.
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
