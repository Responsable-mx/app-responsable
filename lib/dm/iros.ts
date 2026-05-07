import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFieldValue, isFieldFilled, type WizardResponseData } from "@/lib/questionnaires/types";

export type DmIroConfig = {
  id: string;
  esrs_standard: string;            // E1, E2, E3, E4, E5, S1, S2, S3, S4, G1
  label: string;
  category: "ambiental" | "social" | "gobernanza";
  impact_desc: string;              // Impacto: Interno → Externo
  risk_desc: string;                // Riesgo:  Externo → Interno
  opportunity_desc: string;         // Oportunidad: Externo → Interno
  questionnaire_field_keys: string[];
  is_active: boolean;
  sort_order: number;
  updated_by: string | null;
  updated_at: string;
};

// ── In-memory cache 7200s ────────────────────────────────────────────────────
let _cache: DmIroConfig[] | null = null;
let _cacheAt = 0;
const CACHE_TTL_MS = 7_200_000; // 2h

export async function listActiveIros(): Promise<DmIroConfig[]> {
  const now = Date.now();
  if (_cache && now - _cacheAt < CACHE_TTL_MS) return _cache;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("dm_iro_config")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`Error leyendo IROs: ${error.message}`);
  _cache = (data ?? []) as DmIroConfig[];
  _cacheAt = now;
  return _cache;
}

/** Invalidar cache — llamado por PATCH /api/iros/[id] */
export function invalidateIrosCache() {
  _cache = null;
  _cacheAt = 0;
}

/**
 * Lee las respuestas del cuestionario del cliente para los campos vinculados al IRO.
 * Devuelve texto plano (una línea por campo con valor) para inyectar en el prompt.
 */
export async function getIroQuestionnaireContext(
  clientId: string,
  iro: DmIroConfig
): Promise<string> {
  if (!iro.questionnaire_field_keys.length) return "";

  const admin = createAdminClient();
  const { data } = await admin
    .from("questionnaire_responses")
    .select("responses")
    .eq("client_id", clientId)
    .eq("service_key", "doble-materialidad")
    .maybeSingle();

  if (!data?.responses) return "";

  const responses = data.responses as WizardResponseData;
  const lines: string[] = [];

  for (const stepData of Object.values(responses)) {
    if (typeof stepData !== "object" || stepData === null) continue;
    for (const fieldKey of iro.questionnaire_field_keys) {
      const raw = (stepData as Record<string, unknown>)[fieldKey];
      if (raw === undefined) continue;
      const val = getFieldValue(raw);
      if (!isFieldFilled(val)) continue;
      const strVal = Array.isArray(val) ? val.join(", ") : String(val);
      lines.push(`  ${fieldKey}: ${strVal}`);
    }
  }

  return lines.length ? lines.join("\n") : "";
}
