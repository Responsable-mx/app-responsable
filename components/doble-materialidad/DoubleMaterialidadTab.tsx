"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import useSWR from "swr";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { SkeletonList } from "@/components/ui/Skeleton";
import { BENCHMARK_FIELDS, RELATION_LABELS, type CompanyRelation } from "@/lib/dm/fields";

// ── Tipos ────────────────────────────────────────────────────

type BenchmarkCompany = {
  id: string;
  client_id: string;
  name: string;
  country: string | null;
  sector: string | null;
  relation: CompanyRelation;
  proposed_by: "ia" | "consultor";
  validated: boolean;
  created_at: string;
};

type BenchmarkResult = {
  id: string;
  companies_snapshot: Array<{ name: string; relation: string }>;
  fields_snapshot: Array<{ key: string; label: string }>;
  comparison: Record<string, Record<string, string>>;
  narrative: string;
  status: "pending" | "done" | "failed";
  created_at: string;
};

type BenchmarkData = {
  companies: BenchmarkCompany[];
  latest_result: BenchmarkResult | null;
};

type LatestReport = {
  id: string;
  file_name: string;
  created_at: string;
  parse_status: "pending" | "ok" | "failed";
  markdown_content?: string;
} | null;

type Props = {
  clientId: string;
  clientName: string;
  questionnaireProgress: { filled: number; total: number } | null;
  onGoToCuestionario: () => void;
};

// ── Fetcher ──────────────────────────────────────────────────

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

// ── Stage indicator ──────────────────────────────────────────

type StageStatus = "done" | "active" | "pending";

function StageIndicator({
  number,
  label,
  status,
}: {
  number: number;
  label: string;
  status: StageStatus;
}) {
  const ringColor =
    status === "done"
      ? "bg-brand-primary text-white border-brand-primary"
      : status === "active"
      ? "bg-white text-brand-primary border-brand-primary"
      : "bg-white text-slate-400 border-slate-300";

  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] font-bold shrink-0 ${ringColor}`}
      >
        {status === "done" ? (
          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
            <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          number
        )}
      </div>
      <span
        className={`text-xs font-bold uppercase tracking-widest ${
          status === "active" ? "text-brand-primary" : status === "done" ? "text-slate-500" : "text-slate-400"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

// ── Etapa 1: Contexto ────────────────────────────────────────

function ContextoSection({
  progress,
  onGoToCuestionario,
}: {
  progress: Props["questionnaireProgress"];
  onGoToCuestionario: () => void;
}) {
  const isComplete = progress && progress.filled >= progress.total && progress.total > 0;
  const borderColor = isComplete
    ? "border-l-emerald-600"
    : progress && progress.filled > 0
    ? "border-l-amber-500"
    : "border-l-slate-300";

  return (
    <div className={`border-l-4 ${borderColor} pl-4 py-2`}>
      <p className="text-xs text-slate-600 mb-3">
        El cuestionario de contexto es la base para que la IA entienda a tu cliente antes de ejecutar el benchmark.
      </p>
      <div className="flex items-center gap-3">
        {progress ? (
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded ${
              isComplete
                ? "bg-emerald-50 text-emerald-700"
                : progress.filled > 0
                ? "bg-amber-50 text-amber-700"
                : "bg-slate-100 text-slate-500"
            }`}
          >
            {isComplete ? "Completo" : `${progress.filled} / ${progress.total} preguntas`}
          </span>
        ) : (
          <button
            onClick={onGoToCuestionario}
            className="text-xs text-brand-primary hover:underline"
          >
            El cuestionario está vacío. Complétalo primero →
          </button>
        )}
        <Button size="sm" variant="secondary" onClick={onGoToCuestionario}>
          {isComplete ? "Ver cuestionario" : "Completar cuestionario"}
        </Button>
      </div>
    </div>
  );
}

// ── Etapa 2: Benchmark ───────────────────────────────────────

function BenchmarkSection({
  clientId,
  clientName,
  companies,
  latestResult,
  onDataMutate,
  isPolling,
  onStartPolling,
}: {
  clientId: string;
  clientName: string;
  companies: BenchmarkCompany[];
  latestResult: BenchmarkResult | null;
  onDataMutate: () => void;
  isPolling: boolean;
  onStartPolling: () => void;
}) {
  const { push } = useToast();
  const [proposing, setProposing] = useState(false);
  const [confirmRepropose, setConfirmRepropose] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(companies.filter((c) => c.validated).map((c) => c.id))
  );

  const handlePropose = useCallback(async () => {
    setProposing(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/dm-benchmark`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "propose" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al proponer empresas");
      push("success", "Empresas propuestas. Revisa y selecciona las que incluirás en el benchmark.");
      setSelected(new Set());
      onDataMutate();
    } catch (e) {
      push("error", e instanceof Error ? e.message : "Error al proponer empresas");
    } finally {
      setProposing(false);
    }
  }, [clientId, push, onDataMutate]);

  const handleToggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleCompare = useCallback(async () => {
    if (selected.size < 2) {
      push("error", "Selecciona al menos 2 empresas para el benchmark");
      return;
    }
    try {
      const res = await fetch(`/api/clients/${clientId}/dm-benchmark`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "compare", company_ids: Array.from(selected) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al ejecutar benchmark");
      // El POST retorna pending inmediatamente — el padre inicia polling del GET
      onStartPolling();
    } catch (e) {
      push("error", e instanceof Error ? e.message : "Error al ejecutar benchmark");
    }
  }, [clientId, selected, push, onStartPolling]);

  const groupedByRelation = companies.reduce<Record<string, BenchmarkCompany[]>>((acc, c) => {
    if (!acc[c.relation]) acc[c.relation] = [];
    acc[c.relation]!.push(c);
    return acc;
  }, {});

  const hasComparisonData =
    latestResult?.status === "done" &&
    latestResult.companies_snapshot?.length > 0 &&
    latestResult.fields_snapshot?.length > 0 &&
    Object.keys(latestResult.comparison ?? {}).length > 0;

  return (
    <div className="space-y-4">
      {/* Campos que se compararán */}
      <div className="bg-slate-50 rounded p-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
          Campos del benchmark
        </p>
        <div className="flex flex-wrap gap-1.5">
          {BENCHMARK_FIELDS.map((f) => (
            <span key={f.key} className="text-xs bg-white border border-slate-200 text-slate-600 px-2 py-0.5 rounded-sm">
              {f.label}
            </span>
          ))}
        </div>
      </div>

      {/* Botón proponer */}
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          variant={companies.length > 0 ? "secondary" : "primary"}
          loading={proposing}
          onClick={companies.length > 0 ? () => setConfirmRepropose(true) : handlePropose}
        >
          {companies.length > 0 ? "Volver a proponer" : "Proponer empresas con IA"}
        </Button>
        {companies.length > 0 && (
          <span className="text-xs text-slate-500">{companies.length} empresas propuestas</span>
        )}
      </div>

      {/* Selección masiva */}
      {companies.length > 0 && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSelected(new Set(companies.map((c) => c.id)))}
            className="text-[11px] font-semibold text-brand-primary-dark border border-brand-primary/40 rounded px-2 py-1 hover:bg-brand-primary/5"
          >
            Seleccionar todas
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-[11px] font-semibold text-slate-600 border border-slate-300 rounded px-2 py-1 hover:bg-slate-50"
          >
            Limpiar selección
          </button>
          <span className="text-[11px] text-slate-400">{selected.size} seleccionadas</span>
        </div>
      )}

      {/* Lista de empresas por categoría */}
      {Object.entries(groupedByRelation).map(([relation, group]) => (
        <div key={relation}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
            {RELATION_LABELS[relation as CompanyRelation] ?? relation}
          </p>
          <div className="space-y-1">
            {group.map((company) => (
              <label
                key={company.id}
                className="flex items-start gap-2.5 p-2.5 border border-slate-200 rounded cursor-pointer hover:bg-slate-50 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selected.has(company.id)}
                  onChange={() => handleToggle(company.id)}
                  className="mt-0.5 accent-brand-primary"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-slate-800">{company.name}</span>
                  {company.country && (
                    <span className="text-xs text-slate-500 ml-1.5">{company.country}</span>
                  )}
                  {company.sector && (
                    <p className="text-xs text-slate-500 truncate">{company.sector}</p>
                  )}
                </div>
                {company.proposed_by === "ia" && (
                  <span className="text-[9px] font-bold text-brand-primary bg-brand-primary/10 px-1.5 py-0.5 rounded-sm shrink-0">
                    IA
                  </span>
                )}
              </label>
            ))}
          </div>
        </div>
      ))}

      {/* Botón ejecutar benchmark */}
      {companies.length > 0 && (
        <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
          <Button
            size="md"
            variant="primary"
            loading={isPolling}
            onClick={handleCompare}
            disabled={isPolling}
          >
            Ejecutar benchmark ({selected.size} empresas + {clientName})
          </Button>
          {latestResult?.status === "done" && !isPolling && (
            <span className="text-xs text-emerald-600 flex items-center gap-1">
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                <path fillRule="evenodd" d="M8 15A7 7 0 108 1a7 7 0 000 14zm3.354-9.354a.5.5 0 00-.708 0L7 9.293 5.354 7.646a.5.5 0 00-.708.708l2 2a.5.5 0 00.708 0l4-4a.5.5 0 000-.708z" clipRule="evenodd" />
              </svg>
              Benchmark anterior disponible
            </span>
          )}
        </div>
      )}

      {/* Progreso durante ejecución async */}
      {isPolling && (
        <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
          <svg className="w-4 h-4 animate-spin text-brand-primary shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Procesando con IA (Sonnet) — tarda 1-3 minutos. No cierres esta página.
        </div>
      )}

      {/* Resultado narrativo del último benchmark */}
      {latestResult?.status === "done" && latestResult.narrative && (
        <div className="border-l-4 border-l-brand-primary pl-4 py-2 bg-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
            Síntesis del benchmark
          </p>
          <p className="text-sm text-slate-700 leading-relaxed">{latestResult.narrative}</p>
          <p className="text-[10px] text-slate-400 mt-2">
            {new Date(latestResult.created_at).toLocaleDateString("es-MX", {
              day: "numeric", month: "long", year: "numeric",
            })}
          </p>
        </div>
      )}

      {/* Tabla comparativa */}
      {hasComparisonData && (
        <div className="mt-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
            Tabla comparativa
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full w-max text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 pb-2 pr-6 whitespace-nowrap">
                    Dimensión
                  </th>
                  {latestResult!.companies_snapshot.map((company) => (
                    <th
                      key={company.name}
                      className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 pb-2 pr-6 whitespace-nowrap"
                    >
                      {company.name}
                      {company.relation && (
                        <span className="ml-1 font-normal normal-case text-slate-400">
                          · {RELATION_LABELS[company.relation as CompanyRelation] ?? company.relation}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {latestResult!.fields_snapshot.map((field) => (
                  <tr key={field.key} className="even:bg-slate-50/60 hover:bg-brand-primary-light/30 transition-colors">
                    <td className="py-2 pr-6 font-medium text-slate-700 whitespace-nowrap">{field.label}</td>
                    {latestResult!.companies_snapshot.map((company) => {
                      // comparison = { fieldKey: { companyName: value } }
                      // Intenta match exacto primero; si falla, busca la clave cuyo
                      // inicio coincide con el nombre completo de la empresa (el AI
                      // a veces abrevia "Pemex (Petróleos Mexicanos)" → "Pemex").
                      const fieldMap = latestResult!.comparison[field.key] ?? {};
                      const value =
                        fieldMap[company.name] ??
                        Object.entries(fieldMap).find(
                          ([k]) => company.name.startsWith(k) || k.startsWith(company.name.split(" ")[0]!)
                        )?.[1] ??
                        "—";
                      return (
                        <td key={company.name} className="py-2 pr-6 text-slate-600 max-w-[220px]">
                          {value}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {latestResult?.status === "failed" && (
        <div className="border-l-4 border-l-rose-500 pl-4 py-2 bg-rose-50 rounded-r">
          <p className="text-xs text-rose-700">El benchmark anterior falló. Intenta de nuevo.</p>
        </div>
      )}

      <ConfirmModal
        open={confirmRepropose}
        title="¿Volver a proponer empresas?"
        description="Se eliminarán las empresas actuales y la IA generará una nueva lista. El benchmark anterior se conserva hasta que ejecutes uno nuevo."
        confirmLabel="Volver a proponer"
        cancelLabel="Cancelar"
        tone="destructive"
        onConfirm={() => {
          setConfirmRepropose(false);
          handlePropose();
        }}
        onCancel={() => setConfirmRepropose(false)}
      />
    </div>
  );
}

// ── Etapa 3: Reporte ─────────────────────────────────────────

function ReporteSection({
  clientId,
  clientName,
  latestResult,
  latestReport,
  onReportMutate,
  isReportPolling,
  onStartReportPolling,
}: {
  clientId: string;
  clientName: string;
  latestResult: BenchmarkResult | null;
  latestReport: LatestReport;
  onReportMutate: () => void;
  isReportPolling: boolean;
  onStartReportPolling: () => void;
}) {
  const { push } = useToast();
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);

  const canGenerate = latestResult?.status === "done";

  const handleGenerate = useCallback(async () => {
    if (!latestResult) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/dm-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result_id: latestResult.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al generar reporte");
      // POST retorna pending — inicia polling del GET cada 5s
      onStartReportPolling();
      onReportMutate();
    } catch (e) {
      push("error", e instanceof Error ? e.message : "Error al generar reporte");
    } finally {
      setGenerating(false);
    }
  }, [clientId, latestResult, push, onReportMutate, onStartReportPolling]);

  const handleDownloadPdf = useCallback(async () => {
    if (!latestResult) return;
    setDownloading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/export-dm-pdf?result_id=${latestResult.id}`);
      if (!res.ok) throw new Error("Error al exportar PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reporte-dm-${clientName.toLowerCase().replace(/\s+/g, "-")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      push("error", e instanceof Error ? e.message : "Error al descargar PDF");
    } finally {
      setDownloading(false);
    }
  }, [clientId, clientName, latestResult, push]);

  return (
    <div className="space-y-4">
      {!canGenerate && (
        <div className="border-l-4 border-l-slate-300 pl-4 py-2">
          <p className="text-xs text-slate-500">
            Completa el benchmark primero para poder generar el reporte.
          </p>
        </div>
      )}

      {/* Sin reporte todavía — mostrar botón generar */}
      {canGenerate && !latestReport && (
        <div className="border-l-4 border-l-amber-400 pl-4 py-2">
          <p className="text-xs text-slate-600 mb-3">
            El reporte incluirá resumen ejecutivo, posicionamiento vs benchmark, riesgos identificados, fortalezas, áreas de mejora y recomendaciones priorizadas.
          </p>
          <Button
            size="md"
            variant="primary"
            loading={generating || isReportPolling}
            disabled={isReportPolling}
            onClick={handleGenerate}
          >
            Generar reporte con IA
          </Button>
        </div>
      )}

      {/* Batch en proceso — spinner (activo) */}
      {canGenerate && latestReport?.parse_status === "pending" && isReportPolling && (
        <div className="flex items-center gap-2 text-xs text-slate-500 py-2 border-l-4 border-l-amber-400 pl-4">
          <svg className="w-4 h-4 animate-spin text-brand-primary shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Generando reporte con Opus — puede tardar 2-5 minutos. No cierres esta página.
        </div>
      )}

      {/* Batch pendiente pero polling inactivo (posible stale) — botón de verificar */}
      {canGenerate && latestReport?.parse_status === "pending" && !isReportPolling && (
        <div className="border-l-4 border-l-amber-400 pl-4 py-2 space-y-2">
          <p className="text-xs text-slate-500">Reporte en proceso. Verifica el estado actual.</p>
          <Button
            size="sm"
            variant="secondary"
            onClick={onReportMutate}
          >
            Verificar estado
          </Button>
        </div>
      )}

      {/* Batch fallido */}
      {canGenerate && latestReport?.parse_status === "failed" && (
        <div className="border-l-4 border-l-rose-500 pl-4 py-2 bg-rose-50 rounded-r space-y-2">
          <p className="text-xs text-rose-700">El último reporte falló. Intenta de nuevo.</p>
          <Button
            size="sm"
            variant="primary"
            loading={generating}
            onClick={handleGenerate}
          >
            Reintentar
          </Button>
        </div>
      )}

      {/* Reporte listo */}
      {canGenerate && latestReport?.parse_status === "ok" && (
        <div className="border-l-4 border-l-emerald-600 pl-4 py-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
            Último reporte generado
          </p>
          <p className="text-sm font-medium text-slate-800 mb-0.5">{latestReport.file_name}</p>
          <p className="text-xs text-slate-500 mb-3">
            {new Date(latestReport.created_at).toLocaleDateString("es-MX", {
              day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
            })}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="primary"
              loading={downloading}
              onClick={handleDownloadPdf}
            >
              <svg className="w-3.5 h-3.5 mr-1.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 2v8m0 0l-3-3m3 3l3-3M3 13h10" />
              </svg>
              Descargar PDF
            </Button>
            <Button
              size="sm"
              variant="secondary"
              loading={generating}
              onClick={() => setConfirmRegenerate(true)}
            >
              Regenerar reporte
            </Button>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirmRegenerate}
        title="¿Regenerar reporte?"
        description="Se generará un nuevo reporte con el benchmark actual. El reporte anterior quedará reemplazado y no podrá recuperarse."
        confirmLabel="Regenerar"
        cancelLabel="Cancelar"
        tone="destructive"
        onConfirm={() => {
          setConfirmRegenerate(false);
          handleGenerate();
        }}
        onCancel={() => setConfirmRegenerate(false)}
      />
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────

export function DoubleMaterialidadTab({
  clientId,
  clientName,
  questionnaireProgress,
  onGoToCuestionario,
}: Props) {
  const benchmarkKey = `/api/clients/${clientId}/dm-benchmark`;
  const reportKey = `/api/clients/${clientId}/dm-report`;

  // Polling benchmark batch
  const [isPolling, setIsPolling] = useState(false);
  const { push } = useToast();
  const pollingNotified = useRef(false);
  // Guarda el id del resultado que YA existía al arrancar el polling.
  // El effect solo para cuando llega un resultado con id DIFERENTE (el nuevo).
  const pollingStartId = useRef<string | null>(null);

  // Polling reporte batch
  const [isReportPolling, setIsReportPolling] = useState(false);
  const pollingNotifiedReport = useRef(false);
  const pollingStartReportId = useRef<string | null>(null);

  const { data: benchmarkResp, isLoading: loadingBenchmark, mutate: mutateBenchmark } = useSWR<{
    data: BenchmarkData;
  }>(benchmarkKey, fetcher, {
    revalidateOnFocus: false,
    refreshInterval: isPolling ? 5_000 : 0,
  });

  const { data: reportResp, mutate: mutateReport } = useSWR<{
    data: LatestReport;
  }>(reportKey, fetcher, {
    revalidateOnFocus: false,
    refreshInterval: isReportPolling ? 5_000 : 0,
  });

  const companies = benchmarkResp?.data.companies ?? [];
  const latestResult = benchmarkResp?.data.latest_result ?? null;
  const latestReport = reportResp?.data ?? null;

  // Detectar cuando el batch del benchmark termina.
  // Solo para cuando llega un resultado con id DISTINTO al que había al arrancar
  // (evita falso-positivo con datos cacheados del benchmark anterior).
  useEffect(() => {
    if (!isPolling) {
      pollingNotified.current = false;
      return;
    }
    const isStale = latestResult?.id === pollingStartId.current;
    if (isStale) return;
    if (latestResult?.status === "done" && !pollingNotified.current) {
      pollingNotified.current = true;
      setIsPolling(false);
      push("success", "Benchmark completado. Revisa el análisis comparativo.");
    }
    if (latestResult?.status === "failed" && !pollingNotified.current) {
      pollingNotified.current = true;
      setIsPolling(false);
      push("error", "El benchmark falló. Intenta de nuevo.");
    }
  }, [latestResult?.id, latestResult?.status, isPolling, push]);

  // Detectar cuando el batch del reporte termina.
  // Mismo patrón anti-stale que el benchmark.
  useEffect(() => {
    if (!isReportPolling) {
      pollingNotifiedReport.current = false;
      return;
    }
    const isStale = latestReport?.id === pollingStartReportId.current;
    if (isStale) return;
    if (latestReport?.parse_status === "ok" && !pollingNotifiedReport.current) {
      pollingNotifiedReport.current = true;
      setIsReportPolling(false);
      push("success", "Reporte generado. Puedes descargarlo en PDF.");
    }
    if (latestReport?.parse_status === "failed" && !pollingNotifiedReport.current) {
      pollingNotifiedReport.current = true;
      setIsReportPolling(false);
      push("error", "El reporte falló. Intenta de nuevo.");
    }
  }, [latestReport?.id, latestReport?.parse_status, isReportPolling, push]);

  const stage1Status: StageStatus =
    questionnaireProgress &&
    questionnaireProgress.filled >= questionnaireProgress.total &&
    questionnaireProgress.total > 0
      ? "done"
      : "active";

  const hasBenchmark = latestResult?.status === "done";
  const hasReport = latestReport?.parse_status === "ok";

  const stage2Status: StageStatus = hasBenchmark
    ? "done"
    : stage1Status === "done"
    ? "active"
    : "pending";

  const stage3Status: StageStatus = hasReport
    ? "done"
    : hasBenchmark
    ? "active"
    : "pending";

  if (loadingBenchmark) {
    return (
      <div className="py-6">
        <SkeletonList />
      </div>
    );
  }

  return (
    <div className="space-y-6 py-4">
      {/* ── Stepper header ── */}
      <div className="flex items-center gap-4 pb-4 border-b border-slate-100">
        <StageIndicator number={1} label="Contexto" status={stage1Status} />
        <div className="w-8 h-px bg-slate-200" aria-hidden />
        <StageIndicator number={2} label="Benchmark" status={stage2Status} />
        <div className="w-8 h-px bg-slate-200" aria-hidden />
        <StageIndicator number={3} label="Reporte" status={stage3Status} />
      </div>

      {/* ── Etapa 1 ── */}
      <section aria-labelledby="stage-contexto">
        <h2 id="stage-contexto" className="sr-only">
          Contexto del cliente
        </h2>
        <ContextoSection
          progress={questionnaireProgress}
          onGoToCuestionario={onGoToCuestionario}
        />
      </section>

      {/* ── Etapa 2 ── */}
      <section aria-labelledby="stage-benchmark">
        <h2 id="stage-benchmark" className="sr-only">
          Benchmark competitivo
        </h2>
        <BenchmarkSection
          clientId={clientId}
          clientName={clientName}
          companies={companies}
          latestResult={latestResult}
          onDataMutate={() => mutateBenchmark()}
          isPolling={isPolling}
          onStartPolling={() => {
            pollingStartId.current = latestResult?.id ?? null;
            setIsPolling(true);
            void mutateBenchmark(); // Invalida caché para recibir status pending
          }}
        />
      </section>

      {/* ── Etapa 3 ── */}
      <section aria-labelledby="stage-reporte">
        <h2 id="stage-reporte" className="sr-only">
          Reporte de Doble Materialidad
        </h2>
        <ReporteSection
          clientId={clientId}
          clientName={clientName}
          latestResult={latestResult}
          latestReport={latestReport}
          onReportMutate={() => mutateReport()}
          isReportPolling={isReportPolling}
          onStartReportPolling={() => {
            pollingStartReportId.current = latestReport?.id ?? null;
            setIsReportPolling(true);
            void mutateReport(); // Invalida caché para recibir parse_status pending
          }}
        />
      </section>
    </div>
  );
}
