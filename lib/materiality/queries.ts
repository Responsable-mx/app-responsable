import "server-only";
import { isDevMode } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  TEMPLATE_TOPICS,
  type MaterialityTopic,
  type MaterialityTopicInput,
} from "./types";

const SERVICE_KEY = "doble-materialidad";

export async function listMaterialityTopics(
  clientId: string
): Promise<MaterialityTopic[]> {
  if (isDevMode()) return [];
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("materiality_topics")
    .select("*")
    .eq("client_id", clientId)
    .eq("service_key", SERVICE_KEY)
    .order("position_index", { ascending: true });
  if (error) throw new Error(`Error leyendo temas: ${error.message}`);
  return (data ?? []) as MaterialityTopic[];
}

export async function initMaterialityFromTemplate(
  clientId: string,
  actorEmail: string
): Promise<MaterialityTopic[]> {
  if (isDevMode()) {
    throw new Error("Supabase no configurado (dev mode).");
  }
  const supabase = createAdminClient();
  const rows = TEMPLATE_TOPICS.map((t, idx) => ({
    client_id: clientId,
    service_key: SERVICE_KEY,
    topic_key: t.topic_key,
    label: t.label,
    x_pos: t.x_pos,
    y_pos: t.y_pos,
    color: t.color,
    size: t.size,
    section_key: t.section_key ?? null,
    position_index: idx,
    created_by: actorEmail,
    updated_by: actorEmail,
  }));
  const { data, error } = await supabase
    .from("materiality_topics")
    .insert(rows)
    .select();
  if (error) throw new Error(`Error creando plantilla: ${error.message}`);
  return (data ?? []) as MaterialityTopic[];
}

export async function createMaterialityTopic(opts: {
  clientId: string;
  input: MaterialityTopicInput;
  actorEmail: string;
}): Promise<MaterialityTopic> {
  if (isDevMode()) throw new Error("Supabase no configurado (dev mode).");
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("materiality_topics")
    .insert({
      client_id: opts.clientId,
      service_key: SERVICE_KEY,
      topic_key: opts.input.topic_key,
      label: opts.input.label,
      x_pos: opts.input.x_pos,
      y_pos: opts.input.y_pos,
      color: opts.input.color,
      size: opts.input.size,
      section_key: opts.input.section_key ?? null,
      position_index: opts.input.position_index ?? 0,
      notes: opts.input.notes ?? null,
      created_by: opts.actorEmail,
      updated_by: opts.actorEmail,
    })
    .select()
    .single();
  if (error) throw new Error(`Error creando tema: ${error.message}`);
  return data as MaterialityTopic;
}

export async function updateMaterialityTopic(opts: {
  topicId: string;
  patch: Partial<MaterialityTopicInput>;
  actorEmail: string;
}): Promise<MaterialityTopic> {
  if (isDevMode()) throw new Error("Supabase no configurado (dev mode).");
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("materiality_topics")
    .update({ ...opts.patch, updated_by: opts.actorEmail })
    .eq("id", opts.topicId)
    .select()
    .single();
  if (error) throw new Error(`Error actualizando tema: ${error.message}`);
  return data as MaterialityTopic;
}

export async function deleteMaterialityTopic(topicId: string): Promise<void> {
  if (isDevMode()) throw new Error("Supabase no configurado (dev mode).");
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("materiality_topics")
    .delete()
    .eq("id", topicId);
  if (error) throw new Error(`Error eliminando tema: ${error.message}`);
}
