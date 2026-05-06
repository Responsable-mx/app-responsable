"use client";

// Timeline global v2 — vista gerencial cross-project.
// 8 mejoras: KPIs header · RAG badge · sort por riesgo · heatmap solapamiento ·
// milestones por etapa · cascade alert · stage-gate progress · tooltip rico.
// v2.1: zoom (0.5×–4×) + scroll horizontal + scroll-to-today automático.

import { useMemo, useState, useRef, useEffect } from "react";
import Link from "next/link";
import useSWR from "swr";
import type { ProjectOverview } from "@/app/api/projects/overview/route";
import type { ActivityStatus } from "@/lib/stages";
import { activityInDateRange, type EquipoFilters } from "./EquipoFilters";
import { SkeletonTable } from "@/components/ui/Skeleton";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<{ data: ProjectOverview[] }>;
  });

const STATUS_BAR: Record<ActivityStatus, string> = {
  pending: "bg-slate-300 hover:bg-slate-400",
  in_progress: "bg-brand-primary hover:bg-brand-primary-dark",
  completed: "bg-teal-600 hover:bg-teal-700",
  delayed: "bg-rose-500 hover:bg-rose-600",
};

const MS_DAY = 86_400_000;
const LABEL_W = 210;
const CHART_BASE = 1200; // px de ancho del chart a zoom 1×
const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3, 4];
const ZOOM_DEFAULT = 2; // índice → 1×

type FlatActivity = {
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

type Milestone = { date: string; label: string; client: string; progress: string };
type OverlapBand = { leftPx: number; widthPx: number };

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  return new Date(s + "T00:00:00");
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function fmtMonth(d: Date): string {
  return d.toLocaleDateString("es-MX", { month: "short", year: "2-digit" });
}
function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
  });
}

// Asigna carriles evitando superposición visual por fechas reales
function assignLanes(acts: FlatActivity[]): number[] {
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

// Detecta zonas donde ≥2 actividades se solapan → heatmap de carga (px)
function computeOverlapBands(
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
      const oS = Math.max(intervals[i].s, intervals[j].s);
      const oE = Math.min(intervals[i].e, intervals[j].e);
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

// Último milestone (◆) por (client + stage)
function computeMilestones(acts: FlatActivity[]): Milestone[] {
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

// ── Componente ────────────────────────────────────────────────────────────────

export function GlobalTimeline({ filters }: { filters?: EquipoFilters } = {}) {
  const { data, error, isLoading } = useSWR("/api/projects/overview", fetcher);
  const [now] = useState(() => Date.now());
  const [zoomIdx, setZoomIdx] = useState(ZOOM_DEFAULT);
  const scrollRef = useRef<HTMLDivElement>(null);

  const zoom = ZOOM_STEPS[zoomIdx];
  const chartW = Math.round(CHART_BASE * zoom);

  // Aplanar + filtrar (incluye depends_on_activity_id para cascade)
  const activities = useMemo<FlatActivity[]>(() => {
    const out: FlatActivity[] = [];
    for (const p of data?.data ?? []) {
      if (filters?.clientId && p.client_id !== filters.clientId) continue;
      for (const sv of p.services) {
        for (const st of sv.stages) {
          for (const a of st.activities) {
            if (
              filters?.statuses &&
              filters.statuses.size > 0 &&
              !filters.statuses.has(a.status)
            )
              continue;
            if (
              filters?.consultorEmail &&
              a.assignee_email !== filters.consultorEmail
            )
              continue;
            if (filters?.dateRange && filters.dateRange !== "all") {
              if (filters.dateRange === "overdue") {
                if (a.status !== "delayed") continue;
              } else if (
                !activityInDateRange(
                  filters.dateRange,
                  a.planned_start,
                  a.planned_end
                )
              )
                continue;
            }
            out.push({
              id: a.id,
              name: a.name,
              client_id: p.client_id,
              client_name: p.client_name,
              stage_name: st.name,
              service: sv.service,
              assignee_email: a.assignee_email,
              planned_start: a.planned_start,
              planned_end: a.planned_end,
              actual_start: a.actual_start,
              actual_end: a.actual_end,
              status: a.status,
              depends_on_activity_id: a.depends_on_activity_id,
            });
          }
        }
      }
    }
    return out;
  }, [data, filters]);

  // KPIs globales
  const globalStats = useMemo(() => {
    const consultores = new Set(
      activities.map((a) => a.assignee_email).filter(Boolean)
    ).size;
    const activas = activities.filter(
      (a) => a.status === "in_progress" || a.status === "delayed"
    ).length;
    const retrasadas = activities.filter((a) => a.status === "delayed").length;
    const horizon = now + 30 * MS_DAY;
    const proximas = activities.filter((a) => {
      if (a.status !== "pending" || !a.planned_start) return false;
      const ts = parseDate(a.planned_start)?.getTime() ?? 0;
      return ts >= now && ts <= horizon;
    }).length;
    return { consultores, activas, retrasadas, proximas };
  }, [activities, now]);

  // IDs con dependientes — cascade alert
  const activitiesWithDependents = useMemo(() => {
    const set = new Set<string>();
    for (const a of activities) {
      if (a.depends_on_activity_id) set.add(a.depends_on_activity_id);
    }
    return set;
  }, [activities]);

  // Progreso por etapa — stage-gate tooltip
  const stageProgress = useMemo(() => {
    const map = new Map<string, { total: number; completed: number }>();
    for (const a of activities) {
      const key = `${a.client_id}::${a.stage_name}`;
      const cur = map.get(key) ?? { total: 0, completed: 0 };
      cur.total++;
      if (a.status === "completed") cur.completed++;
      map.set(key, cur);
    }
    return map;
  }, [activities]);

  // Agrupar por consultor + sort por riesgo
  const byConsultor = useMemo(() => {
    const map = new Map<string, FlatActivity[]>();
    for (const a of activities) {
      const key = a.assignee_email ?? "__unassigned__";
      const list = map.get(key) ?? [];
      list.push(a);
      map.set(key, list);
    }
    return Array.from(map.entries()).sort(([, a], [, b]) => {
      const aD = a.filter((x) => x.status === "delayed").length;
      const bD = b.filter((x) => x.status === "delayed").length;
      if (bD !== aD) return bD - aD;
      const aP = a.filter((x) => x.status === "in_progress").length;
      const bP = b.filter((x) => x.status === "in_progress").length;
      return bP - aP;
    });
  }, [activities]);

  // Rango temporal global
  const range = useMemo(() => {
    const dates: number[] = [];
    for (const a of activities) {
      for (const k of [a.planned_start, a.planned_end, a.actual_start, a.actual_end]) {
        const d = parseDate(k);
        if (d) dates.push(d.getTime());
      }
    }
    if (dates.length === 0) return null;
    const min = startOfMonth(new Date(Math.min(...dates) - MS_DAY * 7));
    const max = addMonths(startOfMonth(new Date(Math.max(...dates) + MS_DAY * 7)), 1);
    const months: Date[] = [];
    let cur = new Date(min);
    while (cur < max) {
      months.push(new Date(cur));
      cur = addMonths(cur, 1);
    }
    return { min: min.getTime(), max: max.getTime(), months };
  }, [activities]);

  // Datos computados por fila (dependen de range + chartW para px)
  const rowData = useMemo(() => {
    if (!range) return [];
    const ms = range.max - range.min;
    return byConsultor.map(([key, acts]) => {
      const delayed = acts.filter((a) => a.status === "delayed").length;
      const active = acts.filter((a) => a.status === "in_progress").length;
      const rag: "red" | "amber" | "green" =
        delayed > 0 ? "red" : active > 0 ? "amber" : "green";
      const overlapBands = computeOverlapBands(acts, range.min, ms, chartW);
      const milestones = computeMilestones(acts);
      const lanes = assignLanes(acts);
      const maxLane = acts.length > 0 ? Math.max(0, ...lanes) : 0;
      const rowH = Math.max(64, 14 + (maxLane + 1) * 20 + 14);
      return { key, acts, delayed, active, rag, overlapBands, milestones, lanes, rowH };
    });
  }, [byConsultor, range, chartW]);

  // Scroll automático hacia "Hoy" cuando carga datos (solo al montar, no en cada zoom)
  // setTimeout(0) espera a que el DOM se layoutee y clientWidth sea > 0
  const scrolledRef = useRef(false);
  useEffect(() => {
    if (scrolledRef.current || !range) return;
    const ms = range.max - range.min;
    const todayX = ((now - range.min) / ms) * chartW;
    if (todayX < 0 || todayX > chartW) return;
    const timer = setTimeout(() => {
      if (!scrollRef.current) return;
      const cW = scrollRef.current.clientWidth;
      scrollRef.current.scrollLeft = Math.max(0, todayX - cW / 3);
      scrolledRef.current = true;
    }, 0);
    return () => clearTimeout(timer);
  }, [range, chartW, now]);

  // ── Early returns ─────────────────────────────────────────────────────────

  if (isLoading) return <SkeletonTable rows={5} cols={4} />;
  if (error)
    return (
      <div className="border border-rose-200 bg-rose-50 rounded p-4 text-sm text-rose-700">
        No se pudo cargar el timeline.
      </div>
    );
  if (activities.length === 0)
    return (
      <div className="bg-white border border-slate-200 rounded p-12 text-center text-sm text-slate-500">
        Sin actividades creadas todavía.
      </div>
    );
  if (!range)
    return (
      <div className="bg-white border border-slate-200 rounded p-12 text-center text-sm text-slate-500">
        Hay actividades pero ninguna tiene fechas. Asigna fechas plan en la
        ficha del cliente para ver el timeline.
      </div>
    );

  const totalMs = range.max - range.min;
  const todayPx = ((now - range.min) / totalMs) * chartW;
  const todayInRange = todayPx >= 0 && todayPx <= chartW;

  // Granularidad: px por día determina qué mostrar
  const pxPerDay = chartW / (totalMs / MS_DAY);
  const showWeekSub = pxPerDay >= 5;   // sub-fila de semanas
  const showDaySub  = pxPerDay >= 18;  // sub-fila de días
  const headerH     = showWeekSub ? 54 : 36;

  // Lunes de cada semana en el rango
  const weekStarts: { px: number; label: string }[] = (() => {
    const out: { px: number; label: string }[] = [];
    const dow = new Date(range.min).getDay(); // 0=Dom
    const offsetToMon = dow === 0 ? 1 : dow === 1 ? 0 : 8 - dow;
    let cur = range.min + offsetToMon * MS_DAY;
    while (cur < range.max) {
      out.push({
        px: ((cur - range.min) / totalMs) * chartW,
        label: new Date(cur).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }),
      });
      cur += 7 * MS_DAY;
    }
    return out;
  })();

  // Días individuales (solo zoom alto)
  const dayLines: { px: number; label: string }[] = (() => {
    if (!showDaySub) return [];
    const out: { px: number; label: string }[] = [];
    let cur = range.min;
    while (cur < range.max) {
      out.push({
        px: ((cur - range.min) / totalMs) * chartW,
        label: String(new Date(cur).getDate()),
      });
      cur += MS_DAY;
    }
    return out;
  })();

  function pxOf(s: string | null): number | null {
    const d = parseDate(s);
    if (!d) return null;
    return ((d.getTime() - range!.min) / totalMs) * chartW;
  }
  function barPx(s: string | null, e: string | null): { left: number; width: number } | null {
    const a = pxOf(s);
    const b = pxOf(e);
    if (a === null || b === null) return null;
    return { left: a, width: Math.max(b - a, 2) };
  }

  function handleWheel(e: React.WheelEvent<HTMLDivElement>) {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    if (e.deltaY < 0) setZoomIdx((i) => Math.min(ZOOM_STEPS.length - 1, i + 1));
    else setZoomIdx((i) => Math.max(0, i - 1));
  }

  function scrollToToday() {
    if (!scrollRef.current) return;
    const cW = scrollRef.current.clientWidth;
    scrollRef.current.scrollLeft = Math.max(0, todayPx - cW / 3);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* ── KPIs ── */}
      <div className="grid grid-cols-4 gap-3">
        {(
          [
            { label: "Consultores", value: globalStats.consultores, tone: "neutral" as const, hint: "con actividades visibles" },
            { label: "En curso", value: globalStats.activas, tone: "primary" as const, hint: "activas o retrasadas" },
            { label: "Retrasadas", value: globalStats.retrasadas, tone: "red" as const, hint: "requieren atención" },
            { label: "Próximas 30d", value: globalStats.proximas, tone: "amber" as const, hint: "inician pronto" },
          ] as const
        ).map(({ label, value, tone, hint }) => (
          <div key={label} className="bg-white border border-slate-200 rounded px-4 py-3 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
            <p className={`text-2xl font-bold tabular-nums mt-0.5 ${
              tone === "red" ? "text-rose-600"
              : tone === "amber" ? "text-amber-600"
              : tone === "primary" ? "text-brand-primary-dark"
              : "text-slate-900"
            }`}>{value}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{hint}</p>
          </div>
        ))}
      </div>

      {/* ── Timeline ── */}
      <div className="bg-white border border-slate-200 rounded shadow-sm overflow-hidden">

        {/* Barra de zoom */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-100 bg-slate-50/60">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mr-1">Zoom</span>
          <button
            onClick={() => setZoomIdx((i) => Math.max(0, i - 1))}
            disabled={zoomIdx === 0}
            className="w-6 h-6 flex items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-sm font-bold"
            title="Alejar"
          >−</button>
          <span className="text-xs font-bold tabular-nums text-slate-700 w-8 text-center">{zoom}×</span>
          <button
            onClick={() => setZoomIdx((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}
            disabled={zoomIdx === ZOOM_STEPS.length - 1}
            className="w-6 h-6 flex items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-sm font-bold"
            title="Acercar"
          >+</button>
          <div className="flex gap-1 ml-1">
            {ZOOM_STEPS.map((z, i) => (
              <button
                key={z}
                onClick={() => setZoomIdx(i)}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${i === zoomIdx ? "bg-brand-primary" : "bg-slate-300 hover:bg-slate-400"}`}
                title={`${z}×`}
              />
            ))}
          </div>
          {todayInRange && (
            <button
              onClick={scrollToToday}
              className="ml-2 text-[10px] font-semibold text-brand-primary-dark hover:underline"
              title="Centrar en hoy"
            >
              ↔ Hoy
            </button>
          )}
          <span className="ml-auto text-[10px] text-slate-400">Ctrl + rueda para zoom</span>
        </div>

        {/* Grid: columna label fija + zona chart scrolleable */}
        <div className="flex">

          {/* Columna label — ancho fijo, no scrollea */}
          <div className="shrink-0 border-r border-slate-200 bg-white" style={{ width: LABEL_W }}>
            {/* Header — altura dinámica según granularidad */}
            <div className="border-b border-slate-200 bg-slate-50 px-3 flex items-start pt-2" style={{ height: headerH }}>
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Consultor</span>
            </div>
            {/* Filas de consultor */}
            {rowData.map(({ key, acts, rag, delayed, active, rowH }) => {
              const isUnassigned = key === "__unassigned__";
              const display = isUnassigned ? "Sin asignar" : key.split("@")[0];
              const uniqueClients = new Set(acts.map((a) => a.client_id)).size;
              const subtitle = isUnassigned
                ? `${acts.length} sin owner`
                : `${acts.length} ${acts.length === 1 ? "actividad" : "actividades"} · ${uniqueClients} ${uniqueClients === 1 ? "cliente" : "clientes"}`;
              const RAG_DOT = { red: "bg-rose-500", amber: "bg-amber-400", green: "bg-emerald-500" } as const;
              const RAG_TEXT = { red: "text-rose-700 font-bold", amber: "text-amber-700 font-semibold", green: "text-slate-500" } as const;
              const RAG_LABEL = {
                red: `${delayed} retrasada${delayed !== 1 ? "s" : ""}`,
                amber: `${active} en curso`,
                green: "Sin carga activa",
              } as const;
              return (
                <div
                  key={key}
                  className="border-b border-slate-100 px-3 py-2.5 flex flex-col justify-start gap-0.5"
                  style={{ height: rowH }}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`shrink-0 w-2 h-2 rounded-full ${RAG_DOT[rag]}`} aria-label={RAG_LABEL[rag]} />
                    <p className={`text-xs font-semibold truncate ${isUnassigned ? "text-slate-500 italic" : "text-slate-900"}`}>
                      {display}
                    </p>
                  </div>
                  <p className="text-[10px] text-slate-500 truncate pl-3.5" title={subtitle}>{subtitle}</p>
                  {!isUnassigned && (
                    <p className={`text-[10px] tabular-nums pl-3.5 ${RAG_TEXT[rag]}`}>{RAG_LABEL[rag]}</p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Zona chart — scroll horizontal */}
          <div
            ref={scrollRef}
            className="overflow-x-auto flex-1 min-w-0"
            onWheel={handleWheel}
          >
            {/* Inner a ancho fijo en px */}
            <div style={{ width: chartW }} className="relative">

              {/* Header: fila meses + fila semanas/días */}
              <div className="border-b border-slate-200 bg-slate-50 relative overflow-hidden" style={{ height: headerH }}>
                {/* Fila de meses — siempre */}
                {range.months.map((m, i) => {
                  const leftPx = ((m.getTime() - range.min) / totalMs) * chartW;
                  const nextMs = i + 1 < range.months.length
                    ? range.months[i + 1].getTime()
                    : range.max;
                  const widthPx = ((nextMs - m.getTime()) / totalMs) * chartW;
                  return (
                    <div
                      key={i}
                      className="absolute border-r border-slate-300 px-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-600 overflow-hidden flex items-center"
                      style={{ left: leftPx, width: widthPx, top: 0, height: showWeekSub ? 27 : headerH }}
                    >
                      {fmtMonth(m)}
                    </div>
                  );
                })}

                {/* Separador entre filas */}
                {showWeekSub && (
                  <div className="absolute left-0 right-0 border-t border-slate-200" style={{ top: 27 }} />
                )}

                {/* Fila de semanas (zoom moderado) */}
                {showWeekSub && !showDaySub && weekStarts.map(({ px, label }, i) => (
                  <div
                    key={i}
                    className="absolute border-r border-slate-200/60 px-1 text-[9px] font-medium text-slate-500 overflow-hidden flex items-center"
                    style={{ left: px, top: 27, height: 27, minWidth: 2 }}
                  >
                    {label}
                  </div>
                ))}

                {/* Fila de días (zoom alto) */}
                {showDaySub && dayLines.map(({ px, label }, i) => (
                  <div
                    key={i}
                    className="absolute border-r border-slate-200/40 text-[8px] text-slate-400 overflow-hidden flex items-center justify-center"
                    style={{ left: px, top: 27, height: 27, width: Math.max(pxPerDay, 1) }}
                  >
                    {pxPerDay >= 22 ? label : ""}
                  </div>
                ))}
              </div>

              {/* Filas de actividades */}
              {rowData.map(({ key, acts, lanes, rowH, overlapBands, milestones }) => (
                <div key={key} className="relative border-b border-slate-100" style={{ height: rowH }}>

                  {/* Líneas de mes */}
                  {range.months.map((m, i) => (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 border-r border-slate-200/80 pointer-events-none"
                      style={{ left: ((m.getTime() - range.min) / totalMs) * chartW, width: 0 }}
                    />
                  ))}

                  {/* Líneas de semana */}
                  {weekStarts.map(({ px }, i) => (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 border-r border-slate-100 pointer-events-none"
                      style={{ left: px, width: 0 }}
                    />
                  ))}

                  {/* Líneas de día (zoom alto) */}
                  {showDaySub && dayLines.map(({ px }, i) => (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 pointer-events-none"
                      style={{ left: px, width: 0, borderRight: "1px dashed rgba(203,213,225,0.35)" }}
                    />
                  ))}

                  {/* Heatmap de solapamiento */}
                  {overlapBands.map((band, i) => (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 bg-amber-100/70 pointer-events-none"
                      style={{ left: band.leftPx, width: band.widthPx }}
                      title="Actividades solapadas — carga alta en este período"
                    />
                  ))}

                  {/* Línea de hoy */}
                  {todayInRange && (
                    <div
                      className="absolute top-0 bottom-0 border-l border-rose-400/60 pointer-events-none z-20"
                      style={{ left: todayPx, width: 0 }}
                      title="Hoy"
                    />
                  )}

                  {/* Barras de actividades */}
                  {acts.map((a, idx) => {
                    const realStyle = barPx(a.actual_start, a.actual_end);
                    const planStyle = barPx(a.planned_start, a.planned_end);
                    const style = realStyle ?? planStyle;
                    if (!style) return null;

                    const colorClass = STATUS_BAR[a.status];
                    const lane = lanes[idx];
                    const top = 14 + lane * 20;
                    const isCascade = a.status === "delayed" && activitiesWithDependents.has(a.id);

                    const stageKey = `${a.client_id}::${a.stage_name}`;
                    const sp = stageProgress.get(stageKey);
                    const spLabel = sp ? `${sp.completed}/${sp.total} completas` : "";

                    const tooltip = [
                      isCascade ? "⚡ RIESGO CASCADA — dependientes afectados" : null,
                      `Cliente: ${a.client_name}`,
                      `Etapa: ${a.stage_name}${spLabel ? ` · ${spLabel}` : ""}`,
                      `Actividad: ${a.name}`,
                      `Plan: ${fmt(a.planned_start)} → ${fmt(a.planned_end)}`,
                      `Real: ${fmt(a.actual_start)} → ${fmt(a.actual_end)}`,
                      `Status: ${a.status}`,
                    ].filter(Boolean).join("\n");

                    return (
                      <Link
                        key={a.id}
                        href={`/clientes/${a.client_id}?tab=cronograma`}
                        className={`absolute h-4 rounded ${colorClass} transition-colors flex items-center px-1 overflow-hidden gap-0.5 ${
                          isCascade ? "ring-1 ring-rose-300 ring-offset-0" : ""
                        }`}
                        style={{ left: style.left, width: style.width, top }}
                        title={tooltip}
                      >
                        {isCascade && (
                          <span className="text-[8px] shrink-0 leading-none">⚡</span>
                        )}
                        <span className="text-[9px] text-white font-semibold truncate leading-none">
                          {a.client_name} · {a.name}
                        </span>
                      </Link>
                    );
                  })}

                  {/* Milestones ◆ */}
                  {milestones.map((m, i) => {
                    const mPx = pxOf(m.date);
                    if (mPx === null || mPx < 0 || mPx > chartW) return null;
                    return (
                      <div
                        key={i}
                        className="absolute z-10 pointer-events-none"
                        style={{ left: mPx, bottom: 5, transform: "translateX(-50%)" }}
                        title={`◆ Cierre: ${m.client} · ${m.label}\n${m.progress} actividades completadas\nFecha: ${fmt(m.date)}`}
                      >
                        <svg width="10" height="10" viewBox="0 0 10 10" className="fill-slate-500">
                          <polygon points="5,0 10,5 5,10 0,5" />
                        </svg>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Leyenda */}
        <div className="border-t border-slate-100 bg-slate-50 px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-600">
          <span className="font-semibold text-slate-500">Status:</span>
          {(
            [
              { color: "bg-slate-300", label: "Pendiente" },
              { color: "bg-brand-primary", label: "En curso" },
              { color: "bg-teal-600", label: "Completada" },
              { color: "bg-rose-500", label: "Retrasada" },
            ] as const
          ).map(({ color, label }) => (
            <span key={label} className="inline-flex items-center gap-1.5">
              <span className={`w-4 h-2.5 ${color} rounded-sm`} />
              {label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5 border-l border-slate-200 pl-4">
            <svg width="8" height="8" viewBox="0 0 10 10" className="fill-slate-500 shrink-0">
              <polygon points="5,0 10,5 5,10 0,5" />
            </svg>
            Cierre de etapa
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 h-2.5 bg-amber-100 rounded-sm border border-amber-200" />
            Solapamiento
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="text-[9px]">⚡</span>
            Riesgo cascada
          </span>
          {todayInRange && (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-px h-3 bg-rose-400/60" />
              Hoy
            </span>
          )}
          <span className="ml-auto text-[10px] text-slate-500 italic">
            Click en barra → ficha del cliente
          </span>
        </div>
      </div>
    </div>
  );
}
