import { NextRequest, NextResponse } from "next/server";
import { requireConsultorForClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logChange } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// ── GET: retorna el registro de validación del cliente ───────────────────────

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const admin = createAdminClient();
  const { data } = await admin
    .from("dm_validaciones")
    .select("id, client_id, fecha_junta, modalidad, asistentes, iro_decisions, notas, created_at, updated_at")
    .eq("client_id", id)
    .maybeSingle();

  return NextResponse.json({ data: data ?? null });
}

// ── PATCH: upsert del registro de validación (campos parciales) ──────────────

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verificar si ya existe registro para este cliente
  const { data: existing } = await admin
    .from("dm_validaciones")
    .select("id, iro_decisions")
    .eq("client_id", id)
    .maybeSingle();

  const allowed = ["fecha_junta", "modalidad", "asistentes", "iro_decisions", "notas"] as const;
  type AllowedKey = typeof allowed[number];
  const patch: Partial<Record<AllowedKey, unknown>> & { updated_at: string; created_by?: string } = {
    updated_at: new Date().toISOString(),
  };

  for (const key of allowed) {
    if (key in body) {
      patch[key] = body[key];
    }
  }

  // Merge granular de iro_decisions cuando se pasa un objeto parcial
  if (body.iro_decisions && typeof body.iro_decisions === "object" && !Array.isArray(body.iro_decisions)) {
    const existingDecisions = (existing?.iro_decisions as Record<string, unknown>) ?? {};
    patch.iro_decisions = { ...existingDecisions, ...(body.iro_decisions as Record<string, unknown>) };
  }

  if (existing) {
    const { data, error } = await admin
      .from("dm_validaciones")
      .update(patch)
      .eq("id", existing.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    void logChange({
      actorEmail: user,
      entityType: "dm_validacion",
      entityId: existing.id,
      action: "update",
      before: { iro_decisions: existing.iro_decisions },
      after: { client_id: id, ...patch },
    });
    return NextResponse.json({ data });
  }

  // Crear nuevo registro
  const { data, error } = await admin
    .from("dm_validaciones")
    .insert({ client_id: id, created_by: user, ...patch })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  void logChange({
    actorEmail: user,
    entityType: "dm_validacion",
    entityId: data.id,
    action: "create",
    before: null,
    after: { client_id: id, ...patch },
  });
  return NextResponse.json({ data });
}
