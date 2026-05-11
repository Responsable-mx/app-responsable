"use client";

import { Button } from "@/components/ui/Button";
import { catalogLabel } from "@/components/doble-materialidad/catalog-lookup";

export type ContextoProgress = { filled: number; total: number } | null;

export function ContextoSection({
  progress,
  onGoToCuestionario,
  sector,
  size,
  frameworks,
}: {
  progress: ContextoProgress;
  onGoToCuestionario: () => void;
  sector?: string | null;
  size?: string | null;
  frameworks?: string[] | null;
}) {
  const isComplete = progress && progress.filled >= progress.total && progress.total > 0;
  const hasKpis = sector || size || (frameworks && frameworks.length > 0);

  return (
    <div className="py-2">
      {/* KPI cards — Sector / Tamaño / Marcos */}
      {hasKpis && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="border border-slate-200 rounded p-3 bg-slate-50/50">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Sector</p>
            <p className="text-sm font-semibold text-slate-800 truncate">
              {sector ? catalogLabel("sectors", sector) : "—"}
            </p>
          </div>
          <div className="border border-slate-200 rounded p-3 bg-slate-50/50">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Tamaño</p>
            <p className="text-sm font-semibold text-slate-800 truncate">
              {size ? catalogLabel("client_sizes", size) : "—"}
            </p>
          </div>
          <div className="border border-slate-200 rounded p-3 bg-slate-50/50">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Marcos</p>
            <p className="text-sm font-semibold text-slate-800 leading-relaxed">
              {frameworks && frameworks.length > 0
                ? frameworks.map((f) => catalogLabel("frameworks", f)).join(", ")
                : "—"}
            </p>
          </div>
        </div>
      )}

      {/* Barra de progreso — igual que mockup-v7 */}
      {progress ? (
        <div className="mb-3">
          <div className="flex justify-between items-center text-xs text-slate-600 mb-1.5">
            <span className="font-medium">Campos completados</span>
            <span className="flex items-center gap-2">
              <span className={`font-bold tabular-nums ${isComplete ? "text-emerald-600" : "text-brand-primary"}`}>
                {progress.filled} / {progress.total}
              </span>
              {!isComplete && progress.total > 0 && (
                <span className="bg-amber-100 text-amber-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-sm tabular-nums whitespace-nowrap">
                  {progress.total - progress.filled} pendientes
                </span>
              )}
            </span>
          </div>
          <div className="h-[3px] bg-slate-200 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${isComplete ? "bg-emerald-500" : "bg-brand-primary"}`}
              style={{ width: `${Math.round((progress.filled / progress.total) * 100)}%` }}
            />
          </div>
        </div>
      ) : (
        <button
          onClick={onGoToCuestionario}
          className="text-xs text-brand-primary hover:underline mb-3 block"
        >
          El cuestionario está vacío. Complétalo primero →
        </button>
      )}

      {/* Warning banner — campos pendientes (mockup-v7 pattern) */}
      {progress && !isComplete && progress.filled > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-100 rounded text-xs text-amber-800 mb-3">
          <strong>{progress.total - progress.filled} campos pendientes.</strong>{" "}
          Completarlos mejora la calidad del reporte final.{" "}
          <button onClick={onGoToCuestionario} className="underline font-semibold ml-0.5 hover:text-amber-900">
            Ir al cuestionario →
          </button>
        </div>
      )}

      {/* Solo mostrar botón si ya está completo (no competir con amber banner) */}
      {isComplete && (
        <Button size="sm" variant="secondary" onClick={onGoToCuestionario}>
          Ver cuestionario
        </Button>
      )}
    </div>
  );
}
