"use client";

// Timeline global v2 — vista gerencial cross-project.
// 8 mejoras: KPIs header · RAG badge · sort por riesgo · heatmap solapamiento ·
// milestones por etapa · cascade alert · stage-gate progress · tooltip rico.

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import type { ProjectOverview } from "@/app/api/projects/overview/route";
import type { ActivityStatus } from "@/lib/stages";
import { activityInDateRange, type EquipoFilters } from "./EquipoFilters";
import { SkeletonTable } from "@/components/ui/Skeleton";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<{ data: ProjectOverview[] }>;
  });

const STATUS_BAR: Record<ActivityStatus, string> = {
  pending: "bg-slate-300 hover:bg-slate-400",
  in_progress: "bg-brand-primary hover:bg-brand-primary-dark",
  completed: "bg-emerald-500 hover:bg-emerald-600",
  delayed: "bg-rose-500 hover:bg-rose-600",
};

const MS_DAY = 86_400_000;
const LABEL_W = 210;

type FlatActivity = {
  id: string;
  name: string;
  client_id: string;
  client_name: string;
  stage_name: string;
  service: string;
  assignee_email: string | null;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  status: ActivityStatus;
  depends_on_activity_id: string | null;
};

type Milestone = { date: string; label: string; client: string; progress: string };
type OverlapBand = { left: number; width: number };

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  return new Date(s + "T00:00:00");
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function fmtMonth(d: Date): string {
  return d.toLocaleDateString("es-MX", { month: "short", year: "2-digit" });
}
function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
  });
}

// Asigna carriles evitando superposición visual por fechas reales
function assignLanes(acts: FlatActivity[]): number[] {
  type Interval = { s: number; e: number; lane: number };
  const occupied: Interval[] = [];
  return acts.map((a) => {
    const s =
      parseDate(a.planned_start)?.getTime() ??
      parseDate(a.actual_start)?.getTime() ??
      null;
    const e =
      parseDate(a.planned_end)?.getTime() ??
      parseDate(a.actual_end)?.getTime() ??
      null;
    if (!s || !e) return 0;
    let lane = 0;
    while (occupied.some((o) => o.lane === lane && o.s < e && o.e > s)) lane++;
    occupied.push({ s, e, lane });
    return lane;
  });
}

// Detecta zonas donde ≥2 actividades se solapan → heatmap de carga
function computeOverlapBands(
  acts: FlatActivity[],
  rangeMin: number,
  totalMs: number
): OverlapBand[] {
  const intervals = acts
    .map((a) => ({
      s: parseDate(a.planned_start)?.getTime() ?? null,
      e: parseDate(a.planned_end)?.getTime() ?? null,
    }))
    .filter((x): x is { s: number; e: number } => x.s !== null && x.e !== null);

  const bands: OverlapBand[] = [];
  for (let i = 0; i < intervals.length; i++) {
    for (let j = i + 1; j < intervals.length; j++) {
      const oS = Math.max(intervals[i].s, intervals[j].s);
      const oE = Math.min(intervals[i].e, intervals[j].e);
      if (oS < oE) {
        bands.push({
          left: ((oS - rangeMin) / totalMs) * 100,
          width: Math.max(((oE - oS) / totalMs) * 100, 0.3),
        });
      }
    }
  }
  return bands;
}

// Último milestone (◆) por (client + stage) para cada consultor
function computeMilestones(acts: FlatActivity[]): Milestone[] {
  const byStage = new Map<string, FlatActivity[]>();
  for (const a of acts) {
    const key = `${a.client_id}::${a.stage_name}`;
    const list = byStage.get(key) ?? [];
    list.push(a);
    byStage.set(key, list);
  }
  const result: Milestone[] = [];
  for (const [, group] of byStage) {
    const withEnd = group
      .filter((a) => a.planned_end)
      .sort((a, b) => (b.planned_end! > a.planned_end! ? 1 : -1));
    if (withEnd[0]?.planned_end) {
      const completed = group.filter((a) => a.status === "completed").length;
      result.push({
        date: withEnd[0].planned_end,
        label: withEnd[0].stage_name,
        client: withEnd[0].client_name,
        progress: `${completed}/${group.length}`,
      });
    }
  }
  return result;
}

// ── Componente ────────────────────────────────────────────────────────────────

export function GlobalTimeline({ filters }: { filters?: EquipoFilters } = {}) {
  const { data, error, isLoading } = useSWR("/api/projects/overview", fetcher);
  const [now] = useState(() => Date.now());

  // Aplanar + filtrar (incluye depends_on_activity_id para cascade)
  const activities = useMemo<FlatActivity[]>(() => {
    const out: FlatActivity[] = [];
    for (const p of data?.data ?? []) {
      if (filters?.clientId && p.client_id !== filters.clientId) continue;
      for (const sv of p.services) {
        for (const st of sv.stages) {
          for (const a of st.activities) {
            if (
              filters?.statuses &&
              filters.statuses.size > 0 &&
              !filters.statuses.has(a.status)
            )
              continue;
            if (
              filters?.consultorEmail &&
              a.assignee_email !== filters.consultorEmail
            )
              continue;
            if (filters?.dateRange && filters.dateRange !== "all") {
              if (filters.dateRange === "overdue") {
                if (a.status !== "delayed") continue;
              } else if (
                !activityInDateRange(
                  filters.dateRange,
                  a.planned_start,
                  a.planned_end
                )
              )
                continue;
            }
            out.push({
              id: a.id,
              name: a.name,
              client_id: p.client_id,
              client_name: p.client_name,
              stage_name: st.name,
              service: sv.service,
              assignee_email: a.assignee_email,
              planned_start: a.planned_start,
              planned_end: a.planned_end,
              actual_start: a.actual_start,
              actual_end: a.actual_end,
              status: a.status,
              depends_on_activity_id: a.depends_on_activity_id,
            });
          }
        }
      }
    }
    return out;
  }, [data, filters]);

  // KPIs globales (feature 1)
  const globalStats = useMemo(() => {
    const consultores = new Set(
      activities.map((a) => a.assignee_email).filter(Boolean)
    ).size;
    const activas = activities.filter(
      (a) => a.status === "in_progress" || a.status === "delayed"
    ).length;
    const retrasadas = activities.filter((a) => a.status === "delayed").length;
    const horizon = now + 30 * MS_DAY;
    const proximas = activities.filter((a) => {
      if (a.status !== "pending" || !a.planned_start) return false;
      const ts = parseDate(a.planned_start)?.getTime() ?? 0;
      return ts >= now && ts <= horizon;
    }).length;
    return { consultores, activas, retrasadas, proximas };
  }, [activities, now]);

  // IDs con dependientes — para cascade alert (feature 6)
  const activitiesWithDependents = useMemo(() => {
    const set = new Set<string>();
    for (const a of activities) {
      if (a.depends_on_activity_id) set.add(a.depends_on_activity_id);
    }
    return set;
  }, [activities]);

  // Progreso por etapa — para stage-gate tooltip (feature 7)
  const stageProgress = useMemo(() => {
    const map = new Map<string, { total: number; completed: number }>();
    for (const a of activities) {
      const key = `${a.client_id}::${a.stage_name}`;
      const cur = map.get(key) ?? { total: 0, completed: 0 };
      cur.total++;
      if (a.status === "completed") cur.completed++;
      map.set(key, cur);
    }
    return map;
  }, [activities]);

  // Agrupar por consultor + sort por riesgo (feature 3)
  const byConsultor = useMemo(() => {
    const map = new Map<string, FlatActivity[]>();
    for (const a of activities) {
      const key = a.assignee_email ?? "__unassigned__";
      const list = map.get(key) ?? [];
      list.push(a);
      map.set(key, list);
    }
    return Array.from(map.entries()).sort(([, a], [, b]) => {
      // Retrasadas desc → en curso desc → sin asignar al final
      const aD = a.filter((x) => x.status === "delayed").length;
      const bD = b.filter((x) => x.status === "delayed").length;
      if (bD !== aD) return bD - aD;
      const aP = a.filter((x) => x.status === "in_progress").length;
      const bP = b.filter((x) => x.status === "in_progress").length;
      return bP - aP;
    });
  }, [activities]);

  // Rango temporal global
  const range = useMemo(() => {
    const dates: number[] = [];
    for (const a of activities) {
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
  }, [activities]);

  // ── Early returns ─────────────────────────────────────────────────────────

  if (isLoading) return <SkeletonTable rows={5} cols={4} />;
  if (error)
    return (
      <div className="border border-rose-200 bg-rose-50 rounded p-4 text-sm text-rose-700">
        No se pudo cargar el timeline.
      </div>
    );
  if (activities.length === 0)
    return (
      <div className="bg-white border border-slate-200 rounded p-12 text-center text-sm text-slate-500">
        Sin actividades creadas todavía.
      </div>
    );
  if (!range)
    return (
      <div className="bg-white border border-slate-200 rounded p-12 text-center text-sm text-slate-500">
        Hay actividades pero ninguna tiene fechas. Asigna fechas plan en la
        ficha del cliente para ver el timeline.
      </div>
    );

  const totalMs = range.max - range.min;
  const todayPct = ((now - range.min) / totalMs) * 100;
  const todayInRange = todayPct >= 0 && todayPct <= 100;

  function pct(s: string | null): number | null {
    const d = parseDate(s);
    if (!d) return null;
    return ((d.getTime() - range!.min) / totalMs) * 100;
  }
  function barStyle(s: string | null, e: string | null) {
    const a = pct(s);
    const b = pct(e);
    if (a === null || b === null) return null;
    return { left: `${a}%`, width: `${Math.max(b - a, 1)}%` };
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* ── Feature 1: Header KPIs ── */}
      <div className="grid grid-cols-4 gap-3">
        {(
          [
            {
              label: "Consultores",
              value: globalStats.consultores,
              tone: "neutral" as const,
              hint: "con actividades visibles",
            },
            {
              label: "En curso",
              value: globalStats.activas,
              tone: "primary" as const,
              hint: "activas o retrasadas",
            },
            {
              label: "Retrasadas",
              value: globalStats.retrasadas,
              tone: "red" as const,
              hint: "requieren atención",
            },
            {
              label: "Próximas 30d",
              value: globalStats.proximas,
              tone: "amber" as const,
              hint: "inician pronto",
            },
          ] as const
        ).map(({ label, value, tone, hint }) => (
          <div
            key={label}
            className="bg-white border border-slate-200 rounded px-4 py-3 shadow-sm"
          >
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              {label}
            </p>
            <p
              className={`text-2xl font-bold tabular-nums mt-0.5 ${
                tone === "red"
                  ? "text-rose-600"
                  : tone === "amber"
                  ? "text-amber-600"
                  : tone === "primary"
                  ? "text-brand-primary-dark"
                  : "text-slate-900"
              }`}
            >
              {value}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">{hint}</p>
          </div>
        ))}
      </div>

      {/* ── Timeline ── */}
      <div className="bg-white border border-slate-200 rounded shadow-sm overflow-hidden">
        {/* Header meses */}
        <div className="flex border-b border-slate-200 bg-slate-50 sticky top-0 z-10">
          <div
            style={{ width: LABEL_W }}
            className="shrink-0 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 border-r border-slate-200"
          >
            Consultor
          </div>
          <div className="relative flex-1 min-w-0 h-9">
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

        {/* Filas por consultor */}
        <div className="divide-y divide-slate-100">
          {byConsultor.map(([key, acts]) => {
            const isUnassigned = key === "__unassigned__";
            const display = isUnassigned ? "Sin asignar" : key.split("@")[0];
            const subtitle = isUnassigned ? `${acts.length} sin owner` : key;

            // ── Feature 2: RAG badge ──
            const delayed = acts.filter((a) => a.status === "delayed").length;
            const active = acts.filter(
              (a) => a.status === "in_progress"
            ).length;
            const rag: "red" | "amber" | "green" =
              delayed > 0 ? "red" : active > 0 ? "amber" : "green";
            const RAG_DOT = {
              red: "bg-rose-500",
              amber: "bg-amber-400",
              green: "bg-emerald-500",
            } as const;
            const RAG_TEXT = {
              red: `text-rose-700 font-bold`,
              amber: `text-amber-700 font-semibold`,
              green: `text-slate-500`,
            } as const;
            const RAG_LABEL = {
              red: `${delayed} retrasada${delayed !== 1 ? "s" : ""}`,
              amber: `${active} en curso`,
              green: "Sin carga activa",
            } as const;

            // ── Feature 4: Heatmap solapamiento ──
            const overlapBands = computeOverlapBands(acts, range.min, totalMs);

            // ── Feature 5: Milestones ──
            const milestones = computeMilestones(acts);

            // Lane assignment sin superposición visual
            const lanes = assignLanes(acts);
            const maxLane = acts.length > 0 ? Math.max(0, ...lanes) : 0;
            const rowH = Math.max(64, 14 + (maxLane + 1) * 20 + 14);

            return (
              <div key={key} className="flex" style={{ minHeight: rowH }}>
                {/* Label column */}
                <div
                  style={{ width: LABEL_W }}
                  className="shrink-0 px-3 py-2.5 border-r border-slate-200 min-w-0 flex flex-col justify-start gap-0.5"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    {/* RAG dot */}
                    <span
                      className={`shrink-0 w-2 h-2 rounded-full ${RAG_DOT[rag]}`}
                      aria-label={RAG_LABEL[rag]}
                    />
                    <p
                      className={`text-xs font-semibold truncate ${
                        isUnassigned
                          ? "text-slate-500 italic"
                          : "text-slate-900"
                      }`}
                    >
                      {display}
                    </p>
                  </div>
                  <p
                    className="text-[10px] text-slate-500 truncate pl-3.5"
                    title={subtitle}
                  >
                    {subtitle}
                  </p>
                  {!isUnassigned && (
                    <p className={`text-[10px] tabular-nums pl-3.5 ${RAG_TEXT[rag]}`}>
                      {RAG_LABEL[rag]}
                    </p>
                  )}
                </div>

                {/* Timeline column */}
                <div className="relative flex-1 min-w-0">
                  {/* Líneas de meses */}
                  {range.months.map((m, i) => (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 border-r border-slate-100"
                      style={{
                        left: `${((m.getTime() - range.min) / totalMs) * 100}%`,
                        width: 0,
                      }}
                    />
                  ))}

                  {/* Feature 4: Bandas de solapamiento (heatmap de carga) */}
                  {overlapBands.map((band, i) => (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 bg-amber-100/70 pointer-events-none"
                      style={{
                        left: `${band.left}%`,
                        width: `${band.width}%`,
                      }}
                      title="Actividades solapadas — carga alta en este período"
                    />
                  ))}

                  {/* Hoy */}
                  {todayInRange && (
                    <div
                      className="absolute top-0 bottom-0 border-l border-rose-400/60 pointer-events-none z-20"
                      style={{ left: `${todayPct}%`, width: 0 }}
                      title="Hoy"
                    />
                  )}

                  {/* Barras de actividades */}
                  {acts.map((a, idx) => {
                    const realStyle = barStyle(a.actual_start, a.actual_end);
                    const planStyle = barStyle(
                      a.planned_start,
                      a.planned_end
                    );
                    const style = realStyle ?? planStyle;
                    if (!style) return null;

                    const colorClass = STATUS_BAR[a.status];
                    const lane = lanes[idx];
                    const top = 14 + lane * 20;

                    // Feature 6: Cascade alert
                    const isCascade =
                      a.status === "delayed" &&
                      activitiesWithDependents.has(a.id);

                    // Feature 7: Stage-gate progress
                    const stageKey = `${a.client_id}::${a.stage_name}`;
                    const sp = stageProgress.get(stageKey);
                    const spLabel = sp
                      ? `${sp.completed}/${sp.total} completas`
                      : "";

                    // Feature 8: Tooltip rico
                    const tooltip = [
                      isCascade
                        ? "⚡ RIESGO CASCADA — dependientes afectados"
                        : null,
                      `Cliente: ${a.client_name}`,
                      `Etapa: ${a.stage_name}${spLabel ? ` · ${spLabel}` : ""}`,
                      `Actividad: ${a.name}`,
                      `Plan: ${fmt(a.planned_start)} → ${fmt(a.planned_end)}`,
                      `Real: ${fmt(a.actual_start)} → ${fmt(a.actual_end)}`,
                      `Status: ${a.status}`,
                    ]
                      .filter(Boolean)
                      .join("\n");

                    return (
                      <Link
                        key={a.id}
                        href={`/clientes/${a.client_id}?tab=cronograma`}
                        className={`absolute h-4 rounded ${colorClass} transition-colors flex items-center px-1 overflow-hidden gap-0.5 ${
                          isCascade
                            ? "ring-1 ring-rose-300 ring-offset-0"
                            : ""
                        }`}
                        style={{ ...style, top }}
                        title={tooltip}
                      >
                        {isCascade && (
                          <span className="text-[8px] shrink-0 leading-none">
                            ⚡
                          </span>
                        )}
                        <span className="text-[9px] text-white font-semibold truncate leading-none">
                          {a.client_name} · {a.name}
                        </span>
                      </Link>
                    );
                  })}

                  {/* Feature 5: Milestone diamonds (◆ cierre de etapa) */}
                  {milestones.map((m, i) => {
                    const p = pct(m.date);
                    if (p === null || p < 0 || p > 100) return null;
                    return (
                      <div
                        key={i}
                        className="absolute z-10 pointer-events-none"
                        style={{
                          left: `${p}%`,
                          bottom: 5,
                          transform: "translateX(-50%)",
                        }}
                        title={`◆ Cierre: ${m.client} · ${m.label}\n${m.progress} actividades completadas\nFecha: ${fmt(m.date)}`}
                      >
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 10 10"
                          className="fill-slate-500"
                        >
                          <polygon points="5,0 10,5 5,10 0,5" />
                        </svg>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Leyenda */}
        <div className="border-t border-slate-100 bg-slate-50 px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-600">
          <span className="font-semibold text-slate-500">Status:</span>
          {(
            [
              { color: "bg-slate-300", label: "Pendiente" },
              { color: "bg-brand-primary", label: "En curso" },
              { color: "bg-emerald-500", label: "Completada" },
              { color: "bg-rose-500", label: "Retrasada" },
            ] as const
          ).map(({ color, label }) => (
            <span key={label} className="inline-flex items-center gap-1.5">
              <span className={`w-4 h-2.5 ${color} rounded-sm`} />
              {label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5 border-l border-slate-200 pl-4">
            <svg
              width="8"
              height="8"
              viewBox="0 0 10 10"
              className="fill-slate-500 shrink-0"
            >
              <polygon points="5,0 10,5 5,10 0,5" />
            </svg>
            Cierre de etapa
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 h-2.5 bg-amber-100 rounded-sm border border-amber-200" />
            Solapamiento
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="text-[9px]">⚡</span>
            Riesgo cascada
          </span>
          {todayInRange && (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-px h-3 bg-rose-400/60" />
              Hoy
            </span>
          )}
          <span className="ml-auto text-[10px] text-slate-500 italic">
            Click en barra → ficha del cliente
          </span>
        </div>
      </div>
    </div>
  );
}
