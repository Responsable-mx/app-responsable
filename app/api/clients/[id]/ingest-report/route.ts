import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireConsultorOrAdmin } from "@/lib/auth";
import { getClient } from "@/lib/clients";
import { uploadAndParseDocument } from "@/lib/documents/queries";
import { isPublicHttpUrl } from "@/lib/documents/ssrf";
import { logChange } from "@/lib/audit-log";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 90;
export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  kind: z.enum(["sustainability_report", "financial_report"]),
  url: z.string().url(),
});

const ALLOWED_CONTENT_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/markdown",
  "text/html", // si es HTML, lo guardamos como txt
]);

const MAX_BYTES = 25 * 1024 * 1024; // 25MB

type Ctx = { params: Promise<{ id: string }> };

function fileNameFromUrl(u: string, contentType: string): string {
  const url = new URL(u);
  let name = url.pathname.split("/").filter(Boolean).pop() ?? "informe";
  // Quita query strings residuales
  name = name.split("?")[0].split("#")[0];
  if (!name.includes(".")) {
    if (contentType.includes("pdf")) name += ".pdf";
    else if (contentType.includes("html")) name += ".html";
    else name += ".bin";
  }
  return decodeURIComponent(name).slice(0, 120);
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const user = await requireConsultorOrAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const client = await getClient(id).catch(() => null);
  if (!client) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Body inválido" }, { status: 400 });
  }
  const { kind, url } = parsed.data;

  const ssrfCheck = isPublicHttpUrl(url);
  if (!ssrfCheck.ok) {
    return NextResponse.json({ error: `URL bloqueada: ${ssrfCheck.reason}` }, { status: 400 });
  }

  // Descarga con timeout y validación
  let response: Response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "ResponSable-DocIngest/1.0",
        "Accept": "*/*",
      },
    });
    clearTimeout(timeout);
  } catch (e) {
    return NextResponse.json(
      { error: `No se pudo descargar la URL: ${e instanceof Error ? e.message : "error red"}` },
      { status: 502 }
    );
  }

  if (!response.ok) {
    return NextResponse.json({ error: `Servidor remoto retornó ${response.status}` }, { status: 502 });
  }

  const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    return NextResponse.json({ error: `Tipo no soportado: ${contentType}` }, { status: 415 });
  }

  const contentLength = parseInt(response.headers.get("content-length") ?? "0", 10);
  if (contentLength > MAX_BYTES) {
    return NextResponse.json({ error: `Archivo excede 25MB (${(contentLength / 1024 / 1024).toFixed(1)}MB)` }, { status: 413 });
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_BYTES) {
    return NextResponse.json({ error: "Archivo excede 25MB" }, { status: 413 });
  }

  // HTML → guardamos como text/plain (parsers no soporta HTML)
  let mimeType = contentType;
  let finalBuffer = buffer;
  if (contentType === "text/html") {
    const html = buffer.toString("utf-8");
    // Strip básico para sacar texto del HTML
    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    finalBuffer = Buffer.from(stripped, "utf-8");
    mimeType = "text/plain";
  }

  const fileName = fileNameFromUrl(url, contentType);
  let doc;
  try {
    doc = await uploadAndParseDocument({
      clientId: id,
      uploadedBy: user,
      fileName,
      mimeType,
      buffer: finalBuffer,
      kind,
      sourceUrl: url,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error guardando" },
      { status: 500 }
    );
  }

  // Actualiza columna de URL en clients
  const sb = createAdminClient();
  const colName = kind === "sustainability_report" ? "sustainability_report_url" : "financial_report_url";
  const { error: updateErr } = await sb
    .from("clients")
    .update({ [colName]: url, updated_by: user })
    .eq("id", id);
  if (updateErr) {
    console.error("[ingest-report] update client url failed:", updateErr.message);
  }

  void logChange({
    actorEmail: user,
    entityType: "client_document",
    entityId: doc.id,
    action: "create",
    before: null,
    after: { client_id: id, kind: doc.kind, source_url: url, file_name: doc.file_name },
  });

  return NextResponse.json({
    data: {
      doc_id: doc.id,
      file_name: doc.file_name,
      file_type: doc.file_type,
      kind: doc.kind,
      size_bytes: doc.size_bytes,
      parse_status: doc.parse_status,
      parse_error: doc.parse_error,
      source_url: url,
    },
  });
}
