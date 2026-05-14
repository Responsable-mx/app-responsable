"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { ExpandableCell } from "./ExpandableCell";
import type { BenchmarkCompany } from "./benchmark-types";
import {
  TIPO_LABELS, TIPO_BADGE,
  CADENA_LABELS,
  HORIZONTE_LABELS,
  FUENTE_LABELS, FUENTE_BADGE,
  CONFIANZA_LABELS, CONFIANZA_BADGE,
  type BenchmarkCompanyIro,
  type BenchmarkIroBatch,
  type BenchmarkIroTipo,
  type BenchmarkIroHorizonte,
} from "@/lib/dm/benchmark-iro-types";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

type IroGroup = {
  company_id: string;
  company_name: string;
  batch: BenchmarkIroBatch | null;
  iros: BenchmarkCompanyIro[];
};

function downloadCsv(groups: IroGroup[]) {
  const header = ["Empresa", "# IRO", "Descripción", "Tipo", "Cadena de valor", "Horizonte", "Tema asociado", "Fuente", "Confianza"];
  const rows: string[][] = [];
  for (const g of groups) {
    for (const iro of g.iros) {
      rows.push([
        g.company_name,
        String(iro.n_iro),
        iro.descripcion,
        TIPO_LABELS[iro.tipo],
        CADENA_LABELS[iro.cadena],
        HORIZONTE_LABELS[iro.horizonte],
        iro.tema_asociado ?? "",
        FUENTE_LABELS[iro.fuente_tipo],
        CONFIANZA_LABELS[iro.confianza],
      ]);
    }
  }
  const csv = [header, ...rows]
    .map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "IROs-empresas-referencia.csv";
  a.click();
  URL.revokeObjectURL(url);
}

type SummaryStats = {
  total: number;
  byTipo: Record<BenchmarkIroTipo, number>;
  companiesWithIros: number;
};

function computeSummary(groups: IroGroup[]): SummaryStats {
  const byTipo: Record<BenchmarkIroTipo, number> = {
    impacto_positivo: 0,
    impacto_negativo: 0,
    riesgo: 0,
    oportunidad: 0,
  };
  let total = 0;
  let companiesWithIros = 0;
  for (const g of groups) {
    if (g.iros.length > 0) companiesWithIros++;
    for (const iro of g.iros) {
      byTipo[iro.tipo]++;
      total++;
    }
  }
  return { total, byTipo, companiesWithIros };
}

export function BenchmarkIrosSection({
  clientId,
  companies,
}: {
  clientId: string;
  companies: BenchmarkCompany[];
}) {
  const { push } = useToast();
  const validatedCompanies = companies.filter((c) => c.validated);
  const [isPolling, setIsPolling] = useState(false);
  const [generating, setGenerating] = useState<Set<string>>(new Set());
  const [activeCompanyId, setActiveCompanyId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const empresaParam = new URLSearchParams(window.location.search).get("empresa");
      if (empresaParam) {
        const match = companies.filter((c) => c.validated).find((c) => c.id === empresaParam);
        if (match) return match.id;
      }
    }
    return validatedCompanies[0]?.id ?? "";
  });
  const [showCallout, setShowCallout] = useState(true);
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);

  // Write empresa param to URL when active company changes
  useEffect(() => {
    if (!activeCompanyId) return;
    const params = new URLSearchParams(window.location.search);
    params.set("empresa", activeCompanyId);
    const newUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
    window.history.replaceState(null, "", newUrl);
  }, [activeCompanyId]);

  const irosKey = validatedCompanies.length > 0
    ? `/api/clients/${clientId}/dm-benchmark-company-iros`
    : null;

  const { data: resp, mutate, isLoading: loadingIros } = useSWR<{ data: { groups: IroGroup[] } }>(
    irosKey,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: isPolling ? 5_000 : 0 }
  );

  const groups = useMemo(() => resp?.data?.groups ?? [], [resp]);
  const prevStatusesRef = useRef<Record<string, string>>({});
  const didAutoStartRef = useRef(false);

  const summary = useMemo(() => computeSummary(groups), [groups]);

  // Auto-restart polling if pending batches exist when data first loads
  useEffect(() => {
    if (didAutoStartRef.current || groups.length === 0) return;
    const hasPending = groups.some((g) => g.batch?.status === "pending");
    if (hasPending) {
      didAutoStartRef.current = true;
      for (const g of groups) {
        if (g.batch?.status === "pending") {
          prevStatusesRef.current[g.company_id] = "pending";
        }
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect -- auto-restart polling al detectar batches pendientes; didAutoStartRef previene re-entrada
      setIsPolling(true);
    }
  }, [groups]);

  // Detect completion and notify per company
  useEffect(() => {
    if (!isPolling || groups.length === 0) return;
    let hasPending = false;
    for (const g of groups) {
      const prev = prevStatusesRef.current[g.company_id];
      const curr = g.batch?.status;
      if (prev === "pending" && curr === "done") {
        push("success", `IROs de ${g.company_name} generados.`);
      }
      if (prev === "pending" && curr === "failed") {
        push("error", `Falló la generación para ${g.company_name}. Intenta de nuevo.`);
      }
      if (curr) prevStatusesRef.current[g.company_id] = curr;
      if (curr === "pending") hasPending = true;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza estado polling con estado real de batches; isPolling en deps previene loop
    if (!hasPending) setIsPolling(false);
  }, [groups, isPolling, push]);

  // Set default active company when validated list loads
  useEffect(() => {
    if (!activeCompanyId && validatedCompanies.length > 0 && validatedCompanies[0]) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- inicializa tab activa cuando llegan los datos; guard !activeCompanyId previene loop
      setActiveCompanyId(validatedCompanies[0].id);
    }
  }, [validatedCompanies, activeCompanyId]);

  const generateIros = async (companyId: string) => {
    if (generating.has(companyId)) return;
    setGenerating((prev) => new Set(prev).add(companyId));
    try {
      const res = await fetch(`/api/clients/${clientId}/dm-benchmark-company-iros`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        push("error", err.error ?? "Error al generar IROs.");
        return;
      }
      prevStatusesRef.current[companyId] = "pending";
      didAutoStartRef.current = true;
      setIsPolling(true);
      void mutate();
    } catch {
      push("error", "Error de conexión.");
    } finally {
      setGenerating((prev) => {
        const next = new Set(prev);
        next.delete(companyId);
        return next;
      });
    }
  };

  const [bulkGenerating, setBulkGenerating] = useState(false);

  if (validatedCompanies.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-slate-400 border border-dashed border-slate-200 rounded">
        No hay empresas validadas. Valida al menos una empresa en Etapa 3.
      </div>
    );
  }

  const activeGroup = groups.find((g) => g.company_id === activeCompanyId) ?? null;
  const activeCompany = validatedCompanies.find((c) => c.id === activeCompanyId);

  // Companies that still need IROs generated (no batch or batch failed, not currently pending/generating)
  const pendingGeneration = validatedCompanies.filter((c) => {
    const group = groups.find((g) => g.company_id === c.id);
    const status = group?.batch?.status;
    return status !== "done" && status !== "pending" && !generating.has(c.id);
  });

  // Primer uso = datos cargados y NINGUNA empresa tiene IROs aún
  const dataLoaded = !loadingIros && resp !== undefined;
  const isFirstUse = dataLoaded && pendingGeneration.length === validatedCompanies.length;

  const generateAll = async () => {
    if (bulkGenerating || pendingGeneration.length === 0) return;
    setBulkGenerating(true);
    let queued = 0;
    for (const company of pendingGeneration) {
      await generateIros(company.id);
      queued++;
      // Pequeña pausa entre requests para no saturar el rate limit DB
      if (queued < pendingGeneration.length) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }
    setBulkGenerating(false);
  };

  return (
    <div className="space-y-4">
      {/* ── Callout pedagógico: qué hace el consultor aquí ── */}
      {showCallout && (
        <div className="flex items-start gap-2 px-3 py-2.5 bg-brand-primary-light border border-brand-primary/20 rounded text-xs text-slate-600">
          <svg className="w-3.5 h-3.5 shrink-0 mt-0.5 text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            Estos son los IROs que otras empresas del sector ya están reportando. Revísalos como referencia — los temas que aparecen en más empresas son los más relevantes para adaptar al cliente en el siguiente paso.
          </span>
          <button
            type="button"
            onClick={() => setShowCallout(false)}
            className="ml-auto shrink-0 text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Cerrar"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* ── Summary cross-empresa ── */}
      {summary.total > 0 && (
        <div className="flex items-center gap-3 flex-wrap px-3 py-2 bg-slate-50 border border-slate-200 rounded">
          <span className="uppercase tracking-widest text-[10px] font-bold text-slate-400 shrink-0">
            {summary.companiesWithIros} emp. · {summary.total} IROs
          </span>
          {/* Stacked bar */}
          <div className="flex h-2 w-32 rounded overflow-hidden shrink-0 gap-px" aria-hidden="true">
            {summary.byTipo.riesgo > 0 && (
              <div
                className="h-full bg-amber-400"
                style={{ width: `${(summary.byTipo.riesgo / summary.total) * 100}%` }}
                title={`Riesgos: ${summary.byTipo.riesgo}`}
              />
            )}
            {summary.byTipo.impacto_negativo > 0 && (
              <div
                className="h-full bg-rose-400"
                style={{ width: `${(summary.byTipo.impacto_negativo / summary.total) * 100}%` }}
                title={`Impactos negativos: ${summary.byTipo.impacto_negativo}`}
              />
            )}
            {summary.byTipo.oportunidad > 0 && (
              <div
                className="h-full bg-blue-400"
                style={{ width: `${(summary.byTipo.oportunidad / summary.total) * 100}%` }}
                title={`Oportunidades: ${summary.byTipo.oportunidad}`}
              />
            )}
            {summary.byTipo.impacto_positivo > 0 && (
              <div
                className="h-full bg-emerald-400"
                style={{ width: `${(summary.byTipo.impacto_positivo / summary.total) * 100}%` }}
                title={`Impactos positivos: ${summary.byTipo.impacto_positivo}`}
              />
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap text-[10px] text-slate-500">
            {summary.byTipo.riesgo > 0 && (
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-sm bg-amber-400" />
                {summary.byTipo.riesgo} Riesgos
              </span>
            )}
            {summary.byTipo.impacto_negativo > 0 && (
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-sm bg-rose-400" />
                {summary.byTipo.impacto_negativo} Imp. neg.
              </span>
            )}
            {summary.byTipo.oportunidad > 0 && (
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-sm bg-blue-400" />
                {summary.byTipo.oportunidad} Oport.
              </span>
            )}
            {summary.byTipo.impacto_positivo > 0 && (
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-sm bg-emerald-400" />
                {summary.byTipo.impacto_positivo} Imp. pos.
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => downloadCsv(groups)}
            className="ml-auto shrink-0 p-1.5 rounded-sm border border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-white hover:border-slate-300 transition-colors"
            title="Exportar IROs de todas las empresas (CSV)"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span className="sr-only">Exportar Excel</span>
          </button>
        </div>
      )}

      {/* ── Bulk generate banner ── */}
      {pendingGeneration.length > 0 && dataLoaded && (
        <div className={`flex items-center justify-between gap-3 flex-wrap py-2 px-3 border rounded ${
          isFirstUse
            ? "bg-brand-primary-light border-brand-primary/30"
            : "bg-slate-50 border-slate-200"
        }`}>
          <span className="text-xs text-slate-600">
            {isFirstUse ? (
              <>Analiza los IROs de las <span className="font-medium text-slate-700">{pendingGeneration.length} empresas</span> de referencia con IA</>
            ) : (
              <><span className="font-medium text-slate-700">{pendingGeneration.length}</span> empresa{pendingGeneration.length !== 1 ? "s" : ""} sin IROs generados</>
            )}
          </span>
          <Button
            variant="primary"
            size="sm"
            loading={bulkGenerating || isPolling}
            onClick={() => void generateAll()}
          >
            {isFirstUse
              ? `Generar todos (${pendingGeneration.length})`
              : `Generar pendientes (${pendingGeneration.length})`}
          </Button>
        </div>
      )}

      {/* ── Company tabs + acciones en la misma fila ── */}
      {(() => {
        const activeGroupLocal = groups.find((g) => g.company_id === activeCompanyId) ?? null;
        const activeHasIros = (activeGroupLocal?.iros ?? []).length > 0;
        const activeIsPending = activeGroupLocal?.batch?.status === "pending";
        const activeIsGenerating = generating.has(activeCompanyId);
        const showRegenBtn = !isFirstUse || activeHasIros;

        return (
          <>
            <div className="flex gap-1 flex-wrap items-center pb-1 border-b border-slate-100">
              {validatedCompanies.map((company) => {
                const group = groups.find((g) => g.company_id === company.id);
                const batch = group?.batch ?? null;
                const hasIros = (group?.iros ?? []).length > 0;
                const isPending = batch?.status === "pending";
                const isFailed = batch?.status === "failed";
                const isDone = batch?.status === "done" && hasIros;
                const isActive = activeCompanyId === company.id;
                const MAX_TAB = 22;
                const tabLabel = company.name.length > MAX_TAB
                  ? company.name.slice(0, MAX_TAB) + "…"
                  : company.name;

                return (
                  <button
                    key={company.id}
                    type="button"
                    title={company.name.length > MAX_TAB ? company.name : undefined}
                    onClick={() => setActiveCompanyId(company.id)}
                    className={[
                      "px-3 py-1.5 text-xs font-medium rounded-sm border transition-colors",
                      isActive
                        ? "bg-white border-brand-primary text-brand-primary"
                        : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-white hover:border-slate-300",
                    ].join(" ")}
                  >
                    {tabLabel}
                    {hasIros && (
                      <span className="ml-1.5 tabular-nums text-[10px] opacity-60">
                        [{group!.iros.length}]
                      </span>
                    )}
                    {isDone && !isActive && (
                      <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" aria-label="revisado" />
                    )}
                    {isPending && (
                      <span
                        className="ml-1.5 inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse"
                        aria-label="generando"
                      />
                    )}
                    {isFailed && (
                      <span className="ml-1.5 text-rose-500" aria-label="falló">!</span>
                    )}
                  </button>
                );
              })}

              {/* Acción per-empresa */}
              <div className="ml-auto flex items-center shrink-0 pl-2">
                {showRegenBtn && (
                  activeHasIros ? (
                    <button
                      type="button"
                      disabled={activeIsGenerating || activeIsPending}
                      onClick={() => setShowRegenConfirm(true)}
                      className="p-1.5 rounded-sm border border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-white hover:border-slate-300 transition-colors disabled:opacity-50"
                      title={`Regenerar IROs de ${activeCompany?.name ?? "esta empresa"}`}
                    >
                      {activeIsGenerating || activeIsPending ? (
                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      )}
                      <span className="sr-only">Regenerar IROs</span>
                    </button>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      loading={activeIsGenerating || activeIsPending}
                      onClick={() => void generateIros(activeCompanyId)}
                    >
                      Generar IROs
                    </Button>
                  )
                )}
              </div>
            </div>

            {/* ConfirmModal para Regenerar — en el padre para acceso a generateIros */}
            <ConfirmModal
              open={showRegenConfirm}
              onCancel={() => setShowRegenConfirm(false)}
              onConfirm={() => { setShowRegenConfirm(false); void generateIros(activeCompanyId); }}
              title="Regenerar IROs"
              description={`¿Regenerar los IROs de ${activeCompany?.name ?? "esta empresa"}? Los actuales serán reemplazados y no se pueden recuperar.`}
              confirmLabel="Regenerar"
              tone="destructive"
            />
          </>
        );
      })()}

      {/* ── Active company panel ── */}
      {activeCompany && (
        <CompanyIroPanel
          company={activeCompany}
          group={activeGroup}
          isGenerating={generating.has(activeCompanyId)}
        />
      )}
    </div>
  );
}

// Tooltip descriptions for chips
const FUENTE_TOOLTIP: Record<string, string> = {
  reporte:          "Dato extraído directamente del informe de sostenibilidad de la empresa.",
  sitio_web:        "Dato obtenido del sitio web corporativo.",
  interpretacion_ia: "La IA interpretó este IRO a partir del contexto del informe, no está enunciado literalmente.",
};

const CONFIANZA_TOOLTIP: Record<string, string> = {
  alto:  "Alta confianza: el IRO está respaldado por evidencia explícita en el informe.",
  medio: "Confianza media: el IRO se infiere de forma razonable a partir del informe.",
  bajo:  "Confianza baja: el IRO es una interpretación con poca evidencia directa — verificar manualmente.",
};

function CompanyIroPanel({
  company,
  group,
  isGenerating: _isGenerating,
}: {
  company: BenchmarkCompany;
  group: IroGroup | null;
  isGenerating: boolean;
}) {
  const batch = group?.batch ?? null;
  const iros = useMemo(() => group?.iros ?? [], [group]);
  const isPending = batch?.status === "pending";
  const isFailed = batch?.status === "failed" && !isPending;

  // Filtros sobre la lista de IROs
  const [filterTipo, setFilterTipo] = useState<BenchmarkIroTipo | "">("");
  const [filterHorizonte, setFilterHorizonte] = useState<BenchmarkIroHorizonte | "">("");

  // Limpiar filtros si cambia la empresa (group cambia)
  const prevGroupIdRef = useRef<string | null>(null);
  useEffect(() => {
    const currentId = group?.company_id ?? null;
    if (prevGroupIdRef.current !== null && prevGroupIdRef.current !== currentId) {
      setFilterTipo("");
      setFilterHorizonte("");
    }
    prevGroupIdRef.current = currentId;
  }, [group]);

  const filteredIros = useMemo(() => {
    return iros.filter((iro) => {
      if (filterTipo && iro.tipo !== filterTipo) return false;
      if (filterHorizonte && iro.horizonte !== filterHorizonte) return false;
      return true;
    });
  }, [iros, filterTipo, filterHorizonte]);

  // Chips presentes en los IROs actuales (para mostrar solo filtros relevantes)
  const availableTipos = useMemo(
    () => [...new Set(iros.map((i) => i.tipo))] as BenchmarkIroTipo[],
    [iros]
  );
  const availableHorizontes = useMemo(
    () => [...new Set(iros.map((i) => i.horizonte))] as BenchmarkIroHorizonte[],
    [iros]
  );

  return (
    <div className="space-y-3">
      {/* Company header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-slate-700">{company.name}</span>
          {company.sector && (
            <span className="text-xs text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-sm">
              {company.sector}
            </span>
          )}
          {company.country && (
            <span className="text-xs text-slate-400">{company.country}</span>
          )}
          {company.sustainability_report_url && (
            <a
              href={company.sustainability_report_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-slate-400 hover:text-brand-primary inline-flex items-center gap-0.5"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Informe
            </a>
          )}
        </div>
      </div>

      {/* Status banners */}
      {isPending && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          <svg className="w-3.5 h-3.5 shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Analizando el informe de sostenibilidad… puede tomar 1–2 minutos.
        </div>
      )}
      {isFailed && (
        <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">
          {batch?.error_msg ?? "La generación falló."} Intenta de nuevo.
        </div>
      )}

      {/* ── Filtros ── */}
      {iros.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {/* Tipo */}
          <div className="flex items-center gap-1 flex-wrap">
            <button
              type="button"
              onClick={() => setFilterTipo("")}
              className={[
                "px-2 py-0.5 text-[10px] font-medium rounded-sm border transition-colors",
                filterTipo === ""
                  ? "bg-slate-700 text-white border-slate-700"
                  : "bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300",
              ].join(" ")}
            >
              Todos
            </button>
            {availableTipos.map((tipo) => (
              <button
                key={tipo}
                type="button"
                onClick={() => setFilterTipo(filterTipo === tipo ? "" : tipo)}
                className={[
                  "px-2 py-0.5 text-[10px] font-medium rounded-sm border transition-colors",
                  filterTipo === tipo
                    ? TIPO_BADGE[tipo]
                    : "bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300",
                ].join(" ")}
              >
                {TIPO_LABELS[tipo]}
              </button>
            ))}
          </div>
          {/* Divider */}
          {availableHorizontes.length > 1 && (
            <span className="w-px h-4 bg-slate-200 shrink-0" aria-hidden="true" />
          )}
          {/* Horizonte */}
          {availableHorizontes.length > 1 && availableHorizontes.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setFilterHorizonte(filterHorizonte === h ? "" : h)}
              className={[
                "px-2 py-0.5 text-[10px] font-medium rounded-sm border transition-colors",
                filterHorizonte === h
                  ? "bg-slate-700 text-white border-slate-700"
                  : "bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300",
              ].join(" ")}
            >
              {HORIZONTE_LABELS[h]}
            </button>
          ))}
          {/* Results count */}
          {(filterTipo !== "" || filterHorizonte !== "") && (
            <span className="text-[10px] text-slate-400 ml-auto">
              {filteredIros.length} de {iros.length}
            </span>
          )}
        </div>
      )}

      {/* IRO list */}
      {filteredIros.length > 0 && (
        <div className="rounded border border-slate-200 divide-y divide-slate-100">
          {filteredIros.map((iro, idx) => (
            <div
              key={iro.id}
              className={[
                "flex gap-3 px-3 py-3 items-start transition-colors hover:bg-slate-50",
                idx % 2 !== 0 ? "bg-slate-50/40" : "bg-white",
              ].join(" ")}
            >
              {/* Número */}
              <span className="text-slate-400 tabular-nums font-mono text-[11px] w-5 shrink-0 pt-0.5">
                {iro.n_iro}
              </span>
              {/* Descripción + chips */}
              <div className="flex-1 min-w-0">
                <ExpandableCell text={iro.descripcion} showScore={false} />
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {/* Tipo */}
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-medium border ${TIPO_BADGE[iro.tipo]}`}>
                    {TIPO_LABELS[iro.tipo]}
                  </span>
                  {/* Cadena */}
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] bg-slate-100 text-slate-600 border border-slate-200">
                    {CADENA_LABELS[iro.cadena]}
                  </span>
                  {/* Horizonte */}
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] bg-slate-100 text-slate-600 border border-slate-200">
                    {HORIZONTE_LABELS[iro.horizonte]}
                  </span>
                  {/* Tema asociado (ESRS) — truncado con tooltip completo */}
                  {iro.tema_asociado && (
                    <span
                      className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] bg-slate-50 text-slate-500 border border-slate-200 max-w-[200px] truncate"
                      title={iro.tema_asociado}
                    >
                      {iro.tema_asociado}
                    </span>
                  )}
                  {/* Fuente — con tooltip explicativo */}
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-medium border cursor-default ${FUENTE_BADGE[iro.fuente_tipo]}`}
                    title={FUENTE_TOOLTIP[iro.fuente_tipo]}
                  >
                    {FUENTE_LABELS[iro.fuente_tipo]}
                  </span>
                  {/* Confianza — con tooltip explicativo */}
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-medium border cursor-default ${CONFIANZA_BADGE[iro.confianza]}`}
                    title={CONFIANZA_TOOLTIP[iro.confianza]}
                  >
                    {CONFIANZA_LABELS[iro.confianza]}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filtered empty state */}
      {iros.length > 0 && filteredIros.length === 0 && (
        <div className="py-6 text-center text-sm text-slate-400 border border-dashed border-slate-200 rounded">
          Ningún IRO coincide con los filtros seleccionados.
          <button
            type="button"
            onClick={() => { setFilterTipo(""); setFilterHorizonte(""); }}
            className="ml-2 text-brand-primary hover:underline"
          >
            Limpiar filtros
          </button>
        </div>
      )}

      {!isPending && !isFailed && iros.length === 0 && (
        <div className="py-8 text-center text-sm text-slate-400 border border-dashed border-slate-200 rounded">
          Sin IROs generados. Usa el botón &ldquo;Generar IROs con IA&rdquo; para analizar esta empresa.
        </div>
      )}
    </div>
  );
}
