"use client";

// Filtros compartidos entre las 3 vistas de /equipo.
// Status como chips multi-select. Consultor + Proyecto como selects.

import type { ActivityStatus } from "@/lib/stages";

export type EquipoFilters = {
  statuses: Set<ActivityStatus>; // vacío = todos
  consultorEmail: string | null; // null = todos
  clientId: string | null; // null = todos
};

export const ALL_STATUSES: ActivityStatus[] = ["pending", "in_progress", "completed", "delayed"];

const STATUS_LABEL: Record<ActivityStatus, string> = {
  pending: "Pendientes",
  in_progress: "En curso",
  completed: "Completadas",
  delayed: "Retrasadas",
};

const STATUS_CHIP: Record<ActivityStatus, string> = {
  pending: "bg-slate-100 text-slate-700 border-slate-200",
  in_progress: "bg-brand-primary-light text-brand-primary-dark border-brand-primary/30",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  delayed: "bg-rose-50 text-rose-700 border-rose-200",
};

export function emptyFilters(): EquipoFilters {
  return { statuses: new Set(), consultorEmail: null, clientId: null };
}

export function hasActiveFilters(f: EquipoFilters): boolean {
  return f.statuses.size > 0 || f.consultorEmail !== null || f.clientId !== null;
}

export function FiltersBar({
  value,
  onChange,
  consultors,
  projects,
}: {
  value: EquipoFilters;
  onChange: (next: EquipoFilters) => void;
  consultors: { email: string; name: string | null }[];
  projects: { id: string; name: string }[];
}) {
  function toggleStatus(s: ActivityStatus) {
    const next = new Set(value.statuses);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    onChange({ ...value, statuses: next });
  }

  return (
    <div className="bg-white border border-slate-200 rounded shadow-sm px-4 py-3 space-y-2.5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Status
          </span>
          {ALL_STATUSES.map((s) => {
            const active = value.statuses.has(s);
            return (
              <button
                key={s}
                onClick={() => toggleStatus(s)}
                className={`text-[11px] font-medium px-2 py-0.5 rounded-sm border transition-colors ${
                  active
                    ? STATUS_CHIP[s]
                    : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {STATUS_LABEL[s]}
              </button>
            );
          })}
          {value.statuses.size > 0 && (
            <button
              onClick={() => onChange({ ...value, statuses: new Set() })}
              className="text-[11px] text-slate-400 hover:text-slate-700 underline ml-1"
            >
              limpiar
            </button>
          )}
        </div>

        {hasActiveFilters(value) && (
          <button
            onClick={() => onChange(emptyFilters())}
            className="text-[11px] font-bold uppercase tracking-wider text-slate-500 hover:text-rose-700 transition-colors"
          >
            Limpiar todo
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Consultor
          </span>
          <select
            value={value.consultorEmail ?? ""}
            onChange={(e) =>
              onChange({ ...value, consultorEmail: e.target.value || null })
            }
            className="font-sans text-xs border border-slate-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-brand-primary/30 max-w-[220px]"
          >
            <option value="">Todos</option>
            {consultors.map((c) => (
              <option key={c.email} value={c.email}>
                {c.name ?? c.email}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Proyecto
          </span>
          <select
            value={value.clientId ?? ""}
            onChange={(e) => onChange({ ...value, clientId: e.target.value || null })}
            className="font-sans text-xs border border-slate-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-brand-primary/30 max-w-[220px]"
          >
            <option value="">Todos</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
