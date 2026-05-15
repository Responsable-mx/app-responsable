"use client";

import { useState } from "react";
import type { BenchmarkResult } from "./benchmark-types";
import { lookupComparisonValue, abbrevCompanyName, detectScore } from "./benchmark-helpers";
import {
  RankingChart,
  RadarEsgChart,
  BrechaUrgencyChart,
  type CompanyScore,
  type CatScore,
  type BrechaItem,
} from "./BenchmarkCharts";

// ── Score helpers ─────────────────────────────────────────────────────────────

function scoreToNum(s: ReturnType<typeof detectScore>): number {
  if (s === "sólido") return 100;
  if (s === "parcial") return 50;
  if (s === "brecha") return 0;
  return -1;
}

// ── Tipos intermedios ─────────────────────────────────────────────────────────

type CatStats = {
  cat: "E" | "S" | "G";
  label: string;
  clientScore: number;
  medianScore: number;
  bestScore: number;
  fieldCount: number;
};

// ── Cómputo centralizado ──────────────────────────────────────────────────────

function computeData(result: BenchmarkResult, clientName: string) {
  const CAT_LABEL: Record<string, string> = { E: "Ambiental", S: "Social", G: "Gobernanza" };
  const CATS = ["E", "S", "G"] as const;
  const peers = result.companies_snapshot.filter((c) => c.name !== clientName);

  const avg = (nums: number[]) => {
    const valid = nums.filter((n) => n >= 0);
    return valid.length === 0 ? -1 : Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
  };

  const rawCounts = (companyName: string) =>
    result.fields_snapshot.reduce(
      (acc, f) => {
        const sc = detectScore(lookupComparisonValue(result.comparison, f.key, companyName));
        if (sc) acc[sc]++;
        return acc;
      },
      { sólido: 0, parcial: 0, brecha: 0 }
    );

  // CatStats para PositionBars (ponderado: sólido=100, parcial=50, brecha=0)
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

  // Para RankingChart
  const clientRaw = rawCounts(clientName);
  const peerAvgSolido =
    peers.length > 0
      ? Math.round(peers.reduce((sum, co) => sum + rawCounts(co.name).sólido, 0) / peers.length)
      : 0;
  const companyRanking: CompanyScore[] = [
    ...peers.map((co) => ({ name: abbrevCompanyName(co.name), ...rawCounts(co.name), isClient: false })),
    { name: abbrevCompanyName(clientName), ...clientRaw, isClient: true },
  ];

  // Para RadarEsgChart (% sólido por categoría)
  const catScores: CatScore[] = CATS.map((cat) => {
    const fields = result.fields_snapshot.filter((f) => f.key.charAt(0).toUpperCase() === cat);
    const total = fields.length;
    if (total === 0) return { cat, label: CAT_LABEL[cat]!, client: 0, peerAvg: 0 };
    const clientSol = fields.filter(
      (f) => detectScore(lookupComparisonValue(result.comparison, f.key, clientName)) === "sólido"
    ).length;
    const peerSolAvg =
      peers.length > 0
        ? peers.reduce(
            (sum, co) =>
              sum +
              fields.filter(
                (f) => detectScore(lookupComparisonValue(result.comparison, f.key, co.name)) === "sólido"
              ).length,
            0
          ) / peers.length
        : 0;
    return { cat, label: CAT_LABEL[cat]!, client: (clientSol / total) * 100, peerAvg: (peerSolAvg / total) * 100 };
  });

  // Para BrechaUrgencyChart
  const clientBrechaFields = result.fields_snapshot.filter(
    (f) => detectScore(lookupComparisonValue(result.comparison, f.key, clientName)) === "brecha"
  );
  const brechaUrgency: BrechaItem[] = clientBrechaFields.map((f) => ({
    label: f.label,
    peerBrechas: peers.filter(
      (co) => detectScore(lookupComparisonValue(result.comparison, f.key, co.name)) === "brecha"
    ).length,
    totalPeers: peers.length,
  }));

  return { catStats, peers, companyRanking, catScores, brechaUrgency, peerAvgSolido };
}

// ── Barras de posición por categoría ─────────────────────────────────────────

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
                        <div className={`h-full ${row.barCls} transition-all`} style={{ width: `${row.score}%` }} />
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

// ── Heatmap por dimensión × empresa ──────────────────────────────────────────

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
                <span className="font-medium text-[7.5px]">{abbrevCompanyName(col.name).slice(0, 9)}</span>
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
  onCatFilter,
}: {
  latestResult: BenchmarkResult;
  clientName: string;
  onCatFilter?: (cat: "all" | "E" | "S" | "G") => void;
}) {
  const [open, setOpen] = useState(true);
  const [heatmapOpen, setHeatmapOpen] = useState(false);
  const { catStats, peers, companyRanking, catScores, brechaUrgency, peerAvgSolido } =
    computeData(latestResult, clientName);

  if (catStats.length === 0 && companyRanking.length === 0) return null;

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
          {/* Fila: Radar ESG + Barras de posición */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border border-slate-100 rounded p-3 bg-slate-50/40">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                Cobertura por dimensión E/S/G
              </p>
              <RadarEsgChart catScores={catScores} />
              {/* P4 — interpretación radar */}
              {catScores.length >= 3 && (() => {
                const sorted = [...catScores].sort((a, b) => b.client - a.client);
                const best = sorted[0];
                const worst = sorted[sorted.length - 1];
                const aboveAvg = catScores.filter((c) => c.client >= c.peerAvg);
                const labels: Record<string, string> = { E: "Ambiental", S: "Social", G: "Gobernanza" };
                return (
                  <p className="text-[10px] text-slate-500 mt-2 leading-relaxed border-t border-slate-100 pt-2">
                    <span className="font-semibold text-teal-700">{labels[best?.cat ?? "E"]}</span> es la dimensión más sólida ({Math.round(best?.client ?? 0)}%).{" "}
                    {worst && worst.client < (worst.peerAvg ?? 0) - 10 ? (
                      <><span className="font-semibold text-rose-600">{labels[worst.cat]}</span> queda {Math.round((worst.peerAvg ?? 0) - worst.client)}% por debajo de la media de referencia — brecha prioritaria.</>
                    ) : (
                      <>El cliente {aboveAvg.length >= 2 ? "supera la media en " + aboveAvg.length + " dimensiones" : "está alineado con la media sectorial"}.</>
                    )}
                  </p>
                );
              })()}
            </div>
            <PositionBars catStats={catStats} />
          </div>

          {/* Ranking por empresa */}
          {companyRanking.length > 0 && (
            <div className="border border-slate-100 rounded p-3 bg-slate-50/40">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                Posición relativa por empresa
              </p>
              <RankingChart
                companies={companyRanking}
                totalFields={latestResult.fields_snapshot.length}
                peerAvgSolido={peerAvgSolido}
              />
              {/* P4 — interpretación ranking */}
              {(() => {
                const client = companyRanking.find((c) => c.isClient);
                const peers = companyRanking.filter((c) => !c.isClient);
                if (!client || peers.length === 0) return null;
                const sorted = [...companyRanking].sort((a, b) => b.sólido - a.sólido);
                const rank = sorted.findIndex((c) => c.isClient) + 1;
                const total = sorted.length;
                const above = peers.filter((p) => p.sólido > client.sólido).length;
                return (
                  <p className="text-[10px] text-slate-500 mt-2 leading-relaxed border-t border-slate-100 pt-2">
                    {rank === 1 ? (
                      <span className="font-semibold text-emerald-700">Posición líder</span>
                    ) : rank <= Math.ceil(total / 2) ? (
                      <span className="font-semibold text-teal-700">Posición {rank}/{total}</span>
                    ) : (
                      <span className="font-semibold text-amber-700">Posición {rank}/{total}</span>
                    )}{" "}
                    — {above} empresa{above !== 1 ? "s" : ""} de referencia con más campos sólidos que el cliente ({client.sólido} vs. media {Math.round(peers.reduce((s, p) => s + p.sólido, 0) / peers.length)}).
                    {client.brecha > 0 && <> {client.brecha} campo{client.brecha !== 1 ? "s" : ""} en brecha pendiente de cierre.</>}
                  </p>
                );
              })()}
            </div>
          )}

          {/* Urgencia de brechas */}
          {brechaUrgency.length > 0 && (
            <div className="border border-slate-100 rounded p-3 bg-slate-50/40">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                Brechas por prioridad — ¿cuántas referencias comparten la misma brecha?
              </p>
              <p className="text-[9px] text-slate-500 mb-2">
                Barra más larga = brecha exclusiva del cliente = más urgente de atender
              </p>
              <BrechaUrgencyChart items={brechaUrgency} />
              {/* P4 — interpretación brechas */}
              {(() => {
                const exclusivas = brechaUrgency.filter((b) => b.peerBrechas === 0);
                const sectoriales = brechaUrgency.filter((b) => b.peerBrechas >= b.totalPeers * 0.5);
                return (
                  <p className="text-[10px] text-slate-500 mt-2 leading-relaxed border-t border-slate-100 pt-2">
                    {exclusivas.length > 0 ? (
                      <><span className="font-semibold text-rose-600">{exclusivas.length} brecha{exclusivas.length !== 1 ? "s" : ""} exclusiva{exclusivas.length !== 1 ? "s" : ""}</span>: ninguna referencia las reporta — mayor urgencia de cierre.{" "}</>
                    ) : null}
                    {sectoriales.length > 0 ? (
                      <><span className="font-semibold text-slate-600">{sectoriales.length} brecha{sectoriales.length !== 1 ? "s" : ""} sectorial{sectoriales.length !== 1 ? "es" : ""}</span>: compartida{sectoriales.length !== 1 ? "s" : ""} por más del 50% de referencias — menor urgencia diferencial pero obligación de reporte.</>
                    ) : exclusivas.length === 0 ? (
                      "Todas las brechas son compartidas con al menos una referencia — posición alineada al sector."
                    ) : null}
                  </p>
                );
              })()}
            </div>
          )}

          {/* Heatmap colapsable */}
          <div className="border border-slate-100 rounded bg-slate-50/40">
            <button
              type="button"
              onClick={() => setHeatmapOpen((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors"
              aria-expanded={heatmapOpen}
            >
              Mapa de posición — todas las dimensiones
              <svg
                className={`w-3 h-3 transition-transform ${heatmapOpen ? "rotate-180" : ""}`}
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path strokeLinecap="round" d="M3 4.5l3 3 3-3" />
              </svg>
            </button>
            {heatmapOpen && (
              <div className="px-3 pb-3">
                <ScoreHeatmap result={latestResult} clientName={clientName} peers={peers} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
