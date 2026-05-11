"use client";

import { useCallback, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";

export type LatestReport = {
  id: string;
  file_name: string;
  created_at: string;
  parse_status: "pending" | "ok" | "failed";
  markdown_content?: string;
  batch_id?: string | null;
} | null;

export type BenchmarkResultRef = {
  id: string;
  status: "pending" | "done" | "failed";
} | null;

/**
 * Readiness: estado de cada criterio de cierre del estudio.
 * Pasado por el padre (DoubleMaterialidadTab) para evitar duplicar fetches.
 * Pattern del mockup-v7: checklist transparente antes de generar.
 */
export type ReporteReadiness = {
  questionnairePct: number | null;       // 0-100
  benchmarkCompanies: number;            // # empresas validadas
  irosTotal: number;                     // # IROs en inventario
  irosScored: number;                    // # IROs con score completo
  hasMatriz: boolean;                    // ≥3 IROs scored
  nisCount: number;                      // # brechas NIS registradas
  resumenReviewed: boolean;              // reviewed_at != null
  validationDecided: boolean;            // todas decisiones tomadas
  onGoToStage?: (sectionId: string) => void; // deep-link a stage faltante
};

export function ReporteSection({
  clientId,
  clientName,
  latestResult,
  latestReport,
  readiness,
  onReportMutate,
  isReportPolling,
  onStartReportPolling,
}: {
  clientId: string;
  clientName: string;
  latestResult: BenchmarkResultRef;
  latestReport: LatestReport;
  readiness: ReporteReadiness;
  onReportMutate: () => void;
  isReportPolling: boolean;
  onStartReportPolling: () => void;
}) {
  const { push } = useToast();
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [confirmGenerate, setConfirmGenerate] = useState(false);

  const canGenerate = latestResult?.status === "done";

  // Checklist de cierre — pattern mockup-v7. 7 criterios cuantificados.
  // Cliente ve qué falta antes de gastar 2-5 min de IA + accountability del reporte.
  const checklistItems: Array<{ ok: boolean; label: string; detail: string; sectionId?: string }> = [
    {
      ok: (readiness.questionnairePct ?? 0) >= 80,
      label: "Cuestionario ≥80% completado",
      detail: readiness.questionnairePct !== null ? `${readiness.questionnairePct}%` : "sin datos",
      sectionId: "dm-sec-contexto",
    },
    {
      ok: readiness.benchmarkCompanies >= 3,
      label: "Benchmark ejecutado con ≥3 empresas",
      detail: `${readiness.benchmarkCompanies} ${readiness.benchmarkCompanies === 1 ? "empresa" : "empresas"}`,
      sectionId: "dm-sec-benchmark",
    },
    {
      ok: readiness.irosScored >= 5,
      label: "IROs calificados (≥5 con score)",
      detail: `${readiness.irosScored}/${readiness.irosTotal} calificados`,
      sectionId: "dm-sec-iros",
    },
    {
      ok: readiness.hasMatriz,
      label: "Matriz de materialidad generada",
      detail: readiness.hasMatriz ? `${readiness.irosScored} IROs` : "sin matriz",
      sectionId: "dm-sec-matriz",
    },
    {
      ok: readiness.nisCount > 0,
      label: "Brechas NIS/IBSO documentadas",
      detail: `${readiness.nisCount} ${readiness.nisCount === 1 ? "brecha" : "brechas"}`,
      sectionId: "dm-sec-nis",
    },
    {
      ok: readiness.resumenReviewed,
      label: "Resumen ejecutivo revisado",
      detail: readiness.resumenReviewed ? "✓" : "pendiente",
      sectionId: "dm-sec-resumen",
    },
    {
      ok: readiness.validationDecided,
      label: "Hallazgos validados con cliente",
      detail: readiness.validationDecided ? "✓" : "pendiente junta",
      sectionId: "dm-sec-validacion",
    },
  ];
  const okCount = checklistItems.filter((c) => c.ok).length;
  const totalCount = checklistItems.length;
  const allReady = okCount === totalCount;

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

  // Nombre de display legible (slug → título humano)
  const reportDisplayName = latestReport
    ? `Reporte DM — ${clientName} — ${new Date(latestReport.created_at).toLocaleDateString("es-MX", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })}`
    : "";

  return (
    <div className="space-y-4">
      {!canGenerate && (
        <div className="border-l-4 border-l-slate-300 pl-4 py-2">
          <p className="text-xs text-slate-500">
            Completa el benchmark primero para poder generar el reporte.
          </p>
        </div>
      )}

      {/* Checklist de cierre — siempre visible cuando se puede generar (mockup-v7 pattern) */}
      {canGenerate && !latestReport && (
        <>
          <div className="border border-slate-200 rounded p-4 bg-slate-50 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Checklist de cierre</p>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-sm tabular-nums ${
                allReady ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
              }`}>
                {okCount} / {totalCount} criterios
              </span>
            </div>
            <ul className="space-y-1.5 text-xs">
              {checklistItems.map((c) => (
                <li key={c.label} className={`flex items-center gap-2 ${c.ok ? "text-slate-700" : "text-slate-500"}`}>
                  {c.ok ? (
                    <svg className="w-3 h-3 text-brand-primary shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg className="w-3 h-3 text-slate-300 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  )}
                  <span className="flex-1">{c.label}</span>
                  <span className={`text-[10px] tabular-nums ${c.ok ? "text-slate-400" : "text-amber-600"}`}>
                    {c.detail}
                  </span>
                  {!c.ok && c.sectionId && readiness.onGoToStage && (
                    <button
                      type="button"
                      onClick={() => readiness.onGoToStage!(c.sectionId!)}
                      className="text-[10px] text-brand-primary underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 rounded-sm"
                    >
                      Ir →
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
          {!allReady && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded px-3 py-2.5">
              <svg className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12" y2="17" />
              </svg>
              <p className="text-[11px] text-amber-700">
                <strong>{totalCount - okCount} {totalCount - okCount === 1 ? "criterio" : "criterios"} sin completar</strong>
                — el reporte se puede generar, pero la calidad será menor.
              </p>
            </div>
          )}
          <Button
            size="md"
            variant="primary"
            loading={generating || isReportPolling}
            disabled={isReportPolling}
            onClick={() => setConfirmGenerate(true)}
          >
            Generar reporte con IA
          </Button>
        </>
      )}

      {/* Batch en proceso — spinner activo (sin nombrar modelo) */}
      {canGenerate && latestReport?.parse_status === "pending" && isReportPolling && (
        <div className="flex items-center gap-2 text-xs text-slate-500 py-2 border-l-4 border-l-amber-400 pl-4">
          <svg className="w-4 h-4 animate-spin text-brand-primary shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Generando reporte con IA — puede tardar 2-5 minutos. Puedes navegar otras etapas mientras esperas.
        </div>
      )}

      {/* Batch pendiente pero polling inactivo (posible stale) */}
      {canGenerate && latestReport?.parse_status === "pending" && !isReportPolling && (
        <div className="border-l-4 border-l-amber-400 pl-4 py-2 space-y-2">
          <p className="text-xs text-slate-500">Reporte en proceso. Verifica el estado actual.</p>
          <Button size="sm" variant="secondary" onClick={onReportMutate}>
            Verificar estado
          </Button>
        </div>
      )}

      {/* Batch fallido */}
      {canGenerate && latestReport?.parse_status === "failed" && (
        <div className="border-l-4 border-l-rose-500 pl-4 py-2 bg-rose-50 rounded-r space-y-2">
          <p className="text-xs text-rose-700">El último reporte falló. Intenta de nuevo.</p>
          <Button size="sm" variant="primary" loading={generating} onClick={handleGenerate}>
            Reintentar
          </Button>
        </div>
      )}

      {/* Reporte listo */}
      {canGenerate && latestReport?.parse_status === "ok" && (
        <div className="border-l-4 border-l-emerald-600 pl-4 py-2">
          <p className="text-sm font-medium text-slate-800 mb-0.5">{reportDisplayName}</p>
          <p className="text-xs text-slate-500 mb-3">
            {new Date(latestReport.created_at).toLocaleDateString("es-MX", {
              day: "numeric",
              month: "long",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          <div className="flex flex-col gap-3">
            <div>
              <Button size="sm" variant="primary" loading={downloading} onClick={handleDownloadPdf}>
                <svg
                  className="w-3.5 h-3.5 mr-1.5"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 2v8m0 0l-3-3m3 3l3-3M3 13h10" />
                </svg>
                Descargar PDF
              </Button>
            </div>
            {/* Regenerar — destructivo, separado visualmente */}
            <div className="pt-2 border-t border-slate-100">
              <Button
                size="sm"
                variant="secondary"
                loading={generating}
                onClick={() => setConfirmRegenerate(true)}
              >
                <svg className="w-3 h-3 mr-1.5 shrink-0" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 4a4 4 0 11-7.9 1" />
                  <path d="M2 2v3h3" />
                </svg>
                Regenerar reporte
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirmRegenerate}
        title="¿Regenerar reporte?"
        description="Se generará un nuevo reporte con el benchmark actual. El reporte anterior quedará reemplazado y no podrá recuperarse. Esta operación puede tardar 2-5 minutos."
        confirmLabel="Regenerar"
        cancelLabel="Cancelar"
        tone="destructive"
        onConfirm={() => {
          setConfirmRegenerate(false);
          handleGenerate();
        }}
        onCancel={() => setConfirmRegenerate(false)}
      />

      {/* Confirm pre-generate inicial — bullets de insumos confirmados (mockup-v7) */}
      <ConfirmModal
        open={confirmGenerate}
        title={`Generar reporte para ${clientName}`}
        description={`Se analizará toda la información y se generará el PDF en 2-5 min. Cuestionario: ${readiness.questionnairePct ?? "—"}% · Benchmark: ${readiness.benchmarkCompanies} empresas · IROs: ${readiness.irosScored}/${readiness.irosTotal} calificados · NIS: ${readiness.nisCount} brechas. ${allReady ? "Todos los criterios completos." : `${totalCount - okCount} criterios pendientes — la calidad puede ser menor.`}`}
        confirmLabel="Generar reporte"
        cancelLabel="Cancelar"
        tone="primary"
        onConfirm={() => {
          setConfirmGenerate(false);
          handleGenerate();
        }}
        onCancel={() => setConfirmGenerate(false)}
      />
    </div>
  );
}
