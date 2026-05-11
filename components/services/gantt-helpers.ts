import type { ActivityStatus } from "@/lib/stages";
import type { StageActivity } from "@/lib/stages";

export type Zoom = "fit" | "mes" | "quarter" | "semana" | "dia";

// fit=auto · mes=200px/mes · quarter=440 (~110px/sem) · semana=1000 (~33px/día) · dia=3000 (~100px/día)
export const MONTH_PX: Record<Zoom, number | null> = { fit: null, mes: 200, quarter: 440, semana: 1000, dia: 3000 };

export const MS_DAY = 86_400_000;

export const STATUS_BAR: Record<ActivityStatus, string> = {
  pending: "bg-slate-300",
  in_progress: "bg-brand-primary",
  completed: "bg-emerald-500",
  delayed: "bg-rose-500",
};

export const STATUS_LABEL: Record<ActivityStatus, string> = {
  pending: "Pendiente",
  in_progress: "En curso",
  completed: "Completada",
  delayed: "Retrasada",
};

export const LABEL_W = 240;
export const ROW_H = 44;

export function parseDate(s: string | null): Date | null {
  if (!s) return null;
  return new Date(s + "T00:00:00");
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

export function fmtShort(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
  });
}

// Lunes más cercano >= ts
export function nextMonday(ts: number): number {
  const d = new Date(ts);
  const day = d.getDay();
  const diff = day === 1 ? 0 : day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function weekBoundaries(min: number, max: number): number[] {
  const out: number[] = [];
  let cur = nextMonday(min);
  while (cur < max) {
    out.push(cur);
    cur += 7 * MS_DAY;
  }
  return out;
}

export function dayBoundaries(min: number, max: number): number[] {
  const out: number[] = [];
  const d = new Date(min);
  d.setHours(0, 0, 0, 0);
  while (d.getTime() < max) {
    out.push(d.getTime());
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export function findAtRisk(activities: StageActivity[]): Set<string> {
  const atRisk = new Set<string>();
  const queue = activities.filter((a) => a.status === "delayed").map((a) => a.id);
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (atRisk.has(id)) continue;
    atRisk.add(id);
    for (const a of activities) {
      if (a.depends_on_activity_id === id && !atRisk.has(a.id)) queue.push(a.id);
    }
  }
  return atRisk;
}
