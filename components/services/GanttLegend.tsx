"use client";

interface GanttLegendProps {
  hasBaseline: boolean;
  showBaseline: boolean;
  showFloat: boolean;
  showDeps: boolean;
  showCriticalPath: boolean;
  todayInRange: boolean;
}

export function GanttLegend({
  hasBaseline,
  showBaseline,
  showFloat,
  showDeps,
  showCriticalPath,
  todayInRange,
}: GanttLegendProps) {
  return (
    <div className="border-t border-slate-100 bg-slate-50 px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-slate-600">
      {hasBaseline && showBaseline && (
        <span className="inline-flex items-center gap-1.5">
          <span
            className="w-4 h-1.5 rounded"
            style={{
              background:
                "repeating-linear-gradient(90deg,#f97316 0,#f97316 4px,transparent 4px,transparent 8px)",
            }}
          />
          Baseline
        </span>
      )}
      <span className="inline-flex items-center gap-1.5">
        <span className="w-4 h-2.5 border-2 border-slate-400 bg-white rounded-sm" />
        Plan
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="w-4 h-2.5 bg-slate-300 rounded-sm" />
        Pendiente
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="w-4 h-2.5 bg-brand-primary rounded-sm" />
        En curso
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="w-4 h-2.5 bg-emerald-500 rounded-sm" />
        Completada
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="w-4 h-2.5 bg-rose-500 rounded-sm" />
        Retrasada
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="w-3 h-3 rotate-45 bg-amber-400 border-2 border-amber-600 inline-block" />
        Hito
      </span>
      <span className="inline-flex items-center gap-1.5">
        <svg
          className="w-3 h-3 text-rose-500"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
            clipRule="evenodd"
          />
        </svg>
        Ruta crítica
      </span>
      {todayInRange && (
        <span className="inline-flex items-center gap-1.5">
          <span className="w-px h-3 bg-rose-400/60" />
          Hoy
        </span>
      )}
      {showFloat && (
        <span className="inline-flex items-center gap-1.5">
          <span
            className="w-4 h-1.5 inline-block"
            style={{
              background:
                "repeating-linear-gradient(90deg,rgba(148,163,184,0.5) 0,rgba(148,163,184,0.5) 3px,transparent 3px,transparent 6px)",
            }}
          />
          Holgura
        </span>
      )}
      {showDeps && (
        <span className="inline-flex items-center gap-1.5">
          <span className="w-4 h-0 inline-block border-b border-dashed border-slate-400" />
          Dependencia
        </span>
      )}
      {showCriticalPath && (
        <span className="inline-flex items-center gap-1.5">
          <span className="w-4 h-2.5 border-2 border-amber-500 bg-amber-50/80 rounded-sm" />
          Ruta crítica
        </span>
      )}
    </div>
  );
}
