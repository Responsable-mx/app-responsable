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

export function ReporteSection({
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
  latestResult: BenchmarkResultRef;
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

      {/* Batch en proceso — spinner activo */}
      {canGenerate && latestReport?.parse_status === "pending" && isReportPolling && (
        <div className="flex items-center gap-2 text-xs text-slate-500 py-2 border-l-4 border-l-amber-400 pl-4">
          <svg className="w-4 h-4 animate-spin text-brand-primary shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Generando reporte con Opus — puede tardar 2-5 minutos. No cierres esta página.
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
    </div>
  );
}
