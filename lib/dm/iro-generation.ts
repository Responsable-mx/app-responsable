import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { listActiveIros } from "@/lib/dm/iros";
import { getPrompt } from "@/lib/ai/prompts";
import { z } from "zod";

// ── Tipos públicos ────────────────────────────────────────────────────────────

export type IroInventoryItem = {
  id: string;
  client_id: string;
  n_iro: number;
  tema_esg: string;
  descripcion: string;
  tipo: "impacto_positivo" | "impacto_negativo" | "riesgo" | "oportunidad";
  estado: "actual" | "potencial" | "emergente" | "en_observacion";
  cadena: "upstream" | "ops_propia" | "downstream";
  horizonte: "corto" | "mediano" | "largo";
  evidencia: string | null;
  confianza: "alto" | "medio" | "bajo";
  score_impacto: number | null;
  score_financiero: number | null;
  incluido: boolean;
  created_at: string;
  updated_at: string;
};

// ── Schema de validación para respuesta IA ────────────────────────────────────

const IroItemSchema = z.object({
  n_iro:            z.number().int().min(1).max(40),
  tema_esg:         z.string().min(1).max(120),
  descripcion:      z.string().min(20).max(600),
  tipo:             z.enum(["impacto_positivo","impacto_negativo","riesgo","oportunidad"]),
  estado:           z.enum(["actual","potencial","emergente","en_observacion"]),
  cadena:           z.enum(["upstream","ops_propia","downstream"]),
  horizonte:        z.enum(["corto","mediano","largo"]),
  evidencia:        z.string().max(200).optional(),
  confianza:        z.enum(["alto","medio","bajo"]),
  score_impacto:    z.number().int().min(1).max(3),
  score_financiero: z.number().int().min(1).max(3),
});

export const IroGenerationSchema = z.object({
  iros: z.array(IroItemSchema).min(10).max(30),
});

export type IroGenerationResult = z.infer<typeof IroGenerationSchema>;

// ── Contexto del cuestionario (todos los campos rellenos) ─────────────────────

export async function getFullQuestionnaireContext(clientId: string): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("questionnaire_responses")
    .select("responses")
    .eq("client_id", clientId)
    .eq("service_key", "doble-materialidad")
    .maybeSingle();

  if (!data?.responses) return "";

  const lines: string[] = [];
  const responses = data.responses as Record<string, unknown>;

  for (const stepData of Object.values(responses)) {
    if (typeof stepData !== "object" || stepData === null) continue;
    for (const [key, value] of Object.entries(stepData as Record<string, unknown>)) {
      if (value === null || value === undefined || value === "") continue;
      const str = Array.isArray(value)
        ? (value as unknown[]).filter(Boolean).join(", ")
        : String(value).trim();
      if (str.length > 0) lines.push(`  ${key}: ${str}`);
    }
  }

  const text = lines.join("\n");
  // Limitar a 3000 chars para no inflar el prompt
  return text.length > 3000 ? text.slice(0, 3000) + "\n  ...(continúa)" : text;
}

// ── Construcción del prompt ───────────────────────────────────────────────────

export async function buildIroGenerationPrompt(params: {
  clientName: string;
  sector: string | null;
  country: string | null;
  questionnaireContext: string;
  benchmarkNarrative: string;
  benchmarkCompanies: string;
}): Promise<string> {
  const { clientName, sector, country, questionnaireContext, benchmarkNarrative, benchmarkCompanies } = params;

  // ESRS catalog como referencia normativa
  const iros = await listActiveIros().catch(() => []);
  const esrsRef = iros.length
    ? iros.map((iro) => `  ${iro.esrs_standard}: ${iro.label} — ${iro.impact_desc}`).join("\n")
    : "  E1-E5 Ambiental · S1-S4 Social · G1 Gobernanza";

  // Leer template desde DB (con fallback al hardcoded en DEFAULT_PROMPTS)
  const template = await getPrompt("dm.iro_generation");

  return template
    .replaceAll("{{client_name}}", clientName)
    .replaceAll("{{sector}}", sector ?? "no especificado")
    .replaceAll("{{country}}", country ?? "México")
    .replaceAll("{{questionnaire_context}}", questionnaireContext || "  (Sin datos del cuestionario disponibles)")
    .replaceAll("{{benchmark_companies}}", benchmarkCompanies || "No disponible")
    .replaceAll("{{benchmark_narrative}}", benchmarkNarrative || "No disponible")
    .replaceAll("{{esrs_reference}}", esrsRef);
}
