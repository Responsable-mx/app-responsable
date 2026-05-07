import { NextRequest, NextResponse } from "next/server";
import { requireConsultorForClient, requireAdmin } from "@/lib/auth";
import { deleteDocument, getDocument, getSignedUrl } from "@/lib/documents/queries";
import { logChange } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; docId: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const { id, docId } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const doc = await getDocument(docId);
  if (!doc || doc.client_id !== id) {
    return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
  }

  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") ?? "metadata"; // metadata | content | download

  if (mode === "content") {
    return NextResponse.json({
      data: {
        id: doc.id,
        file_name: doc.file_name,
        kind: doc.kind,
        markdown_content: doc.markdown_content,
        parse_status: doc.parse_status,
      },
    });
  }

  if (mode === "download") {
    const signed = await getSignedUrl(doc.storage_path, 600);
    if (!signed) return NextResponse.json({ error: "No se pudo generar URL" }, { status: 500 });
    return NextResponse.json({ data: { url: signed, expires_in: 600 } });
  }

  return NextResponse.json({
    data: {
      id: doc.id,
      file_name: doc.file_name,
      file_type: doc.file_type,
      kind: doc.kind,
      size_bytes: doc.size_bytes,
      source_url: doc.source_url,
      parse_status: doc.parse_status,
      parse_error: doc.parse_error,
      has_content: !!doc.markdown_content,
      created_at: doc.created_at,
    },
  });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Solo admin puede borrar" }, { status: 403 });

  const { id, docId } = await params;
  const doc = await getDocument(docId);
  if (!doc || doc.client_id !== id) {
    return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
  }

  const result = await deleteDocument(docId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  void logChange({
    actorEmail: user,
    entityType: "client_document",
    entityId: docId,
    action: "delete",
    before: { client_id: id, file_name: doc.file_name, kind: doc.kind },
    after: null,
  });

  return NextResponse.json({ data: { id: docId, deleted: true } });
}
