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
import { ConsultorSwimlane } from "./ConsultorSwimlane";
import { FiltersBar, emptyFilters, type EquipoFilters } from "./EquipoFilters";
import { TabErrorBoundary } from "@/components/TabErrorBoundary";

type View = "consultor" | "proyecto" | "timeline" | "gantt" | "swimlane";

const INTRO: Record<View, string> = {
  consultor:
    "Carga del equipo derivada de actividades activas. Clic en un consultor para ver el detalle.",
  proyecto: "Tus proyectos con etapas, actividades y fechas. Clic en un proyecto para expandir.",
  timeline:
    "Timeline cross-project: 1 fila por consultor, todas sus actividades en una línea.",
  gantt:
    "Gantt por proyecto: cada cliente con su cronograma plan vs real. Clic en barra → ficha del cliente.",
  swimlane:
    "Swimlane por consultor: todas las actividades de cada consultor en una línea, coloreadas por proyecto.",
};

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

export function EquipoView() {
  const [view, setView] = useState<View>("consultor");
  const [filters, setFilters] = useState<EquipoFilters>(() => emptyFilters());
  const [showTestAccounts, setShowTestAccounts] = useState(false);

  const occupancyUrl = showTestAccounts
    ? "/api/team/occupancy?include_test=true"
    : "/api/team/occupancy";

  // Para popular dropdowns de filtros: lista de consultores + lista de proyectos.
  // Reutiliza los mismos endpoints que las vistas (SWR comparte cache).
  const { data: teamData, error: teamError } = useSWR<{ data: TeamMember[] }>(occupancyUrl, fetcher);
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
      <div className="flex items-center justify-between gap-4">
        <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showTestAccounts}
            onChange={(e) => setShowTestAccounts(e.target.checked)}
            className="accent-amber-500"
          />
          Mostrar cuentas de prueba
        </label>
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
          {/* Separador visual */}
          <div className="w-px h-5 bg-slate-200 mx-0.5" />
          {/* Vistas avanzadas — icon-only con tooltip */}
          <IconToggleButton active={view === "timeline"} onClick={() => setView("timeline")} label="Timeline">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6h8M8 12h10M6 18h12" />
            </svg>
          </IconToggleButton>
          <IconToggleButton active={view === "gantt"} onClick={() => setView("gantt")} label="Gantt">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <rect x="3" y="5" width="10" height="2.5" rx="1" />
              <rect x="7" y="10" width="14" height="2.5" rx="1" />
              <rect x="5" y="15" width="11" height="2.5" rx="1" />
            </svg>
          </IconToggleButton>
          <IconToggleButton active={view === "swimlane"} onClick={() => setView("swimlane")} label="Swimlane">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
          </IconToggleButton>
        </div>
      </div>
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
      {view === "swimlane" && (
        <TabErrorBoundary tabName="Swimlane">
          <ConsultorSwimlane filters={filters} />
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
              <TeamOccupancy filters={filters} occupancyUrl={occupancyUrl} />
            </TabErrorBoundary>
          )}
          {view === "proyecto" && (
            <TabErrorBoundary tabName="Por proyecto">
              <ProjectsOverview
                filters={filters}
                consultors={consultors}
                onFiltersChange={setFilters}
              />
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

function IconToggleButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      title={label}
      className={`inline-flex items-center justify-center w-8 h-8 rounded transition-colors ${
        active
          ? "bg-brand-primary-light text-brand-primary-dark"
          : "text-slate-400 hover:text-slate-700 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}
