"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
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
  const [activeCompanyId, setActiveCompanyId] = useState<string>(
    validatedCompanies[0]?.id ?? ""
  );

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
  const [bulkGenerating, setBulkGenerating] = useState(false);

  // Primer uso = datos cargados y NINGUNA empresa tiene IROs aún
  const dataLoaded = !loadingIros && resp !== undefined;
  const isFirstUse = dataLoaded && pendingGeneration.length === validatedCompanies.length;
  const allDone = dataLoaded && pendingGeneration.length === 0;

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
      {/* ── Bulk generate banner ── */}
      {/* Primer uso: banner prominente, sin botones individuales */}
      {/* Parcial: banner secundario + botones individuales en tabs pendientes */}
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
      {/* ── Company tabs ── */}
      <div className="flex gap-1 flex-wrap pb-1 border-b border-slate-100">
        {validatedCompanies.map((company) => {
          const group = groups.find((g) => g.company_id === company.id);
          const batch = group?.batch ?? null;
          const hasIros = (group?.iros ?? []).length > 0;
          const isPending = batch?.status === "pending";
          const isFailed = batch?.status === "failed";
          const isActive = activeCompanyId === company.id;

          return (
            <button
              key={company.id}
              type="button"
              onClick={() => setActiveCompanyId(company.id)}
              className={[
                "px-3 py-1.5 text-xs font-medium rounded-sm border transition-colors",
                isActive
                  ? "bg-white border-brand-primary text-brand-primary"
                  : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-white hover:border-slate-300",
              ].join(" ")}
            >
              {company.name}
              {hasIros && (
                <span className="ml-1.5 tabular-nums text-[10px] opacity-60">
                  [{group!.iros.length}]
                </span>
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
      </div>

      {/* ── Active company panel ── */}
      {activeCompany && (
        <CompanyIroPanel
          company={activeCompany}
          group={activeGroup}
          isGenerating={generating.has(activeCompanyId)}
          onGenerate={() => void generateIros(activeCompanyId)}
          hideGenerateBtn={isFirstUse}
          allDone={allDone}
        />
      )}
    </div>
  );
}

function CompanyIroPanel({
  company,
  group,
  isGenerating,
  onGenerate,
  hideGenerateBtn = false,
  allDone = false,
}: {
  company: BenchmarkCompany;
  group: IroGroup | null;
  isGenerating: boolean;
  onGenerate: () => void;
  /** Primer uso: banner es el CTA principal, ocultar botón individual */
  hideGenerateBtn?: boolean;
  /** Todas las empresas ya generadas: botón cambia a "↺ Regenerar" */
  allDone?: boolean;
}) {
  const batch = group?.batch ?? null;
  const iros = group?.iros ?? [];
  const isPending = batch?.status === "pending";
  const isFailed = batch?.status === "failed" && !isPending;
  const hasDone = iros.length > 0;

  // Etiqueta y estilo del botón según contexto
  const btnLabel = hasDone
    ? "↺ Regenerar"
    : "Generar IROs con IA";
  const btnVariant: "primary" | "secondary" | "ghost" = hasDone ? "secondary" : "primary";

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
        {/* Ocultar en primer uso (banner es CTA principal). Mostrar siempre si allDone o si tiene IROs. */}
        {(!hideGenerateBtn || hasDone) && (
          <Button
            variant={btnVariant}
            size="sm"
            loading={isGenerating || isPending}
            onClick={onGenerate}
            title={hasDone ? `Regenerar IROs de ${company.name}` : undefined}
          >
            {btnLabel}
          </Button>
        )}
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

      {/* IRO table */}
      {iros.length > 0 && (
        <div className="overflow-x-auto rounded border border-slate-200">
          <table className="min-w-full w-max text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left uppercase tracking-widest text-[10px] font-bold text-slate-400 w-10">#</th>
                <th className="px-3 py-2 text-left uppercase tracking-widest text-[10px] font-bold text-slate-400 min-w-[300px]">IRO identificado</th>
                <th className="px-3 py-2 text-left uppercase tracking-widest text-[10px] font-bold text-slate-400 whitespace-nowrap">Clasificación</th>
                <th className="px-3 py-2 text-left uppercase tracking-widest text-[10px] font-bold text-slate-400 whitespace-nowrap">¿Dónde ocurre?</th>
                <th className="px-3 py-2 text-left uppercase tracking-widest text-[10px] font-bold text-slate-400 whitespace-nowrap">Horizonte</th>
                <th className="px-3 py-2 text-left uppercase tracking-widest text-[10px] font-bold text-slate-400 min-w-[140px]">Tema asociado</th>
                <th className="px-3 py-2 text-left uppercase tracking-widest text-[10px] font-bold text-slate-400 whitespace-nowrap">Fuente</th>
                <th className="px-3 py-2 text-left uppercase tracking-widest text-[10px] font-bold text-slate-400 whitespace-nowrap">Confianza IA</th>
              </tr>
            </thead>
            <tbody>
              {iros.map((iro, idx) => (
                <tr
                  key={iro.id}
                  className={[
                    "border-b border-slate-100 transition-colors hover:bg-slate-50",
                    idx % 2 === 0 ? "bg-white" : "bg-slate-50/40",
                  ].join(" ")}
                >
                  <td className="sticky left-0 z-10 bg-inherit px-3 py-2.5 text-slate-400 tabular-nums font-mono text-[11px]">
                    {iro.n_iro}
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <ExpandableCell text={iro.descripcion} />
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap align-top">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-medium border ${TIPO_BADGE[iro.tipo]}`}>
                      {TIPO_LABELS[iro.tipo]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap align-top text-slate-600">
                    {CADENA_LABELS[iro.cadena]}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap align-top">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] bg-slate-100 text-slate-600 border border-slate-200">
                      {HORIZONTE_LABELS[iro.horizonte]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 align-top text-slate-600">
                    {iro.tema_asociado ?? <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap align-top">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-medium border ${FUENTE_BADGE[iro.fuente_tipo]}`}>
                      {FUENTE_LABELS[iro.fuente_tipo]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap align-top">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-medium border ${CONFIANZA_BADGE[iro.confianza]}`}>
                      {CONFIANZA_LABELS[iro.confianza]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isPending && !isFailed && iros.length === 0 && (
        <div className="py-8 text-center text-sm text-slate-400 border border-dashed border-slate-200 rounded">
          {hideGenerateBtn
            ? "Sin IROs generados. Usa el botón superior para analizar todas las empresas."
            : "Sin IROs generados. Haz clic en \"Generar IROs con IA\" para analizar esta empresa."}
        </div>
      )}
    </div>
  );
}
