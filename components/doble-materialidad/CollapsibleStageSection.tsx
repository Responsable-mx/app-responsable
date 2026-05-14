"use client";

import type { ReactNode } from "react";
import {
  DM_STAGES_META,
  scrollToDmSection,
} from "@/components/doble-materialidad/DoubleMaterialidadTab";
import type { StageStatus } from "@/components/doble-materialidad/DoubleMaterialidadTab";

export function CollapsibleStageSection({
  id,
  stageNum,
  label,
  status,
  accent,
  isActive,
  lockReason,
  isNextLocked = false,
  subtitle,
  narrativeTitle,
  headerRight,
  children,
}: {
  id: string;
  stageNum: number;
  label: string;
  status: StageStatus;
  accent: string;
  /** Sólo se renderiza si isActive=true (Ruta B wizard) */
  isActive: boolean;
  /** Mensaje mostrado cuando status === "locked" — explica qué se necesita para desbloquear */
  lockReason?: string;
  /** Cuando true, el botón "Siguiente" se deshabilita — la etapa siguiente aún no está disponible */
  isNextLocked?: boolean;
  /** Subtitle pedagógico bajo el H2 (mockup-v7 pattern) */
  subtitle?: string;
  /** Override del H2 — narrativa ejecutiva en lugar de "N. Label" genérico (mockup-v7 pattern) */
  narrativeTitle?: string;
  /** Slot opcional en esquina derecha del header — chips de estado por etapa (count, severidad) */
  headerRight?: ReactNode;
  children: ReactNode;
}) {
  if (!isActive) return null;

  // Derivar prev/next desde DM_STAGES_META por id
  const idx = DM_STAGES_META.findIndex((s) => s.id === id);
  const prev = idx > 0 ? DM_STAGES_META[idx - 1] : null;
  const next = idx >= 0 && idx < DM_STAGES_META.length - 1 ? DM_STAGES_META[idx + 1] : null;

  return (
    <section
      id={id}
      role="tabpanel"
      aria-labelledby={`tab-${id}`}
      tabIndex={0}
      key={id}
      className="motion-safe:animate-[dmFadeIn_0.14s_ease-out] focus:outline-none"
    >
      <div className={`bg-white border border-slate-200 rounded shadow-sm border-l-4 ${accent}`}>
        {/* Header — H2 + subtitle + chips estado (mockup-v7 pattern) */}
        <div className="flex items-start justify-between gap-3 px-5 py-3.5 border-b border-slate-100">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5 min-w-0">
              <h2
                id={`stage-lbl-${id}`}
                className="text-lg font-semibold text-slate-900 truncate"
              >
                {narrativeTitle ?? `${stageNum}. ${label}`}
              </h2>
              {status === "done" && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-sm bg-emerald-50 border border-emerald-200 text-[10px] font-semibold text-emerald-700 shrink-0">
                  <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Completado
                </span>
              )}
              {status === "active" && (
                <span className="px-1.5 py-0.5 rounded-sm bg-white border border-brand-primary text-[10px] font-semibold text-brand-primary-dark shrink-0">
                  En curso
                </span>
              )}
              {status === "pending" && (
                <span className="px-1.5 py-0.5 rounded-sm bg-slate-100 border border-slate-200 text-[10px] font-medium text-slate-400 shrink-0">
                  Pendiente
                </span>
              )}
              {status === "locked" && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-slate-100 border border-slate-200 text-[10px] font-medium text-slate-400 shrink-0">
                  <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  Bloqueada
                </span>
              )}
            </div>
            {subtitle && (
              <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                {subtitle}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {headerRight}
            <span className="text-[10px] text-slate-400 tabular-nums whitespace-nowrap">
              Etapa {stageNum} de {DM_STAGES_META.length}
            </span>
          </div>
        </div>

        {/* Body */}
        <div id={`${id}-body`} className="px-5 py-4">
          {status === "locked" ? (
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
              <svg className="w-10 h-10 text-slate-300 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <p className="text-sm text-slate-600 max-w-md">
                {lockReason ?? "Completa las etapas anteriores para desbloquear esta sección."}
              </p>
            </div>
          ) : (
            children
          )}
        </div>

        {/* Footer navegación prev / next */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-slate-100 bg-slate-50">
          {prev ? (
            <button
              type="button"
              onClick={() => scrollToDmSection(prev.id)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-brand-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 rounded-sm px-1"
            >
              <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              {prev.label}
            </button>
          ) : (
            <span />
          )}
          {next ? (
            isNextLocked ? (
              <button
                type="button"
                disabled
                title="Completa esta etapa para avanzar a la siguiente"
                aria-disabled="true"
                className="inline-flex items-center gap-1.5 bg-slate-100 border border-slate-200 text-slate-400 text-xs font-semibold py-2 px-4 rounded cursor-not-allowed select-none"
              >
                <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                Siguiente: {next.label}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => scrollToDmSection(next.id)}
                className="inline-flex items-center gap-1.5 bg-brand-primary text-white text-xs font-semibold py-2 px-4 rounded hover:bg-brand-primary-dark transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
              >
                Siguiente: {next.label}
                <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              </button>
            )
          ) : (
            <span className="text-[11px] text-slate-400 italic">Última etapa</span>
          )}
        </div>
      </div>
    </section>
  );
}
