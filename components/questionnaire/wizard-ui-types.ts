/**
 * components/questionnaire/wizard-ui-types.ts
 *
 * Tipos y constantes compartidos entre los sub-componentes del wizard de cuestionario.
 * Importar desde aquí — no duplicar en QuestionnaireTab.tsx.
 */

import type { SourceType } from "@/lib/questionnaires/types";

export type SaveState = "idle" | "saving" | "saved" | "error" | "conflict";

export const SOURCE_CHIP: Record<
  SourceType,
  { dot: string; bg: string; text: string; label: string }
> = {
  public: {
    dot: "bg-emerald-500",
    bg: "bg-emerald-50 border-emerald-200",
    text: "text-emerald-700",
    label: "público",
  },
  interpretation: {
    dot: "bg-amber-400",
    bg: "bg-amber-50 border-amber-200",
    text: "text-amber-700",
    label: "interpretación",
  },
  consultor_only: {
    dot: "bg-slate-400",
    bg: "bg-slate-50 border-slate-200",
    text: "text-slate-600",
    label: "solo consultor",
  },
};
