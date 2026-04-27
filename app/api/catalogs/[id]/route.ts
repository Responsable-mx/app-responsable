import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { updateCatalogItem, deleteCatalogItem } from "@/lib/catalogs";
import { CatalogItemInputSchema } from "@/lib/validation";
import { logChange } from "@/lib/audit-log";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "Requiere permisos de administrador." },
      { status: 403 }
    );
  }
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = CatalogItemInputSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 }
    );
  }

  try {
    const data = await updateCatalogItem(id, parsed.data, admin);
    await logChange({
      actorEmail: admin,
      entityType: "catalogs",
      entityId: id,
      action: "update",
      after: { ...parsed.data },
    });
    return NextResponse.json({ data });
  } catch (e) {
    console.error("[PATCH /api/catalogs/:id]", e);
    const msg = e instanceof Error ? e.message : "Error al actualizar";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "Requiere permisos de administrador." },
      { status: 403 }
    );
  }
  const { id } = await params;
  try {
    await deleteCatalogItem(id);
    await logChange({
      actorEmail: admin,
      entityType: "catalogs",
      entityId: id,
      action: "delete",
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/catalogs/:id]", e);
    const msg = e instanceof Error ? e.message : "Error al eliminar";
    const status = msg.includes("sistema") ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
