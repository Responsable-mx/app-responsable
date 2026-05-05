import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDevMode } from "@/lib/env";

// ─── Dev-mode in-memory store ─────────────────────────────
let _seq = 0;
const _devStages: (ServiceStage & { _clientServiceId: string })[] = [];
const _devActs: StageActivity[] = [];
function devId(p: string) { return `${p}-${String(++_seq)}`; }
function _hydrateStages(stages: typeof _devStages): ServiceStage[] {
  return stages.map((s) => ({
    id: s.id,
    client_service_id: s.client_service_id,
    name: s.name,
    order_index: s.order_index,
    created_at: s.created_at,
    updated_at: s.updated_at,
    activities: _devActs
      .filter((a) => a.stage_id === s.id)
      .sort((a, b) => a.order_index - b.order_index)
      .map((a) => ({ ...a, status: computeStatus(a) })),
  }));
}

export type ActivityStatus = "pending" | "in_progress" | "completed" | "delayed";

export type StageActivity = {
  id: string;
  stage_id: string;
  name: string;
  description: string | null;
  order_index: number;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  assignee_email: string | null;
  status: ActivityStatus;
  created_at: string;
  updated_at: string;
};

export type ServiceStage = {
  id: string;
  client_service_id: string;
  name: string;
  order_index: number;
  created_at: string;
  updated_at: string;
  activities: StageActivity[];
};

// Status computado desde fechas — nunca se almacena.
export function computeStatus(a: {
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
}): ActivityStatus {
  const today = new Date().toISOString().slice(0, 10);
  if (a.actual_end) return "completed";
  if (a.actual_start && !a.actual_end) return "in_progress";
  if (a.planned_end && today > a.planned_end) return "delayed";
  return "pending";
}

const dateOrNull = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)")
  .nullable()
  .optional();

export const StageInputSchema = z.object({
  name: z.string().trim().min(1, "Nombre requerido").max(200),
  order_index: z.number().int().min(0).optional(),
});
export type StageInput = z.infer<typeof StageInputSchema>;

export const ActivityInputSchema = z.object({
  name: z.string().trim().min(1, "Nombre requerido").max(200),
  description: z.string().max(2000).nullable().optional(),
  order_index: z.number().int().min(0).optional(),
  planned_start: dateOrNull,
  planned_end: dateOrNull,
  actual_start: dateOrNull,
  actual_end: dateOrNull,
  assignee_email: z.string().email().nullable().optional(),
});
export type ActivityInput = z.infer<typeof ActivityInputSchema>;

// === Queries ===

export async function listStagesByClient(clientId: string): Promise<ServiceStage[]> {
  if (isDevMode()) {
    const { listClientServices } = await import("@/lib/client-services");
    const svcs = await listClientServices(clientId);
    const svcIds = new Set(svcs.map((s) => s.id));
    return _hydrateStages(_devStages.filter((s) => svcIds.has(s.client_service_id)));
  }
  const admin = createAdminClient();
  // Etapas via JOIN: client_services.client_id == clientId
  const { data: services, error: e1 } = await admin
    .from("client_services")
    .select("id")
    .eq("client_id", clientId);
  if (e1) throw e1;
  const serviceIds = (services ?? []).map((s) => s.id);
  if (serviceIds.length === 0) return [];

  const { data: stages, error: e2 } = await admin
    .from("service_stages")
    .select("*")
    .in("client_service_id", serviceIds)
    .order("order_index");
  if (e2) throw e2;

  const stageIds = (stages ?? []).map((s) => s.id);
  const { data: activities, error: e3 } = await admin
    .from("stage_activities")
    .select("*")
    .in("stage_id", stageIds.length ? stageIds : ["00000000-0000-0000-0000-000000000000"])
    .order("order_index");
  if (e3) throw e3;

  return (stages ?? []).map((s) => ({
    ...s,
    activities: (activities ?? [])
      .filter((a) => a.stage_id === s.id)
      .map((a) => ({ ...a, status: computeStatus(a) })),
  }));
}

export async function listStagesByService(clientServiceId: string): Promise<ServiceStage[]> {
  const admin = createAdminClient();
  const { data: stages, error } = await admin
    .from("service_stages")
    .select("*")
    .eq("client_service_id", clientServiceId)
    .order("order_index");
  if (error) throw error;
  const stageIds = (stages ?? []).map((s) => s.id);
  const { data: activities, error: e2 } = await admin
    .from("stage_activities")
    .select("*")
    .in("stage_id", stageIds.length ? stageIds : ["00000000-0000-0000-0000-000000000000"])
    .order("order_index");
  if (e2) throw e2;
  return (stages ?? []).map((s) => ({
    ...s,
    activities: (activities ?? [])
      .filter((a) => a.stage_id === s.id)
      .map((a) => ({ ...a, status: computeStatus(a) })),
  }));
}

export async function createStage(
  clientServiceId: string,
  input: StageInput
): Promise<ServiceStage> {
  if (isDevMode()) {
    const order = input.order_index ??
      _devStages.filter((s) => s.client_service_id === clientServiceId).length;
    const stage = {
      id: devId("dev-stg"),
      client_service_id: clientServiceId,
      _clientServiceId: clientServiceId,
      name: input.name,
      order_index: order,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      activities: [],
    };
    _devStages.push(stage);
    return stage;
  }
  const admin = createAdminClient();
  // Auto order_index: max + 1
  let order = input.order_index;
  if (order === undefined) {
    const { data: last } = await admin
      .from("service_stages")
      .select("order_index")
      .eq("client_service_id", clientServiceId)
      .order("order_index", { ascending: false })
      .limit(1);
    order = (last?.[0]?.order_index ?? -1) + 1;
  }
  const { data, error } = await admin
    .from("service_stages")
    .insert({ client_service_id: clientServiceId, name: input.name, order_index: order })
    .select()
    .single();
  if (error) throw error;
  return { ...data, activities: [] };
}

export async function updateStage(
  stageId: string,
  patch: Partial<StageInput>
): Promise<void> {
  const admin = createAdminClient();
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.order_index !== undefined) update.order_index = patch.order_index;
  const { error } = await admin.from("service_stages").update(update).eq("id", stageId);
  if (error) throw error;
}

export async function deleteStage(stageId: string): Promise<void> {
  if (isDevMode()) {
    const idx = _devStages.findIndex((s) => s.id === stageId);
    if (idx >= 0) _devStages.splice(idx, 1);
    let i = _devActs.length;
    while (i--) { if (_devActs[i].stage_id === stageId) _devActs.splice(i, 1); }
    return;
  }
  const admin = createAdminClient();
  const { error } = await admin.from("service_stages").delete().eq("id", stageId);
  if (error) throw error;
}

export async function createActivity(
  stageId: string,
  input: ActivityInput
): Promise<StageActivity> {
  if (isDevMode()) {
    const order = input.order_index ?? _devActs.filter((a) => a.stage_id === stageId).length;
    const act: StageActivity = {
      id: devId("dev-act"),
      stage_id: stageId,
      name: input.name,
      description: input.description ?? null,
      order_index: order,
      planned_start: input.planned_start ?? null,
      planned_end: input.planned_end ?? null,
      actual_start: input.actual_start ?? null,
      actual_end: input.actual_end ?? null,
      assignee_email: input.assignee_email ?? null,
      status: computeStatus(input as Parameters<typeof computeStatus>[0]),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    _devActs.push(act);
    return act;
  }
  const admin = createAdminClient();
  let order = input.order_index;
  if (order === undefined) {
    const { data: last } = await admin
      .from("stage_activities")
      .select("order_index")
      .eq("stage_id", stageId)
      .order("order_index", { ascending: false })
      .limit(1);
    order = (last?.[0]?.order_index ?? -1) + 1;
  }
  const { data, error } = await admin
    .from("stage_activities")
    .insert({
      stage_id: stageId,
      name: input.name,
      description: input.description ?? null,
      order_index: order,
      planned_start: input.planned_start ?? null,
      planned_end: input.planned_end ?? null,
      actual_start: input.actual_start ?? null,
      actual_end: input.actual_end ?? null,
      assignee_email: input.assignee_email ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return { ...data, status: computeStatus(data) };
}

export async function updateActivity(
  activityId: string,
  patch: Partial<ActivityInput>
): Promise<void> {
  if (isDevMode()) {
    const act = _devActs.find((a) => a.id === activityId);
    if (act) {
      Object.assign(act, patch);
      act.status = computeStatus(act);
      act.updated_at = new Date().toISOString();
    }
    return;
  }
  const admin = createAdminClient();
  const update: Record<string, unknown> = {};
  for (const k of [
    "name",
    "description",
    "order_index",
    "planned_start",
    "planned_end",
    "actual_start",
    "actual_end",
    "assignee_email",
  ] as const) {
    if (patch[k] !== undefined) update[k] = patch[k];
  }
  const { error } = await admin.from("stage_activities").update(update).eq("id", activityId);
  if (error) throw error;
}

export async function deleteActivity(activityId: string): Promise<void> {
  if (isDevMode()) {
    const idx = _devActs.findIndex((a) => a.id === activityId);
    if (idx >= 0) _devActs.splice(idx, 1);
    return;
  }
  const admin = createAdminClient();
  const { error } = await admin.from("stage_activities").delete().eq("id", activityId);
  if (error) throw error;
}

// === Helpers para verificación de ownership (anti-IDOR) ===

export async function getStageOwnerClient(stageId: string): Promise<string | null> {
  if (isDevMode()) {
    return _devStages.find((s) => s.id === stageId) ? "dev-client" : null;
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("service_stages")
    .select("client_service_id, client_services!inner(client_id)")
    .eq("id", stageId)
    .single();
  if (error || !data) return null;
  // Supabase tipo nested: client_services puede ser objeto o array según el join.
  const cs = (data as unknown as { client_services: { client_id: string } | { client_id: string }[] }).client_services;
  if (Array.isArray(cs)) return cs[0]?.client_id ?? null;
  return cs?.client_id ?? null;
}

export async function getActivityOwnerClient(activityId: string): Promise<string | null> {
  if (isDevMode()) {
    const act = _devActs.find((a) => a.id === activityId);
    if (!act) return null;
    return _devStages.find((s) => s.id === act.stage_id) ? "dev-client" : null;
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("stage_activities")
    .select("stage_id, service_stages!inner(client_service_id, client_services!inner(client_id))")
    .eq("id", activityId)
    .single();
  if (error || !data) return null;
  const stage = (data as unknown as { service_stages: { client_services: { client_id: string } | { client_id: string }[] } | { client_services: { client_id: string } | { client_id: string }[] }[] }).service_stages;
  const stageRow = Array.isArray(stage) ? stage[0] : stage;
  const cs = stageRow?.client_services;
  if (!cs) return null;
  if (Array.isArray(cs)) return cs[0]?.client_id ?? null;
  return cs.client_id ?? null;
}
