import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { invalidateIrosCache } from "@/lib/dm/iros";
import { logChange } from "@/lib/audit-log";
import { z } from "zod";

export const dynamic = "force-dynamic";

const PatchBody = z.object({
  label:                    z.string().min(1).max(200).optional(),
  impact_desc:              z.string().max(2000).optional(),
  risk_desc:                z.string().max(2000).optional(),
  opportunity_desc:         z.string().max(2000).optional(),
  questionnaire_field_keys: z.array(z.string()).optional(),
  is_active:                z.boolean().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/iros/[id] — actualiza un IRO (solo admin).
 *  Invalida cache in-memory tras la actualización. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const actorEmail = await requireAdmin();
  if (!actorEmail) return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = PatchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Body inválido" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Snapshot before
  const { data: before } = await admin
    .from("dm_iro_config")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!before) return NextResponse.json({ error: "IRO no encontrado" }, { status: 404 });

  const { data: updated, error } = await admin
    .from("dm_iro_config")
    .update({ ...parsed.data, updated_by: actorEmail, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: error?.message ?? "Error al actualizar" }, { status: 500 });
  }

  // Invalidar cache en-memoria para que el próximo listActiveIros() lea de DB
  invalidateIrosCache();

  void logChange({
    actorEmail,
    entityType: "dm_iro_config",
    entityId: id,
    action: "update",
    before,
    after: updated,
  });

  return NextResponse.json({ data: updated });
}
