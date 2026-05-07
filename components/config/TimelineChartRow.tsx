"use client";

/**
 * TimelineChartRow — fila de actividades en el chart del GlobalTimeline.
 * Extraída de GlobalTimeline.tsx para separar responsabilidades:
 *   - GlobalTimeline: estado, filtros, layout exterior, cabecera de meses/semanas.
 *   - TimelineChartRow: render de barras, milestones, heatmap por fila.
 *
 * React.memo: evita re-render de filas cuyo contenido no cambió al actualizar
 * filtros o zoom (la mayoría de filas son estables entre actualizaciones).
 */

import { memo } from "react";
import Link from "next/link";
import {
  MS_DAY,
  STATUS_INLINE,
  hexAlpha,
  estimateProgress,
  parseDate,
  fmt,
  type FlatActivity,
  type Milestone,
  type OverlapBand,
  type ColorMode,
} from "@/lib/timeline/utils";

export type TimelineChartRowProps = {
  rowH: number;
  acts: FlatActivity[];
  lanes: number[];
  overlapBands: OverlapBand[];
  milestones: Milestone[];
  /** Timestamp del inicio del rango — para calcular posiciones en px */
  rangeMin: number;
  totalMs: number;
  chartW: number;
  rangeMonths: Date[];
  weekStarts: { px: number }[];
  dayLines: { px: number }[];
  showDaySub: boolean;
  todayInRange: boolean;
  todayPx: number;
  now: number;
  activitiesWithDependents: Set<string>;
  stageProgress: Map<string, { total: number; completed: number }>;
  colorMode: ColorMode;
  clientColorMap: Map<string, string>;
};

function pxOf(
  s: string | null,
  rangeMin: number,
  totalMs: number,
  chartW: number
): number | null {
  const d = parseDate(s);
  if (!d) return null;
  return ((d.getTime() - rangeMin) / totalMs) * chartW;
}

function barPx(
  s: string | null,
  e: string | null,
  rangeMin: number,
  totalMs: number,
  chartW: number
): { left: number; width: number } | null {
  const a = pxOf(s, rangeMin, totalMs, chartW);
  const b = pxOf(e, rangeMin, totalMs, chartW);
  if (a === null || b === null) return null;
  return { left: a, width: Math.max(b - a, 2) };
}

export const TimelineChartRow = memo(function TimelineChartRow({
  rowH,
  acts,
  lanes,
  overlapBands,
  milestones,
  rangeMin,
  totalMs,
  chartW,
  rangeMonths,
  weekStarts,
  dayLines,
  showDaySub,
  todayInRange,
  todayPx,
  now,
  activitiesWithDependents,
  stageProgress,
  colorMode,
  clientColorMap,
}: TimelineChartRowProps) {
  return (
    <div
      className="relative border-b border-slate-100"
      style={{
        height: rowH,
        contentVisibility: "auto" as React.CSSProperties["contentVisibility"],
        containIntrinsicSize: `0px ${rowH}px`,
      }}
    >
      {/* Líneas de mes */}
      {rangeMonths.map((m, i) => (
        <div
          key={i}
          className="absolute top-0 bottom-0 border-r border-slate-200/80 pointer-events-none"
          style={{ left: ((m.getTime() - rangeMin) / totalMs) * chartW, width: 0 }}
        />
      ))}

      {/* Líneas de semana */}
      {weekStarts.map(({ px }, i) => (
        <div
          key={i}
          className="absolute top-0 bottom-0 border-r border-slate-100 pointer-events-none"
          style={{ left: px, width: 0 }}
        />
      ))}

      {/* Líneas de día (zoom alto) */}
      {showDaySub && dayLines.map(({ px }, i) => (
        <div
          key={i}
          className="absolute top-0 bottom-0 pointer-events-none"
          style={{ left: px, width: 0, borderRight: "1px dashed rgba(203,213,225,0.35)" }}
        />
      ))}

      {/* Heatmap de solapamiento */}
      {overlapBands.map((band, i) => (
        <div
          key={i}
          className="absolute top-0 bottom-0 bg-amber-100/70 pointer-events-none"
          style={{ left: band.leftPx, width: band.widthPx }}
          title="Actividades solapadas — carga alta en este período"
        />
      ))}

      {/* Línea de hoy */}
      {todayInRange && (
        <div
          className="absolute top-0 bottom-0 border-l border-rose-400/60 pointer-events-none z-20"
          style={{ left: todayPx, width: 0 }}
          title="Hoy"
        />
      )}

      {/* Barras de actividades */}
      {acts.map((a, idx) => {
        const realStyle = barPx(a.actual_start, a.actual_end, rangeMin, totalMs, chartW);
        const planStyle = barPx(a.planned_start, a.planned_end, rangeMin, totalMs, chartW);
        const style = realStyle ?? planStyle;
        if (!style) return null;

        const lane = lanes[idx] ?? 0;
        const top = 14 + lane * 20;
        const isCascade = a.status === "delayed" && activitiesWithDependents.has(a.id);

        const stageKey = `${a.client_id}::${a.stage_name}`;
        const sp = stageProgress.get(stageKey);
        const spLabel = sp ? `${sp.completed}/${sp.total} completas` : "";

        const daysOverdue = (() => {
          if (a.status !== "delayed" || !a.planned_end) return null;
          const endMs = parseDate(a.planned_end)?.getTime();
          if (!endMs || now < endMs) return null;
          return Math.floor((now - endMs) / MS_DAY);
        })();

        const tooltip = [
          isCascade ? "⚡ RIESGO CASCADA — dependientes afectados" : null,
          daysOverdue !== null ? `⏰ ${daysOverdue} días de retraso` : null,
          `Cliente: ${a.client_name}`,
          `Etapa: ${a.stage_name}${spLabel ? ` · ${spLabel}` : ""}`,
          `Actividad: ${a.name}`,
          `Plan: ${fmt(a.planned_start)} → ${fmt(a.planned_end)}`,
          `Real: ${fmt(a.actual_start)} → ${fmt(a.actual_end)}`,
          `Status: ${a.status}`,
        ].filter(Boolean).join("\n");

        const progress = estimateProgress(a, now);
        const barStyle = colorMode === "estado"
          ? STATUS_INLINE[a.status]
          : (() => {
              const c = clientColorMap.get(a.client_id) ?? "#64748b";
              return { bg: hexAlpha(c, 0.12), fill: c, text: c };
            })();

        return (
          <Link
            key={a.id}
            href={`/clientes/${a.client_id}?tab=cronograma`}
            className={`absolute h-4 rounded overflow-hidden flex items-center px-1 gap-0.5 ${
              isCascade ? "ring-1 ring-rose-300" : ""
            }`}
            style={{
              left: style.left,
              width: style.width,
              top,
              background: barStyle.bg,
              border: `1px solid ${barStyle.fill}55`,
            }}
            title={tooltip}
          >
            <div
              className="absolute left-0 top-0 bottom-0 pointer-events-none"
              style={{
                width: `${progress}%`,
                background: barStyle.fill,
                opacity: 0.55,
                borderRadius: "3px 0 0 3px",
              }}
            />
            {isCascade && (
              <span className="relative z-10 text-[8px] shrink-0 leading-none" style={{ color: barStyle.text }}>
                ⚡
              </span>
            )}
            <span className="relative z-10 text-[9px] font-semibold truncate leading-none" style={{ color: barStyle.text }}>
              {a.name}
            </span>
          </Link>
        );
      })}

      {/* Milestones ◆ */}
      {milestones.map((m, i) => {
        const mPx = pxOf(m.date, rangeMin, totalMs, chartW);
        if (mPx === null || mPx < 0 || mPx > chartW) return null;
        return (
          <div
            key={i}
            className="absolute z-10 pointer-events-none"
            style={{ left: mPx, bottom: 5, transform: "translateX(-50%)" }}
            title={`◆ Cierre: ${m.client} · ${m.label}\n${m.progress} actividades completadas\nFecha: ${fmt(m.date)}`}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" className="fill-slate-500">
              <polygon points="5,0 10,5 5,10 0,5" />
            </svg>
          </div>
        );
      })}
    </div>
  );
});
