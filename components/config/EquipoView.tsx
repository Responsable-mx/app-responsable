"use client";

// /equipo con 3 vistas (consultor / proyecto / timeline) + filtros compartidos.
// FilterBar al top: status, consultor, proyecto. Aplican a las 3 vistas.

import { useMemo, useState } from "react";
import useSWR from "swr";
import type { ProjectOverview } from "@/app/api/projects/overview/route";
import type { TeamMember } from "@/app/api/team/occupancy/route";
import { TeamOccupancy } from "./TeamOccupancy";
import { ProjectsOverview } from "./ProjectsOverview";
import { GlobalTimeline } from "./GlobalTimeline";
import { GanttPorProyecto } from "./GanttPorProyecto";
import { FiltersBar, emptyFilters, type EquipoFilters } from "./EquipoFilters";
import { TabErrorBoundary } from "@/components/TabErrorBoundary";

type View = "consultor" | "proyecto" | "timeline" | "gantt";

const INTRO: Record<View, string> = {
  consultor:
    "Carga del equipo derivada de actividades activas. Clic en un consultor para ver el detalle.",
  proyecto: "Tus proyectos con etapas, actividades y fechas. Clic en un proyecto para expandir.",
  timeline:
    "Timeline cross-project: 1 fila por consultor, todas sus actividades en una línea.",
  gantt:
    "Gantt por proyecto: cada cliente con su cronograma plan vs real. Clic en barra → ficha del cliente.",
};

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

export function EquipoView() {
  const [view, setView] = useState<View>("consultor");
  const [filters, setFilters] = useState<EquipoFilters>(() => emptyFilters());

  // Para popular dropdowns de filtros: lista de consultores + lista de proyectos.
  // Reutiliza los mismos endpoints que las vistas (SWR comparte cache).
  const { data: teamData, error: teamError } = useSWR<{ data: TeamMember[] }>("/api/team/occupancy", fetcher);
  const { data: projData, error: projError } = useSWR<{ data: ProjectOverview[] }>(
    "/api/projects/overview",
    fetcher
  );

  const consultors = useMemo(
    () =>
      (teamData?.data ?? []).map((m) => ({
        email: m.email,
        name: m.full_name,
      })),
    [teamData]
  );

  const consultorNames = useMemo(
    () =>
      new Map(
        (teamData?.data ?? [])
          .filter((m) => m.full_name)
          .map((m) => [m.email, m.full_name as string])
      ),
    [teamData]
  );
  const projects = useMemo(
    () =>
      (projData?.data ?? []).map((p) => ({ id: p.client_id, name: p.client_name })),
    [projData]
  );

  return (
    <div>
      {/* D-72: error state SWR */}
      {(teamError || projError) && !teamData && !projData && (
        <div className="max-w-6xl mx-auto mb-3 p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-700">
          Error al cargar datos del equipo. Recarga la página.
        </div>
      )}
      {/* Controles siempre acotados */}
      <div className="max-w-6xl mx-auto space-y-4 mb-4">
      <div className="flex items-center justify-end gap-4">
        <div className="inline-flex items-center bg-white border border-slate-200 rounded p-0.5 shadow-sm">
          <ToggleButton
            active={view === "consultor"}
            onClick={() => setView("consultor")}
            label="Por consultor"
            icon={
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.75}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            }
          />
          <ToggleButton
            active={view === "proyecto"}
            onClick={() => setView("proyecto")}
            label="Por proyecto"
            icon={
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.75}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z"
                />
              </svg>
            }
          />
          <ToggleButton
            active={view === "timeline"}
            onClick={() => setView("timeline")}
            label="Timeline"
            icon={
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.75}
                  d="M4 6h8M8 12h10M6 18h12"
                />
              </svg>
            }
          />
          <ToggleButton
            active={view === "gantt"}
            onClick={() => setView("gantt")}
            label="Gantt"
            icon={
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <rect x="3" y="5" width="10" height="2.5" rx="1" />
                <rect x="7" y="10" width="14" height="2.5" rx="1" />
                <rect x="5" y="15" width="11" height="2.5" rx="1" />
              </svg>
            }
          />
        </div>
      </div>
      <p className="text-sm text-slate-600 max-w-2xl -mt-2">{INTRO[view]}</p>

      {/* Intro solo cuando no hay datos aún — evita ruido cuando la vista ya muestra contenido */}
      {!teamData && !projData && (
        <p className="text-sm text-slate-600 max-w-2xl -mt-2">{INTRO[view]}</p>
      )}

      <FiltersBar
        value={filters}
        onChange={setFilters}
        consultors={consultors}
        projects={projects}
      />
      </div>{/* fin controles */}

      {/* Contenido: Gantt y Timeline usan todo el ancho; Por consultor/proyecto acotados */}
      {view === "gantt" && (
        <TabErrorBoundary tabName="Gantt">
          <GanttPorProyecto filters={filters} />
        </TabErrorBoundary>
      )}
      {view === "timeline" && (
        <TabErrorBoundary tabName="Timeline">
          <GlobalTimeline filters={filters} consultorNames={consultorNames} />
        </TabErrorBoundary>
      )}
      {(view === "consultor" || view === "proyecto") && (
        <div className="max-w-6xl mx-auto">
          {view === "consultor" && (
            <TabErrorBoundary tabName="Por consultor">
              <TeamOccupancy filters={filters} />
            </TabErrorBoundary>
          )}
          {view === "proyecto" && (
            <TabErrorBoundary tabName="Por proyecto">
              <ProjectsOverview filters={filters} />
            </TabErrorBoundary>
          )}
        </div>
      )}
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded transition-colors ${
        active
          ? "bg-brand-primary-light text-brand-primary-dark"
          : "text-slate-500 hover:text-slate-900"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
