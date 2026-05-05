"use client";

// /equipo con 3 vistas: Por consultor · Por proyecto · Timeline global.

import { useState } from "react";
import { TeamOccupancy } from "./TeamOccupancy";
import { ProjectsOverview } from "./ProjectsOverview";
import { GlobalTimeline } from "./GlobalTimeline";

type View = "consultor" | "proyecto" | "timeline";

const INTRO: Record<View, string> = {
  consultor:
    "Carga del equipo derivada de actividades activas. Click en un consultor para ver el detalle.",
  proyecto: "Tus proyectos con etapas, actividades y fechas. Click en un proyecto para expandir.",
  timeline:
    "Timeline cross-project: 1 fila por consultor, todas sus actividades en una línea. Detecta solapamientos al instante.",
};

export function EquipoView() {
  const [view, setView] = useState<View>("consultor");

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="text-sm text-slate-600 max-w-2xl">{INTRO[view]}</p>
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
        </div>
      </div>

      {view === "consultor" && <TeamOccupancy />}
      {view === "proyecto" && <ProjectsOverview />}
      {view === "timeline" && <GlobalTimeline />}
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
