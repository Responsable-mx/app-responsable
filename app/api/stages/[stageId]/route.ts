import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { PROJECTS_OVERVIEW_TAG } from "@/app/api/projects/overview/route";
import { updateStage, deleteStage, StageInputSchema } from "@/lib/stages";
import { logChange } from "@/lib/audit-log";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDevMode } from "@/lib/env";

type Ctx = { params: Promise<{ stageId: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validId = (id: string) => isDevMode() || UUID_RE.test(id);

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Requiere admin" }, { status: 403 });
  const { stageId } = await params;
  if (!validId(stageId))
    return NextResponse.json({ error: "stageId inválido" }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = StageInputSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 }
    );
  }

  // D-52: snapshot before para audit trail completo (solo en prod — dev no tiene DB)
  let before: { name: string; order_index: number } | undefined;
  if (!isDevMode()) {
    const adminDb = createAdminClient();
    const { data } = await adminDb
      .from("service_stages")
      .select("name, order_index")
      .eq("id", stageId)
      .single();
    before = data ?? undefined;
  }

  try {
    await updateStage(stageId, parsed.data);
    await logChange({
      actorEmail: admin,
      entityType: "service_stage",
      entityId: stageId,
      action: "update",
      before,
      after: parsed.data,
    });
    revalidateTag(PROJECTS_OVERVIEW_TAG);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[PATCH /api/stages/:id]", e);
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Requiere admin" }, { status: 403 });
  const { stageId } = await params;
  if (!validId(stageId))
    return NextResponse.json({ error: "stageId inválido" }, { status: 400 });

  try {
    await deleteStage(stageId);
    await logChange({
      actorEmail: admin,
      entityType: "service_stage",
      entityId: stageId,
      action: "delete",
    });
    revalidateTag(PROJECTS_OVERVIEW_TAG);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/stages/:id]", e);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}
