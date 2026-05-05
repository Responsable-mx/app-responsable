"use client";

// Vista por proyecto en /equipo. Muestra cliente → servicios → etapas → actividades
// con fechas plan/real, status y assignee. Toggle Lista/Gantt por proyecto.

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import type { ProjectOverview } from "@/app/api/projects/overview/route";
import { ServiceGantt } from "@/components/services/ServiceGantt";
import { SkeletonTable } from "@/components/ui/Skeleton";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<{ data: ProjectOverview[] }>;
  });

const catalogFetcher = (url: string) =>
  fetch(url)
    .then((r) => r.json())
    .then((j) => (j.data ?? []) as { value: string; label: string }[]);

const STATUS_CHIP: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: "bg-slate-100 border-slate-200", text: "text-slate-600", label: "Pendiente" },
  in_progress: {
    bg: "bg-brand-primary-light border-brand-primary/30",
    text: "text-brand-primary-dark",
    label: "En curso",
  },
  completed: { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", label: "Completada" },
  delayed: { bg: "bg-rose-50 border-rose-200", text: "text-rose-700", label: "Retrasada" },
};

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
  });
}

export function ProjectsOverview() {
  const { data, error, isLoading } = useSWR("/api/projects/overview", fetcher);
  const { data: serviceCat = [] } = useSWR<{ value: string; label: string }[]>(
    "/api/catalogs?category=services",
    catalogFetcher,
    { revalidateOnFocus: false, dedupingInterval: 3_600_000 }
  );

  const serviceLabel = (key: string) =>
    serviceCat.find((c) => c.value === key)?.label ?? key;

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [viewMode, setViewMode] = useState<Record<string, "list" | "gantt">>({});

  if (isLoading) return <SkeletonTable rows={4} cols={4} />;
  if (error)
    return (
      <div className="border border-rose-200 bg-rose-50 rounded p-4 text-sm text-rose-700">
        No se pudo cargar la vista por proyecto.
      </div>
    );

  const projects = data?.data ?? [];

  if (projects.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded p-12 text-center">
        <h3 className="text-sm font-semibold text-slate-900 mb-2">
          Sin proyectos con servicios contratados
        </h3>
        <p className="text-xs text-slate-600 max-w-md mx-auto">
          Esta vista muestra clientes con al menos un servicio activo. Agrega servicios
          desde la ficha del cliente para que aparezcan acá.
        </p>
      </div>
    );
  }

  // Globales
  const totalActive = projects.reduce((s, p) => s + p.active_count, 0);
  const totalDelayed = projects.reduce((s, p) => s + p.delayed_count, 0);
  const totalActivities = projects.reduce((s, p) => s + p.total_activities, 0);

  return (
    <div className="space-y-3">
      <div className="bg-white border border-slate-200 rounded shadow-sm px-5 py-3.5 flex items-center gap-4 flex-wrap">
        <span className="text-sm font-semibold text-slate-900">
          {projects.length} {projects.length === 1 ? "proyecto" : "proyectos"} activos
        </span>
        <span className="text-xs text-slate-500">{totalActivities} actividades</span>
        <span className="text-xs text-slate-500">{totalActive} en curso</span>
        {totalDelayed > 0 && (
          <span className="text-xs text-rose-700 font-semibold">⚠ {totalDelayed} retrasada{totalDelayed === 1 ? "" : "s"}</span>
        )}
      </div>

      {projects.map((p) => {
        const isExp = expanded[p.client_id] ?? false;
        const view = viewMode[p.client_id] ?? "list";
        const allStages = p.services.flatMap((sv) => sv.stages);
        return (
          <div key={p.client_id} className="bg-white border border-slate-200 rounded shadow-sm overflow-hidden">
            {/* Header: cliente + conteos + toggle */}
            <button
              onClick={() => setExpanded((s) => ({ ...s, [p.client_id]: !isExp }))}
              className="w-full text-left px-5 py-3 hover:bg-slate-50 transition-colors flex items-center gap-4 flex-wrap"
            >
              <span className="text-slate-400 text-xs" aria-hidden>
                {isExp ? "▾" : "▸"}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <h3 className="text-sm font-semibold text-slate-900 truncate">{p.client_name}</h3>
                  {p.sector && (
                    <span className="text-[10px] text-slate-500 truncate">· {p.sector}</span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {p.services.length} {p.services.length === 1 ? "servicio" : "servicios"} ·{" "}
                  {p.total_activities} {p.total_activities === 1 ? "actividad" : "actividades"}
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                {p.delayed_count > 0 && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-[11px] font-bold bg-rose-100 text-rose-700">
                    ⚠ {p.delayed_count} retrasada{p.delayed_count === 1 ? "" : "s"}
                  </span>
                )}
                {p.active_count > 0 && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-[11px] font-bold bg-brand-primary-light text-brand-primary-dark">
                    {p.active_count} en curso
                  </span>
                )}
                {p.upcoming_count > 0 && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                    {p.upcoming_count} próx 30d
                  </span>
                )}
                {p.active_count === 0 && p.delayed_count === 0 && p.upcoming_count === 0 && (
                  <span className="text-[11px] text-slate-400 italic">Sin actividad reciente</span>
                )}
              </div>
            </button>

            {/* Cuerpo expandido */}
            {isExp && (
              <div className="border-t border-slate-200 bg-slate-50/40 px-5 py-4 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <Link
                    href={`/clientes/${p.client_id}?tab=cronograma`}
                    className="text-[11px] text-brand-primary-dark hover:underline"
                  >
                    Editar en ficha del cliente →
                  </Link>
                  <ViewToggle
                    value={view}
                    onChange={(v) =>
                      setViewMode((s) => ({ ...s, [p.client_id]: v }))
                    }
                  />
                </div>

                {p.services.map((sv) => {
                  const stagesForService = sv.stages;
                  return (
                    <div key={sv.client_service_id} className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-xs font-semibold text-slate-900">
                          {serviceLabel(sv.service)}
                        </h4>
                        <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
                          Servicio
                        </span>
                      </div>

                      {stagesForService.length === 0 ? (
                        <p className="text-[11px] text-slate-500 italic px-2 py-2">
                          Sin etapas todavía.
                        </p>
                      ) : view === "gantt" ? (
                        <ServiceGantt
                          stages={stagesForService}
                          onEditActivity={() => {
                            // Read-only desde overview — redirige a la ficha
                            window.location.href = `/clientes/${p.client_id}?tab=cronograma`;
                          }}
                        />
                      ) : (
                        <div className="space-y-2">
                          {stagesForService.map((s) => (
                            <div
                              key={s.id}
                              className="bg-white border border-slate-200 rounded p-3"
                            >
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className="text-xs font-bold text-slate-700">
                                  {s.name}
                                </span>
                                <span className="text-[10px] text-slate-500 tabular-nums">
                                  {s.activities.length}{" "}
                                  {s.activities.length === 1 ? "actividad" : "actividades"}
                                </span>
                              </div>
                              {s.activities.length === 0 ? (
                                <p className="text-[11px] text-slate-500 italic">
                                  Sin actividades.
                                </p>
                              ) : (
                                <div className="space-y-1">
                                  {s.activities.map((a) => {
                                    const chip = STATUS_CHIP[a.status] ?? STATUS_CHIP.pending;
                                    return (
                                      <Link
                                        key={a.id}
                                        href={`/clientes/${p.client_id}?tab=cronograma`}
                                        className="block bg-slate-50 hover:bg-white border border-slate-200 hover:border-brand-primary rounded p-2 transition-colors"
                                      >
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="min-w-0 flex-1">
                                            <p className="text-xs font-semibold text-slate-900 truncate">
                                              {a.name}
                                            </p>
                                            <div className="flex flex-wrap gap-x-3 mt-0.5 text-[10px] text-slate-600 tabular-nums">
                                              <span>
                                                Plan: {fmt(a.planned_start)} → {fmt(a.planned_end)}
                                              </span>
                                              <span>
                                                Real: {fmt(a.actual_start)} → {fmt(a.actual_end)}
                                              </span>
                                              {a.assignee_email && (
                                                <span
                                                  className="truncate max-w-[160px]"
                                                  title={a.assignee_email}
                                                >
                                                  @ {a.assignee_email.split("@")[0]}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                          <span
                                            className={`shrink-0 text-[10px] font-medium border rounded-sm px-1.5 py-0.5 ${chip.bg} ${chip.text}`}
                                          >
                                            {chip.label}
                                          </span>
                                        </div>
                                      </Link>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          ))}
                          {stagesForService.length === 0 && allStages.length > 0 && (
                            <p className="text-[11px] text-slate-500 italic">
                              Sin etapas en este servicio.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ViewToggle({
  value,
  onChange,
}: {
  value: "list" | "gantt";
  onChange: (v: "list" | "gantt") => void;
}) {
  const opts: { v: "list" | "gantt"; label: string }[] = [
    { v: "list", label: "Lista" },
    { v: "gantt", label: "Gantt" },
  ];
  return (
    <div className="inline-flex items-center bg-slate-100 rounded p-0.5">
      {opts.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded transition-colors ${
            value === o.v
              ? "bg-white text-brand-primary-dark shadow-sm"
              : "text-slate-500 hover:text-slate-900"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
