"use client";

// 4ta vista de /equipo: Gantt por proyecto.
// Cada proyecto se renderiza con ServiceGantt completo (timeline plan/real).

import useSWR from "swr";
import Link from "next/link";
import type { ProjectOverview } from "@/app/api/projects/overview/route";
import { activityInDateRange, type EquipoFilters } from "./EquipoFilters";
import { ServiceGantt } from "@/components/services/ServiceGantt";
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
      {projects.map((p) => (
        <div key={p.client_id} className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                <Link
                  href={`/clientes/${p.client_id}?tab=cronograma`}
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
                <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-bold bg-rose-100 text-rose-700">
                  ⚠ {p.delayed_count} retrasada{p.delayed_count === 1 ? "" : "s"}
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
                    window.location.href = `/clientes/${p.client_id}?tab=cronograma`;
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
