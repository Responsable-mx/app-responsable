"use client";

import { forwardRef } from "react";

// Dom=0→"D", Lun=1→"L", Mar=2→"M", Mié=3→"X", Jue=4→"J", Vie=5→"V", Sáb=6→"S"
const DOW = ["D", "L", "M", "X", "J", "V", "S"];

function fmtMonth(d: Date): string {
  return d.toLocaleDateString("es-MX", { month: "short", year: "2-digit" });
}

const MS_DAY = 86_400_000;
const LABEL_W = 240;

type Zoom = "fit" | "mes" | "quarter" | "semana" | "dia";

export interface GanttHeaderProps {
  zoom: Zoom;
  visibleMonths: Date[];
  weeks: number[];
  days: number[];
  effectiveMin: number;
  effectiveMax: number;
  totalMs: number;
  timelineWidth: number | null;
  headerH: number;
  monthRowH: number;
  hasSubRow: boolean;
  todayPct: number;
  todayInRange: boolean;
  now: number;
  rangeMin: number;
}

/**
 * Cabecera de fechas del Gantt (fila de meses + fila de semanas/días).
 * Recibe `ref` para que ServiceGantt pueda sincronizar el scroll horizontal
 * mediante transform desde el listener onScroll del área de filas.
 */
export const GanttHeader = forwardRef<HTMLDivElement, GanttHeaderProps>(
  function GanttHeader(
    {
      zoom,
      visibleMonths,
      weeks,
      days,
      effectiveMin,
      effectiveMax: _effectiveMax,
      totalMs,
      timelineWidth,
      headerH,
      monthRowH,
      hasSubRow,
      todayPct,
      todayInRange,
      now,
      rangeMin,
    },
    ref
  ) {
    return (
      <div className="flex border-b border-slate-200 bg-slate-50">
        {/* Columna label — siempre visible */}
        <div
          style={{ width: LABEL_W, height: headerH }}
          className="shrink-0 bg-slate-50 px-3 border-r border-slate-200 flex items-center text-[10px] font-bold uppercase tracking-widest text-slate-400"
        >
          Actividad
        </div>
        {/* Timeline header: overflow:hidden + translateX sync (sin scrollbar propio) */}
        <div style={{ flex: 1, overflow: "hidden", height: headerH }}>
          <div
            ref={ref}
            className="relative h-full"
            style={{ width: timelineWidth ?? "100%" }}
          >
            {/* Fila 1: meses */}
            {visibleMonths.map((m, i) => {
              const left = ((m.getTime() - effectiveMin) / totalMs) * 100;
              const next =
                i + 1 < visibleMonths.length
                  ? visibleMonths[i + 1]!
                  : new Date(effectiveMin + totalMs);
              const width = ((next.getTime() - m.getTime()) / totalMs) * 100;
              return (
                <div
                  key={i}
                  className="absolute border-r border-slate-200 px-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 truncate flex items-center"
                  style={{ left: `${left}%`, width: `${width}%`, top: 0, height: monthRowH }}
                >
                  {fmtMonth(m)}
                </div>
              );
            })}
            {hasSubRow && (
              <div
                className="absolute left-0 right-0 border-t border-slate-100"
                style={{ top: monthRowH }}
              />
            )}
            {/* Semanas (quarter / semana) */}
            {(zoom === "quarter" || zoom === "semana") &&
              weeks.map((wt, i) => {
                const nextWt = i + 1 < weeks.length ? weeks[i + 1]! : rangeMin + totalMs;
                const left = ((wt - rangeMin) / totalMs) * 100;
                const width = ((nextWt - wt) / totalMs) * 100;
                return (
                  <div
                    key={i}
                    className="absolute border-r border-slate-100 px-1 text-[9px] text-slate-500 font-medium flex items-center truncate"
                    style={{ left: `${left}%`, width: `${width}%`, top: monthRowH, bottom: 0 }}
                  >
                    {new Date(wt).toLocaleDateString("es-MX", {
                      day: "2-digit",
                      month: "numeric",
                    })}
                  </div>
                );
              })}
            {/* Días (semana / dia) */}
            {zoom === "dia" &&
              days.map((dt, i) => {
                const left = ((dt - rangeMin) / totalMs) * 100;
                const width = (MS_DAY / totalMs) * 100;
                const d = new Date(dt);
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                return (
                  <div
                    key={i}
                    className={`absolute border-r border-slate-100 flex flex-col items-center justify-center ${
                      isWeekend ? "bg-slate-100/60 text-slate-400" : "text-slate-600"
                    }`}
                    style={{ left: `${left}%`, width: `${width}%`, top: monthRowH, bottom: 0 }}
                  >
                    <span className="text-[9px] font-bold leading-tight">{DOW[d.getDay()]}</span>
                    <span className="text-[9px] leading-tight">
                      {String(d.getDate()).padStart(2, "0")}
                    </span>
                  </div>
                );
              })}
            {/* Línea de hoy */}
            {todayInRange && (
              <div
                className="absolute top-0 bottom-0 pointer-events-none"
                style={{ left: `${todayPct}%` }}
              >
                <div className="absolute top-0 bottom-0 border-l-2 border-rose-500/70" />
                <div
                  className="absolute -translate-x-1/2 px-1 rounded-sm bg-rose-50 border border-rose-200 text-[9px] font-bold text-rose-600 whitespace-nowrap z-10 leading-4"
                  style={{ top: 3 }}
                >
                  {new Date(now).toLocaleDateString("es-MX", {
                    day: "2-digit",
                    month: "short",
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
);
