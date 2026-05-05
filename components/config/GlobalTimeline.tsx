"use client";

// Timeline global: 1 row por consultor, todas sus actividades cross-project en una sola línea.
// Identifica solapamientos de carga al instante. Reutiliza /api/projects/overview.

import { useMemo } from "react";
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
};

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

export function GlobalTimeline({ filters }: { filters?: EquipoFilters } = {}) {
  const { data, error, isLoading } = useSWR("/api/projects/overview", fetcher);

  // Aplanar todas las actividades + aplicar filtros
  const activities = useMemo<FlatActivity[]>(() => {
    const out: FlatActivity[] = [];
    for (const p of data?.data ?? []) {
      if (filters?.clientId && p.client_id !== filters.clientId) continue;
      for (const sv of p.services) {
        for (const st of sv.stages) {
          for (const a of st.activities) {
            if (filters?.statuses && filters.statuses.size > 0 && !filters.statuses.has(a.status)) continue;
            if (filters?.consultorEmail && a.assignee_email !== filters.consultorEmail) continue;
            if (filters?.dateRange && filters.dateRange !== "all") {
              if (filters.dateRange === "overdue") {
                if (a.status !== "delayed") continue;
              } else if (!activityInDateRange(filters.dateRange, a.planned_start, a.planned_end)) {
                continue;
              }
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
            });
          }
        }
      }
    }
    return out;
  }, [data, filters]);

  // Agrupar por consultor
  const byConsultor = useMemo(() => {
    const map = new Map<string, FlatActivity[]>();
    for (const a of activities) {
      const key = a.assignee_email ?? "__unassigned__";
      const list = map.get(key) ?? [];
      list.push(a);
      map.set(key, list);
    }
    // Ordenar: primero asignados (alfabético), unassigned al final
    const entries = Array.from(map.entries()).sort(([a], [b]) => {
      if (a === "__unassigned__") return 1;
      if (b === "__unassigned__") return -1;
      return a.localeCompare(b);
    });
    return entries;
  }, [activities]);

  // Rango temporal global
  const range = useMemo(() => {
    const dates: number[] = [];
    for (const a of activities) {
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
  }, [activities]);

  if (isLoading) return <SkeletonTable rows={5} cols={4} />;
  if (error)
    return (
      <div className="border border-rose-200 bg-rose-50 rounded p-4 text-sm text-rose-700">
        No se pudo cargar el timeline.
      </div>
    );

  if (activities.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded p-12 text-center text-sm text-slate-500">
        Sin actividades creadas todavía.
      </div>
    );
  }

  if (!range) {
    return (
      <div className="bg-white border border-slate-200 rounded p-12 text-center text-sm text-slate-500">
        Hay actividades pero ninguna tiene fechas. Asigna fechas plan en la ficha del cliente para ver el timeline.
      </div>
    );
  }

  const totalMs = range.max - range.min;
  const todayPct = ((Date.now() - range.min) / totalMs) * 100;
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

  const LABEL_W = 200;

  return (
    <div className="bg-white border border-slate-200 rounded shadow-sm overflow-hidden">
      {/* Header de meses */}
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

      {/* Filas por consultor */}
      <div className="divide-y divide-slate-100">
        {byConsultor.map(([key, acts]) => {
          const isUnassigned = key === "__unassigned__";
          const display = isUnassigned ? "Sin asignar" : key.split("@")[0];
          const subtitle = isUnassigned ? `${acts.length} sin owner` : key;
          // Detectar solapamientos: actividades en curso simultáneas
          const inProgress = acts.filter((a) => a.status === "in_progress" || a.status === "delayed").length;
          return (
            <div key={key} className="flex hover:bg-slate-50 transition-colors min-h-[64px]">
              <div
                style={{ width: LABEL_W }}
                className="shrink-0 px-3 py-2.5 border-r border-slate-200 min-w-0"
              >
                <p
                  className={`text-xs font-semibold truncate ${isUnassigned ? "text-slate-500 italic" : "text-slate-900"}`}
                >
                  {display}
                </p>
                <p className="text-[10px] text-slate-500 truncate" title={subtitle}>
                  {subtitle}
                </p>
                {!isUnassigned && (
                  <p className="text-[10px] text-slate-500 tabular-nums mt-0.5">
                    {acts.length} act ·{" "}
                    {inProgress > 0 ? (
                      <span className="text-brand-primary-dark font-bold">
                        {inProgress} en curso
                      </span>
                    ) : (
                      "0 en curso"
                    )}
                  </p>
                )}
              </div>
              <div className="relative flex-1 min-w-0">
                {/* Líneas verticales por mes */}
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

                {/* Hoy */}
                {todayInRange && (
                  <div
                    className="absolute top-0 bottom-0 border-l border-rose-400/60 pointer-events-none z-20"
                    style={{ left: `${todayPct}%`, width: 0 }}
                    title="Hoy"
                  />
                )}

                {/* Barras de actividades — usa fecha real si existe, sino plan */}
                {acts.map((a, idx) => {
                  const realStyle = barStyle(a.actual_start, a.actual_end);
                  const planStyle = barStyle(a.planned_start, a.planned_end);
                  const style = realStyle ?? planStyle;
                  if (!style) return null;
                  const colorClass = STATUS_BAR[a.status];
                  // Stack vertical: usar idx % 3 para asignar 3 carriles y evitar superposición visual total
                  const lane = idx % 3;
                  const top = 8 + lane * 16;
                  return (
                    <Link
                      key={a.id}
                      href={`/clientes/${a.client_id}?tab=cronograma`}
                      className={`absolute h-3.5 rounded ${colorClass} transition-colors flex items-center px-1.5 overflow-hidden`}
                      style={{ ...style, top }}
                      title={`${a.client_name} · ${a.stage_name} · ${a.name}\nPlan: ${fmt(a.planned_start)} → ${fmt(a.planned_end)}\nReal: ${fmt(a.actual_start)} → ${fmt(a.actual_end)}\nStatus: ${a.status}`}
                    >
                      <span className="text-[9px] text-white font-semibold truncate">
                        {a.client_name} · {a.name}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Leyenda */}
      <div className="border-t border-slate-100 bg-slate-50 px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-slate-600">
        <span>Status:</span>
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
          <span className="inline-flex items-center gap-1.5 ml-2">
            <span className="w-px h-3 bg-rose-400/60" />
            Hoy
          </span>
        )}
        <span className="ml-auto text-[10px] text-slate-500 italic">
          Click en barra → ficha del cliente
        </span>
      </div>
    </div>
  );
}
