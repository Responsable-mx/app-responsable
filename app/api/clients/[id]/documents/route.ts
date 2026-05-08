import { NextRequest, NextResponse } from "next/server";
import { requireConsultorForClient } from "@/lib/auth";
import { getClient } from "@/lib/clients";
import { listDocumentsByClient, uploadAndParseDocument } from "@/lib/documents/queries";
import { DOCUMENT_KIND_SCHEMA } from "@/lib/documents/types";
import { logChange } from "@/lib/audit-log";
import { createAdminClient } from "@/lib/supabase/admin";

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
    service_tag: d.service_tag ?? null,
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
  if (!ALLOWED_MIMES.has(file.type)) {
    return NextResponse.json({ error: `Tipo no soportado: ${file.type || "desconocido"}` }, { status: 415 });
  }

  const kindParsed = DOCUMENT_KIND_SCHEMA.safeParse(formData.get("kind"));
  const kind = kindParsed.success ? kindParsed.data : "general";

  const rawServiceTag = formData.get("service_tag");
  const serviceTag = typeof rawServiceTag === "string" && rawServiceTag.trim() ? rawServiceTag.trim() : null;

  const buffer = Buffer.from(await file.arrayBuffer());

  let doc;
  try {
    doc = await uploadAndParseDocument({
      clientId: id,
      uploadedBy: user,
      fileName: file.name,
      mimeType: file.type,
      buffer,
      kind,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error subiendo documento";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Actualiza service_tag si se envió (columna opcional, additive migration 0059)
  if (serviceTag) {
    const admin = createAdminClient();
    await admin.from("client_documents").update({ service_tag: serviceTag }).eq("id", doc.id);
  }

  void logChange({
    actorEmail: user,
    entityType: "client_document",
    entityId: doc.id,
    action: "create",
    before: null,
    after: { client_id: id, file_name: doc.file_name, kind: doc.kind, size_bytes: doc.size_bytes, service_tag: serviceTag },
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
      service_tag: serviceTag,
      created_at: doc.created_at,
    },
  });
}
