"use client";

// Gantt CSS/SVG sin dependencia. Barras plan (outline) vs real (sólida).
// Click en barra → popover quick actions. onEditActivity abre modal completo.
// Resolución: meses. Auto-extiende rango ±7 días al min/max de fechas.
// Zoom: Ajustar (% flex) | Mes (80px/mes) | Trim (200px/mes) + scroll horizontal.

import { useMemo, useState, useRef } from "react";
import type { ActivityStatus, ServiceStage, StageActivity } from "@/lib/stages";
import { QuickActionPopover, type QuickPatch } from "./QuickActionPopover";

const STATUS_BAR: Record<ActivityStatus, string> = {
  pending: "bg-slate-300",
  in_progress: "bg-brand-primary",
  completed: "bg-emerald-500",
  delayed: "bg-rose-500",
};

const STATUS_LABEL: Record<ActivityStatus, string> = {
  pending: "Pendiente",
  in_progress: "En curso",
  completed: "Completada",
  delayed: "Retrasada",
};

const STATUS_TEXT: Record<ActivityStatus, string> = {
  pending: "text-slate-500",
  in_progress: "text-brand-primary-dark",
  completed: "text-emerald-700",
  delayed: "text-rose-700",
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

type Zoom = "fit" | "mes" | "quarter";
const MONTH_PX: Record<Zoom, number | null> = { fit: null, mes: 80, quarter: 200 };

type Overlay =
  | {
      kind: "tooltip";
      activity: StageActivity;
      anchor: { x: number; y: number };
    }
  | {
      kind: "popover";
      stageId: string;
      activity: StageActivity;
      anchor: { x: number; y: number };
    }
  | null;

export function ServiceGantt({
  stages,
  onEditActivity,
  onQuickAction,
}: {
  stages: ServiceStage[];
  onEditActivity: (stageId: string, activity: StageActivity) => void;
  onQuickAction?: (activityId: string, patch: QuickPatch) => Promise<void>;
}) {
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => {
    const out: { stage: ServiceStage; activity: StageActivity }[] = [];
    for (const s of stages) {
      for (const a of s.activities) out.push({ stage: s, activity: a });
    }
    return out;
  }, [stages]);

  const range = useMemo(() => {
    const dates: number[] = [];
    for (const { activity: a } of rows) {
      for (const k of [a.planned_start, a.planned_end, a.actual_start, a.actual_end]) {
        const d = parseDate(k);
        if (d) dates.push(d.getTime());
      }
    }
    if (dates.length === 0) return null;
    const min = startOfMonth(new Date(Math.min(...dates) - MS_DAY * 7));
    const max = addMonths(
      startOfMonth(new Date(Math.max(...dates) + MS_DAY * 7)),
      1
    );
    const months: Date[] = [];
    let cur = new Date(min);
    while (cur < max) {
      months.push(new Date(cur));
      cur = addMonths(cur, 1);
    }
    return { min: min.getTime(), max: max.getTime(), months };
  }, [rows]);

  const [now] = useState(() => Date.now());

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
  const todayPct = ((now - range.min) / totalMs) * 100;
  const todayInRange = todayPct >= 0 && todayPct <= 100;

  const monthPx = MONTH_PX[zoom];
  const timelineWidth = monthPx ? range.months.length * monthPx : null;
  const LABEL_W = 240;

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

  function scrollToToday() {
    const el = scrollRef.current;
    if (!el) return;
    if (timelineWidth && todayInRange) {
      const todayPx = (todayPct / 100) * timelineWidth;
      el.scrollLeft = Math.max(0, todayPx - (el.clientWidth - LABEL_W) / 2);
    } else {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  const timelineStyle = timelineWidth
    ? { width: timelineWidth, flexShrink: 0 as const }
    : { flex: 1, minWidth: 0 };

  const labelBaseClass = `shrink-0 border-r border-slate-200 min-w-0${timelineWidth ? " sticky left-0 z-10" : ""}`;

  function openPopover(e: React.MouseEvent, stageId: string, activity: StageActivity) {
    e.stopPropagation();
    setOverlay({
      kind: "popover",
      stageId,
      activity,
      anchor: { x: e.clientX + 8, y: e.clientY - 4 },
    });
  }

  function showTooltip(e: React.MouseEvent, activity: StageActivity) {
    if (overlay?.kind === "popover") return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setOverlay({
      kind: "tooltip",
      activity,
      anchor: { x: rect.right + 4, y: rect.top },
    });
  }

  function hideTooltip() {
    setOverlay((prev) => (prev?.kind === "tooltip" ? null : prev));
  }

  return (
    <>
      <div
        ref={scrollRef}
        className={`bg-white border border-slate-200 rounded ${timelineWidth ? "overflow-x-auto" : "overflow-hidden"}`}
      >
        {/* Controles zoom + Hoy */}
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-0.5">
            {(
              [
                { v: "fit", label: "Ajustar" },
                { v: "mes", label: "Mes" },
                { v: "quarter", label: "Trim." },
              ] as { v: Zoom; label: string }[]
            ).map(({ v, label }) => (
              <button
                key={v}
                onClick={() => setZoom(v)}
                className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest rounded-sm transition-colors ${
                  zoom === v
                    ? "bg-white border border-slate-200 text-slate-900 shadow-sm"
                    : "text-slate-400 hover:text-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {todayInRange && (
            <button
              onClick={scrollToToday}
              className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-brand-primary-dark transition-colors"
            >
              <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                <circle cx="10" cy="10" r="4" />
              </svg>
              Hoy
            </button>
          )}
        </div>

        {/* Contenido con ancho mínimo en modo zoom */}
        <div style={timelineWidth ? { minWidth: LABEL_W + timelineWidth } : undefined}>
          {/* Header: meses */}
          <div className="flex border-b border-slate-200 bg-slate-50">
            <div
              style={{ width: LABEL_W }}
              className={`${labelBaseClass} bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400`}
            >
              Actividad
            </div>
            <div className="relative h-9" style={timelineStyle}>
              {range.months.map((m, i) => {
                const left = ((m.getTime() - range.min) / totalMs) * 100;
                const next =
                  i + 1 < range.months.length
                    ? range.months[i + 1]
                    : new Date(range.max);
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

          {/* Filas agrupadas por etapa */}
          <div className="divide-y divide-slate-100">
            {stages.map((s) => (
              <div key={s.id}>
                {/* Encabezado de etapa */}
                <div className="flex bg-slate-50/60">
                  <div
                    style={{ width: LABEL_W }}
                    className={`${labelBaseClass} bg-slate-50/80 px-3 py-1.5 text-xs font-bold text-slate-700 truncate`}
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
                  const dep = a.depends_on_activity_id
                    ? stages
                        .flatMap((st) => st.activities)
                        .find((x) => x.id === a.depends_on_activity_id)
                    : null;
                  const conflict = !!(
                    dep &&
                    a.planned_start &&
                    dep.planned_end &&
                    a.planned_start < dep.planned_end
                  );
                  return (
                    <div
                      key={a.id}
                      className="flex hover:bg-slate-50 transition-colors"
                    >
                      {/* Label con tooltip al hover */}
                      <div
                        style={{ width: LABEL_W }}
                        className={`${labelBaseClass} bg-white px-3 py-2 cursor-default`}
                        onMouseEnter={(e) => showTooltip(e, a)}
                        onMouseLeave={hideTooltip}
                      >
                        <p className="text-xs font-medium text-slate-900 truncate">
                          {a.name}
                        </p>
                        {a.assignee_email && (
                          <p
                            className="text-[10px] text-slate-500 truncate"
                            title={a.assignee_email}
                          >
                            @ {a.assignee_email.split("@")[0]}
                          </p>
                        )}
                        {dep && (
                          <p
                            className={`text-[10px] truncate ${
                              conflict
                                ? "text-rose-700 font-bold"
                                : "text-slate-400"
                            }`}
                            title={
                              conflict
                                ? `⚠ Conflicto: empieza antes de que "${dep.name}" termine`
                                : `Depende de: ${dep.name}`
                            }
                          >
                            {conflict ? "⚠ " : "↳ "}depende: {dep.name}
                          </p>
                        )}
                      </div>

                      {/* Timeline */}
                      <div className="relative h-12" style={timelineStyle}>
                        {/* Grid de meses */}
                        {range.months.map((m, i) => {
                          const left =
                            ((m.getTime() - range.min) / totalMs) * 100;
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

                        {/* Barra plan */}
                        {planStyle && (
                          <button
                            onClick={(e) => openPopover(e, s.id, a)}
                            className="absolute h-3 rounded border-2 border-slate-400 bg-white hover:border-brand-primary transition-colors"
                            style={{ ...planStyle, top: 8 }}
                            title={`Plan: ${fmtShort(a.planned_start)} → ${fmtShort(a.planned_end)}`}
                          />
                        )}

                        {/* Barra real */}
                        {realStyle ? (
                          <button
                            onClick={(e) => openPopover(e, s.id, a)}
                            className={`absolute h-3 rounded ${barColor} hover:opacity-80 transition-opacity`}
                            style={{ ...realStyle, top: 26 }}
                            title={`Real: ${fmtShort(a.actual_start)} → ${fmtShort(a.actual_end)} · ${a.status}`}
                          />
                        ) : (
                          planStyle && (
                            <button
                              onClick={(e) => openPopover(e, s.id, a)}
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
      </div>

      {/* Tooltip rich (hover sobre label) */}
      {overlay?.kind === "tooltip" && (
        <RichTooltip activity={overlay.activity} anchor={overlay.anchor} />
      )}

      {/* Popover quick actions (click en barra) */}
      {overlay?.kind === "popover" && (
        <QuickActionPopover
          activity={overlay.activity}
          anchor={overlay.anchor}
          onClose={() => setOverlay(null)}
          onEditFull={() => onEditActivity(overlay.stageId, overlay.activity)}
          onQuickAction={onQuickAction}
        />
      )}
    </>
  );
}

function RichTooltip({
  activity: a,
  anchor,
}: {
  activity: StageActivity;
  anchor: { x: number; y: number };
}) {
  const x = Math.min(anchor.x, window.innerWidth - 216);
  const y = Math.min(anchor.y, window.innerHeight - 180);

  return (
    <div
      className="fixed z-50 bg-white border border-slate-200 rounded shadow-md p-3 w-52 pointer-events-none"
      style={{ top: y, left: x }}
    >
      <p className="text-[10px] font-bold text-slate-800 mb-2 truncate">{a.name}</p>
      <div className="space-y-1 text-[10px] text-slate-600">
        <Row label="Plan inicio" value={fmtShort(a.planned_start)} />
        <Row label="Plan fin" value={fmtShort(a.planned_end)} />
        <Row label="Real inicio" value={fmtShort(a.actual_start)} />
        <Row label="Real fin" value={fmtShort(a.actual_end)} />
      </div>
      <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px]">
        <span className="text-slate-500">Status</span>
        <span className={`font-bold ${STATUS_TEXT[a.status]}`}>
          {STATUS_LABEL[a.status]}
        </span>
      </div>
      {a.assignee_email && (
        <div className="mt-1 pt-1 border-t border-slate-100 text-[10px] text-slate-500 truncate">
          @ {a.assignee_email}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <span className="font-medium text-slate-700">{value}</span>
    </div>
  );
}
