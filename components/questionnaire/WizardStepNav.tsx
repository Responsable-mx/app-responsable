"use client";

import type { WizardStep } from "@/lib/questionnaires/types";

type StepProgress = {
  filled: number;
  total: number;
  pct: number;
};

type WizardStepNavProps = {
  steps: WizardStep[];
  activeStep: number;
  sectionProgress: Record<string, StepProgress>;
  /** Campos llenos pero aún no validados por paso. Si > 0 → badge ámbar. */
  pendingValidation: Record<string, number>;
  onSelect: (index: number) => void;
};

export function WizardStepNav({
  steps,
  activeStep,
  sectionProgress,
  pendingValidation,
  onSelect,
}: WizardStepNavProps) {
  return (
    <aside className="space-y-1 sticky top-4 self-start max-h-[calc(100vh-6rem)] overflow-y-auto">
      {steps.map((s, i) => {
        const sp = sectionProgress[s.key] ?? { filled: 0, total: s.fields.length, pct: 0 };
        const complete = sp.pct === 100 && s.fields.length > 0;
        const pending = pendingValidation[s.key] ?? 0;
        return (
          <button
            key={s.key}
            onClick={() => onSelect(i)}
            title={s.title}
            className={`w-full text-left px-3 py-2 rounded border transition-colors text-xs ${
              activeStep === i
                ? "bg-brand-primary-light border-brand-primary text-brand-primary-dark"
                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
                  complete
                    ? "bg-emerald-500 text-white"
                    : sp.pct > 0
                      ? "bg-amber-100 text-amber-700"
                      : "bg-slate-100 text-slate-500"
                }`}
              >
                {complete ? "✓" : s.step}
              </span>
              <span className="font-semibold leading-tight flex-1 truncate">{s.title}</span>
              {pending > 0 && (
                <span
                  className="text-[9px] font-bold bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5 shrink-0"
                  title={`${pending} campo${pending > 1 ? "s" : ""} sin validar`}
                >
                  {pending}
                </span>
              )}
            </div>
            <div className="mt-1 ml-7 text-[10px] text-slate-500 tabular-nums">
              {sp.filled}/{sp.total} · {sp.pct}%
            </div>
          </button>
        );
      })}
    </aside>
  );
}
