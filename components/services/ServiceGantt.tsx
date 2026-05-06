"use client";

// Gantt CSS sin dependencia pesada. Barras: baseline (dashed) · plan (outline) · real (sólida+%).
// Click barra → popover quick actions. Hover label → tooltip rico.
// Zoom: Ajustar | Mes (200px/mes) | Trim (440px/mes) — ambos con marcadores de semana.
// Baseline freeze · export PNG (html2canvas dyn-import).

import { useMemo, useState, useRef, useId } from "react";
import type { ActivityStatus, ServiceStage, StageActivity } from "@/lib/stages";
import { QuickActionPopover, type QuickPatch } from "./QuickActionPopover";

// ─── Colores ──────────────────────────────────────────────────────────────────

const STATUS_BAR: Record<ActivityStatus, string> = {
  pending: "bg-slate-300",
  in_progress: "bg-brand-primary",
  completed: "bg-emerald-500",
  delayed: "bg-rose-500",
};

const STATUS_LABEL: Record<ActivityStatus, string> = {
  pending: "Pendiente",
  in_progress: "En curso",
  completed: "Completada",
  delayed: "Retrasada",
};

const STATUS_TEXT: Record<ActivityStatus, string> = {
  pending: "text-slate-500",
  in_progress: "text-brand-primary-dark",
  completed: "text-emerald-700",
  delayed: "text-rose-700",
};

// ─── Helpers de fecha ─────────────────────────────────────────────────────────

const MS_DAY = 86_400_000;

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  return new Date(s + "T00:00:00");
}

function fmtMonth(d: Date): string {
  return d.toLocaleDateString("es-MX", { month: "short", year: "2-digit" });
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function fmtShort(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
  });
}

// Lunes más cercano >= ts
function nextMonday(ts: number): number {
  const d = new Date(ts);
  const day = d.getDay(); // 0=Dom
  const diff = day === 1 ? 0 : day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function weekBoundaries(min: number, max: number): number[] {
  const out: number[] = [];
  let cur = nextMonday(min);
  while (cur < max) {
    out.push(cur);
    cur += 7 * MS_DAY;
  }
  return out;
}

function dayBoundaries(min: number, max: number): number[] {
  const out: number[] = [];
  const d = new Date(min);
  d.setHours(0, 0, 0, 0);
  while (d.getTime() < max) {
    out.push(d.getTime());
    d.setDate(d.getDate() + 1);
  }
  return out;
}

// Dom=0→"D", Lun=1→"L", Mar=2→"M", Mié=3→"X", Jue=4→"J", Vie=5→"V", Sáb=6→"S"
const DOW = ["D", "L", "M", "X", "J", "V", "S"];

// ─── Zoom ─────────────────────────────────────────────────────────────────────

type Zoom = "fit" | "mes" | "quarter" | "semana" | "dia";
// fit=auto · mes=200px/mes · quarter=440 (~110px/sem) · semana=1000 (~33px/día) · dia=3000 (~100px/día)
const MONTH_PX: Record<Zoom, number | null> = { fit: null, mes: 200, quarter: 440, semana: 1000, dia: 3000 };

// ─── Ruta crítica ─────────────────────────────────────────────────────────────

function findAtRisk(activities: StageActivity[]): Set<string> {
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

// ─── Overlay ─────────────────────────────────────────────────────────────────

type Overlay =
  | { kind: "tooltip"; activity: StageActivity; anchor: { x: number; y: number } }
  | { kind: "popover"; stageId: string; activity: StageActivity; anchor: { x: number; y: number } }
  | null;

// ─── Constantes layout ────────────────────────────────────────────────────────

const LABEL_W = 240;
const ROW_H = 44;

// ─── Componente ───────────────────────────────────────────────────────────────

export function ServiceGantt({
  stages,
  onEditActivity,
  onQuickAction,
  onFreezeBaseline,
  isAdmin = false,
  storageKey,
}: {
  stages: ServiceStage[];
  onEditActivity: (stageId: string, activity: StageActivity) => void;
  onQuickAction?: (activityId: string, patch: QuickPatch) => Promise<void>;
  onFreezeBaseline?: () => Promise<void>;
  isAdmin?: boolean;
  storageKey?: string;
}) {
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    if (!storageKey || typeof window === "undefined") return new Set();
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? new Set(JSON.parse(saved) as string[]) : new Set();
    } catch { return new Set(); }
  });
  const [confirmFreeze, setConfirmFreeze] = useState(false);
  const [freezing, setFreezing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showFloat, setShowFloat] = useState(false);
  const [showDeps, setShowDeps] = useState(false);
  const [showCriticalPath, setShowCriticalPath] = useState(false);
  const ganttRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerTimelineInnerRef = useRef<HTMLDivElement>(null);
  const [now] = useState(() => Date.now());
  // Drag-to-pan: refs (no state) para evitar re-renders en cada mousemove.
  const isPanning = useRef(false);
  const panStartX = useRef(0);
  const panStartScrollLeft = useRef(0);
  const didPan = useRef(false); // suprimir click si hubo movimiento real

  const allActivities = useMemo(() => stages.flatMap((s) => s.activities), [stages]);
  const atRisk = useMemo(() => findAtRisk(allActivities), [allActivities]);
  const hasBaseline = useMemo(() => allActivities.some((a) => a.baseline_start), [allActivities]);
  const uid = useId().replace(/:/g, "");

  // Float/holgura: días libres entre fin plan y el inicio del dependiente más temprano (o fin de etapa)
  const floatMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of stages) {
      const maxEnd = s.activities
        .filter((a) => a.planned_end)
        .reduce<number>((mx, a) => Math.max(mx, parseDate(a.planned_end)!.getTime()), 0);
      for (const a of s.activities) {
        if (!a.planned_end) continue;
        const aEnd = parseDate(a.planned_end)!.getTime();
        const deps = allActivities.filter((d) => d.depends_on_activity_id === a.id && d.planned_start);
        const floatEnd = deps.length > 0
          ? Math.min(...deps.map((d) => parseDate(d.planned_start)!.getTime()))
          : maxEnd;
        const f = Math.round((floatEnd - aEnd) / MS_DAY);
        if (f > 0) map.set(a.id, f);
      }
    }
    return map;
  }, [stages, allActivities]);

  // Ruta crítica: traza hacia atrás desde la actividad con fin más tardío
  const criticalPathIds = useMemo(() => {
    if (!showCriticalPath) return new Set<string>();
    const acts = allActivities.filter((a) => a.planned_start && a.planned_end);
    if (acts.length === 0) return new Set<string>();
    const idToAct = new Map(acts.map((a) => [a.id, a]));
    const last = acts.reduce((a, b) =>
      parseDate(b.planned_end)!.getTime() > parseDate(a.planned_end)!.getTime() ? b : a
    );
    const critical = new Set<string>();
    let cur: StageActivity | undefined = last;
    let depth = 0;
    while (cur && depth < 200) {
      critical.add(cur.id);
      cur = cur.depends_on_activity_id ? idToAct.get(cur.depends_on_activity_id) : undefined;
      depth++;
    }
    return critical;
  }, [allActivities, showCriticalPath]);

  // Lunes de la semana actual para la banda de hoy
  const todayWeekStart = useMemo(() => {
    const d = new Date(now);
    const dow = d.getDay();
    const diff = dow === 0 ? -6 : 1 - dow;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, [now]);

  // Posición Y de cada actividad en el área de filas (para flechas de dependencia)
  const rowY = useMemo(() => {
    if (!showDeps) return new Map<string, number>();
    const map = new Map<string, number>();
    let y = 0;
    for (const s of stages) {
      const hasMetricsLine = s.activities.some((a) => a.planned_start && a.planned_end);
      y += hasMetricsLine ? 48 : 30; // aprox altura header etapa: 1 línea vs 2 líneas
      if (!collapsed.has(s.id)) {
        for (const a of s.activities) {
          map.set(a.id, y + ROW_H / 2);
          y += ROW_H;
        }
      }
    }
    return map;
  }, [stages, collapsed, showDeps]);

  const range = useMemo(() => {
    const dates: number[] = [];
    for (const a of allActivities) {
      for (const k of [
        a.planned_start, a.planned_end,
        a.actual_start, a.actual_end,
        a.baseline_start, a.baseline_end,
      ]) {
        const d = parseDate(k);
        if (d) dates.push(d.getTime());
      }
    }
    if (dates.length === 0) return null;
    const min = startOfMonth(new Date(Math.min(...dates) - MS_DAY * 7));
    const max = addMonths(startOfMonth(new Date(Math.max(...dates) + MS_DAY * 7)), 1);
    const months: Date[] = [];
    let cur = new Date(min);
    while (cur < max) { months.push(new Date(cur)); cur = addMonths(cur, 1); }
    return { min: min.getTime(), max: max.getTime(), months };
  }, [allActivities]);

  if (allActivities.length === 0) {
    return <div className="text-xs text-slate-500 italic px-2 py-3">Sin actividades para graficar.</div>;
  }
  if (!range) {
    return <div className="text-xs text-slate-500 italic px-2 py-3">Sin fechas. Edita actividades para ver el Gantt.</div>;
  }

  const totalMs = range.max - range.min;
  const todayPct = ((now - range.min) / totalMs) * 100;
  const todayInRange = todayPct >= 0 && todayPct <= 100;

  const monthPx = MONTH_PX[zoom];
  const timelineWidth = monthPx ? range.months.length * monthPx : null;
  const weeks = (zoom === "quarter" || zoom === "semana") ? weekBoundaries(range.min, range.max) : [];
  const days = (zoom === "semana" || zoom === "dia") ? dayBoundaries(range.min, range.max) : [];
  const hasSubRow = zoom !== "fit" && zoom !== "mes";
  const headerH = hasSubRow ? 52 : 36;
  const monthRowH = hasSubRow ? 28 : 36;

  function pct(dateStr: string | null): number | null {
    const d = parseDate(dateStr);
    if (!d) return null;
    return ((d.getTime() - range!.min) / totalMs) * 100;
  }

  function barStyle(start: string | null, end: string | null) {
    const a = pct(start);
    const b = pct(end);
    if (a === null || b === null) return null;
    // Clamp a [0,100]: barras fuera de rango no sangran fuera del timeline div.
    const left = Math.max(0, a);
    const right = Math.min(100, b);
    if (right <= 0 || left >= 100) return null; // totalmente fuera de vista
    return { left: `${left}%`, width: `${Math.max(right - left, 0.8)}%` };
  }

  function scrollToToday() {
    const el = scrollRef.current;
    if (!el || !todayInRange) return;
    if (timelineWidth) {
      const px = (todayPct / 100) * timelineWidth;
      el.scrollLeft = Math.max(0, px - (el.clientWidth - LABEL_W) / 2);
    } else {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  // ─── Navegación teclado ───────────────────────────────────────────────────────
  // ← → : pan 120px · Shift+← → : pan 400px · Home/End : inicio/fin · +/- : zoom
  const ZOOM_ORDER: Zoom[] = ["fit", "mes", "quarter", "semana", "dia"];

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
      case "=": {
        e.preventDefault();
        const idx = ZOOM_ORDER.indexOf(zoom);
        if (idx < ZOOM_ORDER.length - 1) setZoom(ZOOM_ORDER[idx + 1]);
        break;
      }
      case "-": {
        e.preventDefault();
        const idx = ZOOM_ORDER.indexOf(zoom);
        if (idx > 0) setZoom(ZOOM_ORDER[idx - 1]);
        break;
      }
    }
  }

  // ─── Drag-to-pan (mouse) ──────────────────────────────────────────────────────
  // Solo activo cuando hay scroll horizontal (timelineWidth != null).
  // Si el mousedown cae sobre un <button> (barra o milestone) → no paneamos
  // para que el click abra el popover normalmente.
  // Si el usuario mueve >4px antes de soltar → didPan=true → onClickCapture
  // absorbe el click para que el popover no se abra por error.

  function onPanStart(e: React.MouseEvent<HTMLDivElement>) {
    if (e.button !== 0 || !timelineWidth) return;
    if ((e.target as HTMLElement).closest("button")) return;
    const el = scrollRef.current;
    if (!el) return;
    isPanning.current = true;
    didPan.current = false;
    panStartX.current = e.clientX;
    panStartScrollLeft.current = el.scrollLeft;
    el.style.cursor = "grabbing";
    e.preventDefault(); // evita selección de texto durante drag
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
    if (el && timelineWidth) el.style.cursor = "grab";
  }

  // Captura en fase de captura: si hubo pan real, cancela el click en barras.
  function onClickCapture(e: React.MouseEvent) {
    if (didPan.current) {
      e.stopPropagation();
      didPan.current = false;
    }
  }

  async function exportPng() {
    if (!ganttRef.current || exporting) return;
    setExporting(true);
    try {
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(ganttRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const link = document.createElement("a");
      link.download = `gantt-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } finally {
      setExporting(false);
    }
  }

  async function doFreeze() {
    if (!onFreezeBaseline) return;
    setFreezing(true);
    try {
      await onFreezeBaseline();
      setConfirmFreeze(false);
    } finally {
      setFreezing(false);
    }
  }

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      if (storageKey) {
        try { localStorage.setItem(storageKey, JSON.stringify([...n])); } catch {}
      }
      return n;
    });
  }

  function openPopover(e: React.MouseEvent, stageId: string, activity: StageActivity) {
    e.stopPropagation();
    setOverlay({ kind: "popover", stageId, activity, anchor: { x: e.clientX + 8, y: e.clientY - 4 } });
  }

  function showTooltip(e: React.MouseEvent, activity: StageActivity) {
    if (overlay?.kind === "popover") return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setOverlay({ kind: "tooltip", activity, anchor: { x: rect.right + 4, y: rect.top } });
  }

  function hideTooltip() {
    setOverlay((prev) => (prev?.kind === "tooltip" ? null : prev));
  }

  // Desvío: días entre real/plan (positivo=tarde, negativo=adelantado)
  function devDays(a: StageActivity): number | null {
    const plan = parseDate(a.planned_end);
    if (!plan) return null;
    const ref = a.actual_end
      ? parseDate(a.actual_end)
      : a.status === "delayed"
      ? new Date(now)
      : null;
    if (!ref) return null;
    return Math.round((ref.getTime() - plan.getTime()) / MS_DAY);
  }

  function exportCsv() {
    const rows: string[][] = [
      ["Etapa", "Actividad", "Asignado", "Status", "Plan Inicio", "Plan Fin", "Real Inicio", "Real Fin", "Desvío Plan (días)", "Float (días)", "% Avance", "Desv. Baseline (días)"],
    ];
    for (const s of stages) {
      for (const a of s.activities) {
        const dev = devDays(a);
        const floatDays = floatMap.get(a.id) ?? 0;
        const progressStr = a.actual_progress != null ? String(a.actual_progress) : "";
        const baselineDev = a.baseline_end && a.planned_end
          ? String(Math.round((parseDate(a.planned_end)!.getTime() - parseDate(a.baseline_end)!.getTime()) / MS_DAY))
          : "";
        rows.push([
          s.name, a.name, a.assignee_email ?? "", a.status,
          a.planned_start ?? "", a.planned_end ?? "",
          a.actual_start ?? "", a.actual_end ?? "",
          dev !== null ? String(dev) : "",
          String(floatDays),
          progressStr,
          baselineDev,
        ]);
      }
    }
    const bom = "﻿";
    const csv = bom + rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = `gantt-${new Date().toISOString().slice(0, 10)}.csv`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  }

  const tStyle = timelineWidth
    ? { width: timelineWidth, flexShrink: 0 as const }
    : { flex: 1, minWidth: 0 };

  // Sticky solo cuando hay scroll horizontal.
  // z-30 > z-20 (barras real) > z-10 (barras plan) → label siempre encima.
  const stickyBg = timelineWidth ? " sticky left-0 z-30" : "";

  return (
    <>
      {/* ganttRef en el wrapper externo para PNG (captura toolbar+header+filas) */}
      <div ref={ganttRef} className="bg-white border border-slate-200 rounded flex flex-col" style={{ maxHeight: "calc(100vh - 280px)", minHeight: 300 }}>

        {/* ─── Sticky: toolbar + header de fechas ───────────────────────────────
            Fuera del overflow-x-auto para que position:sticky funcione tanto
            vertical (scroll página) como horizontal (header sincronizado via
            transform en lugar de scrollLeft). */}
        <div className="flex-none bg-white border-b border-slate-100 shadow-sm">

          {/* Toolbar — 3 grupos: [Zoom] · [Capas] · [Acciones] */}
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-200 bg-slate-50 flex-wrap">
            {/* Grupo 1: Zoom */}
            <div className="flex items-center gap-0.5">
              {([
                { v: "fit", label: "Ajustar" },
                { v: "mes", label: "Mes" },
                { v: "quarter", label: "Trim." },
                { v: "semana", label: "Sem." },
                { v: "dia", label: "Día" },
              ] as { v: Zoom; label: string }[]).map(({ v, label }) => (
                <button
                  key={v}
                  onClick={() => setZoom(v)}
                  className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest rounded-sm transition-colors ${
                    zoom === v ? "bg-white border border-slate-200 text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {timelineWidth && (
              <span
                className="text-[9px] text-slate-300 select-none font-mono"
                title="Navegar: ← → (pan) · Shift+← → (salto) · +/− (zoom) · Home/End · Arrastra el timeline con el mouse"
              >
                ← → · drag
              </span>
            )}
            {/* Separador */}
            <div className="w-px h-4 bg-slate-200 mx-0.5" aria-hidden />
            {/* Grupo 2: Capas de visualización */}
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setShowFloat((v) => !v)}
                className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest rounded-sm transition-colors ${showFloat ? "bg-slate-200 text-slate-700" : "text-slate-400 hover:text-slate-700"}`}
                title="Holgura: días de buffer disponible por actividad"
              >
                Holgura
              </button>
              <button
                onClick={() => setShowDeps((v) => !v)}
                className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest rounded-sm transition-colors ${showDeps ? "bg-slate-200 text-slate-700" : "text-slate-400 hover:text-slate-700"}`}
                title="Flechas de dependencia entre actividades"
              >
                Dep.
              </button>
              <button
                onClick={() => setShowCriticalPath((v) => !v)}
                className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest rounded-sm transition-colors ${showCriticalPath ? "bg-amber-100 text-amber-700" : "text-slate-400 hover:text-slate-700"}`}
                title="Ruta crítica: cadena de actividades que determina la duración total del proyecto"
              >
                Ruta
              </button>
            </div>
            {/* Grupo 3: Acciones — ml-auto */}
            <div className="flex items-center gap-1.5 ml-auto">
              {todayInRange && (
                <button onClick={scrollToToday} className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-brand-primary-dark transition-colors">
                  <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><circle cx="10" cy="10" r="4" /></svg>
                  Hoy
                </button>
              )}
              {/* Exportar dropdown (PNG + CSV) */}
              <div className="relative">
                <button
                  onClick={() => setShowExportMenu((v) => !v)}
                  className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-700 transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
                  </svg>
                  {exporting ? "..." : "Exportar"}
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showExportMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowExportMenu(false)} />
                    <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-slate-200 rounded shadow-md py-1 w-36">
                      <button
                        onClick={() => { void exportPng(); setShowExportMenu(false); }}
                        disabled={exporting}
                        className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        PNG (imagen)
                      </button>
                      <button
                        onClick={() => { exportCsv(); setShowExportMenu(false); }}
                        className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                      >
                        CSV (Excel)
                      </button>
                    </div>
                  </>
                )}
              </div>
              {isAdmin && onFreezeBaseline && !confirmFreeze && (
                <button onClick={() => setConfirmFreeze(true)} className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-amber-700 transition-colors" title={hasBaseline ? "Ya existe baseline — actualizará el de referencia." : "Congelar fechas plan como baseline de referencia"}>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  {hasBaseline ? "Actualizar baseline" : "Baseline"}
                </button>
              )}
              {confirmFreeze && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-50 border border-amber-200 rounded text-[10px]">
                  <span className="text-amber-700 font-medium">{hasBaseline ? "Sobrescribir baseline?" : "Congelar plan actual como baseline?"}</span>
                  <button onClick={doFreeze} disabled={freezing} className="px-1.5 py-0.5 bg-amber-500 text-white rounded-sm font-bold hover:bg-amber-600 disabled:opacity-50">{freezing ? "..." : "Sí"}</button>
                  <button onClick={() => setConfirmFreeze(false)} className="px-1.5 py-0.5 text-slate-500 hover:text-slate-700">No</button>
                </div>
              )}
            </div>
          </div>

          {/* Header de fechas */}
          <div className="flex border-b border-slate-200 bg-slate-50">
            {/* Columna label — siempre visible */}
            <div style={{ width: LABEL_W, height: headerH }} className="shrink-0 bg-slate-50 px-3 border-r border-slate-200 flex items-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Actividad
            </div>
            {/* Timeline header: overflow:hidden + translateX sync (no scrollbar propio) */}
            <div style={{ flex: 1, overflow: "hidden", height: headerH }}>
              <div ref={headerTimelineInnerRef} className="relative h-full" style={{ width: timelineWidth ?? "100%" }}>
                {/* Fila 1: meses */}
                {range.months.map((m, i) => {
                  const left = ((m.getTime() - range.min) / totalMs) * 100;
                  const next = i + 1 < range.months.length ? range.months[i + 1] : new Date(range.max);
                  const width = ((next.getTime() - m.getTime()) / totalMs) * 100;
                  return (
                    <div key={i} className="absolute border-r border-slate-200 px-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 truncate flex items-center" style={{ left: `${left}%`, width: `${width}%`, top: 0, height: monthRowH }}>
                      {fmtMonth(m)}
                    </div>
                  );
                })}
                {hasSubRow && <div className="absolute left-0 right-0 border-t border-slate-100" style={{ top: monthRowH }} />}
                {(zoom === "quarter" || zoom === "semana") && weeks.map((wt, i) => {
                  const nextWt = i + 1 < weeks.length ? weeks[i + 1] : range.max;
                  const left = ((wt - range.min) / totalMs) * 100;
                  const width = ((nextWt - wt) / totalMs) * 100;
                  return (
                    <div key={i} className="absolute border-r border-slate-100 px-1 text-[9px] text-slate-500 font-medium flex items-center truncate" style={{ left: `${left}%`, width: `${width}%`, top: monthRowH, bottom: 0 }}>
                      {new Date(wt).toLocaleDateString("es-MX", { day: "2-digit", month: "numeric" })}
                    </div>
                  );
                })}
                {zoom === "dia" && days.map((dt, i) => {
                  const left = ((dt - range.min) / totalMs) * 100;
                  const width = (MS_DAY / totalMs) * 100;
                  const d = new Date(dt);
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  return (
                    <div key={i} className={`absolute border-r border-slate-100 flex flex-col items-center justify-center ${isWeekend ? "bg-slate-100/60 text-slate-400" : "text-slate-600"}`} style={{ left: `${left}%`, width: `${width}%`, top: monthRowH, bottom: 0 }}>
                      <span className="text-[9px] font-bold leading-tight">{DOW[d.getDay()]}</span>
                      <span className="text-[9px] leading-tight">{String(d.getDate()).padStart(2, "0")}</span>
                    </div>
                  );
                })}
                {todayInRange && (
                  <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: `${todayPct}%` }}>
                    <div className="absolute top-0 bottom-0 border-l border-rose-400/60" />
                    <div className="absolute -translate-x-1/2 px-1 rounded-sm bg-rose-50 border border-rose-200 text-[9px] font-bold text-rose-600 whitespace-nowrap z-10 leading-4" style={{ top: 3 }}>
                      {new Date(now).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>{/* /sticky */}

        {/* ─── Filas scrollables (flex-1, ambos ejes) ─── */}
        <div
          ref={scrollRef}
          className={`flex-1 min-h-0 ${timelineWidth ? "overflow-auto" : "overflow-hidden"} focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 focus-visible:ring-inset`}
          style={timelineWidth ? { cursor: "grab" } : undefined}
          tabIndex={timelineWidth ? 0 : undefined}
          onScroll={(e) => {
            // Sync header timeline via transform (sin re-render React)
            if (headerTimelineInnerRef.current) {
              headerTimelineInnerRef.current.style.transform = `translateX(-${e.currentTarget.scrollLeft}px)`;
            }
          }}
          onKeyDown={onKeyDown}
          onMouseDown={onPanStart}
          onMouseMove={onPanMove}
          onMouseUp={onPanEnd}
          onMouseLeave={onPanEnd}
          onClickCapture={onClickCapture}
        >
          <div style={timelineWidth ? { minWidth: LABEL_W + timelineWidth } : undefined}>
            {/* ─── Filas ─── */}
            <div className="divide-y divide-slate-200 relative">
              {/* Flechas de dependencia (SVG sobre área timeline, pointer-events:none) */}
              {showDeps && timelineWidth && (() => {
                const arrows: React.ReactNode[] = [];
                let totalH = 0;
                for (const s of stages) {
                  const hm = s.activities.some((a) => a.planned_start && a.planned_end);
                  totalH += hm ? 48 : 30;
                  if (!collapsed.has(s.id)) totalH += s.activities.length * ROW_H;
                }
                for (const a of allActivities) {
                  if (!a.depends_on_activity_id) continue;
                  const dep = allActivities.find((x) => x.id === a.depends_on_activity_id);
                  if (!dep || !dep.planned_end || !a.planned_start) continue;
                  const y1 = rowY.get(dep.id);
                  const y2 = rowY.get(a.id);
                  const x1pct = pct(dep.planned_end);
                  const x2pct = pct(a.planned_start);
                  if (y1 == null || y2 == null || x1pct == null || x2pct == null) continue;
                  const x1 = (x1pct / 100) * timelineWidth;
                  const x2 = (x2pct / 100) * timelineWidth;
                  const mx = (x1 + x2) / 2;
                  const isConflict = a.planned_start < dep.planned_end;
                  const arrowId = isConflict ? `arrowhead-rose-${uid}` : `arrowhead-gray-${uid}`;
                  arrows.push(
                    <polyline
                      key={`${dep.id}-${a.id}`}
                      points={`${x1.toFixed(1)},${y1.toFixed(1)} ${mx.toFixed(1)},${y1.toFixed(1)} ${mx.toFixed(1)},${y2.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`}
                      fill="none"
                      stroke={isConflict ? "#f43f5e" : "#94a3b8"}
                      strokeWidth={1.5}
                      strokeDasharray={isConflict ? undefined : "4 2"}
                      markerEnd={`url(#${arrowId})`}
                      opacity={0.75}
                    />
                  );
                }
                if (arrows.length === 0) return null;
                return (
                  <svg
                    className="absolute pointer-events-none z-30"
                    style={{ left: LABEL_W, top: 0, width: timelineWidth, height: totalH, overflow: "visible" }}
                  >
                    <defs>
                      <marker id={`arrowhead-gray-${uid}`} markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                        <polygon points="0 0, 6 2, 0 4" fill="#94a3b8" />
                      </marker>
                      <marker id={`arrowhead-rose-${uid}`} markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                        <polygon points="0 0, 6 2, 0 4" fill="#f43f5e" />
                      </marker>
                    </defs>
                    {arrows}
                  </svg>
                );
              })()}
              {stages.map((s) => {
                const isCollapsed = collapsed.has(s.id);
                const stageDone = s.activities.filter((a) => a.status === "completed").length;
                const stageDelayed = s.activities.filter((a) => a.status === "delayed").length;
                const stageActive = s.activities.filter((a) => a.status === "in_progress").length;
                const stageTotal = s.activities.length;
                const stagePct = stageTotal > 0 ? Math.round((stageDone / stageTotal) * 100) : 0;
                const stageRag: "red" | "amber" | "green" =
                  stageDelayed > 0 ? "red" : stageActive > 0 ? "amber" : "green";

                // Duración etapa: span de fechas plan y real
                const actsWithPlan = s.activities.filter((a) => a.planned_start && a.planned_end);
                const plannedDays = actsWithPlan.length > 0
                  ? Math.round((Math.max(...actsWithPlan.map((a) => parseDate(a.planned_end)!.getTime())) -
                      Math.min(...actsWithPlan.map((a) => parseDate(a.planned_start)!.getTime()))) / MS_DAY) + 1
                  : null;
                const actsWithReal = s.activities.filter((a) => a.actual_start);
                const actualDays = actsWithReal.length > 0
                  ? Math.round((Math.max(...actsWithReal.map((a) => {
                      if (a.actual_end) return parseDate(a.actual_end)!.getTime();
                      if (a.status === "in_progress" || a.status === "delayed") return now;
                      return parseDate(a.actual_start)!.getTime();
                    })) - Math.min(...actsWithReal.map((a) => parseDate(a.actual_start)!.getTime()))) / MS_DAY) + 1
                  : null;
                const daysOver = actualDays !== null && plannedDays !== null && actualDays > plannedDays;

                // SPI (Schedule Performance Index) = % completado / % tiempo transcurrido
                // Solo significativo cuando hay fechas plan y >5% del tiempo ha pasado
                const planMinTs = actsWithPlan.length > 0
                  ? Math.min(...actsWithPlan.map((a) => parseDate(a.planned_start)!.getTime()))
                  : null;
                const planMaxTs = actsWithPlan.length > 0
                  ? Math.max(...actsWithPlan.map((a) => parseDate(a.planned_end)!.getTime()))
                  : null;
                let stageSpi: number | null = null;
                let stageForecastEnd: Date | null = null;
                if (planMinTs !== null && planMaxTs !== null && planMaxTs > planMinTs && stagePct > 0) {
                  const totalPlanMs = planMaxTs - planMinTs;
                  const elapsedPct = Math.min(Math.max((now - planMinTs) / totalPlanMs, 0), 1);
                  if (elapsedPct >= 0.05) {
                    stageSpi = Math.min((stagePct / 100) / elapsedPct, 2);
                    if (stageSpi > 0 && stageSpi < 2 && stagePct < 100) {
                      stageForecastEnd = new Date(planMinTs + totalPlanMs / stageSpi);
                    }
                  }
                }

                return (
                  <div key={s.id}>
                    {/* Etapa header — columna sticky siempre visible en scroll horizontal */}
                    <div className="flex bg-slate-100/70 border-t border-slate-200">
                      <div style={{ width: LABEL_W }} className={`shrink-0${stickyBg} bg-slate-100/70 border-r border-slate-200 min-w-0`}>
                        <div className="flex items-center gap-1.5 px-3 py-1.5">
                          <button onClick={() => toggleCollapse(s.id)} className="shrink-0 w-4 h-4 flex items-center justify-center text-slate-400 hover:text-slate-700">
                            <svg className={`w-3 h-3 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                          <span
                            className={`shrink-0 w-1.5 h-1.5 rounded-full ${stageRag === "red" ? "bg-rose-500" : stageRag === "amber" ? "bg-amber-400" : "bg-emerald-400"}`}
                            title={stageRag === "red" ? "Retrasada" : stageRag === "amber" ? "En progreso" : "Al día"}
                          />
                          <span className="text-xs font-bold text-slate-700 truncate">{s.name}</span>
                          <span className={`shrink-0 ml-auto text-[10px] font-bold tabular-nums ${stagePct === 100 ? "text-emerald-600" : "text-slate-400"}`}>
                            {stagePct}%
                          </span>
                        </div>
                        {(plannedDays !== null || stageSpi !== null) && (
                          <div className="flex items-center gap-2 px-3 pb-1.5 pl-7">
                            {plannedDays !== null && (
                              <span
                                className={`text-[9px] tabular-nums font-bold whitespace-nowrap ${
                                  daysOver ? "text-rose-600" : actualDays !== null ? "text-emerald-600" : "text-slate-400"
                                }`}
                                title={`Duración etapa — Planeado: ${plannedDays} días${actualDays !== null ? ` / Real: ${actualDays} días` : ""}`}
                              >
                                {plannedDays}d{actualDays !== null ? ` / ${actualDays}d` : ""}
                              </span>
                            )}
                            {stageSpi !== null && (
                              <span
                                className={`text-[9px] tabular-nums font-bold whitespace-nowrap px-1 rounded-sm ${
                                  stageSpi >= 1.0 ? "text-emerald-700 bg-emerald-50" :
                                  stageSpi >= 0.8 ? "text-amber-700 bg-amber-50" :
                                  "text-rose-600 bg-rose-50"
                                }`}
                                title={`SPI ${stageSpi.toFixed(2)} — ${stageSpi >= 1 ? "Adelantado o en tiempo" : stageSpi >= 0.8 ? "Leve retraso" : "Riesgo alto de retraso"}${stageForecastEnd ? ` · Est. fin: ${stageForecastEnd.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "2-digit" })}` : ""}`}
                              >
                                SPI {stageSpi.toFixed(1)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      {/* Barra de span de etapa en área de timeline */}
                      <div className="relative overflow-hidden" style={{ ...tStyle, alignSelf: "stretch" }}>
                        {actsWithPlan.length > 0 && (() => {
                          const minStart = actsWithPlan.reduce((m, a) =>
                            a.planned_start! < m ? a.planned_start! : m,
                            actsWithPlan[0].planned_start!
                          );
                          const maxEnd = actsWithPlan.reduce((m, a) =>
                            a.planned_end! > m ? a.planned_end! : m,
                            actsWithPlan[0].planned_end!
                          );
                          const spanStyle = barStyle(minStart, maxEnd);
                          if (!spanStyle) return null;
                          return (
                            <div
                              className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-sm overflow-hidden bg-slate-200"
                              style={spanStyle}
                              title={`Etapa: ${minStart} → ${maxEnd} · ${stagePct}% completado`}
                            >
                              <div
                                className={`h-full ${stagePct === 100 ? "bg-emerald-400" : stageRag === "red" ? "bg-rose-400/70" : "bg-brand-primary/50"}`}
                                style={{ width: `${stagePct}%` }}
                              />
                            </div>
                          );
                        })()}
                        {todayInRange && (
                          <div
                            className="absolute top-0 bottom-0 border-l border-rose-400/30 pointer-events-none"
                            style={{ left: `${todayPct}%` }}
                          />
                        )}
                      </div>
                    </div>

                    {/* Actividades */}
                    {!isCollapsed && s.activities.map((a) => {
                      const isMilestone = !!a.planned_start && !!a.planned_end && a.planned_start === a.planned_end;
                      const planStyle = isMilestone ? null : barStyle(a.planned_start, a.planned_end);
                      const realStyle = barStyle(a.actual_start, a.actual_end);
                      const baselineStyle = barStyle(a.baseline_start, a.baseline_end);
                      const barColor = STATUS_BAR[a.status];
                      const isOnRisk = atRisk.has(a.id);
                      const noFechas = !a.planned_start && !a.planned_end;
                      const dep = a.depends_on_activity_id ? allActivities.find((x) => x.id === a.depends_on_activity_id) : null;
                      const conflict = !!(dep && a.planned_start && dep.planned_end && a.planned_start < dep.planned_end);
                      const dev = devDays(a);

                      return (
                        <div key={a.id} className={`flex hover:bg-slate-50/80 transition-colors${isOnRisk ? " bg-rose-50/30" : ""}`}>
                          {/* Label */}
                          <div
                            style={{ width: LABEL_W }}
                            className={`shrink-0${stickyBg} bg-white px-3 py-2 border-r border-slate-200 min-w-0 cursor-default`}
                            onMouseEnter={(e) => showTooltip(e, a)}
                            onMouseLeave={hideTooltip}
                          >
                            <div className="flex items-center gap-1 min-w-0">
                              {isOnRisk && (
                                <svg className="shrink-0 w-3 h-3 text-rose-500" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                                </svg>
                              )}
                              {isMilestone && (
                                <svg className="shrink-0 w-3 h-3 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                                  <path d="M10 1l2.928 5.941L19 8l-4.5 4.385L15.618 19 10 16.118 4.382 19l1.118-6.615L1 8l6.072-1.059L10 1z" />
                                </svg>
                              )}
                              <p className="text-xs font-medium text-slate-900 truncate">{a.name}</p>
                              {dev !== null && dev !== 0 && (
                                <span className={`shrink-0 text-[9px] font-bold tabular-nums px-0.5 rounded-sm ${dev > 0 ? "text-rose-600 bg-rose-50" : "text-emerald-700 bg-emerald-50"}`}>
                                  {dev > 0 ? `+${dev}d` : `${dev}d`}
                                </span>
                              )}
                            </div>
                            {a.assignee_email && (
                              <p className="text-[10px] text-slate-500 truncate pl-4" title={a.assignee_email}>
                                @ {a.assignee_email.split("@")[0]}
                              </p>
                            )}
                            {noFechas && (
                              <span className="inline-flex items-center gap-0.5 mt-0.5 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-sm bg-amber-50 text-amber-700 border border-amber-200">
                                Sin plan
                              </span>
                            )}
                            {dep && (
                              <p className={`text-[10px] pl-4 flex items-center gap-0.5 ${conflict ? "text-rose-700 font-bold" : "text-slate-400"}`}>
                                {conflict ? (
                                  <svg className="shrink-0 w-3 h-3 text-rose-500" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                                  </svg>
                                ) : (
                                  <span className="shrink-0">↳</span>
                                )}
                                <span className="truncate">{dep.name}</span>
                              </p>
                            )}
                          </div>

                          {/* Timeline */}
                          <div className="relative" style={{ ...tStyle, height: ROW_H }}>
                            {range.months.map((m, i) => (
                              <div key={i} className="absolute top-0 bottom-0 border-r border-slate-100" style={{ left: `${((m.getTime() - range.min) / totalMs) * 100}%`, width: 0 }} />
                            ))}
                            {weeks.map((wt, i) => (
                              <div key={i} className="absolute top-0 bottom-0 pointer-events-none" style={{ left: `${((wt - range.min) / totalMs) * 100}%`, width: 0, borderLeft: "1px dashed rgba(148,163,184,0.35)" }} />
                            ))}
                            {days.map((dt, i) => {
                              const left = ((dt - range.min) / totalMs) * 100;
                              const d = new Date(dt);
                              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                              return (
                                <div key={i} className="absolute top-0 bottom-0 pointer-events-none" style={{
                                  left: `${left}%`,
                                  width: zoom === "dia" ? `${(MS_DAY / totalMs) * 100}%` : 0,
                                  borderLeft: zoom === "dia" ? (isWeekend ? "1px solid rgba(148,163,184,0.5)" : "1px solid rgba(148,163,184,0.3)") : "1px dashed rgba(148,163,184,0.25)",
                                  background: zoom === "dia" && isWeekend ? "rgba(226,232,240,0.35)" : undefined,
                                }} />
                              );
                            })}
                            {/* Banda semana actual */}
                            {todayInRange && (
                              <div
                                className="absolute top-0 bottom-0 pointer-events-none"
                                style={{
                                  left: `${((todayWeekStart - range.min) / totalMs) * 100}%`,
                                  width: `${(7 * MS_DAY / totalMs) * 100}%`,
                                  background: "rgba(251,113,133,0.04)",
                                }}
                              />
                            )}
                            {todayInRange && (
                              <div className="absolute top-0 bottom-0 border-l border-rose-400/60 pointer-events-none" style={{ left: `${todayPct}%`, width: 0 }} />
                            )}
                            {isOnRisk && (
                              <div className="absolute inset-0 pointer-events-none" style={{ background: "repeating-linear-gradient(135deg,transparent,transparent 4px,rgba(251,113,133,0.07) 4px,rgba(251,113,133,0.07) 8px)" }} />
                            )}
                            {isMilestone && (() => {
                              const p = pct(a.planned_start);
                              if (p === null) return null;
                              return <button onClick={(e) => openPopover(e, s.id, a)} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rotate-45 bg-amber-400 border-2 border-amber-600 hover:bg-amber-300 transition-colors z-20" style={{ left: `${p}%` }} title={`Hito: ${fmtShort(a.planned_start)}`} />;
                            })()}
                            {baselineStyle && (
                              <div className="absolute h-1.5 rounded pointer-events-none z-[5]" style={{ ...baselineStyle, top: 6, background: "repeating-linear-gradient(90deg,#f97316 0,#f97316 4px,transparent 4px,transparent 8px)", opacity: 0.7 }} title={`Baseline: ${fmtShort(a.baseline_start)} → ${fmtShort(a.baseline_end)}`} />
                            )}
                            {planStyle && (
                              <button
                                onClick={(e) => openPopover(e, s.id, a)}
                                className={`absolute h-4 rounded border-2 bg-white/80 hover:opacity-80 transition-all z-10 ${
                                  criticalPathIds.has(a.id)
                                    ? "border-amber-500 bg-amber-50/80"
                                    : isOnRisk
                                    ? "border-rose-400"
                                    : "border-slate-400 hover:border-brand-primary"
                                }`}
                                style={{ ...planStyle, top: 10 }}
                                title={`Plan: ${fmtShort(a.planned_start)} → ${fmtShort(a.planned_end)}${criticalPathIds.has(a.id) ? " · Ruta crítica" : ""}`}
                              />
                            )}
                            {showFloat && (() => {
                              const floatDays = floatMap.get(a.id);
                              if (!floatDays || !a.planned_end) return null;
                              const floatEnd = new Date(parseDate(a.planned_end)!.getTime() + floatDays * MS_DAY);
                              const floatStyle = barStyle(a.planned_end, floatEnd.toISOString().slice(0, 10));
                              if (!floatStyle) return null;
                              return (
                                <div
                                  className="absolute h-1.5 pointer-events-none z-[9]"
                                  style={{
                                    ...floatStyle,
                                    top: 17,
                                    background: "repeating-linear-gradient(90deg,rgba(148,163,184,0.5) 0,rgba(148,163,184,0.5) 3px,transparent 3px,transparent 6px)",
                                  }}
                                  title={`Holgura: ${floatDays}d`}
                                />
                              );
                            })()}
                            {realStyle ? (
                              <button onClick={(e) => openPopover(e, s.id, a)} className={`absolute h-3 rounded overflow-hidden ${barColor} hover:opacity-90 z-20`} style={{ ...realStyle, top: 13 }} title={`Real: ${fmtShort(a.actual_start)} → ${fmtShort(a.actual_end)} · ${STATUS_LABEL[a.status]}${a.actual_progress != null ? ` · ${a.actual_progress}%` : ""}`}>
                                {a.actual_progress != null && a.actual_progress < 100 && (
                                  <div className="absolute top-0 right-0 bottom-0 bg-white/40" style={{ width: `${100 - a.actual_progress}%` }} />
                                )}
                                {a.actual_progress != null && a.actual_progress >= 20 && (
                                  <span className="absolute inset-0 flex items-center justify-center text-[7px] font-bold text-white/90 leading-none pointer-events-none tabular-nums">
                                    {a.actual_progress}%
                                  </span>
                                )}
                              </button>
                            ) : planStyle ? (
                              <button onClick={(e) => openPopover(e, s.id, a)} className="absolute h-2 rounded border border-dashed border-slate-300 bg-transparent hover:border-brand-primary z-20" style={{ ...planStyle, top: 14 }} title="Sin fechas reales — click para registrar" />
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* ─── Leyenda ─── */}
            <div className="border-t border-slate-100 bg-slate-50 px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-slate-600">
              {hasBaseline && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-4 h-1.5 rounded" style={{ background: "repeating-linear-gradient(90deg,#f97316 0,#f97316 4px,transparent 4px,transparent 8px)" }} />
                  Baseline
                </span>
              )}
              <span className="inline-flex items-center gap-1.5"><span className="w-4 h-2.5 border-2 border-slate-400 bg-white rounded-sm" />Plan</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-4 h-2.5 bg-slate-300 rounded-sm" />Pendiente</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-4 h-2.5 bg-brand-primary rounded-sm" />En curso</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-4 h-2.5 bg-emerald-500 rounded-sm" />Completada</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-4 h-2.5 bg-rose-500 rounded-sm" />Retrasada</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rotate-45 bg-amber-400 border-2 border-amber-600 inline-block" />Hito</span>
              <span className="inline-flex items-center gap-1.5">
                <svg className="w-3 h-3 text-rose-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
                Ruta crítica
              </span>
              {todayInRange && <span className="inline-flex items-center gap-1.5"><span className="w-px h-3 bg-rose-400/60" />Hoy</span>}
              {showFloat && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-4 h-1.5 inline-block" style={{ background: "repeating-linear-gradient(90deg,rgba(148,163,184,0.5) 0,rgba(148,163,184,0.5) 3px,transparent 3px,transparent 6px)" }} />
                  Holgura
                </span>
              )}
              {showDeps && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-4 h-0 inline-block border-b border-dashed border-slate-400" />
                  Dependencia
                </span>
              )}
              {showCriticalPath && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-4 h-2.5 border-2 border-amber-500 bg-amber-50/80 rounded-sm" />
                  Ruta crítica
                </span>
              )}
            </div>
          </div>
        </div>{/* /scrollRef */}

      </div>{/* /ganttRef */}

      {overlay?.kind === "tooltip" && <RichTooltip activity={overlay.activity} anchor={overlay.anchor} />}
      {overlay?.kind === "popover" && (
        <QuickActionPopover
          activity={overlay.activity}
          anchor={overlay.anchor}
          onClose={() => setOverlay(null)}
          onEditFull={() => onEditActivity(overlay.stageId, overlay.activity)}
          onQuickAction={onQuickAction}
          isAdmin={isAdmin}
        />
      )}
    </>
  );
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

function RichTooltip({ activity: a, anchor }: { activity: StageActivity; anchor: { x: number; y: number } }) {
  const x = Math.min(anchor.x, window.innerWidth - 220);
  const y = Math.min(anchor.y, window.innerHeight - 210);
  return (
    <div className="fixed z-50 bg-white border border-slate-200 rounded shadow-md p-3 w-56 pointer-events-none" style={{ top: y, left: x }}>
      <p className="text-[10px] font-bold text-slate-800 mb-2 truncate">{a.name}</p>
      <div className="space-y-1 text-[10px] text-slate-600">
        {a.baseline_start && <><TRow label="Baseline inicio" value={fmtShort(a.baseline_start)} /><TRow label="Baseline fin" value={fmtShort(a.baseline_end)} /></>}
        <TRow label="Plan inicio" value={fmtShort(a.planned_start)} />
        <TRow label="Plan fin" value={fmtShort(a.planned_end)} />
        <TRow label="Real inicio" value={fmtShort(a.actual_start)} />
        <TRow label="Real fin" value={fmtShort(a.actual_end)} />
        {a.actual_progress != null && (
          <div className="pt-1">
            <div className="flex justify-between mb-0.5"><span>Progreso</span><span className="font-bold text-slate-700">{a.actual_progress}%</span></div>
            <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-brand-primary rounded-full" style={{ width: `${a.actual_progress}%` }} />
            </div>
          </div>
        )}
      </div>
      <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px]">
        <span className="text-slate-500">Status</span>
        <span className={`font-bold ${STATUS_TEXT[a.status]}`}>{STATUS_LABEL[a.status]}</span>
      </div>
      {a.assignee_email && <div className="mt-1 pt-1 border-t border-slate-100 text-[10px] text-slate-500 truncate">@ {a.assignee_email}</div>}
    </div>
  );
}

function TRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span>{label}</span><span className="font-medium text-slate-700">{value}</span>
    </div>
  );
}
