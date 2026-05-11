import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logChange } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; engId: string }> };

const PatchSchema = z.object({
  service_key: z.string().trim().min(1).max(80).optional(),
  year: z.number().int().min(2010).max(2035).nullable().optional(),
  alcance: z.string().trim().max(300).nullable().optional(),
  status: z.enum(["active", "completed"]).optional(),
});

async function syncServicesArray(clientId: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("client_engagements")
    .select("service_key")
    .eq("client_id", clientId);
  const services = [...new Set((data ?? []).map((r: { service_key: string }) => r.service_key))].sort();
  await supabase.from("clients").update({ services }).eq("id", clientId);
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id, engId } = await params;
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Solo admins" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 422 });
  }

  const supabase = createAdminClient();
  const { data: before } = await supabase
    .from("client_engagements")
    .select("*")
    .eq("id", engId)
    .eq("client_id", id)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const { data, error } = await supabase
    .from("client_engagements")
    .update(parsed.data)
    .eq("id", engId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await syncServicesArray(id);
  await logChange({
    actorEmail: admin,
    entityType: "client_engagement",
    entityId: engId,
    action: "update",
    before: before as Record<string, unknown>,
    after: data as Record<string, unknown>,
  });

  return NextResponse.json({ data });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id, engId } = await params;
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Solo admins" }, { status: 403 });

  const supabase = createAdminClient();
  const { data: before } = await supabase
    .from("client_engagements")
    .select("*")
    .eq("id", engId)
    .eq("client_id", id)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const { error } = await supabase.from("client_engagements").delete().eq("id", engId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await syncServicesArray(id);
  await logChange({
    actorEmail: admin,
    entityType: "client_engagement",
    entityId: engId,
    action: "delete",
    before: before as Record<string, unknown>,
    after: null,
  });

  return NextResponse.json({ ok: true });
}
