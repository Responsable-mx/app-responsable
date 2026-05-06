"use client";

// Heatmap de carga semanal: consultores × próximas 12 semanas.
// Calculado client-side desde /api/projects/overview — sin endpoint extra.
// Color: blanco=libre · emerald=1-2 · amber=3-4 · rose=5+.

import { useState } from "react";
import useSWR from "swr";
import type { ProjectOverview } from "@/app/api/projects/overview/route";

const fetcher = (url: string) =>
  fetch(url).then((r) => r.json() as Promise<{ data: ProjectOverview[] }>);

const MS_DAY = 86_400_000;
const MS_WEEK = 7 * MS_DAY;

function mondayOf(ts: number): number {
  const d = new Date(ts);
  const dow = d.getDay(); // 0=Dom
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function fmtWeek(ts: number): string {
  return new Date(ts).toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
}

export function WorkloadHeatmap() {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("workload-heatmap-collapsed") === "true";
  });
  const { data, isLoading } = useSWR("/api/projects/overview", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="bg-white border border-slate-200 rounded p-4">
        <div className="h-20 animate-pulse bg-slate-100 rounded" />
      </div>
    );
  }

  const projects = data?.data ?? [];

  // Recopilar actividades activas (no completadas) con assignee + fechas plan
  const acts: { assignee: string; start: number; end: number }[] = [];
  for (const p of projects) {
    for (const sv of p.services) {
      for (const st of sv.stages) {
        for (const a of st.activities) {
          if (!a.assignee_email || !a.planned_start || !a.planned_end) continue;
          if (a.status === "completed") continue;
          acts.push({
            assignee: a.assignee_email,
            start: new Date(a.planned_start + "T00:00:00").getTime(),
            end: new Date(a.planned_end + "T00:00:00").getTime(),
          });
        }
      }
    }
  }

  const consultors = [...new Set(acts.map((a) => a.assignee))].sort();
  if (consultors.length === 0) return null;

  // Próximas 12 semanas desde el lunes actual
  const todayMonday = mondayOf(Date.now());
  const weeks = Array.from({ length: 12 }, (_, i) => todayMonday + i * MS_WEEK);

  // heatmap[consultor][semana] = count actividades solapando esa semana
  const heatmap: Record<string, number[]> = {};
  for (const c of consultors) {
    heatmap[c] = weeks.map((wStart) => {
      const wEnd = wStart + MS_WEEK;
      return acts.filter((a) => a.assignee === c && a.start < wEnd && a.end >= wStart).length;
    });
  }

  // Tendencia: compara primera mitad vs segunda mitad de las 12 semanas
  function trendOf(loads: number[]): { arrow: string; color: string; label: string } {
    const a = (loads[0] + loads[1] + loads[2] + loads[3]) / 4;
    const b = (loads[4] + loads[5] + loads[6] + loads[7]) / 4;
    if (b > a + 0.5) return { arrow: "↑", color: "text-rose-600", label: "Carga creciente" };
    if (b < a - 0.5) return { arrow: "↓", color: "text-emerald-600", label: "Carga decreciente" };
    return { arrow: "→", color: "text-slate-400", label: "Carga estable" };
  }

  function cellBg(n: number): string {
    if (n === 0) return "bg-white";
    if (n <= 2) return "bg-emerald-50";
    if (n <= 4) return "bg-amber-50";
    return "bg-rose-50";
  }

  function cellText(n: number): string {
    if (n === 0) return "text-slate-200";
    if (n <= 2) return "text-emerald-700";
    if (n <= 4) return "text-amber-700";
    return "text-rose-700 font-extrabold";
  }

  // Máximo por consultor para mini sparkbar
  const maxLoad = Math.max(...consultors.map((c) => Math.max(...heatmap[c])), 1);

  function toggleCollapsed() {
    setCollapsed((v) => {
      const next = !v;
      try { localStorage.setItem("workload-heatmap-collapsed", String(next)); } catch {}
      return next;
    });
  }

  return (
    <div className="bg-white border border-slate-200 rounded overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between gap-3">
        <button
          onClick={toggleCollapsed}
          className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-700 transition-colors"
        >
          <svg
            className={`w-3 h-3 transition-transform ${collapsed ? "-rotate-90" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          Carga semanal — próximas 12 semanas
        </button>
        {!collapsed && (
          <div className="flex items-center gap-3 text-[9px] font-bold uppercase tracking-widest text-slate-500">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-50 border border-emerald-200 inline-block" />
              1–2
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-50 border border-amber-200 inline-block" />
              3–4
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-rose-50 border border-rose-200 inline-block" />
              5+
            </span>
          </div>
        )}
      </div>
      {!collapsed && <div className="overflow-x-auto">
        <table className="min-w-full w-max text-[10px] border-collapse">
          <thead>
            <tr className="bg-slate-50">
              <th className="sticky left-0 z-10 bg-slate-50 px-3 py-1.5 text-left font-bold uppercase tracking-widest text-slate-400 border-r border-slate-200 w-36">
                Consultor
              </th>
              {weeks.map((w, i) => (
                <th
                  key={i}
                  className={`px-1.5 py-1.5 text-center font-bold text-slate-500 whitespace-nowrap border-r border-slate-100 min-w-[44px] ${
                    w === todayMonday ? "bg-brand-primary/5 text-brand-primary-dark" : ""
                  }`}
                >
                  {fmtWeek(w)}
                </th>
              ))}
              <th className="px-2 py-1.5 text-center font-bold text-slate-400 whitespace-nowrap w-16">
                Pico
              </th>
              <th className="px-2 py-1.5 text-center font-bold text-slate-400 whitespace-nowrap w-10">
                Tend.
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {consultors.map((c) => {
              const peakLoad = Math.max(...heatmap[c]);
              const peakWeekIdx = heatmap[c].indexOf(peakLoad);
              const trend = trendOf(heatmap[c]);
              return (
                <tr key={c} className="hover:bg-slate-50/50 transition-colors">
                  <td
                    className="sticky left-0 z-10 bg-white px-3 py-1.5 border-r border-slate-200 font-medium text-slate-700 truncate max-w-[144px]"
                    title={c}
                  >
                    {c.split("@")[0]}
                  </td>
                  {heatmap[c].map((n, wi) => (
                    <td
                      key={wi}
                      className={`px-1 py-1.5 text-center tabular-nums border-r border-slate-100 ${cellBg(n)} ${cellText(n)} ${
                        wi === peakWeekIdx && peakLoad >= 5 ? "ring-1 ring-inset ring-rose-300" : ""
                      }`}
                      title={`${c.split("@")[0]} · semana del ${fmtWeek(weeks[wi])}: ${n} actividad${n !== 1 ? "es" : ""}`}
                    >
                      {n > 0 ? n : "·"}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-center">
                    {/* Mini spark: barra de carga máxima */}
                    <div className="flex items-center justify-center gap-0.5">
                      {heatmap[c].map((n, wi) => (
                        <div
                          key={wi}
                          className={`w-0.5 rounded-sm transition-all ${
                            n === 0 ? "bg-slate-100" :
                            n <= 2 ? "bg-emerald-300" :
                            n <= 4 ? "bg-amber-400" :
                            "bg-rose-400"
                          }`}
                          style={{ height: Math.max(2, (n / maxLoad) * 14) }}
                        />
                      ))}
                    </div>
                  </td>
                  <td
                    className="px-2 py-1.5 text-center text-sm font-bold"
                    title={trend.label}
                  >
                    <span className={trend.color}>{trend.arrow}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>}
    </div>
  );
}
