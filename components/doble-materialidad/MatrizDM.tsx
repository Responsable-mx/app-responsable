"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { IroInventoryItem } from "@/lib/dm/iro-generation";
import { extractEsrsCode } from "@/lib/dm/esg-classify";
import { type Quadrant, scoreToAxis, classifyQuadrant } from "@/lib/dm/materiality-quadrant";

// ── Tipos internos ────────────────────────────────────────────────────────────

type TemaPoint = {
  tema_esg: string;
  x: number;           // coord financiero 0-10 (derivado de score 1-5 o pos_x override)
  y: number;           // coord impacto    0-10 (derivado de score 1-5 o pos_y override)
  quadrant: Quadrant;
  score_consolidado: number;  // max(score_impacto, score_financiero) 1-5 — usado para ranking
  numero: number;      // 1-N por score_consolidado desc
  idx: number;         // índice original (para jitter)
  hasOverride: boolean; // algún IRO del tema con pos manual
};

type Popover = {
  tema: TemaPoint;
  svgX: number;        // coordenada SVG para posicionamiento
  svgY: number;
};

// ── Prop ──────────────────────────────────────────────────────────────────────

type Props = {
  iros: IroInventoryItem[];
  onGoToIros?: () => void;
};

// ── Constantes de layout SVG ──────────────────────────────────────────────────

const SVG_W  = 560;
const SVG_H  = 480;
const LEFT   = 70;
const RIGHT  = 20;
const TOP    = 20;
const BOTTOM = 60;
const PLOT_W = SVG_W - LEFT - RIGHT;   // 470
const PLOT_H = SVG_H - TOP - BOTTOM;   // 400

// ── Etiquetas y colores de cuadrante ──────────────────────────────────────────

const QUADRANT_META: Record<
  Quadrant,
  { label: string; fill: string; stroke: string; bgFill: string; pillActive: string; pillText: string; listText: string }
> = {
  doble_material:   { label: "Doble material",        fill: "#fda4af", stroke: "#f43f5e", bgFill: "#f43f5e", pillActive: "bg-rose-100 text-rose-700 border-rose-300",   pillText: "text-rose-700",  listText: "text-rose-600"  },
  solo_impacto:     { label: "Material por impacto",  fill: "#fcd34d", stroke: "#d97706", bgFill: "#d97706", pillActive: "bg-amber-100 text-amber-700 border-amber-300", pillText: "text-amber-700", listText: "text-amber-600" },
  solo_financiero:  { label: "Material financiero",   fill: "#99f6e4", stroke: "#0d9488", bgFill: "#0d9488", pillActive: "bg-teal-100 text-teal-700 border-teal-300",   pillText: "text-teal-700",  listText: "text-teal-600"  },
  en_seguimiento:   { label: "En seguimiento",        fill: "#cbd5e1", stroke: "#64748b", bgFill: "#64748b", pillActive: "bg-slate-100 text-slate-700 border-slate-300", pillText: "text-slate-700", listText: "text-slate-600" },
};

const FILTER_OPTIONS: Array<{ value: "todos" | Quadrant; label: string }> = [
  { value: "todos",           label: "Todos" },
  { value: "doble_material",  label: "Doble material" },
  { value: "solo_impacto",    label: "Solo impacto" },
  { value: "solo_financiero", label: "Solo financiero" },
  { value: "en_seguimiento",  label: "En seguimiento" },
];

// ── Helpers de coordenadas ────────────────────────────────────────────────────
// scoreToAxis + classifyQuadrant viven en @/lib/dm/materiality-quadrant (fuente
// única compartida con DoubleMaterialidadTab). mapX/mapY posicionan en el SVG.

function mapX(axisValue: number): number {
  return LEFT + (axisValue / 10) * PLOT_W;
}

function mapY(axisValue: number): number {
  return TOP + PLOT_H - (axisValue / 10) * PLOT_H;
}

// ── Shapes SVG ────────────────────────────────────────────────────────────────

type ShapeProps = {
  cx: number; cy: number; fill: string; stroke: string; num: number;
  dimmed: boolean; label: string;
  onClick: () => void; onMouseEnter: () => void; onMouseLeave: () => void;
};

function dotGroupProps(p: ShapeProps) {
  return {
    role: "button" as const,
    tabIndex: p.dimmed ? -1 : 0,
    "aria-label": p.label,
    onClick: p.onClick,
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); p.onClick(); } },
    onMouseEnter: p.onMouseEnter,
    onMouseLeave: p.onMouseLeave,
    style: { cursor: "pointer", opacity: p.dimmed ? 0.12 : 1 },
  };
}

function ShapeCircle(p: ShapeProps) {
  return (
    <g {...dotGroupProps(p)}>
      <circle cx={p.cx} cy={p.cy} r={7} fill={p.fill} stroke={p.stroke} strokeWidth={1.5} />
      <text x={p.cx} y={p.cy} fontSize={7} textAnchor="middle" dominantBaseline="middle" fill="white" fontWeight="700">
        {p.num}
      </text>
    </g>
  );
}

function ShapeDiamond(p: ShapeProps) {
  const s = 8;
  const pts = `${p.cx},${p.cy - s} ${p.cx + s},${p.cy} ${p.cx},${p.cy + s} ${p.cx - s},${p.cy}`;
  return (
    <g {...dotGroupProps(p)}>
      <polygon points={pts} fill={p.fill} stroke={p.stroke} strokeWidth={1.5} />
      <text x={p.cx} y={p.cy} fontSize={7} textAnchor="middle" dominantBaseline="middle" fill="white" fontWeight="700">
        {p.num}
      </text>
    </g>
  );
}

function ShapeSquare(p: ShapeProps) {
  const s = 6.5;
  return (
    <g {...dotGroupProps(p)}>
      <rect x={p.cx - s} y={p.cy - s} width={13} height={13} fill={p.fill} stroke={p.stroke} strokeWidth={1.5} />
      <text x={p.cx} y={p.cy} fontSize={7} textAnchor="middle" dominantBaseline="middle" fill="white" fontWeight="700">
        {p.num}
      </text>
    </g>
  );
}

function ShapeTriangle(p: ShapeProps) {
  const s = 8;
  const pts = `${p.cx},${p.cy - s} ${p.cx + s},${p.cy + s} ${p.cx - s},${p.cy + s}`;
  return (
    <g {...dotGroupProps(p)}>
      <polygon points={pts} fill={p.fill} stroke={p.stroke} strokeWidth={1.5} />
      <text x={p.cx} y={p.cy + 2} fontSize={7} textAnchor="middle" dominantBaseline="middle" fill="white" fontWeight="700">
        {p.num}
      </text>
    </g>
  );
}

function DotShape(props: {
  quadrant: Quadrant;
  cx: number; cy: number; num: number; dimmed: boolean; label: string;
  onClick: () => void; onMouseEnter: () => void; onMouseLeave: () => void;
}) {
  const meta = QUADRANT_META[props.quadrant];
  const sharedProps: ShapeProps = {
    cx: props.cx, cy: props.cy,
    fill: meta.fill, stroke: meta.stroke,
    num: props.num, dimmed: props.dimmed, label: props.label,
    onClick: props.onClick,
    onMouseEnter: props.onMouseEnter,
    onMouseLeave: props.onMouseLeave,
  };
  switch (props.quadrant) {
    case "doble_material":  return <ShapeCircle   {...sharedProps} />;
    case "solo_impacto":    return <ShapeDiamond  {...sharedProps} />;
    case "solo_financiero": return <ShapeSquare   {...sharedProps} />;
    case "en_seguimiento":  return <ShapeTriangle {...sharedProps} />;
  }
}

// ── Icono pequeño para leyenda e índice ───────────────────────────────────────

function MiniShape({ quadrant }: { quadrant: Quadrant }) {
  const meta = QUADRANT_META[quadrant];
  const size = 12;
  switch (quadrant) {
    case "doble_material":
      return (
        <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden>
          <circle cx={6} cy={6} r={5} fill={meta.fill} stroke={meta.stroke} strokeWidth={1.5} />
        </svg>
      );
    case "solo_impacto":
      return (
        <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden>
          <polygon points="6,1 11,6 6,11 1,6" fill={meta.fill} stroke={meta.stroke} strokeWidth={1.5} />
        </svg>
      );
    case "solo_financiero":
      return (
        <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden>
          <rect x={1} y={1} width={10} height={10} fill={meta.fill} stroke={meta.stroke} strokeWidth={1.5} />
        </svg>
      );
    case "en_seguimiento":
      return (
        <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden>
          <polygon points="6,1 11,11 1,11" fill={meta.fill} stroke={meta.stroke} strokeWidth={1.5} />
        </svg>
      );
  }
}

// ── Componente principal ──────────────────────────────────────────────────────

export function MatrizDM({ iros, onGoToIros }: Props) {
  const [activeFilter, setActiveFilter] = useState<"todos" | Quadrant>("todos");
  const [popover, setPopover]           = useState<Popover | null>(null);
  const [hovered, setHovered]           = useState<string | null>(null);
  const [highlighted, setHighlighted]   = useState<string | null>(null);
  const svgRef    = useRef<SVGSVGElement>(null);
  const indexRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // ── 1. Filtrar IROs válidos ─────────────────────────────────────────────────
  const validIros = useMemo(
    () => iros.filter((i) => i.incluido && i.score_impacto !== null && i.score_financiero !== null),
    [iros],
  );

  // ── 2. Agrupar por tema_esg → max coords (0-10) y max scores (1-3) ─────────
  // Usa pos_x/pos_y manual si existen; sino deriva del score 1-3.
  type TemaAgg = {
    maxAxisX: number;       // 0-10 (financiero)
    maxAxisY: number;       // 0-10 (impacto)
    maxScoreImpacto: number;    // 1-3 (para ranking score_consolidado)
    maxScoreFinanciero: number; // 1-3
    hasOverride: boolean;
  };
  const temaMap = useMemo(() => {
    const map = new Map<string, TemaAgg>();
    for (const iro of validIros) {
      const si = iro.score_impacto as number;
      const sf = iro.score_financiero as number;
      const axisX = iro.pos_x ?? scoreToAxis(sf);
      const axisY = iro.pos_y ?? scoreToAxis(si);
      const isOverride = iro.pos_override === true;
      const current = map.get(iro.tema_esg);
      if (!current) {
        map.set(iro.tema_esg, {
          maxAxisX: axisX,
          maxAxisY: axisY,
          maxScoreImpacto: si,
          maxScoreFinanciero: sf,
          hasOverride: isOverride,
        });
      } else {
        map.set(iro.tema_esg, {
          maxAxisX: Math.max(current.maxAxisX, axisX),
          maxAxisY: Math.max(current.maxAxisY, axisY),
          maxScoreImpacto: Math.max(current.maxScoreImpacto, si),
          maxScoreFinanciero: Math.max(current.maxScoreFinanciero, sf),
          hasOverride: current.hasOverride || isOverride,
        });
      }
    }
    return map;
  }, [validIros]);

  // ── 3. Construir puntos con cuadrante, score consolidado y número ───────────
  const points: TemaPoint[] = useMemo(() => {
    const raw = Array.from(temaMap.entries()).map(([tema_esg, agg], idx) => ({
      tema_esg,
      x:                agg.maxAxisX,
      y:                agg.maxAxisY,
      quadrant:         classifyQuadrant(agg.maxAxisX, agg.maxAxisY),
      score_consolidado: Math.max(agg.maxScoreImpacto, agg.maxScoreFinanciero),
      numero:           0,
      idx,
      hasOverride:      agg.hasOverride,
    }));

    raw.sort((a, b) => b.score_consolidado - a.score_consolidado);
    raw.forEach((p, i) => { p.numero = i + 1; });
    return raw.sort((a, b) => a.idx - b.idx);
  }, [temaMap]);

  // ── Cerrar popover con Escape ───────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPopover(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── Cerrar popover click outside ───────────────────────────────────────────
  const handleSvgClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if ((e.target as SVGElement).tagName === "svg") setPopover(null);
  }, []);

  // ── Jitter: distribuye puntos coincidentes en una cuadrícula para evitar apilamiento ──
  // Agrupa por posición (x,y) exacta y asigna offsets en grid cols×rows con paso 13px.
  // Reemplaza el offset (idx%3-1)*8 que solo cubre 9 posiciones → insuficiente para ≥10 IROs.
  const pointOffsets = useMemo(() => {
    const groups = new Map<string, TemaPoint[]>();
    for (const p of points) {
      const key = `${p.x},${p.y}`;
      const arr = groups.get(key) ?? [];
      arr.push(p);
      groups.set(key, arr);
    }
    const offsets = new Map<number, { dx: number; dy: number }>();
    for (const group of groups.values()) {
      const n = group.length;
      if (n === 1) { offsets.set(group[0]!.idx, { dx: 0, dy: 0 }); continue; }
      const cols = Math.ceil(Math.sqrt(n));
      const rows = Math.ceil(n / cols);
      const step = 13;
      const startX = -((cols - 1) * step) / 2;
      const startY = -((rows - 1) * step) / 2;
      group.forEach((p, i) => {
        offsets.set(p.idx, {
          dx: Math.round(startX + (i % cols) * step),
          dy: Math.round(startY + Math.floor(i / cols) * step),
        });
      });
    }
    return offsets;
  }, [points]);

  // ── Coordenadas de un punto con jitter clampado al cuadrante ──────────────
  // Si el offset empuja el punto a través del midpoint, lo zeroeamos en ese eje.
  function coords(p: TemaPoint) {
    const midX = mapX(5);
    const midY = mapY(5);
    const baseCx = mapX(p.x);
    const baseCy = mapY(p.y);
    const off = pointOffsets.get(p.idx) ?? { dx: 0, dy: 0 };
    let offsetX = off.dx;
    let offsetY = off.dy;
    if (baseCx >= midX && baseCx + offsetX < midX) offsetX = 0;
    if (baseCx <  midX && baseCx + offsetX > midX) offsetX = 0;
    if (baseCy <= midY && baseCy + offsetY > midY) offsetY = 0;
    if (baseCy >  midY && baseCy + offsetY < midY) offsetY = 0;
    return { cx: baseCx + offsetX, cy: baseCy + offsetY };
  }

  // ── Scroll al punto desde el índice lateral ─────────────────────────────────
  function handleIndexClick(tema: string) {
    setHighlighted(tema);
    setActiveFilter("todos");
    // Abrir el popover del tema correspondiente
    const point = points.find((p) => p.tema_esg === tema);
    if (!point) return;
    const { cx, cy } = coords(point);
    setPopover({ tema: point, svgX: cx, svgY: cy });
    setTimeout(() => setHighlighted(null), 1500);
  }

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-slate-500">
        Genera y puntúa los IROs primero para ver la matriz.
      </div>
    );
  }

  // ── Coordenadas de líneas del eje ───────────────────────────────────────────
  const midXPx  = mapX(5);
  const midYPx  = mapY(5);
  const plotX0  = LEFT;
  const plotX1  = LEFT + PLOT_W;
  const plotY0  = TOP;
  const plotY1  = TOP + PLOT_H;
  const tickPositions = [0, 2, 4, 6, 8, 10] as const;

  // ── Renderizar ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">

      {/* Filtros */}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por cuadrante">
        {FILTER_OPTIONS.map((opt) => {
          const isActive = activeFilter === opt.value;
          const activeCls =
            opt.value === "todos"
              ? "bg-slate-800 text-white border-slate-800"
              : QUADRANT_META[opt.value as Quadrant].pillActive;
          return (
            <button
              key={opt.value}
              onClick={() => { setActiveFilter(opt.value); setPopover(null); }}
              className={[
                "px-3 py-1 text-xs font-medium rounded-sm border transition-colors",
                isActive
                  ? activeCls
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-400",
              ].join(" ")}
              aria-pressed={isActive}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Chip narrativo — síntesis automática de cuadrantes */}
      {(() => {
        const dmCount = points.filter((p) => p.quadrant === "doble_material").length;
        const topDm = [...points]
          .filter((p) => p.quadrant === "doble_material")
          .sort((a, b) => b.score_consolidado - a.score_consolidado)[0] ?? null;
        if (dmCount === 0) return null;
        return (
          <div className="flex items-center gap-2 flex-wrap mt-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-rose-50 border border-rose-200 text-rose-700 px-2.5 py-1 rounded-sm">
              <svg className="w-2.5 h-2.5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
              </svg>
              {dmCount} tema{dmCount !== 1 ? "s" : ""} doble material
              {topDm && ` · riesgo principal: ${topDm.tema_esg}`}
            </span>
          </div>
        );
      })()}

      {/* Contenido: SVG + índice lateral */}
      <div className="flex gap-4 items-start">

        {/* SVG Matriz */}
        <div className="flex-1 min-w-0 relative">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            className="w-full"
            onClick={handleSvgClick}
            aria-label="Matriz de doble materialidad"
            role="img"
          >
            {/* Fondos de cuadrante — muy sutiles */}
            {/* Top-right: doble material (rose) */}
            <rect x={midXPx} y={plotY0} width={plotX1 - midXPx} height={midYPx - plotY0}
              fill="#f43f5e" opacity={0.04} />
            {/* Top-left: solo impacto (amber) */}
            <rect x={plotX0} y={plotY0} width={midXPx - plotX0} height={midYPx - plotY0}
              fill="#d97706" opacity={0.04} />
            {/* Bottom-right: solo financiero (teal) */}
            <rect x={midXPx} y={midYPx} width={plotX1 - midXPx} height={plotY1 - midYPx}
              fill="#0d9488" opacity={0.04} />
            {/* Bottom-left: en seguimiento (slate) */}
            <rect x={plotX0} y={midYPx} width={midXPx - plotX0} height={plotY1 - midYPx}
              fill="#64748b" opacity={0.04} />

            {/* Etiquetas de cuadrante — esquinas, estilo McKinsey/BCG */}
            <text x={midXPx + 6} y={plotY0 + 12} fontSize={7} fill="#f43f5e" opacity={0.6} fontWeight={700} letterSpacing="0.08em">DOBLE MATERIAL</text>
            <text x={midXPx + 6} y={plotY0 + 22} fontSize={6.5} fill="#f43f5e" opacity={0.38}>Acción prioritaria</text>
            <text x={plotX0 + 4} y={plotY0 + 12} fontSize={7} fill="#d97706" opacity={0.6} fontWeight={700} letterSpacing="0.08em">SOLO IMPACTO</text>
            <text x={plotX0 + 4} y={plotY0 + 22} fontSize={6.5} fill="#d97706" opacity={0.38}>Gestión activa</text>
            <text x={midXPx + 6} y={plotY1 - 14} fontSize={7} fill="#0d9488" opacity={0.6} fontWeight={700} letterSpacing="0.08em">SOLO FINANCIERO</text>
            <text x={midXPx + 6} y={plotY1 - 4} fontSize={6.5} fill="#0d9488" opacity={0.38}>Monitoreo</text>
            <text x={plotX0 + 4} y={plotY1 - 14} fontSize={7} fill="#64748b" opacity={0.6} fontWeight={700} letterSpacing="0.08em">EN SEGUIMIENTO</text>
            <text x={plotX0 + 4} y={plotY1 - 4} fontSize={6.5} fill="#64748b" opacity={0.38}>Vigilancia</text>

            {/* Grid lines */}
            {tickPositions.map((v) => (
              <g key={`grid-${v}`}>
                <line
                  x1={mapX(v)} y1={plotY0} x2={mapX(v)} y2={plotY1}
                  stroke="#e2e8f0" strokeWidth={1}
                />
                <line
                  x1={plotX0} y1={mapY(v)} x2={plotX1} y2={mapY(v)}
                  stroke="#e2e8f0" strokeWidth={1}
                />
              </g>
            ))}

            {/* Divisores de punto medio (dashed) */}
            <line
              x1={midXPx} y1={plotY0} x2={midXPx} y2={plotY1}
              stroke="#94a3b8" strokeWidth={1} strokeDasharray="4 3"
            />
            <line
              x1={plotX0} y1={midYPx} x2={plotX1} y2={midYPx}
              stroke="#94a3b8" strokeWidth={1} strokeDasharray="4 3"
            />

            {/* Etiquetas de ticks — escala 0-10 (mockup-v7 pattern) */}
            {tickPositions.map((v) => (
              <g key={`tick-${v}`}>
                {/* Eje X — abajo */}
                <text
                  x={mapX(v)} y={plotY1 + 14}
                  textAnchor="middle" fontSize={10} fill="#94a3b8"
                >
                  {v}
                </text>
                {/* Eje Y — izquierda */}
                <text
                  x={LEFT - 8} y={mapY(v)}
                  textAnchor="end" dominantBaseline="middle" fontSize={10} fill="#94a3b8"
                >
                  {v}
                </text>
              </g>
            ))}

            {/* Títulos de ejes */}
            <text
              x={LEFT + PLOT_W / 2} y={plotY1 + 36}
              textAnchor="middle" fontSize={10} fill="#94a3b8"
            >
              Materialidad Financiera
            </text>
            <text
              x={14} y={TOP + PLOT_H / 2}
              textAnchor="middle" dominantBaseline="middle" fontSize={10} fill="#94a3b8"
              transform={`rotate(-90, 14, ${TOP + PLOT_H / 2})`}
            >
              Materialidad de Impacto
            </text>

            {/* Borde del área de plot */}
            <rect
              x={plotX0} y={plotY0}
              width={PLOT_W} height={PLOT_H}
              fill="none" stroke="#e2e8f0" strokeWidth={1}
            />

            {/* Puntos */}
            {points.map((p) => {
              const { cx, cy } = coords(p);
              const dimmed =
                activeFilter !== "todos" && p.quadrant !== activeFilter;
              const isHighlighted = highlighted === p.tema_esg;
              return (
                <g key={p.tema_esg}>
                  {/* Ring de highlight al seleccionar desde índice */}
                  {isHighlighted && (
                    <circle
                      cx={cx} cy={cy} r={14}
                      fill="none" stroke="#1e293b" strokeWidth={2}
                      opacity={0.5}
                    />
                  )}
                  <DotShape
                    quadrant={p.quadrant}
                    cx={cx} cy={cy}
                    num={p.numero}
                    dimmed={dimmed}
                    label={`${QUADRANT_META[p.quadrant].label}: ${p.tema_esg}`}
                    onClick={() => {
                      setPopover((prev) =>
                        prev?.tema.tema_esg === p.tema_esg
                          ? null
                          : { tema: p, svgX: cx, svgY: cy },
                      );
                    }}
                    onMouseEnter={() => setHovered(p.tema_esg)}
                    onMouseLeave={() => setHovered(null)}
                  />
                  {/* Tooltip al hover — nombre del tema */}
                  {hovered === p.tema_esg && (
                    <g>
                      <rect
                        x={cx + 10} y={cy - 14}
                        width={Math.min(p.tema_esg.length * 6, 180)} height={18}
                        rx={2} fill="#1e293b" opacity={0.85}
                      />
                      <text
                        x={cx + 14} y={cy - 5}
                        fontSize={9} fill="white" dominantBaseline="middle"
                      >
                        {p.tema_esg.length > 28 ? p.tema_esg.slice(0, 28) + "…" : p.tema_esg}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Popover flotante (fuera del SVG para no limitar overflow) */}
          {popover && (
            <PopoverCard
              popover={popover}
              svgRef={svgRef}
              onClose={() => setPopover(null)}
              onGoToIros={onGoToIros}
            />
          )}
        </div>

        {/* Panel de índice lateral */}
        <div className="w-56 flex-shrink-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
            Índice de temas
          </p>
          <div className="space-y-px max-h-[420px] overflow-y-auto pr-1">
            {[...points]
              .sort((a, b) => a.numero - b.numero)
              .map((p) => {
                const meta = QUADRANT_META[p.quadrant];
                const dimmed = activeFilter !== "todos" && p.quadrant !== activeFilter;
                return (
                  <button
                    key={p.tema_esg}
                    ref={(el) => { indexRefs.current[p.tema_esg] = el; }}
                    onClick={() => handleIndexClick(p.tema_esg)}
                    title={p.tema_esg}
                    className={[
                      "w-full text-left px-2 py-1.5 rounded-sm flex items-center gap-1.5 transition-colors",
                      dimmed
                        ? "opacity-30"
                        : "hover:bg-slate-50",
                    ].join(" ")}
                  >
                    <span className="flex-shrink-0 text-[10px] font-bold text-slate-400 w-4 text-right">
                      {p.numero}
                    </span>
                    <span className="flex-shrink-0"><MiniShape quadrant={p.quadrant} /></span>
                    <span className="flex-shrink-0 text-[9px] font-mono font-bold text-slate-500 w-6">
                      {extractEsrsCode(p.tema_esg)}
                    </span>
                    <span className={`text-[11px] font-medium truncate ${meta.listText}`}>
                      {p.tema_esg}
                    </span>
                    <span className="ml-auto text-[10px] text-slate-400 flex-shrink-0">
                      {p.score_consolidado}
                    </span>
                  </button>
                );
              })}
          </div>
        </div>
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap gap-4 pt-2 border-t border-slate-100">
        {(Object.entries(QUADRANT_META) as [Quadrant, (typeof QUADRANT_META)[Quadrant]][]).map(
          ([q, meta]) => (
            <div key={q} className="flex items-center gap-1.5">
              <MiniShape quadrant={q} />
              <span className="text-xs text-slate-600">{meta.label}</span>
            </div>
          ),
        )}
      </div>

      {/* P1 — Interpretación IA determinística de la matriz */}
      {points.length > 0 && (() => {
        const byQ = {
          doble_material:   points.filter((p) => p.quadrant === "doble_material"),
          solo_impacto:     points.filter((p) => p.quadrant === "solo_impacto"),
          solo_financiero:  points.filter((p) => p.quadrant === "solo_financiero"),
          en_seguimiento:   points.filter((p) => p.quadrant === "en_seguimiento"),
        };
        const dmCount = byQ.doble_material.length;
        const topDm = byQ.doble_material.sort((a, b) => b.score_consolidado - a.score_consolidado)[0] ?? null;
        const topRiesgo = byQ.solo_financiero.sort((a, b) => b.score_consolidado - a.score_consolidado)[0] ?? null;
        const concPct = Math.round((dmCount / points.length) * 100);

        const obs: { icon: string; text: string; cls: string }[] = [];

        if (dmCount === 0) {
          obs.push({ icon: "◆", text: "Ningún tema alcanza materialidad doble. El estudio muestra riesgo bajo — confirma que los umbrales de calificación son representativos.", cls: "text-slate-500" });
        } else if (concPct >= 50) {
          obs.push({ icon: "●", text: `Alta concentración: ${dmCount} de ${points.length} temas (${concPct}%) son doble material. Riesgo reportable elevado — priorizar planes de acción.`, cls: "text-rose-600" });
        } else {
          obs.push({ icon: "●", text: `${dmCount} tema${dmCount !== 1 ? "s" : ""} doble material (${concPct}% del universo). ${topDm ? `Mayor riesgo combinado: "${topDm.tema_esg}" con score ${topDm.score_consolidado}/5.` : ""}`, cls: "text-rose-600" });
        }

        if (byQ.solo_financiero.length > 0) {
          obs.push({ icon: "■", text: `${byQ.solo_financiero.length} tema${byQ.solo_financiero.length !== 1 ? "s" : ""} solo financiero${topRiesgo ? ` — exposición económica principal: "${topRiesgo.tema_esg}". Monitorear en informes trimestrales.` : "."}`, cls: "text-teal-600" });
        }

        if (byQ.en_seguimiento.length > byQ.doble_material.length) {
          obs.push({ icon: "▲", text: `${byQ.en_seguimiento.length} temas en seguimiento superan en número a los materiales — posible oportunidad de elevar umbrales o enfocar el cuestionario.`, cls: "text-slate-500" });
        }

        return (
          <div className="border border-slate-200 rounded p-3 bg-slate-50/60 space-y-2 mt-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Lectura de la matriz</p>
            <div className="space-y-1.5">
              {obs.map((o, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className={`text-[11px] font-bold shrink-0 mt-px ${o.cls}`}>{o.icon}</span>
                  <p className="text-[11px] text-slate-600 leading-relaxed">{o.text}</p>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── Popover ───────────────────────────────────────────────────────────────────

function PopoverCard({
  popover,
  svgRef,
  onClose,
  onGoToIros,
}: {
  popover: Popover;
  svgRef: React.RefObject<SVGSVGElement | null>;
  onClose: () => void;
  onGoToIros?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { tema } = popover;
  const meta = QUADRANT_META[tema.quadrant];

  // Calcular posición relativa al SVG responsivo
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const svgRect   = svg.getBoundingClientRect();
    const parentRect = svg.parentElement?.getBoundingClientRect();
    if (!parentRect) return;

    // Escala del SVG (viewBox 560 → ancho real)
    const scaleX = svgRect.width  / SVG_W;
    const scaleY = svgRect.height / SVG_H;

    const left = (svgRect.left - parentRect.left) + popover.svgX * scaleX + 16;
    const top  = (svgRect.top  - parentRect.top)  + popover.svgY * scaleY - 32;

    setPos({ top, left });
  }, [popover, svgRef]);

  // Focus al primer botón al montar
  useEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>("button, [tabindex='0']");
    first?.focus();
  }, []);

  // Trap de Tab dentro del popover
  useEffect(() => {
    function onTab(e: KeyboardEvent) {
      if (e.key !== "Tab" || !ref.current) return;
      const focusable = Array.from(
        ref.current.querySelectorAll<HTMLElement>("button, [tabindex='0']")
      ).filter((el) => !el.hasAttribute("disabled"));
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener("keydown", onTab);
    return () => document.removeEventListener("keydown", onTab);
  }, []);

  // Cerrar click outside
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  if (!pos) return null;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-label={`Detalle: ${tema.tema_esg}`}
      className="absolute z-20 bg-white border border-slate-200 rounded shadow-sm p-3 w-52 text-left"
      style={{ top: pos.top, left: pos.left }}
    >
      {/* Botón cerrar */}
      <button
        onClick={onClose}
        className="absolute top-1.5 right-1.5 text-slate-400 hover:text-slate-700 leading-none"
        aria-label="Cerrar"
      >
        <svg width={12} height={12} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M2 2l8 8M10 2l-8 8" />
        </svg>
      </button>

      {/* Header con forma + código ESRS */}
      <div className="flex items-start gap-1.5 mb-2 pr-4">
        <span className="mt-0.5 flex-shrink-0"><MiniShape quadrant={tema.quadrant} /></span>
        <span className="mt-0.5 flex-shrink-0 text-[9px] font-mono font-bold text-slate-500">
          {extractEsrsCode(tema.tema_esg)}
        </span>
        <p className="text-[11px] font-semibold text-slate-800 leading-snug">{tema.tema_esg}</p>
      </div>

      {/* Cuadrante badge */}
      <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${meta.listText}`}>
        {meta.label}
      </p>

      {/* Scores — Impacto/Financiero en eje 0-10; Consolidado en 1-3 (ranking ESRS) */}
      <div className="space-y-1">
        <ScoreRow label="Impacto"     value={tema.y} maxScale={10} />
        <ScoreRow label="Financiero"  value={tema.x} maxScale={10} />
        <ScoreRow label="Consolidado" value={tema.score_consolidado} maxScale={3} highlight />
      </div>

      {/* Override flag — chip cuando el consultor reposicionó manualmente */}
      {tema.hasOverride && (
        <p className="mt-2 inline-flex items-center gap-1 text-[9px] font-bold bg-amber-50 border border-amber-200 text-amber-700 px-1.5 py-0.5 rounded-sm">
          <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          </svg>
          Posición ajustada manualmente
        </p>
      )}

      {/* CTAs de acción */}
      {onGoToIros && (
        <div className="mt-3 pt-2 border-t border-slate-100 flex gap-2">
          <button
            onClick={() => { onClose(); onGoToIros(); }}
            className="flex-1 text-[10px] font-semibold bg-brand-primary text-white px-2 py-1.5 rounded-sm hover:bg-brand-primary-dark transition-colors"
          >
            Ver en IROs
          </button>
        </div>
      )}

      {/* Número del tema */}
      <p className="mt-2 text-[10px] text-slate-400">Tema #{tema.numero}</p>
    </div>
  );
}

function ScoreRow({
  label,
  value,
  maxScale = 3,
  highlight,
}: {
  label: string;
  value: number;
  /** 3 para score 1-3 (consolidado), 10 para axis 0-10 (impacto/financiero) */
  maxScale?: number;
  highlight?: boolean;
}) {
  const half = maxScale / 2;
  const barW = Math.max(0, Math.min(100, (value / maxScale) * 100));
  const color = value >= half ? "bg-brand-primary" : "bg-slate-300";
  const display = Number.isInteger(value) ? value : value.toFixed(1);
  return (
    <div className="flex items-center gap-2">
      <span className={`text-[10px] w-20 flex-shrink-0 ${highlight ? "font-semibold text-slate-700" : "text-slate-500"}`}>
        {label}
      </span>
      <div className="flex-1 h-1 bg-slate-100 rounded-none overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${barW}%` }} />
      </div>
      <span className={`text-[10px] w-6 text-right tabular-nums ${highlight ? "font-bold text-slate-800" : "text-slate-500"}`}>
        {display}
      </span>
    </div>
  );
}
