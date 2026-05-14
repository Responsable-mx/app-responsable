"use client";

import { useState, useRef, useEffect } from "react";
import { useToast } from "@/components/ui/Toast";
import { RELATION_LABELS, type CompanyRelation } from "@/lib/dm/fields";
import { ExpandableCell } from "@/components/doble-materialidad/ExpandableCell";
import type { BenchmarkResult } from "./benchmark-types";
import { lookupComparisonValue, abbrevCompanyName } from "./benchmark-helpers";
import { scrollToDmSection } from "@/components/doble-materialidad/DoubleMaterialidadTab";
import { RankingChart, RadarEsgChart, BrechaUrgencyChart } from "@/components/doble-materialidad/BenchmarkCharts";
import type { CompanyScore, CatScore, BrechaItem } from "@/components/doble-materialidad/BenchmarkCharts";

const cats = ["E", "S", "G"] as const;
const catLabel: Record<string, string> = { E: "Ambiental", S: "Social", G: "Gobernanza" };

// Misma lógica que ExpandableCell.detectScore — reutilizable sin importar el componente cliente
function detectScore(text: string): "sólido" | "parcial" | "brecha" | null {
  if (!text || text === "—" || /^sin datos/i.test(text)) return null;
  const t = text.toLowerCase();
  if (/ausencia|brecha|carece|sin reporte|sin meta|no publica|no mide|no tiene|no cuenta/.test(t)) return "brecha";
  if (/parcial|limitad|sólo |básic|en proceso/.test(t)) return "parcial";
  if (/iso |certif|ecovadis|gri |scope [12]|mide |sólid|verific|reporta/.test(t)) return "sólido";
  return null;
}

const CAT_BADGE: Record<string, { label: string; cls: string }> = {
  E: { label: "Amb", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  S: { label: "Soc", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  G: { label: "Gov", cls: "bg-violet-50 text-violet-700 border-violet-200" },
};
const REL_PILLS = [
  { key: "competitor_nacional",      label: "Nacional" },
  { key: "competitor_internacional", label: "Internacional" },
  { key: "sector",                   label: "Sector" },
  { key: "cadena_valor",             label: "Cadena" },
] as const;

export function BenchmarkComparisonTable({
  clientId,
  clientName,
  latestResult,
  companyUrls = {},
}: {
  clientId: string;
  clientName: string;
  latestResult: BenchmarkResult;
  companyUrls?: Record<string, { reportUrl: string | null; websiteUrl: string | null }>;
}) {
  const { push } = useToast();
  const [tableFilter, setTableFilter] = useState<"all" | "E" | "S" | "G">("all");
  const [onlyBrechas, setOnlyBrechas] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [tableFullscreen, setTableFullscreen] = useState(false);
  const [colFilter, setColFilter] = useState<
    "all" | "competitor_nacional" | "competitor_internacional" | "sector" | "cadena_valor"
  >("all");
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [chartsOpen, setChartsOpen] = useState(true);

  useEffect(() => {
    if (!tableFullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setTableFullscreen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tableFullscreen]);

  // Scroll-fade: detectar si hay contenido oculto a la derecha en la tabla normal
  // colFilter determina qué columnas son visibles → re-check al cambiar
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
    check();
    el.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      el.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [colFilter]);

  const allFields = latestResult.fields_snapshot;
  const allCompanies = latestResult.companies_snapshot;

  // Scorecard: posición de Nuvoil en TODAS las dimensiones (sin filtro aplicado)
  const scorecardAll = allFields.reduce(
    (acc, f) => {
      const t = lookupComparisonValue(latestResult.comparison, f.key, clientName);
      const score = detectScore(t);
      if (score) acc[score]++;
      else if (t && t !== "—" && !/^sin datos/i.test(t)) acc.otros++;
      return acc;
    },
    { sólido: 0, parcial: 0, brecha: 0, otros: 0 }
  );

  // Brechas del cliente — usadas por charts y CTA
  const clientBrechaFields = allFields.filter(
    (f) => detectScore(lookupComparisonValue(latestResult.comparison, f.key, clientName)) === "brecha"
  );

  // Media de sólidos entre empresas de referencia
  const peerAvgSolido =
    allCompanies.length > 0
      ? Math.round(
          allCompanies.reduce((sum, co) => {
            return (
              sum +
              allFields.filter(
                (f) =>
                  detectScore(lookupComparisonValue(latestResult.comparison, f.key, co.name)) === "sólido"
              ).length
            );
          }, 0) / allCompanies.length
        )
      : 0;

  // Ranking por empresa para RankingChart
  const companyRanking: CompanyScore[] = [
    ...allCompanies.map((co) => {
      const s = allFields.reduce(
        (acc, f) => {
          const sc = detectScore(lookupComparisonValue(latestResult.comparison, f.key, co.name));
          if (sc) acc[sc]++;
          return acc;
        },
        { sólido: 0, parcial: 0, brecha: 0 }
      );
      return { name: abbrevCompanyName(co.name), ...s, isClient: false };
    }),
    {
      name: abbrevCompanyName(clientName),
      sólido: scorecardAll.sólido,
      parcial: scorecardAll.parcial,
      brecha: scorecardAll.brecha,
      isClient: true,
    },
  ];

  // Scores por categoría E/S/G para RadarEsgChart
  const catScores: CatScore[] = cats.map((cat) => {
    const catFields = allFields.filter((f) => f.key.charAt(0).toUpperCase() === cat);
    const total = catFields.length;
    if (total === 0) return { cat, label: catLabel[cat] ?? cat, client: 0, peerAvg: 0 };
    const clientSol = catFields.filter(
      (f) => detectScore(lookupComparisonValue(latestResult.comparison, f.key, clientName)) === "sólido"
    ).length;
    const peerSolAvg =
      allCompanies.length > 0
        ? allCompanies.reduce((sum, co) => {
            return (
              sum +
              catFields.filter(
                (f) =>
                  detectScore(lookupComparisonValue(latestResult.comparison, f.key, co.name)) === "sólido"
              ).length
            );
          }, 0) / allCompanies.length
        : 0;
    return { cat, label: catLabel[cat] ?? cat, client: (clientSol / total) * 100, peerAvg: (peerSolAvg / total) * 100 };
  });

  // Urgencia de brechas para BrechaUrgencyChart
  const brechaUrgency: BrechaItem[] = clientBrechaFields.map((f) => ({
    label: f.label,
    peerBrechas: allCompanies.filter(
      (co) => detectScore(lookupComparisonValue(latestResult.comparison, f.key, co.name)) === "brecha"
    ).length,
    totalPeers: allCompanies.length,
  }));

  const isBrechaText = (t: string) =>
    /ausencia|brecha|carece|sin reporte|sin meta|no publica|no mide|no tiene|no cuenta/.test(t.toLowerCase());

  const catCounts = allFields.reduce<Record<string, number>>((acc, f) => {
    const cat = f.key.charAt(0).toUpperCase();
    acc[cat] = (acc[cat] ?? 0) + 1;
    return acc;
  }, {});

  const relCounts = allCompanies.reduce<Record<string, number>>((acc, c) => {
    acc[c.relation] = (acc[c.relation] ?? 0) + 1;
    return acc;
  }, {});

  const visibleCompanies = allCompanies.filter(
    (c) => colFilter === "all" || c.relation === colFilter
  );

  const filteredFields = allFields.filter((f) => {
    const cat = f.key.charAt(0).toUpperCase();
    if (tableFilter !== "all" && cat !== tableFilter) return false;
    if (!onlyBrechas) return true;
    const texts = [
      lookupComparisonValue(latestResult.comparison, f.key, clientName),
      ...visibleCompanies.map((c) =>
        lookupComparisonValue(latestResult.comparison, f.key, c.name)
      ),
    ];
    return texts.some(isBrechaText);
  });

  const sourceHref = (companyName: string, fieldLabel: string) => {
    const urls = companyUrls[companyName];
    if (urls?.reportUrl) return { href: urls.reportUrl, label: "↗ reporte", cls: "text-brand-primary hover:text-brand-primary-dark" };
    if (urls?.websiteUrl) return { href: urls.websiteUrl, label: "↗ sitio web", cls: "text-slate-400 hover:text-brand-primary" };
    return {
      href: `https://www.google.com/search?q=${encodeURIComponent(`${companyName} ${fieldLabel} ESG reporte sustentabilidad`)}`,
      label: "⌕ buscar",
      cls: "text-slate-400 hover:text-slate-600",
    };
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/dm-benchmark/export`);
      if (!res.ok) throw new Error("Export falló");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `benchmark-${clientName.replace(/\s+/g, "-")}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      push("error", "No se pudo exportar el benchmark");
    } finally {
      setExporting(false);
    }
  };

  const filterBar = (
    <div className="flex items-center gap-1.5 flex-wrap">
      {(["all", ...cats] as const).map((c) => {
        const count = c === "all" ? allFields.length : (catCounts[c] ?? 0);
        return (
          <button
            key={c}
            type="button"
            onClick={() => setTableFilter(c)}
            className={`px-2 py-0.5 rounded-sm text-[10px] font-medium border transition-colors ${
              tableFilter === c
                ? "bg-brand-primary text-white border-brand-primary"
                : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"
            }`}
          >
            {c === "all" ? "Todas" : catLabel[c]}
            <span className="ml-1 opacity-60">({count})</span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => setOnlyBrechas((v) => !v)}
        className={`px-2 py-0.5 rounded-sm text-[10px] font-medium border transition-colors ${
          onlyBrechas
            ? "bg-rose-50 text-rose-600 border-rose-200"
            : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"
        }`}
      >
        {onlyBrechas ? `Solo brechas (${filteredFields.length})` : "Solo brechas"}
      </button>
      {/* Divisor visual entre filtros de dimensión y filtro de empresa */}
      <div className="w-px h-3 bg-slate-200 self-center shrink-0 mx-0.5" />
      <span className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Empresa:</span>
      <button
        type="button"
        onClick={() => setColFilter("all")}
        className={`px-2 py-0.5 rounded-sm text-[10px] font-medium border transition-colors ${
          colFilter === "all"
            ? "bg-slate-700 text-white border-slate-700"
            : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"
        }`}
      >
        Todas ({allCompanies.length})
      </button>
      {REL_PILLS.filter((r) => (relCounts[r.key] ?? 0) > 0).map((r) => (
        <button
          key={r.key}
          type="button"
          onClick={() => setColFilter(r.key)}
          className={`px-2 py-0.5 rounded-sm text-[10px] font-medium border transition-colors ${
            colFilter === r.key
              ? "bg-slate-700 text-white border-slate-700"
              : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"
          }`}
        >
          {r.label} ({relCounts[r.key] ?? 0})
        </button>
      ))}
    </div>
  );

  // sticky top-0 en cada <th> con shadow bottom — border-collapse: collapse lo rompe con sticky
  const tableElement = (
    <table className="min-w-full w-max text-xs border-collapse">
      <thead>
        <tr>
          <th className="sticky left-0 top-0 z-[20] bg-white text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 pt-2 pb-3 pr-4 w-[200px] whitespace-nowrap shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06),0_2px_0_0_#cbd5e1]">
            Dimensión
          </th>
          <th className="sticky top-0 z-[11] text-left text-[10px] font-bold uppercase tracking-widest pt-2 pb-3 pr-6 whitespace-nowrap bg-brand-primary-light px-3 rounded-t text-brand-primary-dark shadow-[0_2px_0_0_#94a3b8]">
            {clientName}
            <span className="ml-1 font-normal normal-case text-[10px] text-brand-primary/60">· Cliente</span>
          </th>
          {visibleCompanies.map((company) => (
            <th
              key={company.name}
              title={company.name}
              className="sticky top-0 z-[11] bg-white text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 pt-2 pb-3 pr-6 whitespace-nowrap shadow-[0_2px_0_0_#cbd5e1]"
            >
              {abbrevCompanyName(company.name)}
              {company.relation && (
                <span className="ml-1 font-normal normal-case text-[10px] text-slate-400">
                  · {RELATION_LABELS[company.relation as CompanyRelation] ?? company.relation}
                </span>
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {filteredFields.length === 0 ? (
          <tr>
            <td
              colSpan={2 + visibleCompanies.length}
              className="py-6 text-center text-xs text-slate-400"
            >
              Sin dimensiones con ese filtro.
            </td>
          </tr>
        ) : (
          filteredFields.map((field) => {
            const cat = field.key.charAt(0).toUpperCase();
            const badge = CAT_BADGE[cat];
            const clientText = lookupComparisonValue(latestResult.comparison, field.key, clientName);
            return (
              <tr
                key={field.key}
                className="group even:bg-slate-50/60 hover:bg-brand-primary-light/20 transition-colors"
              >
                <td className="sticky left-0 z-10 w-[200px] bg-white group-even:bg-slate-50/60 group-hover:bg-brand-primary-light/20 py-3 pr-4 align-top shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]">
                  <div className="flex flex-col gap-0.5">
                    {badge && (
                      <span className={`inline-flex w-fit items-center px-1 py-px rounded-sm text-[9px] font-medium border ${badge.cls}`}>
                        {badge.label}
                      </span>
                    )}
                    <span className="font-medium text-slate-700 text-xs leading-snug">{field.label}</span>
                  </div>
                </td>
                <td className="py-3 pr-6 max-w-[220px] align-top bg-brand-primary-light/20 px-3">
                  <ExpandableCell text={clientText} defaultExpanded={onlyBrechas} />
                  {clientText && clientText !== "—" && !/^sin datos/i.test(clientText) && (() => {
                    const src = sourceHref(clientName, field.label);
                    const isClientData = src.label === "⌕ buscar";
                    return (
                      <a href={src.href} target="_blank" rel="noopener noreferrer"
                        title={isClientData ? "Información generada por IA — verificar con el cliente" : undefined}
                        className={`inline-flex items-center text-[9px] mt-0.5 ${src.cls}`}>
                        {isClientData ? "⌕ buscar (IA)" : src.label}
                      </a>
                    );
                  })()}
                  {(() => {
                    const clientScore = detectScore(clientText);
                    if (!clientScore) return null;
                    const peerBrechas = allCompanies.filter((c) =>
                      detectScore(lookupComparisonValue(latestResult.comparison, field.key, c.name)) === "brecha"
                    ).length;
                    if (clientScore === "sólido" && peerBrechas >= 2) {
                      return (
                        <p className="text-[9px] text-emerald-600 mt-0.5" title="Ventaja diferencial frente a referencias">
                          {peerBrechas}/{allCompanies.length} referencias con brecha ↑
                        </p>
                      );
                    }
                    if (clientScore === "brecha" && peerBrechas >= 3) {
                      return (
                        <p className="text-[9px] text-slate-400 mt-0.5" title="Brecha extendida en el sector">
                          {peerBrechas}/{allCompanies.length} también con brecha (sectorial)
                        </p>
                      );
                    }
                    return null;
                  })()}
                  {detectScore(clientText) === "brecha" && (
                    <button
                      type="button"
                      onClick={() => scrollToDmSection("dm-sec-iros")}
                      title="Ir a IROs para registrar esta brecha como riesgo u oportunidad"
                      className="inline-flex items-center gap-0.5 text-[9px] text-indigo-500 hover:text-indigo-700 mt-0.5 font-medium transition-colors"
                    >
                      + IRO →
                    </button>
                  )}
                </td>
                {visibleCompanies.map((company) => {
                  const compText = lookupComparisonValue(latestResult.comparison, field.key, company.name);
                  return (
                    <td key={company.name} className="py-3 pr-6 max-w-[220px] align-top">
                      <ExpandableCell text={compText} defaultExpanded={onlyBrechas} />
                      {compText && compText !== "—" && !/^sin datos/i.test(compText) && (() => {
                        const src = sourceHref(company.name, field.label);
                        return (
                          <a href={src.href} target="_blank" rel="noopener noreferrer"
                            className={`inline-flex items-center text-[9px] mt-0.5 ${src.cls}`}>
                            {src.label}
                          </a>
                        );
                      })()}
                    </td>
                  );
                })}
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );

  const scrollHint = visibleCompanies.length > 2 && (
    <p className="text-[10px] text-slate-400 mt-1 text-right">
      ← desliza para ver todas las empresas
    </p>
  );

  // Scorecard items para render
  const scorecardItems = [
    { key: "sólido" as const, cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: "●" },
    { key: "parcial" as const, cls: "bg-amber-50 text-amber-700 border-amber-200",   icon: "◑" },
    { key: "brecha"  as const, cls: "bg-rose-50 text-rose-600 border-rose-200",       icon: "○" },
  ] as const;

  return (
    <div className="mt-2">
      {/* Scorecard: posición global del cliente */}
      <div className="flex items-center gap-1.5 flex-wrap mb-3 px-0.5">
        <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest">
          {clientName}:
        </span>
        {scorecardItems.map(({ key, cls, icon }) =>
          scorecardAll[key] > 0 ? (
            <button
              key={key}
              type="button"
              onClick={() => setOnlyBrechas(key === "brecha")}
              title={`${scorecardAll[key]} de ${allFields.length} dimensiones — click para filtrar tabla`}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-medium border cursor-pointer hover:opacity-75 transition-opacity ${cls}`}
            >
              <span aria-hidden="true">{icon}</span>
              {scorecardAll[key]}/{allFields.length} {key}
            </button>
          ) : null
        )}
        {scorecardAll.otros > 0 && (
          <span className="text-[10px] text-slate-400 border border-slate-200 px-2 py-0.5 rounded-sm">
            {scorecardAll.otros} sin clasificar
          </span>
        )}
        {allCompanies.length > 0 && (
          <span
            title={`Media de dimensiones sólidas entre las ${allCompanies.length} empresas de referencia`}
            className="text-[10px] text-indigo-500 border border-indigo-100 bg-indigo-50 px-2 py-0.5 rounded-sm ml-1"
          >
            Ref: ~{peerAvgSolido}/{allFields.length} sólido
          </span>
        )}
      </div>

      {/* Análisis visual — 3 gráficas SVG */}
      <div className="mb-4">
        <button
          type="button"
          onClick={() => setChartsOpen((v) => !v)}
          className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors mb-2"
        >
          <svg
            className={`w-3 h-3 transition-transform ${chartsOpen ? "" : "-rotate-90"}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
          Análisis visual — posición ESG
        </button>
        {chartsOpen && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div className="bg-white border border-slate-100 rounded p-3">
              <p className="text-[9px] uppercase tracking-widest text-slate-400 font-bold mb-2">
                Posición relativa por empresa
              </p>
              <RankingChart
                companies={companyRanking}
                totalFields={allFields.length}
                peerAvgSolido={peerAvgSolido}
              />
            </div>
            <div className="bg-white border border-slate-100 rounded p-3">
              <p className="text-[9px] uppercase tracking-widest text-slate-400 font-bold mb-2">
                Cobertura por dimensión E/S/G
              </p>
              <RadarEsgChart catScores={catScores} />
            </div>
            {brechaUrgency.length > 0 && (
              <div className="md:col-span-2 bg-white border border-slate-100 rounded p-3">
                <p className="text-[9px] uppercase tracking-widest text-slate-400 font-bold mb-1">
                  Brechas por prioridad — ¿cuántas referencias comparten la misma brecha?
                </p>
                <p className="text-[9px] text-slate-400 mb-2">
                  Barra más larga = brecha exclusiva del cliente = más urgente de atender
                </p>
                <BrechaUrgencyChart items={brechaUrgency} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Header: título + filtros + acciones */}
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          {clientName} vs {allCompanies.length} empresa
          {allCompanies.length !== 1 ? "s" : ""} — posición por dimensión ESG
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {filterBar}
          <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
            <button
              type="button"
              disabled={exporting}
              onClick={() => void handleExport()}
              title="Exportar a Excel"
              className="px-2 py-0.5 rounded-sm text-[10px] font-medium border border-slate-200 bg-white text-slate-500 hover:border-slate-400 transition-colors disabled:opacity-50"
            >
              {exporting ? "Exportando…" : "↓ Excel"}
            </button>
            <button
              type="button"
              onClick={() => setTableFullscreen(true)}
              title="Pantalla completa"
              className="px-2 py-0.5 rounded-sm text-[10px] font-medium border border-slate-200 bg-white text-slate-500 hover:border-slate-400 transition-colors"
            >
              ⛶
            </button>
          </div>
        </div>
      </div>

      {/* Tabla — scroll horizontal modo normal */}
      {visibleCompanies.length > 3 && (
        <p className="text-[10px] text-slate-400 mb-1 text-right">
          → {visibleCompanies.length - 1} empresas más — desliza para ver todas
        </p>
      )}
      <div className="relative">
        <div ref={scrollRef} className="overflow-x-auto">
          {tableElement}
        </div>
        {/* Fade-right: indica scroll oculto a la derecha */}
        {canScrollRight && (
          <div
            className="absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-white to-transparent pointer-events-none"
            aria-hidden="true"
          />
        )}
      </div>
      {scrollHint}

      {/* CTA: convertir brechas en IROs */}
      {clientBrechaFields.length > 0 && (
        <div className="mt-3 flex items-center justify-between gap-3 px-3 py-2.5 bg-rose-50 border border-rose-200 rounded">
          <div>
            <p className="text-xs font-semibold text-rose-700">
              {clientBrechaFields.length} brecha{clientBrechaFields.length !== 1 ? "s" : ""} identificada{clientBrechaFields.length !== 1 ? "s" : ""}
            </p>
            <p className="text-[10px] text-rose-600 mt-0.5">
              Convierte las brechas de {clientName} en IROs para construir el plan de acción
            </p>
          </div>
          <button
            type="button"
            onClick={() => scrollToDmSection("dm-sec-iros")}
            className="shrink-0 px-3 py-1.5 rounded text-[10px] font-bold bg-rose-600 text-white hover:bg-rose-700 transition-colors whitespace-nowrap"
          >
            Ir a IROs →
          </button>
        </div>
      )}

      {/* Overlay fullscreen */}
      {tableFullscreen && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
          <div className="flex items-center justify-between gap-4 px-6 pt-4 pb-3 border-b border-slate-200 flex-shrink-0 flex-wrap">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              {clientName} vs {allCompanies.length} empresa
              {allCompanies.length !== 1 ? "s" : ""} — posición por dimensión ESG
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              {filterBar}
              <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
                <button
                  type="button"
                  disabled={exporting}
                  onClick={() => void handleExport()}
                  title="Exportar a Excel"
                  className="px-2 py-0.5 rounded-sm text-[10px] font-medium border border-slate-200 bg-white text-slate-500 hover:border-slate-400 transition-colors disabled:opacity-50"
                >
                  {exporting ? "Exportando…" : "↓ Excel"}
                </button>
                <button
                  type="button"
                  onClick={() => setTableFullscreen(false)}
                  title="Cerrar (Esc)"
                  className="px-2 py-0.5 rounded-sm text-[10px] font-medium border border-slate-200 bg-white text-slate-500 hover:border-slate-400 transition-colors"
                >
                  ✕ Cerrar
                </button>
              </div>
            </div>
          </div>
          <div
            className="flex-1 overflow-auto px-6 py-4 outline-none"
            tabIndex={0}
            autoFocus
            style={{ cursor: isDragging ? "grabbing" : "grab" }}
            onKeyDown={(e) => {
              const el = e.currentTarget;
              const hStep = e.shiftKey ? 400 : 150;
              if (e.key === "ArrowRight") { e.preventDefault(); el.scrollLeft += hStep; }
              if (e.key === "ArrowLeft")  { e.preventDefault(); el.scrollLeft -= hStep; }
            }}
            onPointerDown={(e) => {
              const t = e.target as HTMLElement;
              if (t.closest("a, button, input")) return;
              if (e.button !== 0) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              const el = e.currentTarget;
              dragRef.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop };
              setIsDragging(true);
            }}
            onPointerMove={(e) => {
              if (!dragRef.current) return;
              const el = e.currentTarget;
              el.scrollLeft = dragRef.current.sl - (e.clientX - dragRef.current.x);
              el.scrollTop  = dragRef.current.st - (e.clientY - dragRef.current.y);
            }}
            onPointerUp={(e) => {
              if (!dragRef.current) return;
              const moved = Math.abs(e.clientX - dragRef.current.x) > 5 || Math.abs(e.clientY - dragRef.current.y) > 5;
              if (moved) e.preventDefault();
              dragRef.current = null;
              setIsDragging(false);
            }}
            onPointerCancel={() => { dragRef.current = null; setIsDragging(false); }}
          >
            {tableElement}
            {scrollHint}
          </div>
        </div>
      )}
    </div>
  );
}
