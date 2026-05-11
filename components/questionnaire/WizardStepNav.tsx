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
  /** Si está presente, muestra botón ⚡ inline en pasos ai_can_fill para refresco rápido. */
  onRefreshStep?: (stepKey: string) => void;
  /** stepKey actualmente en refresco — muestra spinner en su icono. */
  refreshingStepKey?: string | null;
  /** Bloquea el botón de refresco mientras bulk fill está corriendo. */
  bulkRunning?: boolean;
};

export function WizardStepNav({
  steps,
  activeStep,
  sectionProgress,
  pendingValidation,
  onSelect,
  onRefreshStep,
  refreshingStepKey,
  bulkRunning,
}: WizardStepNavProps) {
  return (
    <aside className="space-y-1 sticky top-[100px] z-20 self-start max-h-[calc(100vh-116px)] overflow-y-auto">
      {steps.map((s, i) => {
        const sp = sectionProgress[s.key] ?? { filled: 0, total: s.fields.length, pct: 0 };
        const complete = sp.pct === 100 && s.fields.length > 0;
        const pending = pendingValidation[s.key] ?? 0;
        const active = activeStep === i;
        const refreshable = !!onRefreshStep && s.ai_can_fill;
        const refreshing = refreshingStepKey === s.key;
        return (
          <div
            key={s.key}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(i)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(i);
              }
            }}
            title={s.title}
            className={`group w-full text-left px-3 py-2 rounded border transition-colors text-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary ${
              active
                ? "bg-brand-primary-light border-brand-primary text-brand-primary-dark"
                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
                  complete
                    ? "bg-emerald-500 text-white"
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
              {refreshable && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (refreshing || bulkRunning) return;
                    onRefreshStep?.(s.key);
                  }}
                  disabled={refreshing || bulkRunning}
                  aria-label={`Refrescar paso ${s.title} con IA`}
                  title={refreshing ? "Refrescando…" : "Refrescar este paso con IA · actualiza campos vacíos y no validados, preserva los validados ✓"}
                  className={`shrink-0 w-6 h-6 -mr-1 rounded flex items-center justify-center transition-colors ${
                    refreshing
                      ? "text-brand-primary-dark"
                      : "text-slate-400 hover:text-brand-primary-dark hover:bg-brand-primary-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary disabled:opacity-30 disabled:hover:bg-transparent"
                  } ${active ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"}`}
                >
                  {refreshing ? (
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                      <path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  )}
                </button>
              )}
            </div>
            <div className="mt-1 ml-7 text-[10px] text-slate-500 tabular-nums">
              {sp.filled}/{sp.total} · {sp.pct}%
            </div>
          </div>
        );
      })}
    </aside>
  );
}
