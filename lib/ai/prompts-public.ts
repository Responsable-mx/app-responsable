/**
 * Copia client-safe de constants de prompts (sin 'server-only').
 * lib/ai/prompts.ts es server-only porque toca DB; este archivo solo
 * exporta tipos y labels para usar en componentes cliente.
 */

export type PromptKey =
  | "system.app_navigation"
  | "system.base_rules"
  | "role.aurora"
  | "role.rebeca"
  | "role.elena"
  | "role.valeria"
  | "dm.benchmark_propose"
  | "dm.iro_generation"
  | "dm.report";

export const PROMPT_KEYS: PromptKey[] = [
  "system.app_navigation",
  "system.base_rules",
  "role.aurora",
  "role.rebeca",
  "role.elena",
  "role.valeria",
  "dm.benchmark_propose",
  "dm.iro_generation",
  "dm.report",
];

export const PROMPT_LABELS: Record<PromptKey, string> = {
  "system.app_navigation": "Navegación (común)",
  "system.base_rules": "Reglas base (común)",
  "role.aurora": "Aurora · Autor",
  "role.rebeca": "Rebeca · Revisor",
  "role.elena": "Elena · Elevador",
  "role.valeria": "Valeria · Validador",
  "dm.benchmark_propose": "DM · Benchmark",
  "dm.iro_generation":    "DM · IROs",
  "dm.report":            "DM · Reporte",
};

export const PROMPT_DESCRIPTIONS: Record<PromptKey, string> = {
  "system.app_navigation":
    "Bloque <app_navigation> que describe las vistas de la app a los 4 roles.",
  "system.base_rules":
    "Bloque <rules> común: idioma, marcos de referencia, tono, honestidad.",
  "role.aurora":
    "Instrucciones específicas de Aurora — construir borradores alineados a metodología.",
  "role.rebeca":
    "Instrucciones específicas de Rebeca — detectar fallas y producir checklist priorizado.",
  "role.elena":
    "Instrucciones específicas de Elena — insights, trade-offs y narrativa ejecutiva.",
  "role.valeria":
    "Instrucciones específicas de Valeria — validar DoD, consistencia y evidencia.",
  "dm.benchmark_propose":
    "Propone empresas para benchmark DM. Variables: {{client_name}}, {{sector}}, {{countries}}.",
  "dm.iro_generation":
    "Genera el inventario de IROs via Batch API (Sonnet). Variables: {{client_name}}, {{sector}}, {{country}}, {{questionnaire_context}}, {{benchmark_companies}}.",
  "dm.report":
    "Genera el reporte narrativo ejecutivo de DM via Batch API (Opus). Variables: {{client_name}}, {{client_context}}, {{iro_inventory}}, {{benchmark_data}}.",
};
