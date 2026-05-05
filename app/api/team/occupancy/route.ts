import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type ProjectAssignment = {
  client_id: string;
  client_name: string;
  sector: string | null;
  seniority_override: string | null;
};

export type TeamMember = {
  email: string;
  full_name: string | null;
  role: string;
  seniority_level: string | null;
  projects: ProjectAssignment[];
};

export async function GET() {
  const actor = await requireAdmin();
  if (!actor) return NextResponse.json({ error: "Requiere admin" }, { status: 403 });

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("authorized_users")
    .select(
      `email, full_name, seniority_level, role,
       client_consultors ( seniority_level, clients ( id, name, sector ) )`
    )
    .eq("active", true)
    .order("full_name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const members: TeamMember[] = (data ?? []).map((u) => {
    const ccs = (u as unknown as { client_consultors: { seniority_level: string | null; clients: { id: string; name: string; sector: string | null } | null }[] }).client_consultors ?? [];
    return {
      email: u.email,
      full_name: u.full_name,
      role: u.role,
      seniority_level: u.seniority_level,
      projects: ccs
        .filter((cc) => cc.clients)
        .map((cc) => ({
          client_id: cc.clients!.id,
          client_name: cc.clients!.name,
          sector: cc.clients!.sector ?? null,
          seniority_override: cc.seniority_level ?? null,
        })),
    };
  });

  return NextResponse.json({ data: members });
}
