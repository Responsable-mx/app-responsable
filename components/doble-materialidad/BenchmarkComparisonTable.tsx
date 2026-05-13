"use client";

import { useState, useRef, useEffect } from "react";
import { useToast } from "@/components/ui/Toast";
import { RELATION_LABELS, type CompanyRelation } from "@/lib/dm/fields";
import { ExpandableCell } from "@/components/doble-materialidad/ExpandableCell";
import type { BenchmarkResult } from "./benchmark-types";
import { lookupComparisonValue, abbrevCompanyName } from "./benchmark-helpers";

const cats = ["E", "S", "G"] as const;
const catLabel: Record<string, string> = { E: "Ambiental", S: "Social", G: "Gobernanza" };
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
}: {
  clientId: string;
  clientName: string;
  latestResult: BenchmarkResult;
}) {
  const { push } = useToast();
  const [tableFilter, setTableFilter] = useState<"all" | "E" | "S" | "G">("all");
  const [onlyBrechas, setOnlyBrechas] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [tableFullscreen, setTableFullscreen] = useState(false);
  const [colFilter, setColFilter] = useState<
    "all" | "competitor_nacional" | "competitor_internacional" | "sector" | "cadena_valor"
  >("all");
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);

  useEffect(() => {
    if (!tableFullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setTableFullscreen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tableFullscreen]);

  const allFields = latestResult.fields_snapshot;
  const allCompanies = latestResult.companies_snapshot;

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

  const searchHref = (companyName: string, fieldLabel: string) =>
    `https://www.google.com/search?q=${encodeURIComponent(`${companyName} ${fieldLabel} ESG reporte sustentabilidad`)}`;

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
    <div className="flex flex-col gap-1.5">
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
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold mr-0.5">Empresa:</span>
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
                  <ExpandableCell text={clientText} />
                  {clientText && clientText !== "—" && !/^sin datos/i.test(clientText) && (
                    <a
                      href={searchHref(clientName, field.label)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-[9px] text-slate-400 hover:text-brand-primary mt-0.5"
                    >
                      ↗ fuente
                    </a>
                  )}
                </td>
                {visibleCompanies.map((company) => {
                  const compText = lookupComparisonValue(latestResult.comparison, field.key, company.name);
                  return (
                    <td key={company.name} className="py-3 pr-6 max-w-[220px] align-top">
                      <ExpandableCell text={compText} />
                      {compText && compText !== "—" && !/^sin datos/i.test(compText) && (
                        <a
                          href={searchHref(company.name, field.label)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center text-[9px] text-slate-400 hover:text-brand-primary mt-0.5"
                        >
                          ↗ fuente
                        </a>
                      )}
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

  return (
    <div className="mt-2">
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
      <div className="relative overflow-x-auto">
        {tableElement}
      </div>
      {scrollHint}

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
