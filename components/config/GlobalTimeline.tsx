"use client";

// Timeline global v2 — vista gerencial cross-project.
// 8 mejoras: KPIs header · RAG badge · sort por riesgo · heatmap solapamiento ·
// milestones por etapa · cascade alert · stage-gate progress · tooltip rico.
// v2.1: zoom (0.5×–4×) + scroll horizontal + scroll-to-today automático.
// Constantes, tipos y helpers puros → lib/timeline/utils.ts

import { useMemo, useState, useRef, useEffect } from "react";
import Link from "next/link";
import useSWR from "swr";
import { TimelineChartRow } from "./TimelineChartRow";
import type { ProjectOverview } from "@/app/api/projects/overview/route";
import { activityInDateRange, type EquipoFilters } from "./EquipoFilters";
import { SkeletonTable } from "@/components/ui/Skeleton";
import {
  MS_DAY, LABEL_W, CHART_BASE, ZOOM_STEPS, ZOOM_DEFAULT, PROJECT_PALETTE,
  STATUS_INLINE, hexAlpha, estimateProgress,
  parseDate, startOfMonth, addMonths, fmtMonth, fmt,
  assignLanes, computeOverlapBands, computeMilestones,
  type ColorMode, type FlatActivity, type Milestone, type OverlapBand,
} from "@/lib/timeline/utils";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<{ data: ProjectOverview[] }>;
  });

// ── Componente ────────────────────────────────────────────────────────────────

export function GlobalTimeline({
  filters,
  consultorNames,
}: {
  filters?: EquipoFilters;
  /** email → nombre completo, para mostrar en columna de label */
  consultorNames?: Map<string, string>;
} = {}) {
  const { data, error, isLoading } = useSWR("/api/projects/overview", fetcher);
  const [now] = useState(() => Date.now());
  const [zoomIdx, setZoomIdx] = useState(ZOOM_DEFAULT);
  type QuickFilter = 'delayed' | 'active' | 'upcoming' | 'completed' | null;
  const [quickFilter, setQuickFilter] = useState<QuickFilter>(null);
  const toggleFilter = (f: QuickFilter) => setQuickFilter((v) => (v === f ? null : f));
  const [colorMode, setColorMode] = useState<ColorMode>('estado');
  const scrollRef = useRef<HTMLDivElement>(null);
  // Drag-to-pan: refs (no state) para evitar re-renders en cada mousemove
  const isPanning = useRef(false);
  const panStartX = useRef(0);
  const panStartScrollLeft = useRef(0);
  const didPan = useRef(false);

  const zoom = ZOOM_STEPS[zoomIdx];
  const chartW = Math.round(CHART_BASE * zoom);

  // Aplanar + filtrar por filtros de panel — base para KPIs y vista filtrada
  const allActivities = useMemo<FlatActivity[]>(() => {
    const out: FlatActivity[] = [];
    for (const p of data?.data ?? []) {
      if (filters?.clientId && p.client_id !== filters.clientId) continue;
      for (const sv of p.services) {
        for (const st of sv.stages) {
          for (const a of st.activities) {
            if (filters?.statuses && filters.statuses.size > 0 && !filters.statuses.has(a.status)) continue;
            if (filters?.consultorEmail && a.assignee_email !== filters.consultorEmail) continue;
            if (filters?.dateRange && filters.dateRange !== "all") {
              if (filters.dateRange === "overdue") { if (a.status !== "delayed") continue; }
              else if (!activityInDateRange(filters.dateRange, a.planned_start, a.planned_end)) continue;
            }
            out.push({
              id: a.id, name: a.name, client_id: p.client_id, client_name: p.client_name,
              stage_name: st.name, service: sv.service, assignee_email: a.assignee_email,
              planned_start: a.planned_start, planned_end: a.planned_end,
              actual_start: a.actual_start, actual_end: a.actual_end,
              status: a.status, depends_on_activity_id: a.depends_on_activity_id,
            });
          }
        }
      }
    }
    return out;
  }, [data, filters]);

  // Vista filtrada — quickFilter sobre allActivities (sin re-loop de datos)
  const activities = useMemo<FlatActivity[]>(() => {
    if (quickFilter === 'delayed')   return allActivities.filter((a) => a.status === 'delayed');
    if (quickFilter === 'active')    return allActivities.filter((a) => a.status === 'in_progress' || a.status === 'delayed');
    if (quickFilter === 'completed') return allActivities.filter((a) => a.status === 'completed');
    if (quickFilter === 'upcoming')  return allActivities.filter((a) => {
      if (a.status !== 'pending' || !a.planned_start) return false;
      const ts = new Date(a.planned_start + 'T00:00:00').getTime();
      return ts >= now && ts <= now + 30 * MS_DAY;
    });
    return allActivities;
  }, [allActivities, quickFilter, now]);

  const globalStats = useMemo(() => {
    const consultores = new Set(allActivities.map((a) => a.assignee_email).filter(Boolean)).size;
    const activas = allActivities.filter((a) => a.status === "in_progress" || a.status === "delayed").length;
    const retrasadas = allActivities.filter((a) => a.status === "delayed").length;
    const completadas = allActivities.filter((a) => a.status === "completed").length;
    const pctComplete = allActivities.length > 0 ? Math.round((completadas / allActivities.length) * 100) : 0;
    const clientesConRetraso = new Set(
      allActivities.filter((a) => a.status === "delayed").map((a) => a.client_id)
    ).size;
    const horizon = now + 30 * MS_DAY;
    const proximas = allActivities.filter((a) => {
      if (a.status !== "pending" || !a.planned_start) return false;
      const ts = parseDate(a.planned_start)?.getTime() ?? 0;
      return ts >= now && ts <= horizon;
    }).length;
    return { consultores, activas, retrasadas, completadas, pctComplete, clientesConRetraso, proximas };
  }, [allActivities, now]);

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

  const clientColorMap = useMemo(() => {
    const ids = Array.from(new Set(activities.map((a) => a.client_id)));
    return new Map(ids.map((id, i) => [id, PROJECT_PALETTE[i % PROJECT_PALETTE.length]]));
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
      const rowH = Math.max(80, 14 + (maxLane + 1) * 20 + 14);
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

  // ── Teclado: ←/→ pan · Shift+←/→ salto · Home/End · +/- zoom ─────────────
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const el = scrollRef.current;
    if (!el) return;
    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        el.scrollLeft -= e.shiftKey ? 400 : 120;
        break;
      case "ArrowRight":
        e.preventDefault();
        el.scrollLeft += e.shiftKey ? 400 : 120;
        break;
      case "Home":
        e.preventDefault();
        el.scrollLeft = 0;
        break;
      case "End":
        e.preventDefault();
        el.scrollLeft = el.scrollWidth;
        break;
      case "+":
      case "=":
        e.preventDefault();
        setZoomIdx((i) => Math.min(ZOOM_STEPS.length - 1, i + 1));
        break;
      case "-":
        e.preventDefault();
        setZoomIdx((i) => Math.max(0, i - 1));
        break;
    }
  }

  // ── Drag-to-pan (mouse) ───────────────────────────────────────────────────
  function onPanStart(e: React.MouseEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("a,button")) return;
    const el = scrollRef.current;
    if (!el) return;
    isPanning.current = true;
    didPan.current = false;
    panStartX.current = e.clientX;
    panStartScrollLeft.current = el.scrollLeft;
    el.style.cursor = "grabbing";
    e.preventDefault();
  }

  function onPanMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!isPanning.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const dx = e.clientX - panStartX.current;
    if (Math.abs(dx) > 4) didPan.current = true;
    el.scrollLeft = panStartScrollLeft.current - dx;
  }

  function onPanEnd() {
    if (!isPanning.current) return;
    isPanning.current = false;
    const el = scrollRef.current;
    if (el) el.style.cursor = "grab";
  }

  // Suprime click en barras si hubo pan real
  function onClickCapture(e: React.MouseEvent) {
    if (didPan.current) {
      e.stopPropagation();
      didPan.current = false;
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* ── Alert banner: solo cuando hay retrasadas — llama la atención del gerente ── */}
      {globalStats.retrasadas > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-rose-50 border border-rose-200 rounded">
          <svg className="w-4 h-4 text-rose-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="flex-1 text-sm font-semibold text-rose-700">
            {globalStats.retrasadas} {globalStats.retrasadas === 1 ? "actividad retrasada" : "actividades retrasadas"}
            {" "}en{" "}
            {globalStats.clientesConRetraso} {globalStats.clientesConRetraso === 1 ? "proyecto" : "proyectos"}
          </p>
          <button
            onClick={() => toggleFilter('delayed')}
            className={`text-xs font-semibold px-3 py-1.5 rounded border transition-colors ${
              quickFilter === 'delayed'
                ? "bg-rose-600 text-white border-rose-600 hover:bg-rose-700"
                : "bg-white text-rose-700 border-rose-300 hover:bg-rose-50"
            }`}
          >
            {quickFilter === 'delayed' ? "× Ver todas" : "Ver solo retrasadas →"}
          </button>
        </div>
      )}

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {(
          [
            { label: "Consultores", value: globalStats.consultores, tone: "neutral" as const, hint: "con actividades visibles" },
            {
              label: "En curso",
              value: globalStats.activas,
              tone: "primary" as const,
              hint: "activas o retrasadas",
              hintActive: "× clic para ver todas",
              onClick: () => toggleFilter('active'),
              active: quickFilter === 'active',
            },
            {
              label: "Retrasadas",
              value: globalStats.retrasadas,
              tone: "red" as const,
              hint: `${globalStats.clientesConRetraso} proyecto${globalStats.clientesConRetraso !== 1 ? "s" : ""} afectado${globalStats.clientesConRetraso !== 1 ? "s" : ""}`,
              hintActive: "× clic para ver todas",
              onClick: () => toggleFilter('delayed'),
              active: quickFilter === 'delayed',
            },
            {
              label: "Próximas 30d",
              value: globalStats.proximas,
              tone: "amber" as const,
              hint: "inician pronto",
              hintActive: "× clic para ver todas",
              onClick: () => toggleFilter('upcoming'),
              active: quickFilter === 'upcoming',
            },
            {
              label: "Completado",
              value: `${globalStats.pctComplete}%`,
              tone: "green" as const,
              hint: `${globalStats.completadas} de ${allActivities.length} actividades`,
              hintActive: "× clic para ver todas",
              onClick: () => toggleFilter('completed'),
              active: quickFilter === 'completed',
            },
          ] as { label: string; value: string | number; tone: "neutral"|"primary"|"red"|"amber"|"green"; hint: string; hintActive?: string; onClick?: () => void; active?: boolean }[]
        ).map(({ label, value, tone, hint, hintActive, onClick, active }) => (
          <div
            key={label}
            onClick={onClick}
            className={`bg-white border rounded px-4 py-3 shadow-sm transition-all ${
              onClick ? "cursor-pointer hover:shadow-md hover:border-slate-300 select-none" : ""
            } ${
              active
                ? tone === "red"    ? "border-rose-400 ring-2 ring-rose-100"
                : tone === "amber"  ? "border-amber-400 ring-2 ring-amber-100"
                : tone === "green"  ? "border-emerald-400 ring-2 ring-emerald-100"
                : tone === "primary"? "border-brand-primary ring-2 ring-brand-primary-light"
                : "border-slate-400 ring-2 ring-slate-100"
                : "border-slate-200"
            }`}
          >
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
            <p className={`text-2xl font-bold tabular-nums mt-0.5 ${
              tone === "red" ? "text-rose-600"
              : tone === "amber" ? "text-amber-600"
              : tone === "primary" ? "text-brand-primary-dark"
              : tone === "green" ? "text-emerald-600"
              : "text-slate-900"
            }`}>{value}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{active && hintActive ? hintActive : hint}</p>
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
          <div className="flex items-center gap-1.5 border-l border-slate-200 pl-2 ml-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Color</span>
            <div className="inline-flex bg-slate-100 rounded p-0.5 gap-0.5">
              <button
                onClick={() => setColorMode('estado')}
                className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded transition-colors ${
                  colorMode === 'estado'
                    ? 'bg-white text-brand-primary-dark shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >Estado</button>
              <button
                onClick={() => setColorMode('proyecto')}
                className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded transition-colors ${
                  colorMode === 'proyecto'
                    ? 'bg-white text-brand-primary-dark shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >Proyecto</button>
            </div>
          </div>
          <span className="ml-auto text-[10px] text-slate-400" title="← → pan · Shift+← → salto · Home/End · +/− zoom · Arrastra con mouse">← → · drag · Ctrl+rueda</span>
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
              const display = isUnassigned
                ? "Sin asignar"
                : (consultorNames?.get(key) ?? key.split("@")[0]);
              const completed = acts.filter((a) => a.status === "completed").length;
              const subtitle = isUnassigned
                ? `${acts.length} sin owner`
                : `${completed}/${acts.length} completadas`;
              const RAG_BORDER = { red: "border-l-rose-500", amber: "border-l-amber-400", green: "border-l-emerald-400" } as const;
              const RAG_AVATAR = { red: "bg-rose-100 text-rose-700", amber: "bg-amber-100 text-amber-700", green: "bg-emerald-100 text-emerald-700" } as const;
              const RAG_TEXT = { red: "text-rose-700 font-semibold", amber: "text-amber-700 font-semibold", green: "text-slate-500" } as const;
              const RAG_LABEL = {
                red: `${delayed} retrasada${delayed !== 1 ? "s" : ""}`,
                amber: `${active} en curso`,
                green: "Al día",
              } as const;
              const initials = isUnassigned
                ? "?"
                : display.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
              return (
                <div
                  key={key}
                  className={`border-b border-slate-100 border-l-4 px-2.5 py-2 flex flex-col justify-center gap-0.5 ${RAG_BORDER[rag]}`}
                  style={{
                    height: rowH,
                    // content-visibility: auto — el browser salta paint/layout de filas
                    // fuera del viewport. Equivalente a virtual scroll sin JS.
                    // containIntrinsicSize fija el tamaño estimado para scrollbar correcto.
                    contentVisibility: "auto" as React.CSSProperties["contentVisibility"],
                    containIntrinsicSize: `0px ${rowH}px`,
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold leading-none ${isUnassigned ? "bg-slate-100 text-slate-500" : RAG_AVATAR[rag]}`}>
                      {initials}
                    </span>
                    <p className={`text-xs font-bold truncate ${isUnassigned ? "text-slate-500 italic" : "text-slate-800"}`}>
                      {display}
                    </p>
                  </div>
                  <p className="text-[10px] leading-4 text-slate-600 truncate pl-8" title={subtitle}>{subtitle}</p>
                  {!isUnassigned && (
                    <p className={`text-[10px] tabular-nums pl-8 ${RAG_TEXT[rag]}`}>{RAG_LABEL[rag]}</p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Zona chart — scroll horizontal.
              overflow-y:clip: evita que overflow-x:auto acople overflow-y:auto
              (CSS coupling rule). clip no crea scroll container → <main> ve
              altura total y puede scrollear verticalmente. */}
          <div
            ref={scrollRef}
            className="overflow-x-auto flex-1 min-w-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 focus-visible:ring-inset"
            style={{ overflowY: "clip", cursor: "grab" }}
            tabIndex={0}
            onWheel={handleWheel}
            onKeyDown={onKeyDown}
            onMouseDown={onPanStart}
            onMouseMove={onPanMove}
            onMouseUp={onPanEnd}
            onMouseLeave={onPanEnd}
            onClickCapture={onClickCapture}
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
                {/* Línea + label de hoy en el header */}
                {todayInRange && (
                  <div className="absolute top-0 bottom-0 pointer-events-none z-10" style={{ left: todayPx }}>
                    <div className="absolute top-0 bottom-0 border-l border-rose-400/60" />
                    <div className="absolute -translate-x-1/2 px-1 rounded-sm bg-rose-50 border border-rose-200 text-[9px] font-bold text-rose-600 whitespace-nowrap leading-4" style={{ top: 3 }}>
                      {new Date(now).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}
                    </div>
                  </div>
                )}
              </div>

              {/* Filas de actividades — TimelineChartRow es React.memo para
                  evitar re-renders de filas estables al cambiar filtros/zoom */}
              {rowData.map(({ key, acts, lanes, rowH, overlapBands, milestones }) => (
                <TimelineChartRow
                  key={key}
                  rowH={rowH}
                  acts={acts}
                  lanes={lanes}
                  overlapBands={overlapBands}
                  milestones={milestones}
                  rangeMin={range.min}
                  totalMs={totalMs}
                  chartW={chartW}
                  rangeMonths={range.months}
                  weekStarts={weekStarts}
                  dayLines={dayLines}
                  showDaySub={showDaySub}
                  todayInRange={todayInRange}
                  todayPx={todayPx}
                  now={now}
                  activitiesWithDependents={activitiesWithDependents}
                  stageProgress={stageProgress}
                  colorMode={colorMode}
                  clientColorMap={clientColorMap}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Leyenda */}
        <div className="border-t border-slate-100 bg-slate-50 px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-600">
          {colorMode === 'estado' ? (
            <>
              <span className="font-semibold text-slate-500">Estado:</span>
              {(
                [
                  { bg: STATUS_INLINE.pending.fill,     label: "Pendiente" },
                  { bg: STATUS_INLINE.in_progress.fill, label: "En curso"  },
                  { bg: STATUS_INLINE.completed.fill,   label: "Completada"},
                  { bg: STATUS_INLINE.delayed.fill,     label: "Retrasada" },
                ] as const
              ).map(({ bg, label }) => (
                <span key={label} className="inline-flex items-center gap-1.5">
                  <span className="w-4 h-2.5 rounded-sm" style={{ background: bg }} />
                  {label}
                </span>
              ))}
            </>
          ) : (
            <>
              <span className="font-semibold text-slate-500">Proyecto:</span>
              {Array.from(clientColorMap.entries()).map(([clientId, color]) => {
                const name = activities.find((a) => a.client_id === clientId)?.client_name ?? clientId;
                return (
                  <span key={clientId} className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: color }} />
                    {name}
                  </span>
                );
              })}
            </>
          )}
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
