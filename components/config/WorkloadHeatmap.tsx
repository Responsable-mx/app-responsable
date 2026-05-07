"use client";

// Heatmap de carga semanal: consultores × próximas 12 semanas.
// Calculado client-side desde /api/projects/overview — sin endpoint extra.
// Color: blanco=libre · emerald=1-2 · amber=3-4 · rose=5+.
// Click en celda → panel de actividades de esa semana para ese consultor.

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import type { ProjectOverview } from "@/app/api/projects/overview/route";
import type { ActivityStatus } from "@/lib/stages";

const fetcher = (url: string) =>
  fetch(url).then((r) => r.json() as Promise<{ data: ProjectOverview[] }>);

const MS_DAY = 86_400_000;
const MS_WEEK = 7 * MS_DAY;

type HeatAct = {
  assignee: string;
  start: number;
  end: number;
  name: string;
  clientId: string;
  clientName: string;
  status: ActivityStatus;
  plannedStart: string | null;
  plannedEnd: string | null;
};

const STATUS_COLOR: Record<ActivityStatus, string> = {
  pending: "bg-slate-100 text-slate-600 border-slate-200",
  in_progress: "bg-brand-primary-light text-brand-primary-dark border-brand-primary/20",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  delayed: "bg-rose-50 text-rose-700 border-rose-200",
};

const STATUS_LABEL: Record<ActivityStatus, string> = {
  pending: "Pendiente",
  in_progress: "En curso",
  completed: "Completada",
  delayed: "Retrasada",
};

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

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
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

function totalBg(n: number): string {
  if (n === 0) return "bg-slate-50 text-slate-300";
  if (n <= consultorCount * 2) return "bg-emerald-50 text-emerald-700";
  if (n <= consultorCount * 4) return "bg-amber-50 text-amber-700";
  return "bg-rose-50 text-rose-700 font-extrabold";
}

// Se asigna en el módulo porque la función totalBg lo necesita
let consultorCount = 1;

export function WorkloadHeatmap() {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("workload-heatmap-collapsed") === "true";
  });
  const { data, isLoading } = useSWR("/api/projects/overview", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  const [todayMonday] = useState(() => mondayOf(Date.now()));
  const [selectedCell, setSelectedCell] = useState<{ email: string; weekTs: number } | null>(null);

  if (isLoading) {
    return (
      <div className="bg-white border border-slate-200 rounded p-4">
        <div className="h-20 animate-pulse bg-slate-100 rounded" />
      </div>
    );
  }

  const projects = data?.data ?? [];

  // Recopilar actividades activas (no completadas) con datos enriquecidos
  const acts: HeatAct[] = [];
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
            name: a.name,
            clientId: p.client_id,
            clientName: p.client_name,
            status: a.status,
            plannedStart: a.planned_start,
            plannedEnd: a.planned_end,
          });
        }
      }
    }
  }

  const consultors = [...new Set(acts.map((a) => a.assignee))].sort();
  if (consultors.length === 0) return null;
  consultorCount = consultors.length;

  // Próximas 12 semanas desde el lunes actual
  const weeks = Array.from({ length: 12 }, (_, i) => todayMonday + i * MS_WEEK);

  // heatmap[consultor][semana] = count actividades solapando esa semana
  const heatmap: Record<string, number[]> = {};
  for (const c of consultors) {
    heatmap[c] = weeks.map((wStart) => {
      const wEnd = wStart + MS_WEEK;
      return acts.filter((a) => a.assignee === c && a.start < wEnd && a.end >= wStart).length;
    });
  }

  // Totales por semana (suma de todos los consultores)
  const weekTotals = weeks.map((_, wi) =>
    consultors.reduce((s, c) => s + heatmap[c][wi], 0)
  );

  // Badge: semanas donde algún consultor tiene ≥5 actividades
  const criticalWeeks = weeks.filter((_, wi) => consultors.some((c) => heatmap[c][wi] >= 5)).length;

  function toggleCollapsed() {
    setCollapsed((v) => {
      const next = !v;
      try { localStorage.setItem("workload-heatmap-collapsed", String(next)); } catch {}
      return next;
    });
  }

  function handleCellClick(email: string, weekTs: number, count: number) {
    if (count === 0) return;
    setSelectedCell((prev) =>
      prev?.email === email && prev?.weekTs === weekTs ? null : { email, weekTs }
    );
  }

  // Actividades del panel seleccionado
  const panelActs = selectedCell
    ? acts.filter((a) => {
        const wEnd = selectedCell.weekTs + MS_WEEK;
        return a.assignee === selectedCell.email && a.start < wEnd && a.end >= selectedCell.weekTs;
      }).sort((a, b) => {
        const order: Record<ActivityStatus, number> = { delayed: 0, in_progress: 1, pending: 2, completed: 3 };
        return (order[a.status] ?? 9) - (order[b.status] ?? 9);
      })
    : [];

  const selectedName = selectedCell
    ? (() => { const n = selectedCell.email.split("@")[0]; return n.charAt(0).toUpperCase() + n.slice(1); })()
    : "";

  return (
    <div className="bg-white border border-slate-200 rounded overflow-hidden">
      {/* Header */}
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
          {criticalWeeks > 0 && (
            <span className="ml-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-sm bg-rose-100 text-rose-700 text-[9px] font-bold">
              ⚠ {criticalWeeks} semana{criticalWeeks !== 1 ? "s" : ""} en riesgo
            </span>
          )}
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
            <span className="text-slate-400">· Click celda = ver detalle</span>
          </div>
        )}
      </div>

      {!collapsed && (
        <>
          <div className="overflow-x-auto">
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
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {consultors.map((c) => {
                  const peakLoad = Math.max(...heatmap[c]);
                  const peakWeekIdx = heatmap[c].indexOf(peakLoad);
                  const displayName = (() => { const n = c.split("@")[0]; return n.charAt(0).toUpperCase() + n.slice(1); })();
                  return (
                    <tr key={c} className="hover:bg-slate-50/50 transition-colors">
                      <td
                        className="sticky left-0 z-10 bg-white px-3 py-1.5 border-r border-slate-200 font-medium text-slate-700 truncate max-w-[144px]"
                        title={c}
                      >
                        {displayName}
                      </td>
                      {heatmap[c].map((n, wi) => {
                        const isSelected = selectedCell?.email === c && selectedCell?.weekTs === weeks[wi];
                        return (
                          <td
                            key={wi}
                            onClick={() => handleCellClick(c, weeks[wi], n)}
                            className={`px-1 py-1.5 text-center tabular-nums border-r border-slate-100 transition-all ${
                              n > 0 ? "cursor-pointer hover:ring-2 hover:ring-inset hover:ring-slate-400/40" : ""
                            } ${cellBg(n)} ${cellText(n)} ${
                              wi === peakWeekIdx && peakLoad >= 5 ? "ring-1 ring-inset ring-rose-300" : ""
                            } ${isSelected ? "ring-2 ring-inset ring-brand-primary/60" : ""}`}
                            title={n > 0 ? `${displayName} · semana del ${fmtWeek(weeks[wi])}: ${n} actividad${n !== 1 ? "es" : ""} — click para ver detalle` : undefined}
                          >
                            {n > 0 ? n : "·"}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200">
                  <td className="sticky left-0 z-10 bg-slate-50 px-3 py-1.5 border-r border-slate-200 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Total equipo
                  </td>
                  {weekTotals.map((n, wi) => (
                    <td
                      key={wi}
                      className={`px-1 py-1.5 text-center tabular-nums border-r border-slate-100 text-[10px] font-bold ${totalBg(n)}`}
                      title={`Total equipo · semana del ${fmtWeek(weeks[wi])}: ${n} actividades en curso`}
                    >
                      {n > 0 ? n : "·"}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Panel de detalle de celda seleccionada */}
          {selectedCell && panelActs.length > 0 && (
            <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  {selectedName} · semana del {fmtWeek(selectedCell.weekTs)} · {panelActs.length} actividad{panelActs.length !== 1 ? "es" : ""}
                </p>
                <button
                  onClick={() => setSelectedCell(null)}
                  className="text-slate-400 hover:text-slate-700 text-xs transition-colors min-w-[28px] min-h-[28px] flex items-center justify-center"
                  aria-label="Cerrar detalle"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                {panelActs.map((a, i) => (
                  <Link
                    key={i}
                    href={`/clientes/${a.clientId}?tab=cronograma`}
                    className="bg-white border border-slate-200 rounded p-2.5 hover:border-brand-primary transition-colors block"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-900 truncate leading-tight">{a.name}</p>
                        <p className="text-[10px] text-slate-500 truncate mt-0.5">{a.clientName}</p>
                        <p className="text-[10px] text-slate-400 tabular-nums mt-0.5">
                          {fmtDate(a.plannedStart)} → {fmtDate(a.plannedEnd)}
                        </p>
                      </div>
                      <span className={`shrink-0 text-[9px] font-medium border rounded-sm px-1.5 py-0.5 whitespace-nowrap ${STATUS_COLOR[a.status]}`}>
                        {STATUS_LABEL[a.status]}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
