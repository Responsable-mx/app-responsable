import "server-only";
import type { Client } from "@/lib/clients";
import type { RoleId } from "@/lib/ai/models";
import { buildRoleSystemText } from "@/lib/ai/prompts";
import { NARRATIVE_SCHEMAS } from "@/lib/clients/narrative-schemas";

export { DEFAULT_PROMPTS, PROMPT_KEYS } from "@/lib/ai/prompts";

/**
 * Construye el preámbulo de contexto del cliente.
 *
 * Atributos estructurados primero (alto valor semántico / bajo costo en tokens),
 * luego narrativa. Los roles IA pueden razonar sobre los chips sin extraer de la prosa.
 */
export function buildClientContext(client: Client | null): string {
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

  const attrs = [
    line("name", client.name),
    line("sector", client.sector),
    line("subsector", client.subsector),
    line("size", client.size),
    arr("countries", client.countries),
    arr("business_segments", client.business_segments),
    arr("services_contracted", client.services),
    arr("frameworks_reported", client.frameworks),
    arr("applicable_regulations", client.applicable_regulations),
    arr("policies_in_place", client.policies_in_place),
    arr("certifications", client.certifications),
    arr("material_topics", client.material_topics),
    line("maturity_level", client.maturity_level),
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

  return `<context>
<client>
${attrs}

${narrativeBlocks}
</client>

Instrucción sobre este contexto:
- Úsalo para personalizar. No lo repitas literal en tu respuesta.
- Los atributos estructurados (frameworks_reported, certifications,
  material_topics, etc.) son hechos declarados por el cliente — trátalos
  como dato confiable.
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
 * Cache_control al final del prefix → todo el prefix cacheable. Subsecuentes
 * turnos de la misma conversación (mismo cliente + mismo rol) hacen cache hit.
 *
 * Ahora es async porque lee prompts desde DB (con fallback a código).
 */
export async function buildSystemBlocks(role: RoleId, client: Client | null) {
  const contextBlock = buildClientContext(client);
  const roleBlock = await buildRoleSystemText(role);

  return [
    { type: "text" as const, text: contextBlock },
    {
      type: "text" as const,
      text: roleBlock,
      cache_control: { type: "ephemeral" as const },
    },
  ];
}
