"use client";

// Gantt CSS/SVG sin dependencia. Barras plan (outline) vs real (overlay sólido + % progreso).
// Click en barra → popover quick actions. onEditActivity abre modal completo.
// Mejoras: collapsar etapas · milestones · ruta crítica · indicador sin fechas · zoom + Hoy.

import { useMemo, useState, useRef } from "react";
import type { ActivityStatus, ServiceStage, StageActivity } from "@/lib/stages";
import { QuickActionPopover, type QuickPatch } from "./QuickActionPopover";

// ─── Colores por status ───────────────────────────────────────────────────────

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

// ─── Helpers de fecha ─────────────────────────────────────────────────────────

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

// ─── Zoom ─────────────────────────────────────────────────────────────────────

type Zoom = "fit" | "mes" | "quarter";
const MONTH_PX: Record<Zoom, number | null> = { fit: null, mes: 80, quarter: 200 };

// ─── Ruta crítica: BFS forward desde actividades retrasadas ──────────────────

function findAtRisk(activities: StageActivity[]): Set<string> {
  const atRisk = new Set<string>();
  const queue = activities.filter((a) => a.status === "delayed").map((a) => a.id);
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (atRisk.has(id)) continue;
    atRisk.add(id);
    for (const a of activities) {
      if (a.depends_on_activity_id === id && !atRisk.has(a.id)) queue.push(a.id);
    }
  }
  return atRisk;
}

// ─── Overlay state ────────────────────────────────────────────────────────────

type Overlay =
  | { kind: "tooltip"; activity: StageActivity; anchor: { x: number; y: number } }
  | { kind: "popover"; stageId: string; activity: StageActivity; anchor: { x: number; y: number } }
  | null;

// ─── Componente principal ─────────────────────────────────────────────────────

const LABEL_W = 240;
const ROW_H = 44;

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
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const [now] = useState(() => Date.now());

  const allActivities = useMemo(
    () => stages.flatMap((s) => s.activities),
    [stages]
  );

  const atRisk = useMemo(() => findAtRisk(allActivities), [allActivities]);

  const range = useMemo(() => {
    const dates: number[] = [];
    for (const a of allActivities) {
      for (const k of [a.planned_start, a.planned_end, a.actual_start, a.actual_end]) {
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
  }, [allActivities]);

  if (allActivities.length === 0) {
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

  function pct(dateStr: string | null): number | null {
    const d = parseDate(dateStr);
    if (!d) return null;
    return ((d.getTime() - range!.min) / totalMs) * 100;
  }

  function barStyle(start: string | null, end: string | null) {
    const a = pct(start);
    const b = pct(end);
    if (a === null || b === null) return null;
    return { left: `${a}%`, width: `${Math.max(b - a, 0.8)}%` };
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

  function toggleCollapse(stageId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(stageId)) { next.delete(stageId); } else { next.add(stageId); }
      return next;
    });
  }

  function openPopover(e: React.MouseEvent, stageId: string, activity: StageActivity) {
    e.stopPropagation();
    setOverlay({ kind: "popover", stageId, activity, anchor: { x: e.clientX + 8, y: e.clientY - 4 } });
  }

  function showTooltip(e: React.MouseEvent, activity: StageActivity) {
    if (overlay?.kind === "popover") return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setOverlay({ kind: "tooltip", activity, anchor: { x: rect.right + 4, y: rect.top } });
  }

  function hideTooltip() {
    setOverlay((prev) => (prev?.kind === "tooltip" ? null : prev));
  }

  const timelineStyle = timelineWidth
    ? { width: timelineWidth, flexShrink: 0 as const }
    : { flex: 1, minWidth: 0 };

  const labelSticky = timelineWidth ? " sticky left-0 z-10" : "";

  return (
    <>
      <div
        ref={scrollRef}
        className={`bg-white border border-slate-200 rounded ${timelineWidth ? "overflow-x-auto" : "overflow-hidden"}`}
      >
        {/* Toolbar: zoom + Hoy */}
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

        <div style={timelineWidth ? { minWidth: LABEL_W + timelineWidth } : undefined}>
          {/* Header meses */}
          <div className="flex border-b border-slate-200 bg-slate-50">
            <div
              style={{ width: LABEL_W }}
              className={`shrink-0${labelSticky} bg-slate-50 px-3 py-2 border-r border-slate-200 text-[10px] font-bold uppercase tracking-widest text-slate-400`}
            >
              Actividad
            </div>
            <div className="relative h-9" style={timelineStyle}>
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

          {/* Filas por etapa */}
          <div className="divide-y divide-slate-100">
            {stages.map((s) => {
              const isCollapsed = collapsed.has(s.id);
              return (
                <div key={s.id}>
                  {/* Header de etapa — colapsable */}
                  <div className="flex bg-slate-50/60">
                    <div
                      style={{ width: LABEL_W }}
                      className={`shrink-0${labelSticky} bg-slate-50/80 px-3 py-1.5 border-r border-slate-200 flex items-center gap-1.5 min-w-0`}
                    >
                      <button
                        onClick={() => toggleCollapse(s.id)}
                        className="shrink-0 w-4 h-4 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors"
                        title={isCollapsed ? "Expandir" : "Colapsar"}
                      >
                        <svg
                          className={`w-3 h-3 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      <span className="text-xs font-bold text-slate-700 truncate">{s.name}</span>
                      <span className="shrink-0 ml-auto text-[10px] text-slate-400">
                        {s.activities.length}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0" />
                  </div>

                  {/* Actividades de la etapa */}
                  {!isCollapsed &&
                    s.activities.map((a) => {
                      const isMilestone =
                        !!a.planned_start &&
                        !!a.planned_end &&
                        a.planned_start === a.planned_end;
                      const planStyle = isMilestone ? null : barStyle(a.planned_start, a.planned_end);
                      const realStyle = barStyle(a.actual_start, a.actual_end);
                      const barColor = STATUS_BAR[a.status];
                      const isOnRisk = atRisk.has(a.id);
                      const noFechas = !a.planned_start && !a.planned_end;

                      const dep = a.depends_on_activity_id
                        ? allActivities.find((x) => x.id === a.depends_on_activity_id)
                        : null;
                      const conflict = !!(
                        dep && a.planned_start && dep.planned_end && a.planned_start < dep.planned_end
                      );

                      return (
                        <div
                          key={a.id}
                          className={`flex hover:bg-slate-50/80 transition-colors${isOnRisk ? " bg-rose-50/30" : ""}`}
                        >
                          {/* Label */}
                          <div
                            style={{ width: LABEL_W }}
                            className={`shrink-0${labelSticky} bg-white px-3 py-2 border-r border-slate-200 min-w-0 cursor-default`}
                            onMouseEnter={(e) => showTooltip(e, a)}
                            onMouseLeave={hideTooltip}
                          >
                            <div className="flex items-center gap-1 min-w-0">
                              {isOnRisk && (
                                <svg className="shrink-0 w-3 h-3 text-rose-500" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                                </svg>
                              )}
                              {isMilestone && (
                                <svg className="shrink-0 w-3 h-3 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                                  <path d="M10 1l2.928 5.941L19 8l-4.5 4.385L15.618 19 10 16.118 4.382 19l1.118-6.615L1 8l6.072-1.059L10 1z" />
                                </svg>
                              )}
                              <p className="text-xs font-medium text-slate-900 truncate">{a.name}</p>
                            </div>
                            {a.assignee_email && (
                              <p className="text-[10px] text-slate-500 truncate pl-4" title={a.assignee_email}>
                                @ {a.assignee_email.split("@")[0]}
                              </p>
                            )}
                            {noFechas && (
                              <span className="inline-flex items-center gap-0.5 mt-0.5 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-sm bg-amber-50 text-amber-700 border border-amber-200">
                                Sin plan
                              </span>
                            )}
                            {dep && (
                              <p
                                className={`text-[10px] truncate pl-4 ${conflict ? "text-rose-700 font-bold" : "text-slate-400"}`}
                                title={conflict ? `⚠ Conflicto: empieza antes de que "${dep.name}" termine` : `Depende de: ${dep.name}`}
                              >
                                {conflict ? "⚠ " : "↳ "}{dep.name}
                              </p>
                            )}
                          </div>

                          {/* Timeline */}
                          <div
                            className="relative"
                            style={{ ...timelineStyle, height: ROW_H }}
                          >
                            {/* Grid meses */}
                            {range.months.map((m, i) => (
                              <div
                                key={i}
                                className="absolute top-0 bottom-0 border-r border-slate-100"
                                style={{ left: `${((m.getTime() - range.min) / totalMs) * 100}%`, width: 0 }}
                              />
                            ))}

                            {/* Línea hoy */}
                            {todayInRange && (
                              <div
                                className="absolute top-0 bottom-0 border-l border-rose-400/60 pointer-events-none"
                                style={{ left: `${todayPct}%`, width: 0 }}
                              />
                            )}

                            {/* Ruta crítica: fondo tenue */}
                            {isOnRisk && (
                              <div
                                className="absolute inset-0 pointer-events-none"
                                style={{
                                  background: "repeating-linear-gradient(135deg, transparent, transparent 4px, rgba(251,113,133,0.06) 4px, rgba(251,113,133,0.06) 8px)",
                                }}
                              />
                            )}

                            {/* ── Milestone: diamante ──────────────────────── */}
                            {isMilestone && (() => {
                              const p = pct(a.planned_start);
                              if (p === null) return null;
                              return (
                                <button
                                  onClick={(e) => openPopover(e, s.id, a)}
                                  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rotate-45 bg-amber-400 border-2 border-amber-600 hover:bg-amber-300 transition-colors z-20"
                                  style={{ left: `${p}%` }}
                                  title={`Hito: ${fmtShort(a.planned_start)}`}
                                />
                              );
                            })()}

                            {/* ── Barra plan (outline) ─────────────────────── */}
                            {planStyle && (
                              <button
                                onClick={(e) => openPopover(e, s.id, a)}
                                className={`absolute h-4 rounded border-2 bg-white/80 hover:opacity-80 transition-all z-10 ${
                                  isOnRisk ? "border-rose-400" : "border-slate-400 hover:border-brand-primary"
                                }`}
                                style={{ ...planStyle, top: 10 }}
                                title={`Plan: ${fmtShort(a.planned_start)} → ${fmtShort(a.planned_end)}`}
                              />
                            )}

                            {/* ── Barra real (sólida, overlay, con progreso) ── */}
                            {realStyle ? (
                              <button
                                onClick={(e) => openPopover(e, s.id, a)}
                                className={`absolute h-3 rounded overflow-hidden ${barColor} hover:opacity-90 transition-opacity z-20`}
                                style={{ ...realStyle, top: 13 }}
                                title={`Real: ${fmtShort(a.actual_start)} → ${fmtShort(a.actual_end)} · ${STATUS_LABEL[a.status]}${a.actual_progress != null ? ` · ${a.actual_progress}%` : ""}`}
                              >
                                {/* Unfilled portion si hay progreso explícito */}
                                {a.actual_progress != null && a.actual_progress < 100 && (
                                  <div
                                    className="absolute top-0 right-0 bottom-0 bg-white/40"
                                    style={{ width: `${100 - a.actual_progress}%` }}
                                  />
                                )}
                              </button>
                            ) : planStyle ? (
                              /* Sin fechas reales: placeholder dashed sobre barra plan */
                              <button
                                onClick={(e) => openPopover(e, s.id, a)}
                                className="absolute h-2 rounded border border-dashed border-slate-300 bg-transparent hover:border-brand-primary transition-colors z-20"
                                style={{ ...planStyle, top: 14 }}
                                title="Sin fechas reales — click para registrar"
                              />
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                </div>
              );
            })}
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
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rotate-45 bg-amber-400 border-2 border-amber-600 inline-block" />
              Hito
            </span>
            <span className="inline-flex items-center gap-1.5">
              <svg className="w-3 h-3 text-rose-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              Ruta crítica
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

      {/* Tooltip rich */}
      {overlay?.kind === "tooltip" && (
        <RichTooltip activity={overlay.activity} anchor={overlay.anchor} />
      )}

      {/* Popover quick actions */}
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

// ─── Rich tooltip ─────────────────────────────────────────────────────────────

function RichTooltip({
  activity: a,
  anchor,
}: {
  activity: StageActivity;
  anchor: { x: number; y: number };
}) {
  const x = Math.min(anchor.x, window.innerWidth - 220);
  const y = Math.min(anchor.y, window.innerHeight - 200);

  return (
    <div
      className="fixed z-50 bg-white border border-slate-200 rounded shadow-md p-3 w-56 pointer-events-none"
      style={{ top: y, left: x }}
    >
      <p className="text-[10px] font-bold text-slate-800 mb-2 truncate">{a.name}</p>
      <div className="space-y-1 text-[10px] text-slate-600">
        <TooltipRow label="Plan inicio" value={fmtShort(a.planned_start)} />
        <TooltipRow label="Plan fin" value={fmtShort(a.planned_end)} />
        <TooltipRow label="Real inicio" value={fmtShort(a.actual_start)} />
        <TooltipRow label="Real fin" value={fmtShort(a.actual_end)} />
        {a.actual_progress != null && (
          <div className="pt-1">
            <div className="flex justify-between mb-0.5">
              <span>Progreso</span>
              <span className="font-bold text-slate-700">{a.actual_progress}%</span>
            </div>
            <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-primary rounded-full"
                style={{ width: `${a.actual_progress}%` }}
              />
            </div>
          </div>
        )}
      </div>
      <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px]">
        <span className="text-slate-500">Status</span>
        <span className={`font-bold ${STATUS_TEXT[a.status]}`}>{STATUS_LABEL[a.status]}</span>
      </div>
      {a.assignee_email && (
        <div className="mt-1 pt-1 border-t border-slate-100 text-[10px] text-slate-500 truncate">
          @ {a.assignee_email}
        </div>
      )}
    </div>
  );
}

function TooltipRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <span className="font-medium text-slate-700">{value}</span>
    </div>
  );
}
