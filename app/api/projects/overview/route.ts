import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeStatus, type ServiceStage, type StageActivity } from "@/lib/stages";

export type ProjectService = {
  client_service_id: string;
  service: string;
  stages: ServiceStage[];
};

export type ProjectOverview = {
  client_id: string;
  client_name: string;
  sector: string | null;
  services: ProjectService[];
  total_activities: number;
  active_count: number;
  delayed_count: number;
  upcoming_count: number;
};

const MS_DAY = 86_400_000;

export async function GET() {
  const actor = await requireAdmin();
  if (!actor) return NextResponse.json({ error: "Requiere admin" }, { status: 403 });

  const admin = createAdminClient();

  // Pull todo en 4 queries paralelas (clientes, servicios, etapas, actividades)
  const [clientsRes, servicesRes, stagesRes, activitiesRes] = await Promise.all([
    admin.from("clients").select("id, name, sector").order("name"),
    admin.from("client_services").select("id, client_id, service"),
    admin.from("service_stages").select("*").order("order_index"),
    admin.from("stage_activities").select("*").order("order_index"),
  ]);

  if (clientsRes.error) return NextResponse.json({ error: clientsRes.error.message }, { status: 500 });
  if (servicesRes.error) return NextResponse.json({ error: servicesRes.error.message }, { status: 500 });
  if (stagesRes.error) return NextResponse.json({ error: stagesRes.error.message }, { status: 500 });
  if (activitiesRes.error) return NextResponse.json({ error: activitiesRes.error.message }, { status: 500 });

  const today = Date.now();
  const horizon = today + 30 * MS_DAY;

  // Activities with computed status, grouped by stage_id
  const actsByStage = new Map<string, StageActivity[]>();
  for (const raw of activitiesRes.data ?? []) {
    const a: StageActivity = { ...raw, status: computeStatus(raw) };
    const list = actsByStage.get(a.stage_id) ?? [];
    list.push(a);
    actsByStage.set(a.stage_id, list);
  }

  // Stages with activities, grouped by client_service_id
  const stagesByService = new Map<string, ServiceStage[]>();
  for (const s of stagesRes.data ?? []) {
    const stage: ServiceStage = {
      ...s,
      activities: actsByStage.get(s.id) ?? [],
    };
    const list = stagesByService.get(s.client_service_id) ?? [];
    list.push(stage);
    stagesByService.set(s.client_service_id, list);
  }

  // Services grouped by client_id
  const servicesByClient = new Map<string, ProjectService[]>();
  for (const cs of servicesRes.data ?? []) {
    const service: ProjectService = {
      client_service_id: cs.id,
      service: cs.service,
      stages: stagesByService.get(cs.id) ?? [],
    };
    const list = servicesByClient.get(cs.client_id) ?? [];
    list.push(service);
    servicesByClient.set(cs.client_id, list);
  }

  // Build per-project overview con conteos
  const projects: ProjectOverview[] = (clientsRes.data ?? [])
    .map((c) => {
      const services = servicesByClient.get(c.id) ?? [];
      let total = 0;
      let active = 0;
      let delayed = 0;
      let upcoming = 0;
      for (const sv of services) {
        for (const st of sv.stages) {
          for (const a of st.activities) {
            total++;
            if (a.status === "in_progress" || a.status === "delayed") active++;
            if (a.status === "delayed") delayed++;
            if (a.status === "pending" && a.planned_start) {
              const ts = new Date(a.planned_start + "T00:00:00").getTime();
              if (ts >= today && ts <= horizon) upcoming++;
            }
          }
        }
      }
      return {
        client_id: c.id,
        client_name: c.name,
        sector: c.sector,
        services,
        total_activities: total,
        active_count: active,
        delayed_count: delayed,
        upcoming_count: upcoming,
      };
    })
    // Solo proyectos con al menos 1 servicio
    .filter((p) => p.services.length > 0);

  return NextResponse.json({ data: projects });
}
