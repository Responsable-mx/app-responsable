"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { IroInventoryItem } from "@/lib/dm/iro-generation";
import { extractEsrsCode } from "@/lib/dm/esg-classify";

// ── Tipos internos ────────────────────────────────────────────────────────────

type Quadrant = "doble_material" | "solo_impacto" | "solo_financiero" | "en_seguimiento";

type TemaPoint = {
  tema_esg: string;
  x: number;           // coord financiero 0-10 (derivado de score 1-3 o pos_x override)
  y: number;           // coord impacto    0-10 (derivado de score 1-3 o pos_y override)
  quadrant: Quadrant;
  score_consolidado: number;  // max(score_impacto, score_financiero) 1-3 — usado para ranking
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
// Ejes 0-10 (pattern mockup-v7). Score 1-3 se derive como (1→0, 2→5, 3→10)
// o se sobrescribe con pos_x/pos_y manual del consultor.

function mapX(axisValue: number): number {
  return LEFT + (axisValue / 10) * PLOT_W;
}

function mapY(axisValue: number): number {
  return TOP + PLOT_H - (axisValue / 10) * PLOT_H;
}

/** Score 1-3 → coord eje 0-10. Permite null score → midpoint 5. */
function scoreToAxis(score: number | null | undefined): number {
  if (score == null) return 5;
  return ((score - 1) / 2) * 10;
}

// ── Clasificación de cuadrante ────────────────────────────────────────────────
// Midpoint en 5 (ejes 0-10).

function classifyQuadrant(x: number, y: number): Quadrant {
  const xMat = x >= 5;
  const yMat = y >= 5;
  if (xMat && yMat)   return "doble_material";
  if (!xMat && yMat)  return "solo_impacto";
  if (xMat && !yMat)  return "solo_financiero";
  return "en_seguimiento";
}

// ── Shapes SVG ────────────────────────────────────────────────────────────────

function ShapeCircle({ cx, cy, fill, stroke, num, dimmed, onClick, onMouseEnter, onMouseLeave }: {
  cx: number; cy: number; fill: string; stroke: string; num: number;
  dimmed: boolean; onClick: () => void;
  onMouseEnter: () => void; onMouseLeave: () => void;
}) {
  return (
    <g
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ cursor: "pointer", opacity: dimmed ? 0.12 : 1 }}
    >
      <circle cx={cx} cy={cy} r={7} fill={fill} stroke={stroke} strokeWidth={1.5} />
      <text x={cx} y={cy} fontSize={7} textAnchor="middle" dominantBaseline="middle" fill="white" fontWeight="700">
        {num}
      </text>
    </g>
  );
}

function ShapeDiamond({ cx, cy, fill, stroke, num, dimmed, onClick, onMouseEnter, onMouseLeave }: {
  cx: number; cy: number; fill: string; stroke: string; num: number;
  dimmed: boolean; onClick: () => void;
  onMouseEnter: () => void; onMouseLeave: () => void;
}) {
  const s = 8;
  const pts = `${cx},${cy - s} ${cx + s},${cy} ${cx},${cy + s} ${cx - s},${cy}`;
  return (
    <g
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ cursor: "pointer", opacity: dimmed ? 0.12 : 1 }}
    >
      <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={1.5} />
      <text x={cx} y={cy} fontSize={7} textAnchor="middle" dominantBaseline="middle" fill="white" fontWeight="700">
        {num}
      </text>
    </g>
  );
}

function ShapeSquare({ cx, cy, fill, stroke, num, dimmed, onClick, onMouseEnter, onMouseLeave }: {
  cx: number; cy: number; fill: string; stroke: string; num: number;
  dimmed: boolean; onClick: () => void;
  onMouseEnter: () => void; onMouseLeave: () => void;
}) {
  const s = 6.5;
  return (
    <g
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ cursor: "pointer", opacity: dimmed ? 0.12 : 1 }}
    >
      <rect x={cx - s} y={cy - s} width={13} height={13} fill={fill} stroke={stroke} strokeWidth={1.5} />
      <text x={cx} y={cy} fontSize={7} textAnchor="middle" dominantBaseline="middle" fill="white" fontWeight="700">
        {num}
      </text>
    </g>
  );
}

function ShapeTriangle({ cx, cy, fill, stroke, num, dimmed, onClick, onMouseEnter, onMouseLeave }: {
  cx: number; cy: number; fill: string; stroke: string; num: number;
  dimmed: boolean; onClick: () => void;
  onMouseEnter: () => void; onMouseLeave: () => void;
}) {
  const s = 8;
  const pts = `${cx},${cy - s} ${cx + s},${cy + s} ${cx - s},${cy + s}`;
  return (
    <g
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ cursor: "pointer", opacity: dimmed ? 0.12 : 1 }}
    >
      <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={1.5} />
      <text x={cx} y={cy + 2} fontSize={7} textAnchor="middle" dominantBaseline="middle" fill="white" fontWeight="700">
        {num}
      </text>
    </g>
  );
}

function DotShape(props: {
  quadrant: Quadrant;
  cx: number; cy: number; num: number; dimmed: boolean;
  onClick: () => void; onMouseEnter: () => void; onMouseLeave: () => void;
}) {
  const meta = QUADRANT_META[props.quadrant];
  const sharedProps = {
    cx: props.cx, cy: props.cy,
    fill: meta.fill, stroke: meta.stroke,
    num: props.num, dimmed: props.dimmed,
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

export function MatrizDM({ iros }: Props) {
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

  // ── Coordenadas de un punto con jitter clampado al cuadrante ──────────────
  // Si jitter empuja el punto a través del midpoint, lo reducimos a 0 en ese eje.
  // Garantiza que el render visual coincide con el cuadrante calculado.
  function coords(p: TemaPoint) {
    const midX = mapX(5);
    const midY = mapY(5);
    const baseCx = mapX(p.x);
    const baseCy = mapY(p.y);
    let offsetX = (p.idx % 3 - 1) * 8;
    let offsetY = (Math.floor(p.idx / 3) % 3 - 1) * 8;
    // Eje X: si baseCx ≥ midX (financiero ≥ 5), offsetX no debe hacer cx < midX, y viceversa
    if (baseCx >= midX && baseCx + offsetX < midX) offsetX = 0;
    if (baseCx <  midX && baseCx + offsetX > midX) offsetX = 0;
    // Eje Y: mapY invertido (y=10 → top, y=0 → bottom). midY divide top/bottom.
    if (baseCy <= midY && baseCy + offsetY > midY) offsetY = 0; // arriba (impacto ≥ 5)
    if (baseCy >  midY && baseCy + offsetY < midY) offsetY = 0; // abajo  (impacto < 5)
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
    </div>
  );
}

// ── Popover ───────────────────────────────────────────────────────────────────

function PopoverCard({
  popover,
  svgRef,
  onClose,
}: {
  popover: Popover;
  svgRef: React.RefObject<SVGSVGElement | null>;
  onClose: () => void;
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
