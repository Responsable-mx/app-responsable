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
    model: process.env.ANTHROPIC_MODEL_SONNET || "claude-sonnet-4-6",
    maxTokens: 2000,
    useCache: true,
    description: "Aurora — Autor. Construye borrador alineado a metodología.",
  },
  rebeca: {
    model: process.env.ANTHROPIC_MODEL_SONNET || "claude-sonnet-4-6",
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

// ── Modelos por TIPO DE TAREA (no por rol) ─────────────────
// Permite que tareas estructuradas (extracción JSON, validación) usen
// Haiku (12× más barato que Sonnet) sin tocar el sistema de roles del chat.
// ───────────────────────────────────────────────────────────

export type TaskKind =
  | "extract"   // Estructurar campos desde texto/web → Haiku
  | "validate"  // Verificar JSON contra schema/checklist → Haiku
  | "compose"   // Borrador narrativo, listas, propuestas → Sonnet
  | "analyze"   // Razonamiento sectorial, comparaciones → Sonnet
  | "elevate"   // Insights, trade-offs estratégicos → Opus
  | "report";   // Reporte final crítico cliente → Opus

export const TASK_CONFIG: Record<TaskKind, ModelConfig> = {
  extract: {
    model: process.env.ANTHROPIC_MODEL_HAIKU || "claude-haiku-4-5-20251001",
    maxTokens: 1500,
    useCache: false,
    description: "Extracción estructurada (campos JSON desde texto/web)",
  },
  validate: {
    model: process.env.ANTHROPIC_MODEL_HAIKU || "claude-haiku-4-5-20251001",
    maxTokens: 1000,
    useCache: false,
    description: "Validación de JSON / checklist DoD",
  },
  compose: {
    model: process.env.ANTHROPIC_MODEL_SONNET || "claude-sonnet-4-6",
    maxTokens: 2000,
    useCache: true,
    description: "Borrador narrativo, listas, propuestas IA",
  },
  analyze: {
    model: process.env.ANTHROPIC_MODEL_SONNET || "claude-sonnet-4-6",
    maxTokens: 2500,
    useCache: true,
    description: "Razonamiento sectorial, comparaciones, benchmarks",
  },
  elevate: {
    model: process.env.ANTHROPIC_MODEL_OPUS || "claude-opus-4-7",
    maxTokens: 2500,
    useCache: true,
    description: "Insights, trade-offs estratégicos (Elena)",
  },
  report: {
    model: process.env.ANTHROPIC_MODEL_OPUS || "claude-opus-4-7",
    maxTokens: 4000,
    useCache: true,
    description: "Reporte final cliente — Opus por criticidad",
  },
};

export function getTaskConfig(task: TaskKind): ModelConfig {
  return TASK_CONFIG[task];
}
