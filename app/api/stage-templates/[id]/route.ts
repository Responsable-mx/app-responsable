import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { deleteTemplate } from "@/lib/stage-templates";
import { logChange } from "@/lib/audit-log";

type Ctx = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Requiere admin" }, { status: 403 });
  const { id } = await params;
  if (!UUID_RE.test(id))
    return NextResponse.json({ error: "id inválido" }, { status: 400 });

  try {
    await deleteTemplate(id);
    await logChange({
      actorEmail: admin,
      entityType: "stage_template",
      entityId: id,
      action: "delete",
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/stage-templates/:id]", e);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}
