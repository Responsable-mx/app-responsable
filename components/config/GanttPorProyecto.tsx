"use client";

// 4ta vista de /equipo: Gantt por proyecto.
// Cada proyecto se renderiza con ServiceGantt completo (timeline plan/real).

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import type { ProjectOverview } from "@/app/api/projects/overview/route";
import { activityInDateRange, type EquipoFilters } from "./EquipoFilters";
import { ServiceGantt } from "@/components/services/ServiceGantt";
import { WorkloadHeatmap } from "./WorkloadHeatmap";
import { useToast } from "@/components/ui/Toast";
import { SkeletonTable } from "@/components/ui/Skeleton";
import type { QuickPatch } from "@/components/services/QuickActionPopover";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<{ data: ProjectOverview[] }>;
  });

const catalogFetcher = (url: string) =>
  fetch(url)
    .then((r) => r.json())
    .then((j) => (j.data ?? []) as { value: string; label: string }[]);

export function GanttPorProyecto({ filters }: { filters?: EquipoFilters } = {}) {
  const { data, error, isLoading, mutate } = useSWR("/api/projects/overview", fetcher);
  const { push: pushToast } = useToast();
  const [sortByRisk, setSortByRisk] = useState(false);

  async function handleQuickAction(activityId: string, patch: QuickPatch) {
    const res = await fetch(`/api/activities/${activityId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      pushToast("error", (err as { error?: string }).error ?? "Error al actualizar actividad");
      throw new Error("patch failed");
    }
    await mutate();
  }
  function generateDigest(projects: ProjectOverview[]) {
    const today = new Date().toLocaleDateString("es-MX", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const totalP = projects.length;
    const atRiskP = projects.filter((p) => p.delayed_count > 0).length;

    // Actividades retrasadas
    type DelayRow = { client: string; stage: string; activity: string; assignee: string; planned_end: string; days_over: number };
    const delayed: DelayRow[] = [];
    for (const p of projects) {
      for (const sv of p.services) {
        for (const st of sv.stages) {
          for (const a of st.activities) {
            if (a.status === "delayed" && a.planned_end) {
              const daysOver = Math.round((Date.now() - new Date(a.planned_end + "T00:00:00").getTime()) / 86_400_000);
              delayed.push({ client: p.client_name, stage: st.name, activity: a.name, assignee: a.assignee_email?.split("@")[0] ?? "—", planned_end: a.planned_end, days_over: daysOver });
            }
          }
        }
      }
    }
    delayed.sort((a, b) => b.days_over - a.days_over);

    // Actividades sin iniciar atrasadas
    type LateRow = { client: string; stage: string; activity: string; assignee: string; planned_start: string; days_late: number };
    const lateRows: LateRow[] = [];
    const todayIso = new Date().toISOString().slice(0, 10);
    for (const p of projects) {
      for (const sv of p.services) {
        for (const st of sv.stages) {
          for (const a of st.activities) {
            if (!a.actual_start && !a.actual_end && a.planned_start && a.planned_start < todayIso && a.status !== "completed") {
              const daysLate = Math.round((Date.now() - new Date(a.planned_start + "T00:00:00").getTime()) / 86_400_000);
              lateRows.push({ client: p.client_name, stage: st.name, activity: a.name, assignee: a.assignee_email?.split("@")[0] ?? "—", planned_start: a.planned_start, days_late: daysLate });
            }
          }
        }
      }
    }
    lateRows.sort((a, b) => b.days_late - a.days_late);

    // Carga por consultor
    const loadMap: Record<string, { active: number; delayed: number }> = {};
    for (const p of projects) {
      for (const sv of p.services) {
        for (const st of sv.stages) {
          for (const a of st.activities) {
            if (!a.assignee_email) continue;
            if (!loadMap[a.assignee_email]) loadMap[a.assignee_email] = { active: 0, delayed: 0 };
            if (a.status === "in_progress") loadMap[a.assignee_email]!.active++;
            if (a.status === "delayed") loadMap[a.assignee_email]!.delayed++;
          }
        }
      }
    }
    const consultorRows = Object.entries(loadMap)
      .filter(([, v]) => v.active + v.delayed > 0)
      .sort((a, b) => b[1].delayed - a[1].delayed || b[1].active - a[1].active);

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Digest ejecutivo — ${today}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 12px; color: #1e293b; margin: 0; padding: 24px; }
  h1 { font-size: 18px; font-weight: 700; color: #0f172a; margin: 0 0 4px; }
  .subtitle { font-size: 11px; color: #64748b; margin-bottom: 20px; }
  h2 { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; margin: 20px 0 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
  .kpi-row { display: flex; gap: 16px; margin-bottom: 16px; }
  .kpi { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 10px 16px; min-width: 80px; }
  .kpi-n { font-size: 22px; font-weight: 700; color: #0f172a; line-height: 1; }
  .kpi-l { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; margin-top: 2px; }
  .kpi.risk .kpi-n { color: #e11d48; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th { text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; padding: 4px 8px; border-bottom: 2px solid #e2e8f0; }
  td { padding: 5px 8px; border-bottom: 1px solid #f1f5f9; font-size: 11px; vertical-align: middle; }
  tr:hover td { background: #f8fafc; }
  .badge-rose { background: #fff1f2; color: #e11d48; border-radius: 3px; padding: 1px 5px; font-size: 10px; font-weight: 700; }
  .badge-amber { background: #fffbeb; color: #b45309; border-radius: 3px; padding: 1px 5px; font-size: 10px; font-weight: 700; }
  .badge-emerald { background: #f0fdf4; color: #15803d; border-radius: 3px; padding: 1px 5px; font-size: 10px; font-weight: 700; }
  .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
<h1>Digest ejecutivo de portafolio</h1>
<p class="subtitle">${today} · Generado desde App ResponSable</p>

<div class="kpi-row">
  <div class="kpi"><div class="kpi-n">${totalP}</div><div class="kpi-l">Proyectos</div></div>
  <div class="kpi ${atRiskP > 0 ? "risk" : ""}"><div class="kpi-n">${atRiskP}</div><div class="kpi-l">En riesgo</div></div>
  <div class="kpi"><div class="kpi-n">${delayed.length}</div><div class="kpi-l">Retrasadas</div></div>
  <div class="kpi ${lateRows.length > 0 ? "risk" : ""}"><div class="kpi-n">${lateRows.length}</div><div class="kpi-l">Sin iniciar</div></div>
  <div class="kpi"><div class="kpi-n">${consultorRows.length}</div><div class="kpi-l">Consultores activos</div></div>
</div>

<h2>Actividades retrasadas (${delayed.length})</h2>
${delayed.length === 0 ? "<p style='color:#64748b;font-size:11px;padding:8px 0'>Sin retrasos activos. ✓</p>" : `
<table>
  <thead><tr><th>Cliente</th><th>Etapa</th><th>Actividad</th><th>Asignado</th><th>Fecha plan</th><th>Días vencido</th></tr></thead>
  <tbody>
    ${delayed.map((r) => `<tr>
      <td>${r.client}</td>
      <td style="color:#64748b">${r.stage}</td>
      <td><strong>${r.activity}</strong></td>
      <td>${r.assignee}</td>
      <td>${r.planned_end}</td>
      <td><span class="badge-rose">+${r.days_over}d</span></td>
    </tr>`).join("")}
  </tbody>
</table>`}

<h2>Sin iniciar — vencidas (${lateRows.length})</h2>
${lateRows.length === 0 ? "<p style='color:#64748b;font-size:11px;padding:8px 0'>Sin actividades pendientes de iniciar. ✓</p>" : `
<table>
  <thead><tr><th>Cliente</th><th>Etapa</th><th>Actividad</th><th>Asignado</th><th>Debió iniciar</th><th>Días vencida</th></tr></thead>
  <tbody>
    ${lateRows.map((r) => `<tr>
      <td>${r.client}</td>
      <td style="color:#64748b">${r.stage}</td>
      <td><strong>${r.activity}</strong></td>
      <td>${r.assignee}</td>
      <td>${r.planned_start}</td>
      <td><span class="badge-amber">+${r.days_late}d</span></td>
    </tr>`).join("")}
  </tbody>
</table>`}

<h2>Carga por consultor</h2>
<table>
  <thead><tr><th>Consultor</th><th>En curso</th><th>Retrasadas</th><th>Estado</th></tr></thead>
  <tbody>
    ${consultorRows.map(([email, v]) => `<tr>
      <td>${email.split("@")[0]}</td>
      <td><span class="badge-amber">${v.active}</span></td>
      <td>${v.delayed > 0 ? `<span class="badge-rose">${v.delayed}</span>` : "<span style='color:#94a3b8'>0</span>"}</td>
      <td>${v.delayed >= 2 ? '<span class="badge-rose">Sobrecargado</span>' : v.active >= 4 ? '<span class="badge-amber">Alta carga</span>' : '<span class="badge-emerald">Normal</span>'}</td>
    </tr>`).join("")}
  </tbody>
</table>

<div class="footer">Digest generado el ${today} · App ResponSable · Solo para uso interno</div>
</body>
</html>`;

    // Blob URL → abre en nueva pestaña sin bloqueador de pop-ups
    const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  const { data: serviceCat = [] } = useSWR<{ value: string; label: string }[]>(
    "/api/catalogs?category=services",
    catalogFetcher,
    { revalidateOnFocus: false, dedupingInterval: 3_600_000 }
  );

  const serviceLabel = (key: string) =>
    serviceCat.find((c) => c.value === key)?.label ?? key;

  if (isLoading) return <SkeletonTable rows={4} cols={4} />;
  if (error)
    return (
      <div className="border border-rose-200 bg-rose-50 rounded p-4 text-sm text-rose-700">
        No se pudo cargar el Gantt por proyecto.
      </div>
    );

  // Aplicar filtros (mismo pattern que ProjectsOverview)
  const rawProjects = data?.data ?? [];
  const projects = rawProjects
    .filter((p) => !filters?.clientId || p.client_id === filters.clientId)
    .map((p) => ({
      ...p,
      services: p.services.map((sv) => ({
        ...sv,
        stages: sv.stages.map((st) => ({
          ...st,
          activities: st.activities.filter((a) => {
            if (filters?.statuses && filters.statuses.size > 0 && !filters.statuses.has(a.status)) return false;
            if (filters?.consultorEmail && a.assignee_email !== filters.consultorEmail) return false;
            if (filters?.dateRange && filters.dateRange !== "all") {
              if (filters.dateRange === "overdue") {
                if (a.status !== "delayed") return false;
              } else if (!activityInDateRange(filters.dateRange, a.planned_start, a.planned_end)) {
                return false;
              }
            }
            return true;
          }),
        })),
      })),
    }))
    .filter((p) => p.services.some((sv) => sv.stages.some((st) => st.activities.length > 0)));

  // Portfolio health (usa rawProjects para no filtrar la barra de resumen)
  const totalProjects = rawProjects.length;
  const atRiskProjects = rawProjects.filter((p) => p.delayed_count > 0).length;
  const onTrackProjects = rawProjects.filter((p) => p.active_count > 0 && p.delayed_count === 0).length;
  const quietProjects = rawProjects.filter((p) => p.active_count === 0 && p.delayed_count === 0).length;

  // Sprint L: actividades sin iniciar atrasadas
  const todayStr = new Date().toISOString().slice(0, 10);
  const lateStartCount = rawProjects.reduce((n, p) => {
    for (const sv of p.services)
      for (const st of sv.stages)
        for (const a of st.activities)
          if (!a.actual_start && !a.actual_end && a.planned_start && a.planned_start < todayStr && a.status !== "completed")
            n++;
    return n;
  }, 0);

  // Portfolio completion %
  const { totalActs, doneActs } = rawProjects.reduce(
    (acc, p) => {
      for (const sv of p.services) {
        for (const st of sv.stages) {
          acc.totalActs += st.activities.length;
          acc.doneActs += st.activities.filter((a) => a.status === "completed").length;
        }
      }
      return acc;
    },
    { totalActs: 0, doneActs: 0 }
  );
  const portfolioPct = totalActs > 0 ? Math.round((doneActs / totalActs) * 100) : null;

  // Sort por riesgo opcional
  const displayProjects = sortByRisk
    ? [...projects].sort((a, b) => b.delayed_count - a.delayed_count || b.active_count - a.active_count)
    : projects;

  if (projects.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded p-12 text-center">
        <h3 className="text-sm font-semibold text-slate-900 mb-2">
          Sin actividades visibles
        </h3>
        <p className="text-xs text-slate-600 max-w-md mx-auto">
          Limpia los filtros o aplica una plantilla a un servicio del cliente para
          que aparezcan actividades en el Gantt.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Heatmap carga semanal */}
      <WorkloadHeatmap />

      {/* Portfolio health summary */}
      <div className="flex items-center justify-between gap-3 px-3 py-2 bg-white border border-slate-200 rounded">
        <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest">
          <span className="text-slate-500">{totalProjects} proyecto{totalProjects !== 1 ? "s" : ""}</span>
          {atRiskProjects > 0 && (
            <span className="flex items-center gap-1 text-rose-600">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
              {atRiskProjects} en riesgo
            </span>
          )}
          {onTrackProjects > 0 && (
            <span className="flex items-center gap-1 text-amber-700">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
              {onTrackProjects} en curso
            </span>
          )}
          {quietProjects > 0 && (
            <span className="flex items-center gap-1 text-emerald-700">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
              {quietProjects} al día
            </span>
          )}
          {lateStartCount > 0 && (
            <span className="flex items-center gap-1 text-rose-600 border-l border-slate-200 pl-4 ml-1" title="Actividades que debieron iniciar y no tienen fecha real de inicio">
              ⏰ {lateStartCount} sin iniciar
            </span>
          )}
          {portfolioPct !== null && (
            <span className="flex items-center gap-1 text-slate-500 border-l border-slate-200 pl-4 ml-1">
              <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle cx="12" cy="12" r="10" strokeWidth={1.75} />
                <path d="M12 6v6l4 2" strokeWidth={1.75} strokeLinecap="round" />
              </svg>
              {portfolioPct}% completado
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSortByRisk((v) => !v)}
            className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-sm transition-colors ${
              sortByRisk
                ? "bg-rose-100 text-rose-700"
                : "text-slate-400 hover:text-slate-700"
            }`}
          >
            {sortByRisk ? "Ordenado por riesgo" : "Ordenar por riesgo"}
          </button>
          <div className="w-px h-4 bg-slate-200" aria-hidden />
          <button
            onClick={() => generateDigest(rawProjects)}
            className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-sm text-slate-400 hover:text-brand-primary-dark transition-colors"
            title="Digest ejecutivo: retrasos + carga + estado portafolio"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Reporte
          </button>
        </div>
      </div>

      {displayProjects.map((p) => (
        <div key={p.client_id} className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                <Link
                  href={`/clientes/${p.client_id}?tab=cronograma&view=gantt`}
                  className="hover:text-brand-primary-dark hover:underline"
                >
                  {p.client_name}
                </Link>
              </h3>
              {p.sector && (
                <p className="text-[10px] text-slate-500">{p.sector}</p>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {p.delayed_count > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-bold bg-rose-100 text-rose-700">
                  <svg className="w-2.5 h-2.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                  {p.delayed_count} retrasada{p.delayed_count === 1 ? "" : "s"}
                </span>
              )}
              {p.active_count > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-bold bg-brand-primary-light text-brand-primary-dark">
                  {p.active_count} en curso
                </span>
              )}
            </div>
          </div>
          {(() => {
            // Overload alert: consultores con ≥3 actividades in_progress+delayed en este proyecto
            const assigneeLoad: Record<string, number> = {};
            for (const sv of p.services) {
              for (const st of sv.stages) {
                for (const a of st.activities) {
                  if ((a.status === "in_progress" || a.status === "delayed") && a.assignee_email) {
                    assigneeLoad[a.assignee_email] = (assigneeLoad[a.assignee_email] ?? 0) + 1;
                  }
                }
              }
            }
            const overloaded = Object.entries(assigneeLoad).filter(([, n]) => n >= 3);
            if (overloaded.length === 0) return null;
            return (
              <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-800">
                <svg className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <span>
                  <span className="font-bold">Sobrecarga:</span>{" "}
                  {overloaded.map(([email, n]) => `${email.split("@")[0]} (${n} activas)`).join(", ")}
                </span>
              </div>
            );
          })()}

          {p.services.map((sv) => {
            const stagesWithActs = sv.stages.filter((st) => st.activities.length > 0);
            if (stagesWithActs.length === 0) return null;
            // Progreso del servicio
            const allActs = sv.stages.flatMap((st) => st.activities);
            const totalActs = allActs.length;
            const doneActs = allActs.filter((a) => a.status === "completed").length;
            const svcPct = totalActs > 0 ? Math.round((doneActs / totalActs) * 100) : 0;
            return (
              <div key={sv.client_service_id} className="space-y-1">
                <div className="flex items-center justify-between gap-2 px-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    {serviceLabel(sv.service)}
                  </p>
                  <span className={`text-[10px] font-bold tabular-nums ${svcPct === 100 ? "text-emerald-600" : "text-slate-400"}`}>
                    {svcPct}%
                  </span>
                </div>
                <div className="h-1 bg-slate-100 overflow-hidden mx-1">
                  <div
                    className={`h-full transition-all ${svcPct === 100 ? "bg-emerald-400" : "bg-brand-primary"}`}
                    style={{ width: `${svcPct}%` }}
                  />
                </div>
                <ServiceGantt
                  stages={stagesWithActs}
                  onEditActivity={() => {
                    window.location.href = `/clientes/${p.client_id}?tab=cronograma&view=gantt`;
                  }}
                  onQuickAction={handleQuickAction}
                />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
