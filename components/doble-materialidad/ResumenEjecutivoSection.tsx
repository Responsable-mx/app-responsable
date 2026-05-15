"use client";

import { useState, useCallback, useMemo } from "react";
import useSWR from "swr";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
  reviewed_at: string | null;
} | null;

type QuadrantCounts = {
  doble_material: number;
  solo_impacto: number;
  solo_financiero: number;
  brechas_criticas: number;
};

type Props = {
  clientId: string;
  quadrantCounts: QuadrantCounts;
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

// ── KPI cards config ──────────────────────────────────────────────────────────

const KPI_CARDS: Array<{
  key: keyof QuadrantCounts;
  label: string;
  sublabel: string;
  borderClass: string;
  textClass: string;
  countClass: string;
}> = [
  {
    key: "doble_material",
    label: "Doble material",
    sublabel: "impacto + financiero",
    borderClass: "border-l-rose-600",
    textClass: "text-rose-600",
    countClass: "text-rose-700",
  },
  {
    key: "solo_impacto",
    label: "Mat. impacto",
    sublabel: "solo impacto",
    borderClass: "border-l-amber-600",
    textClass: "text-amber-600",
    countClass: "text-amber-700",
  },
  {
    key: "solo_financiero",
    label: "Mat. financiero",
    sublabel: "solo financiero",
    borderClass: "border-l-brand-primary",
    textClass: "text-brand-primary",
    countClass: "text-teal-700",
  },
  {
    key: "brechas_criticas",
    label: "Brechas NIS",
    sublabel: "sin información",
    borderClass: "border-l-red-600",
    textClass: "text-red-600",
    countClass: "text-red-700",
  },
];

// ── Componente principal ──────────────────────────────────────────────────────

export function ResumenEjecutivoSection({ clientId, quadrantCounts }: Props) {
  const { push: pushToast } = useToast();
  const [generating, setGenerating] = useState(false);
  const [marking, setMarking] = useState(false);
  // UX patterns del mockup-v7: colapsable (lee 1er párrafo, expande resto) + edición inline
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  // P7 — tabs cuando hay contenido
  const [resumenTab, setResumenTab] = useState<"narrativa" | "cuadrantes">("narrativa");
  const [draft, setDraft] = useState("");
  const [savingDraft, setSavingDraft] = useState(false);

  const { data, isLoading, mutate } = useSWR<{ data: ResumenData }>(
    `/api/clients/${clientId}/dm-resumen`,
    fetcher,
    { revalidateOnFocus: false }
  );

  const resumen = data?.data ?? null;
  const hasContent = resumen?.status === "done" && !!resumen.content;
  const isReviewed = !!resumen?.reviewed_at;

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

  const handleStartEdit = useCallback(() => {
    setDraft(resumen?.content ?? "");
    setEditing(true);
    setExpanded(true);
  }, [resumen]);

  const handleSaveEdit = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      pushToast("error", "El resumen no puede estar vacío");
      return;
    }
    setSavingDraft(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/dm-resumen`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) {
        pushToast("error", json.error ?? "Error al guardar");
        return;
      }
      await mutate();
      setEditing(false);
      pushToast("success", "Resumen actualizado");
    } catch {
      pushToast("error", "Error de red al guardar");
    } finally {
      setSavingDraft(false);
    }
  }, [clientId, draft, mutate, pushToast]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <section className="border border-slate-200 rounded bg-white shadow-sm">
      {/* ── Encabezado ── */}
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

          {/* Badge de estado de revisión */}
          {hasContent && !isReviewed && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-amber-50 border border-amber-200 text-[10px] font-medium text-amber-700 ml-1">
              <svg
                className="w-3 h-3 shrink-0"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm.75 3.75a.75.75 0 00-1.5 0v3.5c0 .414.336.75.75.75h2.5a.75.75 0 000-1.5H8.75V4.75z" />
              </svg>
              Borrador IA · pendiente revisión
            </span>
          )}
          {hasContent && isReviewed && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-emerald-50 border border-emerald-200 text-[10px] font-medium text-emerald-700 ml-1">
              <svg
                className="w-3 h-3 text-emerald-600 shrink-0"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              Revisado por consultor
            </span>
          )}
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-2">
          {hasContent && !editing && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleStartEdit}
                aria-label="Editar resumen"
              >
                <svg className="w-4 h-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Editar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopiar}
                aria-label="Copiar resumen al portapapeles"
              >
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
            </>
          )}
          {!editing && (
            <Button
              variant={hasContent ? "secondary" : "primary"}
              size="sm"
              loading={generating}
              onClick={handleGenerar}
              disabled={generating}
            >
              {hasContent ? "Regenerar" : "Generar resumen"}
            </Button>
          )}
        </div>
      </div>

      {/* ── KPI cards — solo cuando hay contenido ── */}
      {hasContent && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-5 pt-4 pb-2">
          {KPI_CARDS.map((card) => (
            <div
              key={card.key}
              className={`p-3 bg-slate-50 border border-slate-200 rounded border-l-4 ${card.borderClass}`}
              title={
                quadrantCounts[card.key] === 0 &&
                (card.key === "solo_impacto" || card.key === "solo_financiero")
                  ? "0 = todos los IROs del estudio tienen ambas dimensiones de materialidad"
                  : undefined
              }
            >
              <p className={`text-[10px] font-bold uppercase tracking-widest ${card.textClass} mb-1.5`}>
                {card.label}
              </p>
              <p className={`text-2xl font-bold tabular-nums ${card.countClass} leading-none`}>
                {quadrantCounts[card.key]}
              </p>
              <p className="text-[10px] text-slate-400 mt-1">{card.sublabel}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Cuerpo: contenido generado / estados ── */}
      <div className="px-5 py-4">
        {isLoading ? (
          <SkeletonList items={4} />
        ) : generating ? (
          <div
            className="flex flex-col items-center justify-center py-10 gap-3"
            role="status"
            aria-live="polite"
          >
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
          <div>
            {/* P7 — tabs navegación */}
            <div className="flex gap-1 mb-4 border-b border-slate-100 pb-2">
              {(["narrativa", "cuadrantes"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setResumenTab(tab)}
                  className={[
                    "px-3 py-1.5 text-xs font-medium rounded-sm border transition-colors",
                    resumenTab === tab
                      ? "bg-white border-brand-primary text-brand-primary"
                      : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-white hover:border-slate-300",
                  ].join(" ")}
                >
                  {tab === "narrativa" ? "Narrativa" : "Cuadrantes ESG"}
                </button>
              ))}
            </div>

            {resumenTab === "cuadrantes" ? (
              /* Pestaña cuadrantes — visual de distribución */
              <div className="space-y-3">
                <p className="text-xs text-slate-500">Distribución de IROs por cuadrante de materialidad.</p>
                <div className="grid grid-cols-2 gap-3">
                  {KPI_CARDS.map((card) => {
                    const count = quadrantCounts[card.key];
                    const total = Object.values(quadrantCounts).reduce((a, b) => a + b, 0);
                    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                    return (
                      <div key={card.key} className={`p-3 bg-slate-50 border border-slate-200 rounded border-l-4 ${card.borderClass}`}>
                        <p className={`text-[10px] font-bold uppercase tracking-widest ${card.textClass} mb-1.5`}>{card.label}</p>
                        <div className="flex items-end gap-2">
                          <p className={`text-2xl font-bold tabular-nums ${card.countClass} leading-none`}>{count}</p>
                          <p className="text-[11px] text-slate-400 mb-0.5">{pct}%</p>
                        </div>
                        <div className="h-1 bg-slate-200 mt-2 overflow-hidden">
                          <div className={`h-full transition-all ${card.borderClass.replace("border-l-", "bg-")}`} style={{ width: `${pct}%` }} />
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">{card.sublabel}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <>
            {resumen?.created_at && (
              <p className="text-[11px] text-slate-400 mb-4">
                Generado el {formatDate(resumen.created_at)}
              </p>
            )}
            {editing ? (
              // Editor inline — consultor refina narrativa sin regenerar (ahorra Opus call)
              <div className="border border-slate-200 rounded">
                <div className="px-3 pt-2 pb-1 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Editar síntesis</span>
                  <span className="text-[10px] text-slate-400">Markdown · separar párrafos con línea en blanco</span>
                </div>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={14}
                  className="w-full text-xs text-slate-800 leading-relaxed px-4 py-3 resize-none focus:outline-none focus:ring-1 focus:ring-brand-primary/40 font-sans"
                />
                <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 flex items-center gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={savingDraft}>Cancelar</Button>
                  <Button variant="primary" size="sm" loading={savingDraft} onClick={handleSaveEdit}>Guardar cambios</Button>
                </div>
              </div>
            ) : (() => {
              // Colapsable: muestra primer párrafo + "Leer síntesis completa ↓"
              // Evita wall-of-text en el panel sticky. Pattern del mockup-v7.
              const content = resumen.content!;
              const firstBlockEnd = content.indexOf("\n\n");
              const hasMore = firstBlockEnd > 0 && firstBlockEnd < content.length - 1;
              const preview = !expanded && hasMore ? content.slice(0, firstBlockEnd) : content;
              return (
                <>
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
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{preview}</ReactMarkdown>
                  </div>
                  {hasMore && (
                    <button
                      type="button"
                      onClick={() => setExpanded((v) => !v)}
                      className="mt-2 text-[11px] text-brand-primary font-semibold underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 rounded-sm"
                    >
                      {expanded ? "Mostrar menos ↑" : "Leer síntesis completa ↓"}
                    </button>
                  )}
                </>
              );
            })()}
              </>
            )}
          </div>
        ) : resumen?.status === "failed" ? (
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
          /* P5 — Empty state estructurado: preview de lo que contendrá el resumen */
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-3 pb-3 border-b border-slate-100">
              <div className="shrink-0 w-8 h-8 rounded bg-brand-primary/10 flex items-center justify-center">
                <svg className="w-4 h-4 text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-0.5">El resumen ejecutivo incluirá:</p>
                <p className="text-xs text-slate-500">Aurora (Claude Sonnet) redactará un documento listo para Dirección General en ~30 segundos.</p>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
              <svg className="w-3.5 h-3.5 text-brand-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <p className="text-[11px] text-slate-500">
                Completa la calificación de IROs (Etapa 6) y usa <strong className="text-slate-600">"Generar resumen"</strong> para que Aurora redacte el análisis.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                {
                  icon: "1",
                  label: "Narrativa para DG",
                  desc: "Contexto ejecutivo del estudio — sector, marcos, período y metodología.",
                  cls: "border-l-brand-primary",
                },
                {
                  icon: "2",
                  label: "Top 5 IROs materiales",
                  desc: "Los temas con mayor doble materialidad priorizados por score.",
                  cls: "border-l-rose-500",
                },
                {
                  icon: "3",
                  label: "Brechas críticas",
                  desc: "Áreas donde el cliente está por debajo del benchmark sectorial.",
                  cls: "border-l-amber-500",
                },
                {
                  icon: "4",
                  label: "Posición competitiva",
                  desc: "Comparativa vs. empresas de referencia en el benchmark.",
                  cls: "border-l-slate-400",
                },
              ].map((item) => (
                <div key={item.icon} className={`border border-slate-200 border-l-4 ${item.cls} rounded p-2.5 space-y-1`}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-mono font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-sm">{item.icon}</span>
                    <span className="text-[10px] font-bold text-slate-700">{item.label}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-snug">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── CTA: marcar como revisado ── */}
      {hasContent && !isReviewed && (
        <div className="border-t border-slate-100 px-5 py-3">
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-slate-500">
              Revisa el borrador y márcalo como revisado para avanzar al reporte.
            </p>
            <Button
              variant="secondary"
              size="sm"
              loading={marking}
              disabled={marking}
              onClick={async () => {
                setMarking(true);
                try {
                  const res = await fetch(`/api/clients/${clientId}/dm-resumen`, { method: "PATCH" });
                  if (!res.ok) throw new Error("Error al marcar");
                  await mutate();
                  pushToast("success", "Resumen marcado como revisado");
                } catch {
                  pushToast("error", "No se pudo marcar como revisado");
                } finally {
                  setMarking(false);
                }
              }}
            >
              <svg
                className="w-3.5 h-3.5 mr-1.5"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              Marcar como revisado
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
