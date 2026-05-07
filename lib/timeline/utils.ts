/**
 * lib/timeline/utils.ts
 *
 * Constantes, tipos y helpers puros del Timeline global.
 * Extraídos de GlobalTimeline.tsx para mejorar testabilidad y legibilidad.
 * Sin dependencias React — importable desde tests sin jsdom.
 */

import type { ActivityStatus } from "@/lib/stages";

// ── Constantes de layout ─────────────────────────────────────────────────────

export const MS_DAY = 86_400_000;
export const LABEL_W = 220;
export const CHART_BASE = 1200; // px de ancho del chart a zoom 1×
export const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3, 4];
export const ZOOM_DEFAULT = 2; // índice → 1×

// Paleta de 12 colores para colorMode='proyecto' (asignación por client_id)
export const PROJECT_PALETTE = [
  '#0d9488','#4f46e5','#d97706','#ea580c',
  '#db2777','#7c3aed','#0284c7','#059669',
  '#dc2626','#9333ea','#c2410c','#0891b2',
] as const;

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type ColorMode = 'estado' | 'proyecto';

export type FlatActivity = {
  id: string;
  name: string;
  client_id: string;
  client_name: string;
  stage_name: string;
  service: string;
  assignee_email: string | null;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  status: ActivityStatus;
  depends_on_activity_id: string | null;
};

export type Milestone = { date: string; label: string; client: string; progress: string };
export type OverlapBand = { leftPx: number; widthPx: number };

// ── Estilos de estado — hex inline (necesario para estilos dinámicos) ─────────
// STATUS_INLINE usa hex en lugar de Tailwind — los valores dependen de datos
// (status/client_id) y no pueden expresarse como clases estáticas de Tailwind.

export const STATUS_INLINE: Record<ActivityStatus, { bg: string; fill: string; text: string }> = {
  pending:     { bg: '#f1f5f9', fill: '#94a3b8', text: '#475569' },
  in_progress: { bg: '#ccfbf1', fill: '#0d9488', text: '#0f766e' },
  completed:   { bg: '#d1fae5', fill: '#059669', text: '#065f46' },
  delayed:     { bg: '#fee2e2', fill: '#ef4444', text: '#991b1b' },
};

// ── Helpers de color ─────────────────────────────────────────────────────────

/** Convierte hex + alpha a rgba. Útil para fondos semitransparentes sin Tailwind dinámico. */
export function hexAlpha(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// ── Helpers de progreso ───────────────────────────────────────────────────────

/** Estima progreso 0-100% de una actividad basándose en fechas planificadas vs now. */
export function estimateProgress(a: FlatActivity, now: number): number {
  if (a.status === 'completed') return 100;
  if (a.status === 'pending') return 0;
  const s = a.planned_start ? new Date(a.planned_start + 'T00:00:00').getTime() : null;
  const e = a.planned_end   ? new Date(a.planned_end   + 'T00:00:00').getTime() : null;
  if (!s || !e || e <= s) return 20;
  return Math.min(100, Math.max(5, Math.round((now - s) / (e - s) * 100)));
}

// ── Helpers de fecha ──────────────────────────────────────────────────────────

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

export function fmtMonth(d: Date): string {
  return d.toLocaleDateString("es-MX", { month: "short", year: "2-digit" });
}

export function fmt(d: string | null): string {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
  });
}

// ── Helpers de layout ─────────────────────────────────────────────────────────

/** Asigna carriles (swim lanes) evitando superposición visual por fechas. */
export function assignLanes(acts: FlatActivity[]): number[] {
  type Interval = { s: number; e: number; lane: number };
  const occupied: Interval[] = [];
  return acts.map((a) => {
    const s =
      parseDate(a.planned_start)?.getTime() ??
      parseDate(a.actual_start)?.getTime() ??
      null;
    const e =
      parseDate(a.planned_end)?.getTime() ??
      parseDate(a.actual_end)?.getTime() ??
      null;
    if (!s || !e) return 0;
    let lane = 0;
    while (occupied.some((o) => o.lane === lane && o.s < e && o.e > s)) lane++;
    occupied.push({ s, e, lane });
    return lane;
  });
}

/** Detecta zonas donde ≥2 actividades se solapan → heatmap de carga (px). */
export function computeOverlapBands(
  acts: FlatActivity[],
  rangeMin: number,
  totalMs: number,
  chartW: number
): OverlapBand[] {
  const intervals = acts
    .map((a) => ({
      s: parseDate(a.planned_start)?.getTime() ?? null,
      e: parseDate(a.planned_end)?.getTime() ?? null,
    }))
    .filter((x): x is { s: number; e: number } => x.s !== null && x.e !== null);

  const bands: OverlapBand[] = [];
  for (let i = 0; i < intervals.length; i++) {
    for (let j = i + 1; j < intervals.length; j++) {
      const oS = Math.max(intervals[i]!.s, intervals[j]!.s);
      const oE = Math.min(intervals[i]!.e, intervals[j]!.e);
      if (oS < oE) {
        bands.push({
          leftPx: ((oS - rangeMin) / totalMs) * chartW,
          widthPx: Math.max(((oE - oS) / totalMs) * chartW, 2),
        });
      }
    }
  }
  return bands;
}

/** Último milestone (◆) por (client + stage). */
export function computeMilestones(acts: FlatActivity[]): Milestone[] {
  const byStage = new Map<string, FlatActivity[]>();
  for (const a of acts) {
    const key = `${a.client_id}::${a.stage_name}`;
    const list = byStage.get(key) ?? [];
    list.push(a);
    byStage.set(key, list);
  }
  const result: Milestone[] = [];
  for (const [, group] of byStage) {
    const withEnd = group
      .filter((a) => a.planned_end)
      .sort((a, b) => (b.planned_end! > a.planned_end! ? 1 : -1));
    if (withEnd[0]?.planned_end) {
      const completed = group.filter((a) => a.status === "completed").length;
      result.push({
        date: withEnd[0].planned_end,
        label: withEnd[0].stage_name,
        client: withEnd[0].client_name,
        progress: `${completed}/${group.length}`,
      });
    }
  }
  return result;
}
