import "server-only";
import type { Client } from "@/lib/clients";
import type { RoleId } from "@/lib/ai/models";
import { buildRoleSystemText } from "@/lib/ai/prompts";

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
sobre metodología general de consultoría ESG de ResponSable, sin
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
    arr("frameworks_reported", client.frameworks),
    arr("applicable_regulations", client.applicable_regulations),
    arr("policies_in_place", client.policies_in_place),
    arr("certifications", client.certifications),
    arr("material_topics", client.material_topics),
    line("maturity_level", client.maturity_level),
    bool("has_double_materiality", client.has_double_materiality),
    bool("has_sustainability_report", client.has_sustainability_report),
    bool("has_sustainability_strategy", client.has_sustainability_strategy),
  ]
    .filter(Boolean)
    .join("\n");

  return `<context>
<client>
${attrs}

<info_general>
${client.info_general || "(pendiente de llenar)"}
</info_general>

<business_model>
${client.business_model || "(pendiente)"}
</business_model>

<impacts>
${client.impacts || "(pendiente)"}
</impacts>

<regulatory_context>
${client.regulatory_context || "(pendiente)"}
</regulatory_context>

<sustainability_strategy>
${client.sustainability_strategy || "(pendiente)"}
</sustainability_strategy>

<stakeholders>
${client.stakeholders || "(pendiente)"}
</stakeholders>
</client>

Instrucción sobre este contexto:
- Úsalo para personalizar. No lo repitas literal en tu respuesta.
- Los atributos estructurados (frameworks_reported, certifications,
  material_topics, etc.) son hechos declarados por el cliente — trátalos
  como dato confiable.
- Si un bloque narrativo dice "(pendiente)", señálalo cuando sea relevante
  y sugiere que el usuario lo llene en /clientes/${client.id} antes de
  profundizar en ese tema.
</context>`;
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
