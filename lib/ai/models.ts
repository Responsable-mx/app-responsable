import "server-only";

// ── Configuración centralizada de modelos IA ───────────────
// Precios (abr 2026, por 1M tokens):
//   Haiku 4.5:  $1 input  / $5 output
//   Sonnet 4:   $3 input  / $15 output
//   Opus 4:     $5 input  / $25 output
// Prompt caching: 90% ahorro en lecturas repetidas.
// ───────────────────────────────────────────────────────────

export type RoleId = "aurora" | "rebeca" | "elena" | "valeria";

type ModelConfig = {
  model: string;
  maxTokens: number;
  useCache: boolean;
  description: string;
};

/**
 * Asignación de modelos por rol. Aurora/Rebeca/Elena usan Sonnet (calidad
 * narrativa y juicio). Valeria usa Haiku (verificación de DoD y consistencia
 * estructurada → output formulario/checklist).
 */
export const MODEL_CONFIG: Record<RoleId, ModelConfig> = {
  aurora: {
    model: process.env.ANTHROPIC_MODEL_SONNET || "claude-sonnet-4-20250514",
    maxTokens: 2000,
    useCache: true,
    description: "Aurora — Autor. Construye borrador alineado a metodología.",
  },
  rebeca: {
    model: process.env.ANTHROPIC_MODEL_SONNET || "claude-sonnet-4-20250514",
    maxTokens: 2000,
    useCache: true,
    description: "Rebeca — Revisor. Detecta fallas, omisiones, riesgos.",
  },
  elena: {
    // Opus: insights no evidentes + trade-offs estratégicos requieren razonamiento
    // cruzado que Opus supera a Sonnet. Para 8 usuarios piloto costo adicional <$0.50/mes.
    model: process.env.ANTHROPIC_MODEL_OPUS || "claude-opus-4-7",
    maxTokens: 2000,
    useCache: true,
    description: "Elena — Elevador. Insights, trade-offs, narrativa.",
  },
  valeria: {
    model: process.env.ANTHROPIC_MODEL_HAIKU || "claude-haiku-4-5-20251001",
    maxTokens: 1500,
    useCache: true,
    description: "Valeria — Validador. DoD, consistencia, evidencia.",
  },
};

export function getModelConfig(role: RoleId): ModelConfig {
  return MODEL_CONFIG[role];
}

export const ROLE_LABELS: Record<RoleId, string> = {
  aurora: "Aurora · Autor",
  rebeca: "Rebeca · Revisor",
  elena: "Elena · Elevador",
  valeria: "Valeria · Validador",
};
