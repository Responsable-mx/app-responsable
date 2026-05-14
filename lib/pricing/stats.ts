import "server-only";
import { isDevMode } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export type ProjectDetail = {
  id: string;
  client_id: string;
  client_name: string;
  is_pilot: boolean;
  actual_cost: number | null;
  sale_price: number | null;
  cost_notes: string | null;
  created_at: string;
};

export type ServicePricingStats = {
  service_key: string;
  count: number;
  pilot_count: number;
  avg_actual_cost: number | null;
  only_pilots: boolean;
  projects: ProjectDetail[];
};

const DEV_STATS: ServicePricingStats[] = [
  {
    service_key: "doble_materialidad_ia",
    count: 1,
    pilot_count: 1,
    avg_actual_cost: 18500,
    only_pilots: true,
    projects: [
      {
        id: "dev-dm-ia-1",
        client_id: "dev-altamira",
        client_name: "Altamira",
        is_pilot: true,
        actual_cost: 18500,
        sale_price: 15000,
        cost_notes: "Piloto — bugs iniciales, onboarding equipo.",
        created_at: "2026-05-01T00:00:00Z",
      },
    ],
  },
];

export async function getServicePricingStats(): Promise<ServicePricingStats[]> {
  if (isDevMode()) return DEV_STATS;

  const admin = createAdminClient();

  const [{ data: services, error }, { data: clients }] = await Promise.all([
    admin
      .from("client_services")
      .select("id, client_id, service, is_pilot, actual_cost, sale_price, cost_notes, created_at")
      .order("service")
      .order("created_at"),
    admin.from("clients").select("id, name"),
  ]);

  if (error) {
    console.error("[pricing/stats] fetch:", error.message);
    return [];
  }

  const clientNameMap = new Map<string, string>(
    (clients ?? []).map((c) => [c.id as string, c.name as string])
  );

  const byService = new Map<string, ProjectDetail[]>();
  for (const row of services ?? []) {
    const key = row.service as string;
    if (!byService.has(key)) byService.set(key, []);
    byService.get(key)!.push({
      id: row.id as string,
      client_id: row.client_id as string,
      client_name: clientNameMap.get(row.client_id as string) ?? "Sin nombre",
      is_pilot: row.is_pilot as boolean,
      actual_cost: row.actual_cost as number | null,
      sale_price: row.sale_price as number | null,
      cost_notes: row.cost_notes as string | null,
      created_at: row.created_at as string,
    });
  }

  const result: ServicePricingStats[] = [];
  for (const [serviceKey, projects] of byService) {
    const withCost = projects.filter((p) => p.actual_cost !== null);
    const pilotCount = projects.filter((p) => p.is_pilot).length;
    const avg =
      withCost.length > 0
        ? Math.round(withCost.reduce((s, p) => s + p.actual_cost!, 0) / withCost.length)
        : null;
    result.push({
      service_key: serviceKey,
      count: projects.length,
      pilot_count: pilotCount,
      avg_actual_cost: avg,
      only_pilots: pilotCount === projects.length && projects.length > 0,
      projects,
    });
  }

  return result;
}
