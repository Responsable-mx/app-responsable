import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logChange } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

export type AutoUpdateConfigRow = {
  resource_key: string;
  label: string;
  description: string | null;
  enabled: boolean;
  frequency_days: number;
  recommended_frequency_days: number | null;
  recommendation_reason: string | null;
  last_run_at: string | null;
  last_status: "ok" | "partial" | "failed" | null;
  last_error: string | null;
  last_run_summary: Record<string, unknown> | null;
  updated_by: string | null;
  updated_at: string;
  /** ROI tracking — poblado por el cron al ejecutar cada handler */
  last_run_cost_usd:    number | null;
  last_run_savings_usd: number | null;
  total_cost_usd:       number | null;
  total_savings_usd:    number | null;
};

const PatchSchema = z.object({
  resource_key: z.string().min(1),
  enabled: z.boolean().optional(),
  frequency_days: z.number().int().min(1).max(365).optional(),
});

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Solo admin" }, { status: 403 });

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("auto_update_config")
    .select("*")
    .order("resource_key");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data: (data ?? []) as AutoUpdateConfigRow[] });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Solo admin" }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validación falló", details: parsed.error.flatten() }, { status: 400 });
  }

  const sb = createAdminClient();
  const { data: before } = await sb
    .from("auto_update_config")
    .select("*")
    .eq("resource_key", parsed.data.resource_key)
    .maybeSingle();

  if (!before) {
    return NextResponse.json({ error: "Recurso no encontrado" }, { status: 404 });
  }

  const updates: Record<string, unknown> = { updated_by: admin, updated_at: new Date().toISOString() };
  if (typeof parsed.data.enabled === "boolean") updates.enabled = parsed.data.enabled;
  if (typeof parsed.data.frequency_days === "number") updates.frequency_days = parsed.data.frequency_days;

  const { data: after, error } = await sb
    .from("auto_update_config")
    .update(updates)
    .eq("resource_key", parsed.data.resource_key)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  void logChange({
    actorEmail: admin,
    entityType: "auto_update_config",
    entityId: parsed.data.resource_key,
    action: "update",
    before: { enabled: before.enabled, frequency_days: before.frequency_days },
    after: { enabled: after.enabled, frequency_days: after.frequency_days },
  });

  return NextResponse.json({ data: after as AutoUpdateConfigRow });
}
