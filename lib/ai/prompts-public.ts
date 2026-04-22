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
  | "role.valeria";

export const PROMPT_KEYS: PromptKey[] = [
  "system.app_navigation",
  "system.base_rules",
  "role.aurora",
  "role.rebeca",
  "role.elena",
  "role.valeria",
];

export const PROMPT_LABELS: Record<PromptKey, string> = {
  "system.app_navigation": "Navegación (común)",
  "system.base_rules": "Reglas base (común)",
  "role.aurora": "Aurora · Autor",
  "role.rebeca": "Rebeca · Revisor",
  "role.elena": "Elena · Elevador",
  "role.valeria": "Valeria · Validador",
};
