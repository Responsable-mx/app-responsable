"use client";

import { useState, useCallback } from "react";
import useSWR from "swr";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { SkeletonList } from "@/components/ui/Skeleton";

// ── Tipos ────────────────────────────────────────────────────────────────────

type ResumenStatus = "idle" | "pending" | "done" | "failed";

type ResumenData = {
  status: ResumenStatus;
  content: string | null;
  created_at: string | null;
  error_msg: string | null;
} | null;

type Props = {
  clientId: string;
};

// ── Fetcher ───────────────────────────────────────────────────────────────────

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

// ── Utilidades ────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Componente principal ──────────────────────────────────────────────────────

export function ResumenEjecutivoSection({ clientId }: Props) {
  const { push: pushToast } = useToast();
  const [generating, setGenerating] = useState(false);

  const { data, isLoading, mutate } = useSWR<{ data: ResumenData }>(
    `/api/clients/${clientId}/dm-resumen`,
    fetcher,
    { revalidateOnFocus: false }
  );

  const resumen = data?.data ?? null;
  const hasContent = resumen?.status === "done" && !!resumen.content;

  const handleGenerar = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/dm-resumen`, {
        method: "POST",
      });
      const json = await res.json();

      if (!res.ok) {
        pushToast("error", json.error ?? "Error al generar el resumen");
        return;
      }

      await mutate();
      pushToast("success", "Resumen ejecutivo generado");
    } catch {
      pushToast("error", "Error de red al generar el resumen");
    } finally {
      setGenerating(false);
    }
  }, [clientId, mutate, pushToast]);

  const handleCopiar = useCallback(async () => {
    if (!resumen?.content) return;
    try {
      await navigator.clipboard.writeText(resumen.content);
      pushToast("success", "Resumen copiado al portapapeles");
    } catch {
      pushToast("error", "No se pudo copiar");
    }
  }, [resumen, pushToast]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <section className="border border-slate-200 rounded bg-white shadow-sm">
      {/* Encabezado de sección */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          {/* Ícono documento */}
          <span className="w-8 h-8 rounded flex items-center justify-center bg-slate-100 shrink-0">
            <svg
              className="w-4 h-4 text-slate-500"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
                clipRule="evenodd"
              />
            </svg>
          </span>
          <div>
            <p className="uppercase tracking-widest text-[10px] font-bold text-slate-400 leading-none mb-0.5">
              Entregable
            </p>
            <h3 className="text-sm font-semibold text-slate-800">
              Resumen ejecutivo
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasContent && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopiar}
              aria-label="Copiar resumen al portapapeles"
            >
              {/* Ícono copiar */}
              <svg
                className="w-4 h-4 mr-1.5"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
              </svg>
              Copiar
            </Button>
          )}
          <Button
            variant={hasContent ? "secondary" : "primary"}
            size="sm"
            loading={generating}
            onClick={handleGenerar}
            disabled={generating}
          >
            {hasContent ? "Regenerar" : "Generar resumen"}
          </Button>
        </div>
      </div>

      {/* Cuerpo */}
      <div className="px-5 py-4">
        {isLoading ? (
          <SkeletonList items={4} />
        ) : generating ? (
          // Estado generando
          <div
            className="flex flex-col items-center justify-center py-10 gap-3"
            role="status"
            aria-live="polite"
          >
            {/* Spinner */}
            <svg
              className="w-6 h-6 text-brand-primary animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
            <p className="text-sm text-slate-500">
              Generando resumen ejecutivo… puede tardar hasta 45 segundos.
            </p>
          </div>
        ) : hasContent ? (
          // Contenido generado
          <div>
            {resumen?.created_at && (
              <p className="text-[11px] text-slate-400 mb-4">
                Generado el {formatDate(resumen.created_at)}
              </p>
            )}
            <div
              className="prose prose-sm prose-slate max-w-none
                prose-headings:font-semibold prose-headings:text-slate-800
                prose-h2:text-sm prose-h2:mt-5 prose-h2:mb-2
                prose-h3:text-xs prose-h3:mt-4 prose-h3:mb-1
                prose-p:text-slate-700 prose-p:leading-relaxed
                prose-table:text-xs prose-td:py-1.5 prose-th:py-1.5
                prose-th:font-semibold prose-th:text-slate-600
                prose-li:text-slate-700"
            >
              <ReactMarkdown>{resumen.content!}</ReactMarkdown>
            </div>
          </div>
        ) : resumen?.status === "failed" ? (
          // Estado de error
          <div className="rounded border-l-4 border-l-brand-berry bg-red-50 px-4 py-3">
            <p className="text-sm font-medium text-red-700">
              No se pudo generar el resumen
            </p>
            {resumen.error_msg && (
              <p className="text-xs text-red-600 mt-1">{resumen.error_msg}</p>
            )}
            <p className="text-xs text-red-500 mt-2">
              Verifica que el cliente tenga IROs registrados y vuelve a intentarlo.
            </p>
          </div>
        ) : (
          // Estado vacío / inicial
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
            <svg
              className="w-8 h-8 text-slate-300"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p className="text-sm font-medium text-slate-600">
              Sin resumen ejecutivo
            </p>
            <p className="text-xs text-slate-400 max-w-xs">
              Genera el resumen una vez que los IROs materiales estén validados.
              Aurora redactará un análisis ejecutivo listo para Dirección General.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
