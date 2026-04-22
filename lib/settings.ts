import "server-only";
import { isDevMode } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

const DEFAULT_SETTINGS: Record<string, unknown> = {
  tour_version: 1,
};

export async function getSetting<T = unknown>(
  key: string
): Promise<T | null> {
  if (isDevMode()) {
    return (DEFAULT_SETTINGS[key] as T) ?? null;
  }
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (data?.value !== undefined) return data.value as T;
    return (DEFAULT_SETTINGS[key] as T) ?? null;
  } catch (e) {
    console.error(`[settings] get ${key} error:`, e);
    return (DEFAULT_SETTINGS[key] as T) ?? null;
  }
}

export async function setSetting(
  key: string,
  value: unknown,
  updatedBy: string
): Promise<void> {
  if (isDevMode()) {
    throw new Error("Supabase no configurado (dev mode).");
  }
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("app_settings")
    .select("key")
    .eq("key", key)
    .maybeSingle();

  if (existing) {
    const { error } = await admin
      .from("app_settings")
      .update({
        value,
        updated_by: updatedBy,
        updated_at: new Date().toISOString(),
      })
      .eq("key", key);
    if (error) throw new Error(`setSetting update: ${error.message}`);
  } else {
    const { error } = await admin.from("app_settings").insert({
      key,
      value,
      updated_by: updatedBy,
    });
    if (error) throw new Error(`setSetting insert: ${error.message}`);
  }
}

/** Bump del tour_version para forzar re-tour a todo el equipo. */
export async function bumpTourVersion(updatedBy: string): Promise<number> {
  const current = (await getSetting<number>("tour_version")) ?? 1;
  const next = current + 1;
  await setSetting("tour_version", next, updatedBy);
  return next;
}
