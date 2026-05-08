import { NextRequest, NextResponse } from "next/server";
import { requireConsultorForClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type AuditLogEntry = {
  id: string;
  action: "INSERT" | "UPDATE" | "DELETE";
  entity_type: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  actor_email: string;
  created_at: string;
};

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("audit_log")
    .select("id, action, entity_type, before, after, actor_email, created_at")
    .eq("entity_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: "Error al consultar audit log" }, { status: 500 });
  }

  return NextResponse.json({ entries: (data ?? []) as AuditLogEntry[] });
}
