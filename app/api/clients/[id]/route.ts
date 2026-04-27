import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  getClient,
  updateClientRow,
  deleteClientRow,
} from "@/lib/clients";
import { ClientInputSchema } from "@/lib/validation";
import { logChange } from "@/lib/audit-log";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const data = await getClient(id);
    if (!data)
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ data });
  } catch (e) {
    console.error("[GET /api/clients/:id]", e);
    return NextResponse.json({ error: "Error al leer cliente" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = ClientInputSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 }
    );
  }

  try {
    const data = await updateClientRow(id, parsed.data, user);
    await logChange({
      actorEmail: user,
      entityType: "clients",
      entityId: id,
      action: "update",
      // Solo nombre + atributos estructurados al log; bloques narrativos
      // pueden ser >1KB y van a impactar tamaño del audit_log.
      after: {
        name: data.name,
        sector: data.sector,
        size: data.size,
        maturity_level: data.maturity_level,
        services: data.services,
        frameworks: data.frameworks,
        certifications: data.certifications,
        material_topics: data.material_topics,
      },
    });
    return NextResponse.json({ data });
  } catch (e) {
    console.error("[PATCH /api/clients/:id]", e);
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const before = await getClient(id).catch(() => null);
    await deleteClientRow(id);
    await logChange({
      actorEmail: user,
      entityType: "clients",
      entityId: id,
      action: "delete",
      before: before
        ? { name: before.name, sector: before.sector }
        : null,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/clients/:id]", e);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}
