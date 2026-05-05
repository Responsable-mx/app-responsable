import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { deleteTemplate, getTemplate, TemplateInputSchema } from "@/lib/stage-templates";
import { createAdminClient } from "@/lib/supabase/admin";
import { logChange } from "@/lib/audit-log";

type Ctx = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: NextRequest, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Requiere admin" }, { status: 403 });
  const { id } = await params;
  if (!UUID_RE.test(id))
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  const tpl = await getTemplate(id);
  if (!tpl) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  return NextResponse.json({ data: tpl });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Requiere admin" }, { status: 403 });
  const { id } = await params;
  if (!UUID_RE.test(id))
    return NextResponse.json({ error: "id inválido" }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = TemplateInputSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 }
    );
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.description !== undefined) update.description = parsed.data.description;
  if (parsed.data.service !== undefined) update.service = parsed.data.service;
  if (parsed.data.data !== undefined) update.data = parsed.data.data;

  try {
    const adminDb = createAdminClient();
    const before = await getTemplate(id);
    const { error } = await adminDb.from("stage_templates").update(update).eq("id", id);
    if (error) throw error;
    await logChange({
      actorEmail: admin,
      entityType: "stage_template",
      entityId: id,
      action: "update",
      before: before ? { name: before.name, description: before.description, service: before.service } : null,
      after: update,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[PATCH /api/stage-templates/:id]", e);
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}

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
