import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

export type TemplateActivity = {
  name: string;
  description: string | null;
  order_index: number;
  // Offsets en días desde fecha base. Null = actividad sin fecha plan en el origen.
  offset_start_days: number | null;
  offset_end_days: number | null;
  // Path "stageIdx.actIdx" del predecesor; resuelto a UUID real al aplicar.
  depends_on_path?: string | null;
};

export type TemplateStage = {
  name: string;
  order_index: number;
  activities: TemplateActivity[];
};

export type TemplateData = { stages: TemplateStage[] };

export type StageTemplate = {
  id: string;
  name: string;
  description: string | null;
  service: string | null;
  data: TemplateData;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export const TemplateActivitySchema = z.object({
  name: z.string().trim().min(1, "Nombre requerido").max(200),
  description: z.string().max(2000).nullable().optional(),
  order_index: z.number().int().min(0),
  offset_start_days: z.number().int().nullable().optional(),
  offset_end_days: z.number().int().nullable().optional(),
  // Referencia por path: "stageIdx.actIdx" del predecesor en la misma plantilla.
  // Al aplicar, se resuelve a stage_activities.id real.
  depends_on_path: z.string().regex(/^\d+\.\d+$/).nullable().optional(),
});

export const TemplateStageSchema = z.object({
  name: z.string().trim().min(1, "Nombre requerido").max(200),
  order_index: z.number().int().min(0),
  activities: z.array(TemplateActivitySchema),
});

export const TemplateDataSchema = z.object({
  stages: z.array(TemplateStageSchema),
});

export const TemplateInputSchema = z.object({
  name: z.string().trim().min(1, "Nombre requerido").max(200),
  description: z.string().max(2000).nullable().optional(),
  service: z.string().max(100).nullable().optional(),
  data: TemplateDataSchema.optional(),
});

export const CreateFromServiceSchema = TemplateInputSchema.extend({
  fromClientServiceId: z.string().uuid(),
});

export const ApplyTemplateSchema = z.object({
  client_service_id: z.string().uuid(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)"),
});

const MS_DAY = 86_400_000;

function diffDays(from: string, to: string): number {
  const a = new Date(from + "T00:00:00").getTime();
  const b = new Date(to + "T00:00:00").getTime();
  return Math.round((b - a) / MS_DAY);
}

function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// === Queries ===

export async function listTemplates(serviceFilter?: string): Promise<StageTemplate[]> {
  const admin = createAdminClient();
  let q = admin.from("stage_templates").select("*").order("name");
  if (serviceFilter) q = q.eq("service", serviceFilter);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as StageTemplate[];
}

export async function getTemplate(id: string): Promise<StageTemplate | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("stage_templates")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return null;
  return data as StageTemplate;
}

export async function deleteTemplate(id: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("stage_templates").delete().eq("id", id);
  if (error) throw error;
}

// Crea plantilla leyendo stages+activities de un client_service existente.
// Calcula offsets relativos a la fecha plan más temprana del origen.
export async function createTemplateFromService(input: {
  name: string;
  description: string | null;
  service: string | null;
  fromClientServiceId: string;
  createdBy: string;
}): Promise<StageTemplate> {
  const admin = createAdminClient();

  // Verificar que el client_service existe + obtener su service key (default si no se pasó)
  const { data: cs, error: e1 } = await admin
    .from("client_services")
    .select("service")
    .eq("id", input.fromClientServiceId)
    .single();
  if (e1 || !cs) throw new Error("Servicio origen no encontrado");

  // Pull stages + activities
  const { data: stages, error: e2 } = await admin
    .from("service_stages")
    .select("*")
    .eq("client_service_id", input.fromClientServiceId)
    .order("order_index");
  if (e2) throw e2;

  const stageIds = (stages ?? []).map((s) => s.id);
  const { data: acts, error: e3 } = await admin
    .from("stage_activities")
    .select("*")
    .in("stage_id", stageIds.length ? stageIds : ["00000000-0000-0000-0000-000000000000"])
    .order("order_index");
  if (e3) throw e3;

  // Calcular fecha base = MIN(planned_start) entre todas las actividades.
  // Si ninguna tiene planned_start, todos los offsets quedan null.
  let baseDate: string | null = null;
  for (const a of acts ?? []) {
    if (a.planned_start && (!baseDate || a.planned_start < baseDate)) {
      baseDate = a.planned_start as string;
    }
  }

  const data: TemplateData = {
    stages: (stages ?? []).map((s) => ({
      name: s.name,
      order_index: s.order_index,
      activities: (acts ?? [])
        .filter((a) => a.stage_id === s.id)
        .map((a) => ({
          name: a.name,
          description: a.description ?? null,
          order_index: a.order_index,
          offset_start_days:
            a.planned_start && baseDate ? diffDays(baseDate, a.planned_start) : null,
          offset_end_days:
            a.planned_end && baseDate ? diffDays(baseDate, a.planned_end) : null,
        })),
    })),
  };

  const { data: tpl, error: e4 } = await admin
    .from("stage_templates")
    .insert({
      name: input.name,
      description: input.description,
      service: input.service ?? cs.service,
      data,
      created_by: input.createdBy,
    })
    .select()
    .single();
  if (e4) throw e4;
  return tpl as StageTemplate;
}

// Aplica plantilla a un client_service. Crea stages+activities con
// planned_start/planned_end calculados desde startDate + offsets.
export async function applyTemplate(input: {
  templateId: string;
  clientServiceId: string;
  startDate: string; // YYYY-MM-DD
}): Promise<{ stagesCreated: number; activitiesCreated: number }> {
  const admin = createAdminClient();
  const tpl = await getTemplate(input.templateId);
  if (!tpl) throw new Error("Plantilla no encontrada");

  // Verificar que el client_service existe
  const { data: cs, error: e1 } = await admin
    .from("client_services")
    .select("id")
    .eq("id", input.clientServiceId)
    .single();
  if (e1 || !cs) throw new Error("Servicio destino no encontrado");

  // Calcular order_index inicial (max actual + 1) para no chocar con stages existentes
  const { data: existingStages } = await admin
    .from("service_stages")
    .select("order_index")
    .eq("client_service_id", input.clientServiceId)
    .order("order_index", { ascending: false })
    .limit(1);
  const baseOrder = (existingStages?.[0]?.order_index ?? -1) + 1;

  let stagesCreated = 0;
  let activitiesCreated = 0;

  // Pass 1: crear stages + activities; capturar mapping path "sIdx.aIdx" → activityId real.
  const idMap = new Map<string, string>();
  const pendingDeps: { activityId: string; dependsOnPath: string }[] = [];

  for (let sIdx = 0; sIdx < tpl.data.stages.length; sIdx++) {
    const tplStage = tpl.data.stages[sIdx];
    const { data: stage, error: e2 } = await admin
      .from("service_stages")
      .insert({
        client_service_id: input.clientServiceId,
        name: tplStage.name,
        order_index: baseOrder + tplStage.order_index,
      })
      .select()
      .single();
    if (e2) throw e2;
    stagesCreated++;

    for (let aIdx = 0; aIdx < tplStage.activities.length; aIdx++) {
      const a = tplStage.activities[aIdx];
      const { data: act, error: e3 } = await admin
        .from("stage_activities")
        .insert({
          stage_id: stage.id,
          name: a.name,
          description: a.description,
          order_index: a.order_index,
          planned_start: a.offset_start_days !== null && a.offset_start_days !== undefined ? addDays(input.startDate, a.offset_start_days) : null,
          planned_end: a.offset_end_days !== null && a.offset_end_days !== undefined ? addDays(input.startDate, a.offset_end_days) : null,
        })
        .select("id")
        .single();
      if (e3) throw e3;
      idMap.set(`${sIdx}.${aIdx}`, act.id);
      if (a.depends_on_path) {
        pendingDeps.push({ activityId: act.id, dependsOnPath: a.depends_on_path });
      }
      activitiesCreated++;
    }
  }

  // Pass 2: resolver dependencias (paths → UUIDs reales)
  for (const dep of pendingDeps) {
    const targetId = idMap.get(dep.dependsOnPath);
    if (!targetId) continue; // path inválido, ignorar
    await admin
      .from("stage_activities")
      .update({ depends_on_activity_id: targetId })
      .eq("id", dep.activityId);
  }

  return { stagesCreated, activitiesCreated };
}
