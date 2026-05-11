import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, requireAdmin } from "@/lib/auth";
import {
  updateClientService,
  deleteClientService,
  getClientService,
} from "@/lib/client-services";
import { logChange } from "@/lib/audit-log";

type Ctx = { params: Promise<{ id: string }> };

const PatchSchema = z.object({
  data: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(_req: NextRequest, { params }: Ctx) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await params;
  const data = await getClientService(id);
  if (!data) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ data });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  // D-42: mutaciones de servicios requieren admin
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Requiere admin" }, { status: 403 });
  const user = admin;
  const { id } = await params;

  // D-33: verificar ownership antes de mutar
  const before = await getClientService(id);
  if (!before) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  try {
    const updated = await updateClientService(
      id,
      { data: parsed.data.data ?? {} },
      user
    );
    // D-36: audit log en mutaciones de servicios
    void logChange({
      actorEmail: user,
      entityType: "client_services",
      entityId: id,
      action: "update",
      before: { service: before.service, client_id: before.client_id },
      after: { service: updated.service, client_id: updated.client_id },
    });
    return NextResponse.json({ data: updated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al actualizar";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  // D-42: mutaciones de servicios requieren admin
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Requiere admin" }, { status: 403 });
  const user = admin;
  const { id } = await params;

  // D-33: verificar ownership antes de borrar
  const before = await getClientService(id);
  if (!before) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  try {
    await deleteClientService(id);
    // D-36: audit log en eliminación de servicios
    void logChange({
      actorEmail: user,
      entityType: "client_services",
      entityId: id,
      action: "delete",
      before: { service: before.service, client_id: before.client_id },
      after: null,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al eliminar";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
