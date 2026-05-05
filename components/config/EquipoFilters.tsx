"use client";

// Filtros compartidos entre las 3 vistas de /equipo.
// Status como chips multi-select. Consultor + Proyecto como custom SelectField.
// Nota: <select> nativo en Windows/Chrome usa fuente del SO cuando está abierto —
// se reemplaza con SelectField para garantizar Inter en el dropdown.

import type { ActivityStatus } from "@/lib/stages";
import { SelectField } from "@/components/ui/SelectField";

export type DateRange = "all" | "this_week" | "next_30d" | "this_month" | "this_quarter" | "overdue";

export type EquipoFilters = {
  statuses: Set<ActivityStatus>; // vacío = todos
  consultorEmail: string | null; // null = todos
  clientId: string | null; // null = todos
  dateRange: DateRange; // "all" = sin filtro temporal
};

const DATE_RANGE_LABEL: Record<DateRange, string> = {
  all: "Todo",
  this_week: "Esta semana",
  next_30d: "Próx 30 días",
  this_month: "Este mes",
  this_quarter: "Este trimestre",
  overdue: "Vencidas",
};

const ALL_DATE_RANGES: DateRange[] = [
  "all",
  "this_week",
  "next_30d",
  "this_month",
  "this_quarter",
  "overdue",
];

const MS_DAY = 86_400_000;

// Computa rango [start, end] para un DateRange. null = sin límite por ese lado.
export function dateRangeBounds(r: DateRange): { start: Date | null; end: Date | null } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (r) {
    case "all":
      return { start: null, end: null };
    case "this_week": {
      // Lunes a domingo
      const day = today.getDay() || 7; // domingo=0 → 7
      const start = new Date(today);
      start.setDate(today.getDate() - (day - 1));
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return { start, end };
    }
    case "next_30d":
      return { start: today, end: new Date(today.getTime() + 30 * MS_DAY) };
    case "this_month":
      return {
        start: new Date(today.getFullYear(), today.getMonth(), 1),
        end: new Date(today.getFullYear(), today.getMonth() + 1, 0),
      };
    case "this_quarter": {
      const q = Math.floor(today.getMonth() / 3);
      return {
        start: new Date(today.getFullYear(), q * 3, 1),
        end: new Date(today.getFullYear(), q * 3 + 3, 0),
      };
    }
    case "overdue":
      // No usa rango; se filtra por status en client. Marcado para que callers sepan.
      return { start: null, end: today };
  }
}

// Aplica filtro de rango a una actividad. Devuelve true si pasa.
// Una actividad "pasa" si su rango [planned_start, planned_end] solapa con el rango.
export function activityInDateRange(
  range: DateRange,
  planned_start: string | null,
  planned_end: string | null
): boolean {
  if (range === "all") return true;
  const bounds = dateRangeBounds(range);
  // Si no tiene fechas, no pasa los filtros temporales
  if (!planned_start && !planned_end) return false;
  const aStart = planned_start ? new Date(planned_start + "T00:00:00") : null;
  const aEnd = planned_end ? new Date(planned_end + "T00:00:00") : null;
  // Solapamiento de intervalos: aStart <= bEnd && aEnd >= bStart
  if (bounds.start && aEnd && aEnd < bounds.start) return false;
  if (bounds.end && aStart && aStart > bounds.end) return false;
  return true;
}

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
  return { statuses: new Set(), consultorEmail: null, clientId: null, dateRange: "all" };
}

export function hasActiveFilters(f: EquipoFilters): boolean {
  return (
    f.statuses.size > 0 ||
    f.consultorEmail !== null ||
    f.clientId !== null ||
    f.dateRange !== "all"
  );
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
          <SelectField
            value={value.consultorEmail ?? ""}
            onChange={(v) => onChange({ ...value, consultorEmail: v || null })}
            options={consultors.map((c) => ({ value: c.email, label: c.name ?? c.email }))}
            placeholder="Todos"
            className="max-w-[220px] w-[220px]"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Proyecto
          </span>
          <SelectField
            value={value.clientId ?? ""}
            onChange={(v) => onChange({ ...value, clientId: v || null })}
            options={projects.map((p) => ({ value: p.id, label: p.name }))}
            placeholder="Todos"
            className="max-w-[220px] w-[220px]"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Rango
          </span>
          <SelectField
            value={value.dateRange === "all" ? "" : value.dateRange}
            onChange={(v) => onChange({ ...value, dateRange: (v || "all") as DateRange })}
            options={ALL_DATE_RANGES.filter((r) => r !== "all").map((r) => ({
              value: r,
              label: DATE_RANGE_LABEL[r],
            }))}
            placeholder="Todo"
            className="w-[140px]"
          />
        </div>
      </div>
    </div>
  );
}
