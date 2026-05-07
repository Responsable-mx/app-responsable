import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
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

export const PROJECTS_OVERVIEW_TAG = "projects-overview";

const buildProjectsOverview = unstable_cache(
  async (): Promise<ProjectOverview[]> => {
    const admin = createAdminClient();

    const [clientsRes, servicesRes, stagesRes, activitiesRes] = await Promise.all([
      admin.from("clients").select("id, name, sector").order("name"),
      admin.from("client_services").select("id, client_id, service"),
      admin.from("service_stages").select("id,client_service_id,name,order_index,created_at,updated_at").order("order_index"),
      admin.from("stage_activities").select("id,stage_id,name,assignee_email,planned_start,planned_end,actual_start,actual_end,depends_on_activity_id,order_index").order("order_index"),
    ]);

    if (clientsRes.error) throw new Error(clientsRes.error.message);
    if (servicesRes.error) throw new Error(servicesRes.error.message);
    if (stagesRes.error) throw new Error(stagesRes.error.message);
    if (activitiesRes.error) throw new Error(activitiesRes.error.message);

    const today = Date.now();
    const horizon = today + 30 * MS_DAY;

    const actsByStage = new Map<string, StageActivity[]>();
    for (const raw of activitiesRes.data ?? []) {
      const a: StageActivity = { ...raw, status: computeStatus(raw) };
      const list = actsByStage.get(a.stage_id) ?? [];
      list.push(a);
      actsByStage.set(a.stage_id, list);
    }

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

    return (clientsRes.data ?? [])
      .map((c) => {
        const services = servicesByClient.get(c.id) ?? [];
        let total = 0, active = 0, delayed = 0, upcoming = 0;
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
      .filter((p) => p.services.length > 0);
  },
  [PROJECTS_OVERVIEW_TAG],
  { revalidate: 60, tags: [PROJECTS_OVERVIEW_TAG] }
);

export async function GET() {
  const actor = await requireAdmin();
  if (!actor) return NextResponse.json({ error: "Requiere admin" }, { status: 403 });

  try {
    const data = await buildProjectsOverview();
    return NextResponse.json({ data }, {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=300" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al cargar proyectos";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
