import { NextRequest, NextResponse } from "next/server";
import { requireUser, requireAdmin } from "@/lib/auth";
import {
  ActivityInputSchema,
  updateActivity,
  deleteActivity,
  getActivityOwnerClient,
} from "@/lib/stages";
import { logChange } from "@/lib/audit-log";
import { createAdminClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ activityId: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PATCH: actualizar fechas, asignación o nombre.
// Permitido a CONSULTOR (no solo admin) si solo actualiza actual_start/actual_end
// (caso "consultor reporta progreso real"). Admin puede actualizar todo.
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const { activityId } = await params;
  if (!UUID_RE.test(activityId))
    return NextResponse.json({ error: "activityId inválido" }, { status: 400 });

  const owner = await getActivityOwnerClient(activityId);
  if (!owner) return NextResponse.json({ error: "Actividad no encontrada" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = ActivityInputSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 }
    );
  }

  // Si cambia algo más allá de actual_start/actual_end, requiere admin
  const adminOnlyFields = [
    "name",
    "description",
    "order_index",
    "planned_start",
    "planned_end",
    "assignee_email",
  ] as const;
  const touchesAdminField = adminOnlyFields.some((k) => parsed.data[k] !== undefined);

  if (touchesAdminField) {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json(
        {
          error:
            "Solo admin puede editar nombre/fechas plan/asignado. Consultor solo edita fechas reales.",
        },
        { status: 403 }
      );
    }
  }

  // Si el actor no es admin, debe estar en el equipo del cliente o ser el assignee
  const isAdminEmail = (await requireAdmin()) !== null;
  if (!isAdminEmail) {
    const adminDb = createAdminClient();
    const { data: act } = await adminDb
      .from("stage_activities")
      .select("assignee_email, stage_id")
      .eq("id", activityId)
      .single();
    if (!act) return NextResponse.json({ error: "No existe" }, { status: 404 });
    const isAssignee = act.assignee_email === user;
    const { data: team } = await adminDb
      .from("client_consultors")
      .select("user_email")
      .eq("client_id", owner)
      .eq("user_email", user);
    const isTeam = (team ?? []).length > 0;
    if (!isAssignee && !isTeam) {
      return NextResponse.json(
        { error: "No estás asignado a este cliente ni a esta actividad." },
        { status: 403 }
      );
    }
  }

  try {
    await updateActivity(activityId, parsed.data);
    await logChange({
      actorEmail: user,
      entityType: "stage_activity",
      entityId: activityId,
      action: "update",
      after: parsed.data,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[PATCH /api/activities/:id]", e);
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Requiere admin" }, { status: 403 });
  const { activityId } = await params;
  if (!UUID_RE.test(activityId))
    return NextResponse.json({ error: "activityId inválido" }, { status: 400 });

  const owner = await getActivityOwnerClient(activityId);
  if (!owner) return NextResponse.json({ error: "Actividad no encontrada" }, { status: 404 });

  try {
    await deleteActivity(activityId);
    await logChange({
      actorEmail: admin,
      entityType: "stage_activity",
      entityId: activityId,
      action: "delete",
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/activities/:id]", e);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}
