"use client";

// Gantt CSS/SVG sin dependencia. Barras plan (outline) vs real (sólida).
// Click en barra → callback onEditActivity para abrir modal compartido.
// Resolución: meses. Auto-extiende rango ±15 días al min/max de fechas.

import { useMemo } from "react";
import type { ActivityStatus, ServiceStage, StageActivity } from "@/lib/stages";

const STATUS_BAR: Record<ActivityStatus, string> = {
  pending: "bg-slate-300",
  in_progress: "bg-brand-primary",
  completed: "bg-emerald-500",
  delayed: "bg-rose-500",
};

const MS_DAY = 86_400_000;

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  return new Date(s + "T00:00:00");
}

function fmtMonth(d: Date): string {
  return d.toLocaleDateString("es-MX", { month: "short", year: "2-digit" });
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function fmtShort(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
  });
}

export function ServiceGantt({
  stages,
  onEditActivity,
}: {
  stages: ServiceStage[];
  onEditActivity: (stageId: string, activity: StageActivity) => void;
}) {
  // Aplanar todas las actividades por orden etapa→actividad
  const rows = useMemo(() => {
    const out: { stage: ServiceStage; activity: StageActivity }[] = [];
    for (const s of stages) {
      for (const a of s.activities) out.push({ stage: s, activity: a });
    }
    return out;
  }, [stages]);

  // Calcular rango temporal global
  const range = useMemo(() => {
    const dates: number[] = [];
    for (const { activity: a } of rows) {
      for (const k of [
        a.planned_start,
        a.planned_end,
        a.actual_start,
        a.actual_end,
      ]) {
        const d = parseDate(k);
        if (d) dates.push(d.getTime());
      }
    }
    if (dates.length === 0) return null;
    const min = startOfMonth(new Date(Math.min(...dates) - MS_DAY * 7));
    const max = addMonths(startOfMonth(new Date(Math.max(...dates) + MS_DAY * 7)), 1);
    const months: Date[] = [];
    let cur = new Date(min);
    while (cur < max) {
      months.push(new Date(cur));
      cur = addMonths(cur, 1);
    }
    return { min: min.getTime(), max: max.getTime(), months };
  }, [rows]);

  if (rows.length === 0) {
    return (
      <div className="text-xs text-slate-500 italic px-2 py-3">
        Sin actividades para graficar.
      </div>
    );
  }

  if (!range) {
    return (
      <div className="text-xs text-slate-500 italic px-2 py-3">
        Las actividades existen pero no tienen fechas. Edítalas para ver el Gantt.
      </div>
    );
  }

  const totalMs = range.max - range.min;
  // eslint-disable-next-line react-hooks/purity -- Date.now() fuera de useMemo; valor estable dentro del render
  const todayPct = ((Date.now() - range.min) / totalMs) * 100;
  const todayInRange = todayPct >= 0 && todayPct <= 100;

  function pct(dateStr: string | null): number | null {
    const d = parseDate(dateStr);
    if (!d) return null;
    return ((d.getTime() - range!.min) / totalMs) * 100;
  }

  function barStyle(start: string | null, end: string | null) {
    const a = pct(start);
    const b = pct(end);
    if (a === null || b === null) return null;
    return { left: `${a}%`, width: `${Math.max(b - a, 1)}%` };
  }

  const LABEL_W = 240;

  return (
    <div className="bg-white border border-slate-200 rounded overflow-hidden">
      {/* Header: meses */}
      <div className="flex border-b border-slate-200 bg-slate-50">
        <div
          style={{ width: LABEL_W }}
          className="shrink-0 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 border-r border-slate-200"
        >
          Actividad
        </div>
        <div className="relative flex-1 min-w-0 h-9">
          {range.months.map((m, i) => {
            const left = ((m.getTime() - range.min) / totalMs) * 100;
            const next = i + 1 < range.months.length ? range.months[i + 1] : new Date(range.max);
            const width = ((next.getTime() - m.getTime()) / totalMs) * 100;
            return (
              <div
                key={i}
                className="absolute top-0 bottom-0 border-r border-slate-200 px-1.5 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 truncate"
                style={{ left: `${left}%`, width: `${width}%` }}
              >
                {fmtMonth(m)}
              </div>
            );
          })}
        </div>
      </div>

      {/* Filas: agrupadas por etapa */}
      <div className="divide-y divide-slate-100">
        {stages.map((s) => (
          <div key={s.id}>
            {/* Encabezado de etapa */}
            <div className="flex bg-slate-50/60">
              <div
                style={{ width: LABEL_W }}
                className="shrink-0 px-3 py-1.5 text-xs font-bold text-slate-700 truncate border-r border-slate-200"
              >
                {s.name}
              </div>
              <div className="flex-1 min-w-0 px-2 py-1.5 text-[10px] text-slate-500">
                {s.activities.length}{" "}
                {s.activities.length === 1 ? "actividad" : "actividades"}
              </div>
            </div>
            {s.activities.length === 0 && (
              <div className="flex">
                <div style={{ width: LABEL_W }} className="shrink-0" />
                <div className="flex-1 px-3 py-2 text-[11px] italic text-slate-400">
                  Sin actividades
                </div>
              </div>
            )}
            {s.activities.map((a) => {
              const planStyle = barStyle(a.planned_start, a.planned_end);
              const realStyle = barStyle(a.actual_start, a.actual_end);
              const barColor = STATUS_BAR[a.status];
              return (
                <div
                  key={a.id}
                  className="flex hover:bg-slate-50 transition-colors group"
                >
                  <div
                    style={{ width: LABEL_W }}
                    className="shrink-0 px-3 py-2 border-r border-slate-200 min-w-0"
                  >
                    <p className="text-xs font-medium text-slate-900 truncate">{a.name}</p>
                    {a.assignee_email && (
                      <p
                        className="text-[10px] text-slate-500 truncate"
                        title={a.assignee_email}
                      >
                        @ {a.assignee_email.split("@")[0]}
                      </p>
                    )}
                  </div>
                  <div className="relative flex-1 min-w-0 h-12">
                    {/* Grid de meses */}
                    {range.months.map((m, i) => {
                      const left = ((m.getTime() - range.min) / totalMs) * 100;
                      return (
                        <div
                          key={i}
                          className="absolute top-0 bottom-0 border-r border-slate-100"
                          style={{ left: `${left}%`, width: 0 }}
                        />
                      );
                    })}

                    {/* Línea del día actual */}
                    {todayInRange && (
                      <div
                        className="absolute top-0 bottom-0 border-l border-rose-400/60 pointer-events-none"
                        style={{ left: `${todayPct}%`, width: 0 }}
                        title="Hoy"
                      />
                    )}

                    {/* Barra plan: outline */}
                    {planStyle && (
                      <button
                        onClick={() => onEditActivity(s.id, a)}
                        className="absolute h-3 rounded border-2 border-slate-400 bg-white hover:border-brand-primary transition-colors"
                        style={{ ...planStyle, top: 8 }}
                        title={`Plan: ${fmtShort(a.planned_start)} → ${fmtShort(a.planned_end)}`}
                      />
                    )}

                    {/* Barra real: sólida color por status */}
                    {realStyle ? (
                      <button
                        onClick={() => onEditActivity(s.id, a)}
                        className={`absolute h-3 rounded ${barColor} hover:opacity-80 transition-opacity`}
                        style={{ ...realStyle, top: 26 }}
                        title={`Real: ${fmtShort(a.actual_start)} → ${fmtShort(a.actual_end)} · ${a.status}`}
                      />
                    ) : (
                      // Si no hay fechas reales, muestro placeholder muy tenue
                      planStyle && (
                        <button
                          onClick={() => onEditActivity(s.id, a)}
                          className="absolute h-3 rounded border border-dashed border-slate-300 bg-slate-50 hover:border-brand-primary transition-colors"
                          style={{ ...planStyle, top: 26 }}
                          title="Sin fechas reales — click para registrar"
                        />
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Leyenda */}
      <div className="border-t border-slate-100 bg-slate-50 px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-slate-600">
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
        {todayInRange && (
          <span className="inline-flex items-center gap-1.5">
            <span className="w-px h-3 bg-rose-400/60" />
            Hoy
          </span>
        )}
      </div>
    </div>
  );
}
