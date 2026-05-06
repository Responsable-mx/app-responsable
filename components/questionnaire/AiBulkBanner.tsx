"use client";

import { Button } from "@/components/ui/Button";

type BulkProgress = {
  current: number;
  total: number;
  stepTitle: string;
};

type AiBulkBannerProps = {
  /** Cuántos pasos pueden ser llenados por IA */
  aiCapableCount: number;
  /** Total de pasos del cuestionario */
  totalSteps: number;
  /** Si algún paso ya tiene respuestas (cambia la etiqueta del botón) */
  someStepHasResponses: boolean;
  /** Progreso del llenado masivo en curso, null cuando no está activo */
  progress: BulkProgress | null;
  onFillAll: () => void;
};

/**
 * Banner superior del cuestionario con botón de llenado masivo con IA.
 * Muestra progreso inline cuando el llenado está en curso.
 */
export function AiBulkBanner({
  aiCapableCount,
  totalSteps,
  someStepHasResponses,
  progress,
  onFillAll,
}: AiBulkBannerProps) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 px-4 py-3 bg-gradient-to-r from-brand-primary-light to-slate-50 border border-brand-primary/30 rounded">
      <div className="flex items-start gap-3 min-w-0">
        <svg className="w-5 h-5 text-brand-primary shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-900">
            IA puede completar {aiCapableCount} de {totalSteps} pasos automáticamente
          </p>
          <p className="text-[11px] text-slate-600">
            Usa datos públicos verificables y citados. Puedes ajustar cada paso individualmente después.
          </p>
        </div>
      </div>
      <Button
        variant="primary"
        size="sm"
        loading={!!progress}
        onClick={onFillAll}
      >
        {progress
          ? `${progress.current}/${progress.total} · ${progress.stepTitle}`
          : someStepHasResponses
            ? "Refrescar con IA"
            : "Llenar todos con IA"}
      </Button>
    </div>
  );
}
