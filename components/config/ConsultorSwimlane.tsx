"use client";

// Sprint K: Swimlane por consultor — vista cross-project.
// Y = consultor · X = tiempo · Barras coloreadas por proyecto (client_id hash).
// Fuente de datos: /api/projects/overview (SWR compartido con GanttPorProyecto).

import { useMemo, useState, useRef } from "react";
import useSWR from "swr";
import type { ProjectOverview } from "@/app/api/projects/overview/route";
import type { EquipoFilters } from "./EquipoFilters";
import { SkeletonTable } from "@/components/ui/Skeleton";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<{ data: ProjectOverview[] }>;
  });

const MS_DAY = 86_400_000;
const ROW_H = 40;
const LABEL_W = 180;

// Paleta de 12 colores para proyectos (distinguibles, accesible)
const PROJECT_COLORS = [
  "#0f766e", // teal-700
  "#1d4ed8", // blue-700
  "#7c3aed", // violet-600
  "#b45309", // amber-700
  "#b91c1c", // red-700
  "#047857", // emerald-700
  "#0369a1", // sky-700
  "#6d28d9", // purple-700
  "#c2410c", // orange-700
  "#0e7490", // cyan-700
  "#4f46e5", // indigo-600
  "#9f1239", // rose-800
];

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
function fmtShort(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
}

type FlatAct = {
  id: string;
  name: string;
  assignee: string;
  client_id: string;
  client_name: string;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  status: string;
  is_milestone: boolean;
  blocker_note: string | null;
};

export function ConsultorSwimlane({ filters }: { filters?: EquipoFilters } = {}) {
  const { data, isLoading, error } = useSWR("/api/projects/overview", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<1 | 2 | 3>(1);
  const [now] = useState(() => Date.now());

  const projects = data?.data ?? [];

  // Asignar color por cliente (índice hash)
  const clientColorMap = useMemo(() => {
    const map = new Map<string, string>();
    let idx = 0;
    for (const p of projects) {
      if (!map.has(p.client_id)) {
        map.set(p.client_id, PROJECT_COLORS[idx % PROJECT_COLORS.length]);
        idx++;
      }
    }
    return map;
  }, [projects]);

  // Aplanar actividades con assignee + fechas
  const flatActs = useMemo<FlatAct[]>(() => {
    const out: FlatAct[] = [];
    for (const p of projects) {
      if (filters?.clientId && p.client_id !== filters.clientId) continue;
      for (const sv of p.services) {
        for (const st of sv.stages) {
          for (const a of st.activities) {
            if (!a.assignee_email) continue;
            if (!a.planned_start && !a.planned_end) continue;
            if (filters?.consultorEmail && a.assignee_email !== filters.consultorEmail) continue;
            if (filters?.statuses && filters.statuses.size > 0 && !filters.statuses.has(a.status)) continue;
            out.push({
              id: a.id,
              name: a.name,
              assignee: a.assignee_email,
              client_id: p.client_id,
              client_name: p.client_name,
              planned_start: a.planned_start,
              planned_end: a.planned_end,
              actual_start: a.actual_start,
              actual_end: a.actual_end,
              status: a.status,
              is_milestone: a.is_milestone ?? false,
              blocker_note: a.blocker_note ?? null,
            });
          }
        }
      }
    }
    return out;
  }, [projects, filters]);

  // Agrupar por consultor
  const consultorRows = useMemo(() => {
    const map = new Map<string, FlatAct[]>();
    for (const a of flatActs) {
      const list = map.get(a.assignee) ?? [];
      list.push(a);
      map.set(a.assignee, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [flatActs]);

  // Rango de fechas (toda la vista)
  const range = useMemo(() => {
    const dates: number[] = [];
    for (const a of flatActs) {
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
    while (cur < max) { months.push(new Date(cur)); cur = addMonths(cur, 1); }
    return { min: min.getTime(), max: max.getTime(), months };
  }, [flatActs]);

  // Leyenda de proyectos — antes de early returns (regla hooks)
  const uniqueProjects = useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; name: string; color: string }[] = [];
    for (const p of projects) {
      if (!seen.has(p.client_id)) {
        seen.add(p.client_id);
        out.push({ id: p.client_id, name: p.client_name, color: clientColorMap.get(p.client_id) ?? "#64748b" });
      }
    }
    return out;
  }, [projects, clientColorMap]);

  if (isLoading) return <SkeletonTable rows={4} cols={5} />;
  if (error) return <div className="text-xs text-rose-700 p-4 bg-rose-50 border border-rose-200 rounded">Error al cargar vista swimlane.</div>;
  if (!range || consultorRows.length === 0) return <div className="text-xs text-slate-500 italic p-4">Sin actividades asignadas para mostrar en swimlane.</div>;

  const totalMs = range.max - range.min;
  const todayPct = ((now - range.min) / totalMs) * 100;
  const todayInRange = todayPct >= 0 && todayPct <= 100;
  const BASE_W = 1000 * zoom;

  function pct(s: string | null): number | null {
    const d = parseDate(s);
    if (!d) return null;
    return ((d.getTime() - range!.min) / totalMs) * 100;
  }
  function barStyle(start: string | null, end: string | null) {
    const a = pct(start);
    const b = pct(end);
    if (a === null || b === null) return null;
    const left = Math.max(0, a);
    const right = Math.min(100, b);
    if (right <= 0 || left >= 100) return null;
    return { left: `${left}%`, width: `${Math.max(right - left, 0.6)}%` };
  }

  return (
    <div className="bg-white border border-slate-200 rounded overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-slate-200 bg-slate-50 flex-wrap">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Swimlane por consultor</span>
        <div className="flex items-center gap-0.5">
          {([1, 2, 3] as const).map((z) => (
            <button
              key={z}
              onClick={() => setZoom(z)}
              className={`px-2 py-0.5 text-[10px] font-bold rounded-sm transition-colors ${zoom === z ? "bg-white border border-slate-200 text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-700"}`}
            >
              {z}×
            </button>
          ))}
        </div>
        {/* Leyenda proyectos */}
        <div className="flex items-center gap-2 flex-wrap ml-2">
          {uniqueProjects.map((p) => (
            <span key={p.id} className="flex items-center gap-1 text-[10px] text-slate-600">
              <span className="w-3 h-2.5 rounded-sm shrink-0" style={{ background: p.color }} />
              {p.name}
            </span>
          ))}
        </div>
      </div>

      <div ref={scrollRef} className="overflow-x-auto">
        <div style={{ minWidth: LABEL_W + BASE_W }}>
          {/* Header meses */}
          <div className="flex border-b border-slate-200 bg-slate-50" style={{ height: 32 }}>
            <div style={{ width: LABEL_W, flexShrink: 0 }} className="border-r border-slate-200 px-3 flex items-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Consultor
            </div>
            <div className="relative" style={{ width: BASE_W, flexShrink: 0 }}>
              {range.months.map((m, i) => {
                const left = ((m.getTime() - range.min) / totalMs) * 100;
                const next = i + 1 < range.months.length ? range.months[i + 1] : new Date(range.max);
                const width = ((next.getTime() - m.getTime()) / totalMs) * 100;
                return (
                  <div key={i} className="absolute top-0 bottom-0 border-r border-slate-200 px-1.5 flex items-center text-[10px] font-bold uppercase text-slate-500 truncate" style={{ left: `${left}%`, width: `${width}%` }}>
                    {m.toLocaleDateString("es-MX", { month: "short", year: "2-digit" })}
                  </div>
                );
              })}
              {todayInRange && (
                <div className="absolute top-0 bottom-0 border-l-2 border-rose-500/70 pointer-events-none" style={{ left: `${todayPct}%` }} />
              )}
            </div>
          </div>

          {/* Filas por consultor */}
          <div className="divide-y divide-slate-100">
            {consultorRows.map(([email, acts]) => {
              // KPIs del consultor
              const active = acts.filter((a) => a.status === "in_progress").length;
              const delayed = acts.filter((a) => a.status === "delayed").length;
              const lateStart = acts.filter((a) => !a.actual_start && a.planned_start && a.planned_start < new Date(now).toISOString().slice(0, 10) && a.status !== "completed").length;
              return (
                <div key={email} className="flex hover:bg-slate-50/50 transition-colors" style={{ height: ROW_H }}>
                  {/* Label */}
                  <div style={{ width: LABEL_W, flexShrink: 0 }} className="border-r border-slate-200 px-3 flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-800 truncate" title={email}>{email.split("@")[0]}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {active > 0 && <span className="text-[9px] font-bold text-brand-primary-dark">{active} en curso</span>}
                        {delayed > 0 && <span className="text-[9px] font-bold text-rose-600">{delayed} retrasada{delayed !== 1 ? "s" : ""}</span>}
                        {lateStart > 0 && <span className="text-[9px] font-bold text-amber-700">⏰ {lateStart}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Timeline */}
                  <div className="relative" style={{ width: BASE_W, flexShrink: 0 }}>
                    {/* Grid de meses */}
                    {range.months.map((m, i) => (
                      <div key={i} className="absolute top-0 bottom-0 border-r border-slate-100" style={{ left: `${((m.getTime() - range.min) / totalMs) * 100}%`, width: 0 }} />
                    ))}
                    {/* Línea de hoy */}
                    {todayInRange && (
                      <div className="absolute top-0 bottom-0 border-l-2 border-rose-500/60 pointer-events-none z-10" style={{ left: `${todayPct}%` }} />
                    )}
                    {/* Barras de actividades */}
                    {acts.map((a) => {
                      const color = clientColorMap.get(a.client_id) ?? "#64748b";
                      // Hito: diamante
                      if (a.is_milestone || a.planned_start === a.planned_end) {
                        const p = pct(a.planned_start);
                        if (p === null) return null;
                        return (
                          <div
                            key={a.id}
                            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 z-20"
                            style={{ left: `${p}%` }}
                            title={`${a.name} · ${a.client_name} · ${fmtShort(a.planned_start)}`}
                          >
                            <span className="block w-3 h-3 rotate-45 border-2" style={{ background: color, borderColor: color }} />
                          </div>
                        );
                      }
                      // Barra plan
                      const planSt = barStyle(a.planned_start, a.planned_end);
                      // Barra real
                      const realEnd = a.actual_end ?? (a.status === "in_progress" || a.status === "delayed" ? new Date(now).toISOString().slice(0, 10) : null);
                      const realSt = a.actual_start ? barStyle(a.actual_start, realEnd) : null;
                      return (
                        <div key={a.id}>
                          {planSt && (
                            <div
                              className="absolute rounded-sm pointer-events-none"
                              style={{
                                ...planSt,
                                top: 8,
                                height: 10,
                                background: `${color}40`,
                                border: `1.5px solid ${color}`,
                              }}
                              title={`[Plan] ${a.name} · ${a.client_name} · ${fmtShort(a.planned_start)} → ${fmtShort(a.planned_end)}`}
                            />
                          )}
                          {realSt && (
                            <div
                              className="absolute rounded-sm pointer-events-none"
                              style={{
                                ...realSt,
                                top: 22,
                                height: 8,
                                background: color,
                                opacity: a.status === "completed" ? 0.9 : 0.75,
                              }}
                              title={`[Real] ${a.name} · ${a.client_name} · ${fmtShort(a.actual_start)} → ${fmtShort(a.actual_end ?? "en curso")}`}
                            />
                          )}
                          {a.blocker_note && planSt && (
                            <div
                              className="absolute text-[9px] font-bold z-20 pointer-events-none"
                              style={{ left: planSt.left, top: 4, color: "#e11d48" }}
                              title={`🚫 ${a.blocker_note}`}
                            >
                              🚫
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Leyenda inferior */}
          <div className="border-t border-slate-100 bg-slate-50 px-3 py-1.5 flex items-center gap-4 text-[10px] text-slate-500 flex-wrap">
            <span className="flex items-center gap-1"><span className="w-4 h-2 rounded-sm border border-slate-400 bg-transparent inline-block" />Plan</span>
            <span className="flex items-center gap-1"><span className="w-4 h-2 rounded-sm bg-slate-500 inline-block opacity-75" />Real</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rotate-45 border-2 border-slate-500 inline-block" />Hito</span>
            {todayInRange && <span className="flex items-center gap-1"><span className="w-px h-3 bg-rose-400/60" />Hoy</span>}
            <span className="flex items-center gap-1">🚫 Bloqueo</span>
          </div>
        </div>
      </div>
    </div>
  );
}
