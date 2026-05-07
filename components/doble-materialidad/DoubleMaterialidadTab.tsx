"use client";

import { useState, useCallback } from "react";
import useSWR, { mutate } from "swr";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
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
            {isComplete ? "Completo" : `${progress.filled} / ${progress.total} campos`}
          </span>
        ) : (
          <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded">Sin datos</span>
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
}: {
  clientId: string;
  clientName: string;
  companies: BenchmarkCompany[];
  latestResult: BenchmarkResult | null;
  onDataMutate: () => void;
}) {
  const { push } = useToast();
  const [proposing, setProposing] = useState(false);
  const [comparing, setComparing] = useState(false);
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
    setComparing(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/dm-benchmark`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "compare", company_ids: Array.from(selected) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al ejecutar benchmark");
      push("success", "Benchmark completado. Revisa el análisis comparativo.");
      onDataMutate();
    } catch (e) {
      push("error", e instanceof Error ? e.message : "Error al ejecutar benchmark");
    } finally {
      setComparing(false);
    }
  }, [clientId, selected, push, onDataMutate]);

  const groupedByRelation = companies.reduce<Record<string, BenchmarkCompany[]>>((acc, c) => {
    if (!acc[c.relation]) acc[c.relation] = [];
    acc[c.relation].push(c);
    return acc;
  }, {});

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
          onClick={handlePropose}
        >
          {companies.length > 0 ? "Volver a proponer" : "Proponer empresas con IA"}
        </Button>
        {companies.length > 0 && (
          <span className="text-xs text-slate-500">{companies.length} empresas propuestas</span>
        )}
      </div>

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
            loading={comparing}
            onClick={handleCompare}
          >
            Ejecutar benchmark ({selected.size} empresas + {clientName})
          </Button>
          {latestResult?.status === "done" && (
            <span className="text-xs text-emerald-600 flex items-center gap-1">
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                <path fillRule="evenodd" d="M8 15A7 7 0 108 1a7 7 0 000 14zm3.78-4.22a.75.75 0 01-1.06 0L8 8.06 5.28 10.78a.75.75 0 01-1.06-1.06L6.94 7 5.22 5.28a.75.75 0 011.06-1.06L8 5.94l2.72-2.72a.75.75 0 011.06 1.06L9.06 7l2.72 2.72a.75.75 0 010 1.06z" clipRule="evenodd" />
              </svg>
              Benchmark anterior disponible
            </span>
          )}
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

      {latestResult?.status === "failed" && (
        <div className="border-l-4 border-l-rose-500 pl-4 py-2 bg-rose-50 rounded-r">
          <p className="text-xs text-rose-700">El benchmark anterior falló. Intenta de nuevo.</p>
        </div>
      )}
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
}: {
  clientId: string;
  clientName: string;
  latestResult: BenchmarkResult | null;
  latestReport: LatestReport;
  onReportMutate: () => void;
}) {
  const { push } = useToast();
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);

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
      push("success", "Reporte generado exitosamente.");
      onReportMutate();
    } catch (e) {
      push("error", e instanceof Error ? e.message : "Error al generar reporte");
    } finally {
      setGenerating(false);
    }
  }, [clientId, latestResult, push, onReportMutate]);

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

      {canGenerate && !latestReport && (
        <div className="border-l-4 border-l-amber-400 pl-4 py-2">
          <p className="text-xs text-slate-600 mb-3">
            El reporte incluirá resumen ejecutivo, posicionamiento vs benchmark, riesgos identificados, fortalezas, áreas de mejora y recomendaciones priorizadas.
          </p>
          <Button
            size="md"
            variant="primary"
            loading={generating}
            onClick={handleGenerate}
          >
            Generar reporte con IA
          </Button>
        </div>
      )}

      {canGenerate && latestReport && (
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
              onClick={handleGenerate}
            >
              Regenerar reporte
            </Button>
          </div>
        </div>
      )}
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

  const { data: benchmarkResp, isLoading: loadingBenchmark, mutate: mutateBenchmark } = useSWR<{
    data: BenchmarkData;
  }>(benchmarkKey, fetcher, { revalidateOnFocus: false });

  const { data: reportResp, mutate: mutateReport } = useSWR<{
    data: LatestReport;
  }>(reportKey, fetcher, { revalidateOnFocus: false });

  const companies = benchmarkResp?.data.companies ?? [];
  const latestResult = benchmarkResp?.data.latest_result ?? null;
  const latestReport = reportResp?.data ?? null;

  // Determinar estado de cada etapa para el stepper
  const hasQuestionnaire =
    questionnaireProgress && questionnaireProgress.filled > 0;
  const hasBenchmark = latestResult?.status === "done";
  const hasReport = latestReport !== null;

  const stage1Status: StageStatus = hasQuestionnaire ? "done" : "active";
  const stage2Status: StageStatus = hasBenchmark
    ? "done"
    : hasQuestionnaire
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
        <h2
          id="stage-contexto"
          className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3"
        >
          1 · Contexto del cliente
        </h2>
        <ContextoSection
          progress={questionnaireProgress}
          onGoToCuestionario={onGoToCuestionario}
        />
      </section>

      {/* ── Etapa 2 ── */}
      <section aria-labelledby="stage-benchmark">
        <h2
          id="stage-benchmark"
          className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3"
        >
          2 · Benchmark competitivo
        </h2>
        <BenchmarkSection
          clientId={clientId}
          clientName={clientName}
          companies={companies}
          latestResult={latestResult}
          onDataMutate={() => mutateBenchmark()}
        />
      </section>

      {/* ── Etapa 3 ── */}
      <section aria-labelledby="stage-reporte">
        <h2
          id="stage-reporte"
          className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3"
        >
          3 · Reporte de Doble Materialidad
        </h2>
        <ReporteSection
          clientId={clientId}
          clientName={clientName}
          latestResult={latestResult}
          latestReport={latestReport}
          onReportMutate={() => mutateReport()}
        />
      </section>
    </div>
  );
}
