import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeStatus, type ActivityStatus } from "@/lib/stages";

export type ProjectAssignment = {
  client_id: string;
  client_name: string;
  sector: string | null;
  seniority_override: string | null;
};

export type ConsultantActivity = {
  activity_id: string;
  activity_name: string;
  client_id: string;
  client_name: string;
  service_name: string;
  stage_name: string;
  status: ActivityStatus;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
};

export type TeamMember = {
  email: string;
  full_name: string | null;
  role: string;
  seniority_level: string | null;
  projects: ProjectAssignment[];
  activities: ConsultantActivity[];
  // Conteos derivados (precomputados aquí para evitar lógica duplicada en UI)
  active_count: number; // in_progress + delayed
  delayed_count: number;
  upcoming_count: number; // pending starting in next 30d
};

const MS_DAY = 86_400_000;

export async function GET(req: NextRequest) {
  const actor = await requireAdmin();
  if (!actor) return NextResponse.json({ error: "Requiere admin" }, { status: 403 });

  const includeTest = req.nextUrl.searchParams.get("include_test") === "true";
  const admin = createAdminClient();

  // Query 1: usuarios + asignación a clientes (existente)
  let q = admin
    .from("authorized_users")
    .select(
      `email, full_name, seniority_level, role,
       client_consultors ( seniority_level, clients ( id, name, sector ) )`
    )
    .eq("active", true)
    .order("full_name");
  if (!includeTest) q = q.eq("is_test_account", false);
  const { data: users, error: e1 } = await q;

  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });

  // Solo actividades activas o completadas en el último año — evita acumulación indefinida.
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const oneYearAgoStr = oneYearAgo.toISOString().slice(0, 10);

  // Query 2: actividades con assignee + cadena de joins hasta cliente
  const { data: activitiesRaw, error: e2 } = await admin
    .from("stage_activities")
    .select(
      `id, name, planned_start, planned_end, actual_start, actual_end, assignee_email,
       service_stages!inner ( name, client_services!inner ( service, clients!inner ( id, name ) ) )`
    )
    .not("assignee_email", "is", null)
    .or(`actual_end.is.null,actual_end.gte.${oneYearAgoStr}`);

  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  // Agrupar actividades por assignee_email
  const byAssignee = new Map<string, ConsultantActivity[]>();
  for (const raw of activitiesRaw ?? []) {
    const a = raw as unknown as {
      id: string;
      name: string;
      assignee_email: string;
      planned_start: string | null;
      planned_end: string | null;
      actual_start: string | null;
      actual_end: string | null;
      service_stages: {
        name: string;
        client_services: {
          service: string;
          clients: { id: string; name: string } | { id: string; name: string }[];
        } | { service: string; clients: { id: string; name: string } | { id: string; name: string }[] }[];
      } | { name: string; client_services: { service: string; clients: { id: string; name: string } | { id: string; name: string }[] } | { service: string; clients: { id: string; name: string } | { id: string; name: string }[] }[] }[];
    };
    if (!a.assignee_email) continue;

    // Normalizar nested join (Supabase devuelve objeto o array según FK ambiguity)
    const stage = Array.isArray(a.service_stages) ? a.service_stages[0] : a.service_stages;
    if (!stage) continue;
    const cs = Array.isArray(stage.client_services) ? stage.client_services[0] : stage.client_services;
    if (!cs) continue;
    const cli = Array.isArray(cs.clients) ? cs.clients[0] : cs.clients;
    if (!cli) continue;

    const list = byAssignee.get(a.assignee_email) ?? [];
    list.push({
      activity_id: a.id,
      activity_name: a.name,
      client_id: cli.id,
      client_name: cli.name,
      service_name: cs.service,
      stage_name: stage.name,
      status: computeStatus(a),
      planned_start: a.planned_start,
      planned_end: a.planned_end,
      actual_start: a.actual_start,
      actual_end: a.actual_end,
    });
    byAssignee.set(a.assignee_email, list);
  }

  // Construir miembros del equipo con conteos derivados
  const today = Date.now();
  const horizon30d = today + 30 * MS_DAY;

  const members: TeamMember[] = (users ?? []).map((u) => {
    const ccs = (u as unknown as { client_consultors: { seniority_level: string | null; clients: { id: string; name: string; sector: string | null } | null }[] }).client_consultors ?? [];
    const acts = byAssignee.get(u.email) ?? [];

    let active = 0;
    let delayed = 0;
    let upcoming = 0;
    for (const a of acts) {
      if (a.status === "in_progress" || a.status === "delayed") active++;
      if (a.status === "delayed") delayed++;
      if (a.status === "pending" && a.planned_start) {
        const ts = new Date(a.planned_start + "T00:00:00").getTime();
        if (ts >= today && ts <= horizon30d) upcoming++;
      }
    }

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
      activities: acts,
      active_count: active,
      delayed_count: delayed,
      upcoming_count: upcoming,
    };
  });

  return NextResponse.json({ data: members });
}
