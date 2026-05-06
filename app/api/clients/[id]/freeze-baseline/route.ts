import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logChange } from "@/lib/audit-log";

type Ctx = { params: Promise<{ id: string }> };

// POST: copia planned_start/end → baseline_start/end donde aún no hay baseline.
// Solo admin. Operación idempotente: actividades con baseline existente no se modifican.
// Pasa ?force=1 para sobrescribir baselines previos.
export async function POST(req: NextRequest, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Requiere admin" }, { status: 403 });

  const { id: clientId } = await params;
  const force = new URL(req.url).searchParams.get("force") === "1";

  const db = createAdminClient();

  // Obtener IDs de todas las actividades del cliente (3 queries porque Supabase JS no soporta subqueries nested)
  const { data: svcs } = await db
    .from("client_services")
    .select("id")
    .eq("client_id", clientId);
  const svcIds = (svcs ?? []).map((s: { id: string }) => s.id);

  const { data: stages } = await db
    .from("service_stages")
    .select("id")
    .in("client_service_id", svcIds.length > 0 ? svcIds : ["__none__"]);
  const stageIds = (stages ?? []).map((s: { id: string }) => s.id);

  const { data: acts, error } = await db
    .from("stage_activities")
    .select("id, planned_start, planned_end, baseline_start")
    .in("stage_id", stageIds.length > 0 ? stageIds : ["__none__"]);

  if (error) {
    console.error("[POST freeze-baseline]", error);
    return NextResponse.json({ error: "Error al obtener actividades" }, { status: 500 });
  }

  const toFreeze = (acts ?? []).filter(
    (a) => a.planned_start && a.planned_end && (force || !a.baseline_start)
  );

  if (toFreeze.length === 0) {
    return NextResponse.json({ ok: true, frozen: 0, skipped: (acts ?? []).length });
  }

  const { error: updErr } = await db
    .from("stage_activities")
    .upsert(
      toFreeze.map((a) => ({
        id: a.id,
        baseline_start: a.planned_start,
        baseline_end: a.planned_end,
      })),
      { onConflict: "id" }
    );

  if (updErr) {
    console.error("[POST freeze-baseline upsert]", updErr);
    return NextResponse.json({ error: "Error al congelar baseline" }, { status: 500 });
  }

  await logChange({
    actorEmail: admin,
    entityType: "clients",
    entityId: clientId,
    action: "update",
    after: { baseline_frozen: true, count: toFreeze.length, force },
  });

  return NextResponse.json({ ok: true, frozen: toFreeze.length, skipped: (acts ?? []).length - toFreeze.length });
}
