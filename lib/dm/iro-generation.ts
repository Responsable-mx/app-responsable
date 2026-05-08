import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { listActiveIros } from "@/lib/dm/iros";
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

  // Incluir nombres de estándares ESRS para referencia
  const iros = await listActiveIros().catch(() => []);
  const esrsRef = iros.length
    ? iros.map((iro) => `  ${iro.esrs_standard}: ${iro.label} — ${iro.impact_desc}`).join("\n")
    : "";

  return `Eres un consultor senior de Doble Materialidad (ESRS/GRI/SASB) con experiencia en empresas mexicanas.
Tu tarea es identificar el inventario preliminar de IROs (Impactos, Riesgos y Oportunidades) para ${clientName}.

EMPRESA:
  Nombre: ${clientName}
  Sector: ${sector ?? "no especificado"}
  País principal: ${country ?? "México"}

CONTEXTO DEL CUESTIONARIO (datos del cliente):
${questionnaireContext || "  (Sin datos del cuestionario disponibles)"}

SEÑALES DEL BENCHMARK (sector y competidores):
  Empresas analizadas: ${benchmarkCompanies || "No disponible"}
  Narrativa del analista: ${benchmarkNarrative || "No disponible"}

MARCOS DE REFERENCIA ESRS:
${esrsRef || "  E1-E5 Ambiental · S1-S4 Social · G1 Gobernanza"}

REGLAS OBLIGATORIAS:
1. Cada IRO debe describir una situación concreta en formato causa → efecto, NO un tema genérico.
   ❌ Incorrecto: "Gestión de agua"
   ✅ Correcto: "Riesgo de interrupción operativa por escasez de agua en zonas donde opera la empresa"
2. Debe identificar claramente dónde ocurre (upstream / ops_propia / downstream).
3. Debe poder evaluarse en términos de gravedad (score_impacto) y magnitud financiera (score_financiero).
4. Si no puede llevar a una acción concreta, está mal formulado.
5. score_impacto: severidad del impacto sobre personas/ambiente/sociedad (1=bajo, 2=medio, 3=alto).
6. score_financiero: magnitud financiera potencial para la empresa (1=bajo, 2=medio, 3=alto).
7. Prioriza IROs respaldados por el cuestionario del cliente o el benchmark. Marca confianza=alto si tienes evidencia directa.
8. Genera entre 15 y 25 IROs — suficientes para cubrir el perfil de riesgo sin inflar artificialmente.

TIPOS válidos: impacto_positivo | impacto_negativo | riesgo | oportunidad
ESTADO válido: actual | potencial | emergente | en_observacion
CADENA válida: upstream | ops_propia | downstream
HORIZONTE válido: corto | mediano | largo
CONFIANZA válida: alto | medio | bajo

Responde ÚNICAMENTE con JSON válido:
{
  "iros": [
    {
      "n_iro": 1,
      "tema_esg": "Cambio climático y energía",
      "descripcion": "Riesgo de aumento de costos operativos por impuestos al carbono y regulación de emisiones GEI en México.",
      "tipo": "riesgo",
      "estado": "emergente",
      "cadena": "ops_propia",
      "horizonte": "mediano",
      "evidencia": "Benchmark sectorial + regulación NOM-SEMARNAT",
      "confianza": "medio",
      "score_impacto": 2,
      "score_financiero": 3
    }
  ]
}`;
}
