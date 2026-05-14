"use client";

import { scrollToDmSection } from "@/components/doble-materialidad/DoubleMaterialidadTab";
import type { StageStatus } from "@/components/doble-materialidad/DoubleMaterialidadTab";

export function StagePill({
  label,
  status,
  subtitle,
  sectionId,
  selected,
  compact = false,
  className = "",
  title,
}: {
  label: string;
  status: StageStatus;
  /** Texto bajo el label: fecha de completado / "En curso" / "Pendiente" */
  subtitle: string;
  sectionId?: string;
  /** ¿Es el panel actualmente visible? (Ruta B — independiente del status) */
  selected: boolean;
  /** Oculta subtítulo cuando el stepper está pinned — reduce altura sticky stack */
  compact?: boolean;
  className?: string;
  /** Tooltip nativo del browser — mostrado en hover cuando compact=true */
  title?: string;
}) {
  const pillBase =
    `flex flex-col items-center gap-0.5 px-3 py-2.5 rounded-sm border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 ${className}`;

  // selected = panel visible (ring teal + bg teal). status sólo determina estilo no-selected.
  const pillStyle = selected
    ? `${pillBase} bg-brand-primary border-brand-primary shadow-[0_0_0_2px_var(--color-brand-primary),0_1px_4px_rgba(15,118,110,0.18)]`
    : status === "done"
    ? `${pillBase} bg-slate-50 border-slate-200 hover:bg-slate-100`
    : status === "active"
    ? `${pillBase} bg-white border-brand-primary/60 hover:border-brand-primary`
    : status === "locked"
    ? `${pillBase} border-slate-100 opacity-50 hover:opacity-70`
    : `${pillBase} border-slate-200 hover:border-slate-300`;

  // Texto: cuando selected → blanco. Si no, color por status.
  const labelTextClass = selected
    ? "font-bold text-white"
    : status === "done"
    ? "font-semibold text-brand-primary"
    : status === "active"
    ? "font-bold text-brand-primary-dark"
    : "font-medium text-slate-500";

  const subTextClass = selected
    ? "text-white/80"
    : status === "done"
    ? "text-slate-500"
    : status === "active"
    ? "text-brand-primary"
    : "text-slate-500";

  const inner = (
    <>
      <div className="flex items-center gap-1.5">
        {status === "done" && !selected && (
          <svg
            className="w-2.5 h-2.5 text-brand-primary shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
        {status === "done" && selected && (
          <svg
            className="w-2.5 h-2.5 text-white shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
        <span className={`text-[11px] whitespace-nowrap ${labelTextClass}`}>
          {label}
        </span>
      </div>
      {!compact && (
        <span className={`text-[10px] whitespace-nowrap ${subTextClass}`}>
          {subtitle}
        </span>
      )}
    </>
  );

  // Ruta B: TODOS los pills son clickables (incluso locked — navegan al panel
  // que muestra la razón de bloqueo). Sólo el pill sin sectionId queda inerte.
  if (sectionId) {
    return (
      <button
        type="button"
        role="tab"
        id={`tab-${sectionId}`}
        aria-selected={selected}
        aria-controls={sectionId}
        tabIndex={selected ? 0 : -1}
        onClick={() => scrollToDmSection(sectionId)}
        aria-label={`Ir a ${label}`}
        title={title}
        className={pillStyle}
      >
        {inner}
      </button>
    );
  }

  return <div className={pillStyle}>{inner}</div>;
}
