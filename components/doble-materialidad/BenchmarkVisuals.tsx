"use client";

import { useState } from "react";
import type { BenchmarkResult } from "./benchmark-types";
import { lookupComparisonValue, abbrevCompanyName } from "./benchmark-helpers";

// ── Score helpers (misma lógica que BenchmarkComparisonTable) ─────────────────

function detectScore(text: string): "sólido" | "parcial" | "brecha" | null {
  if (!text || text === "—" || /^sin datos/i.test(text)) return null;
  const t = text.toLowerCase();
  if (/ausencia|brecha|carece|sin reporte|sin meta|no publica|no mide|no tiene|no cuenta/.test(t)) return "brecha";
  if (/parcial|limitad|sólo |básic|en proceso/.test(t)) return "parcial";
  if (/iso |certif|ecovadis|gri |scope [12]|mide |sólid|verific|reporta/.test(t)) return "sólido";
  return null;
}

function scoreToNum(s: ReturnType<typeof detectScore>): number {
  if (s === "sólido") return 100;
  if (s === "parcial") return 50;
  if (s === "brecha") return 0;
  return -1; // null = sin datos
}

// ── Tipos intermedios ─────────────────────────────────────────────────────────

type CatStats = {
  cat: "E" | "S" | "G";
  label: string;
  clientScore: number;  // -1 = sin datos
  medianScore: number;
  bestScore: number;
  fieldCount: number;
};

// ── Cómputo de datos ──────────────────────────────────────────────────────────

function computeData(result: BenchmarkResult, clientName: string) {
  const CAT_LABEL: Record<string, string> = { E: "Ambiental", S: "Social", G: "Gobernanza" };
  const CATS = ["E", "S", "G"] as const;
  const peers = result.companies_snapshot.filter((c) => c.name !== clientName);

  const avg = (nums: number[]) => {
    const valid = nums.filter((n) => n >= 0);
    return valid.length === 0 ? -1 : Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
  };

  const catStats: CatStats[] = CATS.map((cat) => {
    const fields = result.fields_snapshot.filter((f) => f.key.charAt(0).toUpperCase() === cat);
    if (fields.length === 0)
      return { cat, label: CAT_LABEL[cat]!, clientScore: -1, medianScore: -1, bestScore: -1, fieldCount: 0 };

    const clientScore = avg(
      fields.map((f) => scoreToNum(detectScore(lookupComparisonValue(result.comparison, f.key, clientName))))
    );

    const peerAvgs = peers
      .map((c) =>
        avg(fields.map((f) => scoreToNum(detectScore(lookupComparisonValue(result.comparison, f.key, c.name)))))
      )
      .filter((s) => s >= 0)
      .sort((a, b) => a - b);

    const medianScore = peerAvgs.length === 0 ? -1 : peerAvgs[Math.floor(peerAvgs.length / 2)]!;
    const bestScore   = peerAvgs.length === 0 ? -1 : Math.max(...peerAvgs);

    return { cat, label: CAT_LABEL[cat]!, clientScore, medianScore, bestScore, fieldCount: fields.length };
  }).filter((d) => d.fieldCount > 0);

  return { catStats, peers };
}

// ── 1. Radar ESG ──────────────────────────────────────────────────────────────

// E arriba (−90°), S abajo-derecha (30°), G abajo-izquierda (150°)
const AXES = [
  { cat: "E" as const, label: "Ambiental",   angle: -Math.PI / 2 },
  { cat: "S" as const, label: "Social",       angle:  Math.PI / 6 },
  { cat: "G" as const, label: "Gobernanza",   angle:  5 * Math.PI / 6 },
];

const CAT_COLOR = { E: "#059669", S: "#2563eb", G: "#7c3aed" } as const;

function RadarESG({ catStats }: { catStats: CatStats[] }) {
  const cx = 90, cy = 88, maxR = 62;

  const axisPt = (i: number, r: number) => {
    const a = AXES[i]!.angle;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };

  const toPtStr = (i: number, score: number) => {
    if (score < 0) return `${cx},${cy}`;
    const r = (score / 100) * maxR;
    const a = AXES[i]!.angle;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  };

  const orderedStats = AXES.map((ax) => catStats.find((d) => d.cat === ax.cat));
  const clientPts  = orderedStats.map((d, i) => toPtStr(i, d?.clientScore  ?? -1)).join(" ");
  const medianPts  = orderedStats.map((d, i) => toPtStr(i, d?.medianScore  ?? -1)).join(" ");
  const gridLevels = [25, 50, 75, 100];

  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Radar ESG</p>
      <svg viewBox="0 0 180 158" className="w-full max-w-[200px]" overflow="visible">
        {/* Cuadrículas concéntricas */}
        {gridLevels.map((lvl) => {
          const r = (lvl / 100) * maxR;
          const pts = [0, 1, 2]
            .map((i) => {
              const p = axisPt(i, r);
              return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
            })
            .join(" ");
          return (
            <polygon key={lvl} points={pts} fill="none" stroke="#e2e8f0" strokeWidth="0.6" />
          );
        })}

        {/* Ejes */}
        {[0, 1, 2].map((i) => {
          const tip = axisPt(i, maxR);
          return (
            <line
              key={i}
              x1={cx} y1={cy}
              x2={tip.x.toFixed(1)} y2={tip.y.toFixed(1)}
              stroke="#e2e8f0"
              strokeWidth="0.6"
            />
          );
        })}

        {/* Polígono mediana (sector) */}
        <polygon
          points={medianPts}
          fill="rgba(148,163,184,0.12)"
          stroke="#94a3b8"
          strokeWidth="1"
          strokeDasharray="3 2"
        />

        {/* Polígono cliente */}
        <polygon
          points={clientPts}
          fill="rgba(20,184,166,0.12)"
          stroke="var(--color-brand-primary)"
          strokeWidth="1.8"
        />

        {/* Etiquetas en puntas de eje: letra + score */}
        {AXES.map((ax, i) => {
          const tip = axisPt(i, maxR + 10);
          const stat = orderedStats[i];
          return (
            <g key={ax.cat}>
              <text
                x={tip.x.toFixed(1)}
                y={(tip.y + 3).toFixed(1)}
                textAnchor="middle"
                fontSize="9"
                fontWeight="700"
                fill={CAT_COLOR[ax.cat]}
                fontFamily="inherit"
              >
                {ax.cat}
              </text>
              {stat && stat.clientScore >= 0 && (
                <text
                  x={tip.x.toFixed(1)}
                  y={(tip.y + 12).toFixed(1)}
                  textAnchor="middle"
                  fontSize="7.5"
                  fontWeight="600"
                  fill="var(--color-brand-primary)"
                  fontFamily="inherit"
                >
                  {stat.clientScore}%
                </text>
              )}
            </g>
          );
        })}

        {/* Leyenda */}
        <g>
          <rect x="4" y="146" width="12" height="2" fill="var(--color-brand-primary)" rx="0.5" />
          <text x="18" y="149" fontSize="6.5" fill="#475569" fontFamily="inherit">Cliente</text>
          <line x1="60" y1="147" x2="72" y2="147" stroke="#94a3b8" strokeWidth="1" strokeDasharray="2 1.5" />
          <text x="76" y="149" fontSize="6.5" fill="#475569" fontFamily="inherit">Mediana sector</text>
        </g>
      </svg>

      {/* Sub-leyenda: label + score por categoría */}
      <div className="flex gap-3 mt-1 flex-wrap">
        {AXES.map((ax) => {
          const stat = catStats.find((d) => d.cat === ax.cat);
          if (!stat) return null;
          return (
            <span key={ax.cat} className="flex items-center gap-1 text-[8px]">
              <span className="font-bold" style={{ color: CAT_COLOR[ax.cat] }}>{ax.label}</span>
              <span className="text-slate-400">
                {stat.clientScore >= 0 ? `${stat.clientScore}%` : "—"}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── 2. Barras de posición por categoría ───────────────────────────────────────

const BAR_COLOR: Record<string, { bar: string; text: string }> = {
  E: { bar: "bg-emerald-500", text: "text-emerald-700" },
  S: { bar: "bg-blue-500",    text: "text-blue-700" },
  G: { bar: "bg-violet-500",  text: "text-violet-700" },
};

function PositionBars({ catStats }: { catStats: CatStats[] }) {
  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">Posición por categoría</p>
      <div className="space-y-3">
        {catStats.map((d) => {
          const c = BAR_COLOR[d.cat] ?? BAR_COLOR["E"]!;
          const rows: { label: string; score: number; barCls: string; textCls: string }[] = [
            { label: "Cliente", score: d.clientScore, barCls: c.bar,           textCls: c.text },
            { label: "Mediana", score: d.medianScore, barCls: "bg-slate-300",   textCls: "text-slate-500" },
            { label: "Mejor",   score: d.bestScore,   barCls: "bg-emerald-200", textCls: "text-slate-400" },
          ];
          return (
            <div key={d.cat}>
              <div className="flex items-center gap-1.5 mb-1">
                <span className={`text-[9px] font-bold ${c.text}`}>{d.label}</span>
                <span className="text-[8px] text-slate-400">{d.fieldCount} dim.</span>
              </div>
              <div className="space-y-1">
                {rows.map((row) => (
                  <div key={row.label} className="flex items-center gap-1.5">
                    <span className="text-[8px] text-slate-400 w-10 shrink-0">{row.label}</span>
                    <div className="flex-1 bg-slate-100 h-[7px] overflow-hidden">
                      {row.score >= 0 && (
                        <div
                          className={`h-full ${row.barCls} transition-all`}
                          style={{ width: `${row.score}%` }}
                        />
                      )}
                    </div>
                    <span className={`text-[8px] font-medium ${row.textCls} w-6 text-right shrink-0`}>
                      {row.score >= 0 ? `${row.score}%` : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 3. Heatmap por dimensión × empresa ────────────────────────────────────────

const HEAT_CLS: Record<string, string> = {
  sólido: "bg-emerald-400",
  parcial: "bg-amber-300",
  brecha:  "bg-rose-400",
};
const HEAT_TITLE: Record<string, string> = {
  sólido: "Sólido",
  parcial: "Parcial",
  brecha:  "Brecha",
};
const CAT_CLS: Record<string, string> = {
  E: "text-emerald-600",
  S: "text-blue-600",
  G: "text-violet-600",
};

function ScoreHeatmap({
  result,
  clientName,
  peers,
}: {
  result: BenchmarkResult;
  clientName: string;
  peers: { name: string; relation: string }[];
}) {
  const allCols = [{ name: clientName, isClient: true }, ...peers.map((p) => ({ name: p.name, isClient: false }))];

  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">
        Mapa de posición — todas las dimensiones
      </p>
      <div className="overflow-x-auto">
        <table className="text-[8px] border-collapse">
          <thead>
            <tr>
              <th className="text-left pr-2 pb-1 font-medium text-slate-400 whitespace-nowrap min-w-[120px] align-bottom">
                Dimensión
              </th>
              {allCols.map((col) => (
                <th
                  key={col.name}
                  title={col.name}
                  className={`pb-1 w-5 min-w-[20px] align-bottom ${col.isClient ? "text-brand-primary" : "text-slate-400"}`}
                  style={{ writingMode: "vertical-lr", transform: "rotate(180deg)", height: "52px" }}
                >
                  <span className="font-medium text-[7.5px]">
                    {abbrevCompanyName(col.name).slice(0, 9)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.fields_snapshot.map((f) => {
              const cat = f.key.charAt(0).toUpperCase();
              return (
                <tr key={f.key} className="group">
                  <td className="pr-2 py-px align-middle whitespace-nowrap">
                    <span className={`text-[7px] font-bold mr-0.5 ${CAT_CLS[cat] ?? "text-slate-400"}`}>{cat}</span>
                    <span className="text-slate-600">
                      {f.label.length > 20 ? f.label.slice(0, 19) + "…" : f.label}
                    </span>
                  </td>
                  {allCols.map((col) => {
                    const score = detectScore(lookupComparisonValue(result.comparison, f.key, col.name));
                    return (
                      <td
                        key={col.name}
                        className={`w-5 h-[13px] transition-opacity group-hover:opacity-70 ${score ? HEAT_CLS[score]! : "bg-slate-100"} ${col.isClient ? "ring-1 ring-inset ring-brand-primary/30" : ""}`}
                        title={`${col.name} · ${f.label}: ${score ? HEAT_TITLE[score] : "Sin datos"}`}
                      />
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Leyenda */}
      <div className="flex items-center gap-3 mt-2 flex-wrap">
        {Object.entries(HEAT_CLS).map(([score, cls]) => (
          <span key={score} className="flex items-center gap-1 text-[8px] text-slate-500">
            <span className={`w-3 h-3 ${cls} rounded-sm shrink-0`} />
            {HEAT_TITLE[score]}
          </span>
        ))}
        <span className="flex items-center gap-1 text-[8px] text-slate-500">
          <span className="w-3 h-3 bg-slate-100 rounded-sm shrink-0 border border-slate-200" />
          Sin datos
        </span>
      </div>
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────────

export function BenchmarkVisuals({
  latestResult,
  clientName,
}: {
  latestResult: BenchmarkResult;
  clientName: string;
}) {
  const [open, setOpen] = useState(true);
  const { catStats, peers } = computeData(latestResult, clientName);

  if (catStats.length === 0) return null;

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors"
        aria-expanded={open}
      >
        <svg
          className={`w-3 h-3 transition-transform ${open ? "rotate-90" : ""}`}
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path strokeLinecap="round" d="M4 3l4 3-4 3" />
        </svg>
        Visualizaciones ESG
      </button>

      {open && (
        <div className="space-y-3 pt-1">
          {/* Fila: Radar + Barras */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border border-slate-100 rounded p-3 bg-slate-50/40">
            <RadarESG catStats={catStats} />
            <PositionBars catStats={catStats} />
          </div>

          {/* Heatmap */}
          <div className="border border-slate-100 rounded p-3 bg-slate-50/40">
            <ScoreHeatmap result={latestResult} clientName={clientName} peers={peers} />
          </div>
        </div>
      )}
    </div>
  );
}
