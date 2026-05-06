import "server-only";
import type { Client } from "@/lib/clients";
import type { RoleId } from "@/lib/ai/models";
import { buildRoleSystemText } from "@/lib/ai/prompts";
import { NARRATIVE_SCHEMAS } from "@/lib/clients/narrative-schemas";
import { CATALOG_SEEDS, type CatalogCategory } from "@/lib/catalogs/seeds";
import type { QuestionnaireBundle } from "@/lib/questionnaires/types";
import { isWizardSchema, isFieldResponse } from "@/lib/questionnaires/types";

export { DEFAULT_PROMPTS, PROMPT_KEYS } from "@/lib/ai/prompts";

// ── Mapeo code → label humano (es-MX) ──────────────────────────
// Los códigos del catálogo (`doble_materialidad`, `gestionado`, `gri`...)
// son referencias internas. El LLM razona mejor si recibe el nombre humano
// junto al código — y nunca debe repetir el código literal en respuesta al
// consultor. STARTER_UX §7.3 + §8.
const CATALOG_LABELS: Record<CatalogCategory, Record<string, string>> = (() => {
  const out: Record<string, Record<string, string>> = {};
  for (const item of CATALOG_SEEDS) {
    if (!out[item.category]) out[item.category] = {};
    out[item.category][item.value] = item.label;
  }
  return out as Record<CatalogCategory, Record<string, string>>;
})();

function humanize(category: CatalogCategory, value: string): string {
  return CATALOG_LABELS[category]?.[value] ?? value;
}
function humanizeList(category: CatalogCategory, values: string[]): string[] {
  return values.map((v) => humanize(category, v));
}

/**
 * Construye el preámbulo de contexto del cliente.
 *
 * Atributos estructurados primero (alto valor semántico / bajo costo en tokens),
 * luego narrativa. Los roles IA pueden razonar sobre los chips sin extraer de la prosa.
 *
 * Códigos internos (catalog values) se traducen a labels humanos antes de
 * inyectarse al prompt. El LLM ve "Doble materialidad, ESR" en lugar de
 * "doble_materialidad, esr" — evita que el consultor lea jerga interna en la
 * respuesta. STARTER_UX §7.3.
 */
// D-10: Trazabilidad Chat → Cuestionario.
// Campos llenos del cuestionario se inyectan al contexto del LLM con su key.
// El LLM cita campos como [campo:key] y el UI los convierte en links.
function buildQuestionnaireSection(questionnaire: QuestionnaireBundle | null | undefined, clientId: string): string {
  if (!questionnaire || !isWizardSchema(questionnaire.template.schema) || !questionnaire.response?.responses) {
    return "";
  }
  const lines: string[] = [];
  for (const step of questionnaire.template.schema.steps) {
    const stepResp = (questionnaire.response.responses[step.key] as Record<string, unknown>) ?? {};
    for (const field of step.fields) {
      const resp = stepResp[field.key];
      if (isFieldResponse(resp) && resp.value !== null && resp.value !== "") {
        const val = String(resp.value).slice(0, 200);
        lines.push(`  [${field.key}] ${field.label}: ${val}`);
      }
    }
  }
  if (lines.length === 0) return "";
  return `\n<questionnaire_data>\nCampos del Cuestionario de Doble Materialidad ya llenados para /clientes/${clientId}:\n${lines.join("\n")}\n</questionnaire_data>\n\nInstrucción de trazabilidad: cuando cites un dato de estos campos, usa la notación [campo:key] (ej: [campo:razon_social]). El sistema convierte la cita en un link clicable para que el consultor verifique en el cuestionario. Solo usa keys listadas arriba.`;
}

export function buildClientContext(client: Client | null, questionnaire?: QuestionnaireBundle | null): string {
  if (!client) {
    return `<context>
No hay cliente seleccionado en este chat. El usuario te está preguntando
sobre metodología general de consultoría en sostenibilidad de ResponSable, sin
personalizar a una empresa específica. Si necesitas contexto de cliente
para responder bien, pídele al usuario que lo seleccione en el dropdown
de arriba o que cree el cliente en /clientes.
</context>`;
  }

  const line = (tag: string, v: string | null | undefined) =>
    v && v.trim() ? `<${tag}>${v}</${tag}>` : "";
  const arr = (tag: string, v: string[] | null | undefined) =>
    v && v.length ? `<${tag}>${v.join(", ")}</${tag}>` : "";
  const bool = (tag: string, v: boolean | null | undefined) =>
    v === null || v === undefined
      ? ""
      : `<${tag}>${v ? "sí" : "no"}</${tag}>`;

  const sectorHuman = client.sector
    ? humanize("sectors", client.sector)
    : null;
  const sizeHuman = client.size
    ? humanize("client_sizes", client.size)
    : null;
  const countriesHuman = client.countries?.length
    ? humanizeList("countries", client.countries)
    : null;
  const segmentsHuman = client.business_segments?.length
    ? humanizeList("business_segments", client.business_segments)
    : null;
  const servicesHuman = client.services?.length
    ? humanizeList("services", client.services)
    : null;
  const frameworksHuman = client.frameworks?.length
    ? humanizeList("frameworks", client.frameworks)
    : null;
  const regulationsHuman = client.applicable_regulations?.length
    ? humanizeList("applicable_regulations", client.applicable_regulations)
    : null;
  const policiesHuman = client.policies_in_place?.length
    ? humanizeList("policies", client.policies_in_place)
    : null;
  const certsHuman = client.certifications?.length
    ? humanizeList("certifications", client.certifications)
    : null;
  const topicsHuman = client.material_topics?.length
    ? humanizeList("material_topics", client.material_topics)
    : null;
  const maturityHuman = client.maturity_level
    ? humanize("maturity_levels", client.maturity_level)
    : null;

  const attrs = [
    line("name", client.name),
    line("sector", sectorHuman),
    line("subsector", client.subsector),
    line("size", sizeHuman),
    arr("countries", countriesHuman),
    arr("business_segments", segmentsHuman),
    arr("services_contracted", servicesHuman),
    arr("frameworks_reported", frameworksHuman),
    arr("applicable_regulations", regulationsHuman),
    arr("policies_in_place", policiesHuman),
    arr("certifications", certsHuman),
    arr("material_topics", topicsHuman),
    line("maturity_level", maturityHuman),
    bool("has_double_materiality", client.has_double_materiality),
    bool("has_sustainability_report", client.has_sustainability_report),
    bool("has_sustainability_strategy", client.has_sustainability_strategy),
    line("sustainability_strategy_url", client.sustainability_strategy_url),
    line("sustainability_report_url", client.sustainability_report_url),
    line("double_materiality_url", client.double_materiality_url),
  ]
    .filter(Boolean)
    .join("\n");

  const narrativeBlocks = NARRATIVE_SCHEMAS.map((schema) => {
    const json = (client as unknown as Record<string, unknown>)[
      schema.jsonColumn
    ] as Record<string, unknown> | null | undefined;
    return serializeBlock(schema.block, json);
  }).join("\n\n");

  const questionnaireSection = buildQuestionnaireSection(questionnaire, client.id);

  return `<context>
<client>
${attrs}

${narrativeBlocks}
</client>
${questionnaireSection}
Instrucción sobre este contexto:
- Úsalo para personalizar. No lo repitas literal en tu respuesta.
- Los atributos estructurados (frameworks_reported, certifications,
  material_topics, etc.) son hechos declarados por el cliente — trátalos
  como dato confiable.
- Los nombres ya vienen humanizados (ej. "Doble materialidad", "Gestionado",
  "GRI Standards"). NUNCA uses códigos internos del catálogo
  (doble_materialidad, gestionado, gri) en tu respuesta al consultor —
  son referencias técnicas internas, no se exponen al usuario.
- Los bloques narrativos tienen sub-campos específicos (pilares, kpis,
  objetivos, etc.). Cuando respondas, cita el sub-campo exacto si lo
  mencionas (ej: "el KPI de alcance 1+2 indica…").
- Si un sub-campo está vacío pero es relevante para la pregunta, señálalo
  y sugiere que se llene en /clientes/${client.id}.
</context>`;
}

/**
 * Convierte un bloque JSONB en XML legible para el modelo. Omite claves
 * vacías para no inflar el prompt.
 */
function serializeBlock(
  blockName: string,
  json: Record<string, unknown> | null | undefined
): string {
  if (!json || Object.keys(json).length === 0) {
    return `<${blockName}>(pendiente)</${blockName}>`;
  }
  const parts: string[] = [];
  for (const [key, value] of Object.entries(json)) {
    if (value === null || value === undefined || value === "") continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      if (value.every((v) => typeof v === "string")) {
        parts.push(`  <${key}>${(value as string[]).join(", ")}</${key}>`);
      } else {
        const items = (value as Array<Record<string, unknown>>)
          .map((obj, i) => {
            const attrs = Object.entries(obj)
              .filter(([, v]) => v !== null && v !== undefined && v !== "")
              .map(([k, v]) => `${k}="${escapeAttr(String(v))}"`)
              .join(" ");
            return `    <item ${attrs} index="${i + 1}"/>`;
          })
          .join("\n");
        parts.push(`  <${key}>\n${items}\n  </${key}>`);
      }
    } else if (typeof value === "boolean") {
      parts.push(`  <${key}>${value ? "sí" : "no"}</${key}>`);
    } else if (typeof value === "number" || typeof value === "string") {
      parts.push(`  <${key}>${value}</${key}>`);
    }
  }
  if (parts.length === 0) {
    return `<${blockName}>(pendiente)</${blockName}>`;
  }
  return `<${blockName}>\n${parts.join("\n")}\n</${blockName}>`;
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * System blocks para el SDK de Anthropic.
 *
 * Estructura: [contexto del cliente] [rol + navegación + reglas base].
 *
 * 2 cache breakpoints (max permitido = 4):
 *  - 1 al final del contextBlock → al cambiar de rol con mismo cliente, el
 *    preámbulo del cliente (potencialmente >1KB con 6 bloques narrativos
 *    JSONB) hace cache hit y no se re-tokeniza.
 *  - 1 al final del roleBlock → turnos subsecuentes con mismo cliente +
 *    mismo rol hacen cache hit completo del prefix.
 *
 * Resultado: ~50% ahorro en input tokens vs cache de 1 solo breakpoint
 * cuando el consultor cambia entre Aurora/Rebeca/Elena/Valeria sobre el
 * mismo cliente. STARTER_IA §2 + STACK.md "2 breakpoints ephemerales".
 */
export async function buildSystemBlocks(role: RoleId, client: Client | null, questionnaire?: QuestionnaireBundle | null) {
  const contextBlock = buildClientContext(client, questionnaire);
  const roleBlock = await buildRoleSystemText(role);

  return [
    {
      type: "text" as const,
      text: contextBlock,
      cache_control: { type: "ephemeral" as const },
    },
    {
      type: "text" as const,
      text: roleBlock,
      cache_control: { type: "ephemeral" as const },
    },
  ];
}
