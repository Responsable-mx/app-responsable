import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireConsultorForClient } from "@/lib/auth";
import { getClient } from "@/lib/clients";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "client-documents";
const MAX_PRESIGN_SIZE = 100 * 1024 * 1024; // 100MB

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const [user, client] = await Promise.all([
    requireConsultorForClient(id),
    getClient(id).catch(() => null),
  ]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!client) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

  let body: { filename?: unknown; mimeType?: unknown; size?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { filename, size } = body;
  if (typeof filename !== "string" || !filename) {
    return NextResponse.json({ error: "Falta filename" }, { status: 400 });
  }
  if (typeof size === "number" && size > MAX_PRESIGN_SIZE) {
    return NextResponse.json({ error: "Archivo excede 100MB" }, { status: 413 });
  }

  const safeName = filename.replace(/[^\w\-.]+/g, "_").slice(0, 120);
  const storagePath = `${id}/${randomUUID()}-${safeName}`;

  const sb = createAdminClient();
  const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(storagePath);
  if (error || !data) {
    return NextResponse.json(
      { error: `Error creando URL de subida: ${error?.message ?? "desconocido"}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ signedUrl: data.signedUrl, storagePath });
}
