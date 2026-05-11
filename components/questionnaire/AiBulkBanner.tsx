"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

type BulkProgress = {
  current: number;
  total: number;
  stepTitle: string;
};

export type AiFillScope = "empty" | "non_validated" | "all";

type AiBulkBannerProps = {
  /** Cuántos pasos pueden ser llenados por IA */
  aiCapableCount: number;
  /** Total de pasos del cuestionario */
  totalSteps: number;
  /** Campos vacíos en pasos AI-capable (para etiquetar opción "empty") */
  emptyFieldCount: number;
  /** Campos NO validados en pasos AI-capable (incluye vacíos + llenos sin chip) */
  nonValidatedFieldCount: number;
  /** Total de campos en pasos AI-capable */
  totalFieldCount: number;
  /** Progreso del llenado masivo en curso, null cuando no está activo */
  progress: BulkProgress | null;
  onFillScope: (scope: AiFillScope) => void;
};

/**
 * Banner superior del cuestionario con menú scope para llenado masivo con IA.
 * Reemplaza el modal destructivo "Llenar todo / no se puede deshacer" por un
 * selector explícito de alcance:
 *   - empty: solo campos vacíos (seguro)
 *   - non_validated: campos no validados (incluye vacíos)
 *   - all: todo (incluye validados — requiere diff review)
 */
export function AiBulkBanner({
  aiCapableCount,
  totalSteps,
  emptyFieldCount,
  nonValidatedFieldCount,
  totalFieldCount,
  progress,
  onFillScope,
}: AiBulkBannerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Cierra dropdown al click fuera o ESC.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(scope: AiFillScope) {
    setOpen(false);
    onFillScope(scope);
  }

  return (
    <div
      className="mb-4 flex items-center justify-between gap-3 px-4 py-3 bg-gradient-to-r from-brand-primary-light to-slate-50 border border-brand-primary/30 rounded"
      ref={containerRef}
    >
      <div className="flex items-start gap-3 min-w-0">
        <svg className="w-5 h-5 text-brand-primary shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-900">
            IA puede completar {aiCapableCount} de {totalSteps} pasos automáticamente
          </p>
          <p className="text-[11px] text-slate-600">
            Por defecto solo llena campos vacíos — los validados se preservan. Guardamos snapshot que puedes restaurar 72h.
          </p>
        </div>
      </div>

      <div className="relative shrink-0">
        {progress ? (
          <Button variant="secondary" size="sm" loading disabled>
            {`${progress.current}/${progress.total} · ${progress.stepTitle}`}
          </Button>
        ) : (
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={open}
            >
              Asistente IA ▾
            </Button>
            {open && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-1 w-[340px] bg-white border border-slate-200 rounded shadow-lg z-30 overflow-hidden"
              >
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => choose("empty")}
                  disabled={emptyFieldCount === 0}
                  className="w-full text-left px-3 py-2.5 hover:bg-brand-primary-light/40 disabled:opacity-40 disabled:hover:bg-white transition-colors border-b border-slate-100"
                >
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-xs font-bold text-slate-900">Solo campos vacíos</span>
                    <span className="text-[10px] font-bold tabular-nums text-emerald-700 bg-emerald-50 rounded-sm px-1.5 py-0.5">
                      {emptyFieldCount} campo{emptyFieldCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    No toca lo ya escrito. Recomendado tras agregar documentos nuevos.
                  </p>
                </button>

                <button
                  role="menuitem"
                  type="button"
                  onClick={() => choose("non_validated")}
                  disabled={nonValidatedFieldCount === 0}
                  className="w-full text-left px-3 py-2.5 hover:bg-brand-primary-light/40 disabled:opacity-40 disabled:hover:bg-white transition-colors border-b border-slate-100"
                >
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-xs font-bold text-slate-900">Campos no validados</span>
                    <span className="text-[10px] font-bold tabular-nums text-amber-700 bg-amber-50 rounded-sm px-1.5 py-0.5">
                      {nonValidatedFieldCount} campo{nonValidatedFieldCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Refresca vacíos + borradores. Preserva los marcados con ✓ validado.
                  </p>
                </button>

                <button
                  role="menuitem"
                  type="button"
                  onClick={() => choose("all")}
                  className="w-full text-left px-3 py-2.5 hover:bg-rose-50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-xs font-bold text-rose-700">Re-procesar todo</span>
                    <span className="text-[10px] font-bold tabular-nums text-rose-700 bg-rose-50 rounded-sm px-1.5 py-0.5">
                      {totalFieldCount} campo{totalFieldCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Incluye validados. Mostraré diff antes de aplicar cualquier sobrescritura.
                  </p>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
