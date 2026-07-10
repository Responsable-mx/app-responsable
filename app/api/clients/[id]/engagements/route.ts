import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireConsultorForClient, requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logChange } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const EngagementSchema = z.object({
  service_key: z.string().trim().min(1).max(80),
  year: z.number().int().min(2010).max(2035).nullable().optional(),
  alcance: z.string().trim().max(300).nullable().optional(),
  status: z.enum(["active", "completed"]).default("active"),
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

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("client_engagements")
    .select("*")
    .eq("client_id", id)
    .order("year", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = EngagementSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 422 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("client_engagements")
    .insert({ client_id: id, ...parsed.data })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await syncServicesArray(id);

  const isAdmin = await requireAdmin();
  await logChange({
    actorEmail: isAdmin ?? user,
    entityType: "client_engagement",
    entityId: data.id,
    action: "create",
    before: null,
    after: data as Record<string, unknown>,
  });

  return NextResponse.json({ data }, { status: 201 });
}
