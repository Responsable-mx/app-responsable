"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import useSWR from "swr";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { RELATION_LABELS, RELATION_ORDER, type CompanyRelation } from "@/lib/dm/fields";
import type { DmIroConfig } from "@/lib/dm/iros";
import { ExpandableCell } from "@/components/doble-materialidad/ExpandableCell";
import type { BenchmarkCompany, BenchmarkResult, RejectionReason } from "./benchmark-types";
import { REJECTION_OPTIONS } from "./benchmark-helpers";
import { BenchmarkComparisonTable } from "./BenchmarkComparisonTable";
import type { BenchmarkEmpresa } from "@/lib/dm/benchmark-empresas-types";
import { ManualAddCompanyForm } from "@/components/doble-materialidad/ManualAddCompanyForm";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

// ── Síntesis estructurada ─────────────────────────────────────────────────────

type SynthesisSection = { label: string; text: string; accent: string; labelCls: string };

function parseSynthesis(text: string): SynthesisSection[] | null {
  // Buscar marcadores comunes en el output de la IA
  const MARKERS: Array<{ re: RegExp; label: string; accent: string; labelCls: string }> = [
    {
      re: /[Ss]us fortalezas son[:\s]|[Ff]ortalezas[:\s]/,
      label: "Fortalezas",
      accent: "border-l-emerald-500",
      labelCls: "text-emerald-700",
    },
    {
      re: /[Ll]as brechas críticas son[:\s]|[Bb]rechas críticas[:\s]/,
      label: "Brechas críticas",
      accent: "border-l-amber-500",
      labelCls: "text-amber-700",
    },
    {
      re: /[Pp]rioridad(?:es)? inmediata[:\s]|[Pp]rioridad[:\s]/,
      label: "Prioridad inmediata",
      accent: "border-l-brand-primary",
      labelCls: "text-brand-primary",
    },
  ];

  const positions: Array<{ idx: number; markerIdx: number; matchEnd: number }> = [];
  for (let i = 0; i < MARKERS.length; i++) {
    const m = MARKERS[i]!.re.exec(text);
    if (m) positions.push({ idx: m.index, markerIdx: i, matchEnd: m.index + m[0].length });
  }
  if (positions.length < 2) return null; // no hay suficientes marcadores → fallback

  positions.sort((a, b) => a.idx - b.idx);

  const sections: SynthesisSection[] = [];
  // Texto previo al primer marcador = intro (opcional, no renderizar como sección propia)
  for (let p = 0; p < positions.length; p++) {
    const pos = positions[p]!;
    const marker = MARKERS[pos.markerIdx]!;
    const end = p + 1 < positions.length ? positions[p + 1]!.idx : text.length;
    const sectionText = text.slice(pos.matchEnd, end).trim().replace(/^[:\s]+/, "");
    if (sectionText) {
      sections.push({ label: marker.label, text: sectionText, accent: marker.accent, labelCls: marker.labelCls });
    }
  }
  return sections.length >= 2 ? sections : null;
}

// Regex con todos los marcadores — extrae texto previo al primer marcador
const FIRST_MARKER_RE = /[Ss]us fortalezas son[:\s]|[Ff]ortalezas[:\s]|[Ll]as brechas críticas son[:\s]|[Bb]rechas críticas[:\s]|[Pp]rioridad(?:es)? inmediata[:\s]|[Pp]rioridad[:\s]/;

function SynthesisBlock({ narrative, createdAt }: { narrative: string; createdAt: string }) {
  const sections = parseSynthesis(narrative);

  // Extraer párrafo de apertura (antes del primer marcador)
  let intro: string | null = null;
  if (sections) {
    const m = FIRST_MARKER_RE.exec(narrative);
    if (m && m.index > 20) {
      const candidate = narrative.slice(0, m.index).trim();
      if (candidate.length > 0) intro = candidate;
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
        Síntesis del benchmark
      </p>
      {sections ? (
        <div className="space-y-2">
          {intro && (
            <p className="text-sm text-slate-600 leading-relaxed">{intro}</p>
          )}
          {sections.map((s) => (
            <div key={s.label} className={`border-l-4 ${s.accent} pl-3 py-1.5`}>
              <span className={`text-[10px] font-bold uppercase tracking-widest ${s.labelCls} block mb-0.5`}>
                {s.label}
              </span>
              <p className="text-sm text-slate-700 leading-relaxed">{s.text}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="border-l-4 border-l-brand-primary pl-4 py-2">
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{narrative}</p>
        </div>
      )}
      <p className="text-[10px] text-slate-400">
        {new Date(createdAt).toLocaleDateString("es-MX", {
          day: "numeric", month: "long", year: "numeric",
        })}
      </p>
    </div>
  );
}

export function BenchmarkSection({
  clientId,
  clientName,
  companies,
  latestResult,
  onDataMutate,
  isPolling,
  onStartPolling,
  referentCompanies = [],
}: {
  clientId: string;
  clientName: string;
  companies: BenchmarkCompany[];
  latestResult: BenchmarkResult | null;
  onDataMutate: () => void;
  isPolling: boolean;
  onStartPolling: () => void;
  /** Empresas validadas en Etapa 3 (Empresas de referencia). Cuando presente, oculta "Proponer con IA". */
  referentCompanies?: BenchmarkEmpresa[];
}) {
  const { push } = useToast();
  const { data: irosData } = useSWR<{ data: DmIroConfig[] }>("/api/iros", fetcher);
  const iros = irosData?.data ?? [];

  const [proposing, setProposing] = useState(false);
  const [confirmRepropose, setConfirmRepropose] = useState(false);
  const [fieldsExpanded, setFieldsExpanded] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const hasDone = latestResult?.status === "done";
  const hasReferentes = referentCompanies.length > 0;
  // Colapsar configuración por default cuando ya existe un resultado
  const [configExpanded, setConfigExpanded] = useState(() => latestResult?.status !== "done");

  // Auto-importar silenciosamente desde Etapa 3 cuando aún no hay empresas en benchmark
  const autoImportAttempted = useRef(false);
  useEffect(() => {
    if (!hasReferentes || companies.length > 0 || autoImportAttempted.current) return;
    autoImportAttempted.current = true;
    void fetch(`/api/clients/${clientId}/dm-benchmark`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "import_from_referentes" }),
    })
      .then((r) => r.json())
      .then((json) => { if ((json.data?.imported ?? 0) > 0) onDataMutate(); })
      .catch(() => { /* silent */ });
  }, [hasReferentes, companies.length, clientId, onDataMutate]);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(companies.filter((c) => c.validated).map((c) => c.id))
  );
  // En modo Etapa 3: auto-seleccionar todas cuando el SWR refetch trae las companies importadas
  useEffect(() => {
    if (hasReferentes && companies.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot: sincroniza selección cuando llegan las empresas importadas por primera vez
      setSelected(new Set(companies.map((c) => c.id)));
    }
  }, [hasReferentes, companies]);
  // ID de empresa esperando razón de rechazo (al desmarcar)
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const handlePropose = useCallback(async () => {
    setProposing(true);
    // Capturar selecciones actuales antes de la petición
    const currentSelected = Array.from(selected);
    try {
      const res = await fetch(`/api/clients/${clientId}/dm-benchmark`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Pasar IDs seleccionados para que el backend los marque validated=true
        // y no los borre al regenerar
        body: JSON.stringify({ action: "propose", selected_ids: currentSelected }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al proponer empresas");
      const conserved = currentSelected.length;
      push(
        "success",
        conserved > 0
          ? `Nuevas propuestas listas. Tus ${conserved} empresa${conserved > 1 ? "s" : ""} seleccionada${conserved > 1 ? "s" : ""} se conservaron.`
          : "Empresas propuestas. Revisa y selecciona las que incluirás en el benchmark."
      );
      // No limpiar selected — las empresas conservadas siguen en la lista
      onDataMutate();
    } catch (e) {
      push("error", e instanceof Error ? e.message : "Error al proponer empresas");
    } finally {
      setProposing(false);
    }
  }, [clientId, selected, push, onDataMutate]);

  const handleToggle = useCallback((id: string) => {
    setSelected((prev) => {
      if (prev.has(id)) {
        // Deseleccionando → pedir razón de rechazo en lugar de quitar directo
        setRejectingId(id);
        return prev; // no quitar todavía — se quita tras elegir razón
      }
      // Seleccionando → limpiar rejection_reason si tenía una
      void fetch(`/api/clients/${clientId}/dm-benchmark`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: id, rejection_reason: null }),
      });
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, [clientId]);

  const handleRejectionPick = useCallback(async (companyId: string, reason: RejectionReason | null) => {
    // Quitar de selección
    setSelected((prev) => { const n = new Set(prev); n.delete(companyId); return n; });
    setRejectingId(null);
    if (reason) {
      await fetch(`/api/clients/${clientId}/dm-benchmark`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, rejection_reason: reason }),
      });
      onDataMutate();
    }
  }, [clientId, onDataMutate]);

  const handleToggleReportsPublicly = useCallback(async (companyId: string, current: boolean | null) => {
    const next = current === true ? false : current === false ? null : true;
    await fetch(`/api/clients/${clientId}/dm-benchmark`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company_id: companyId, reports_publicly: next }),
    });
    onDataMutate();
  }, [clientId, onDataMutate]);

  const handleCompare = useCallback(async () => {
    if (selected.size < 2) {
      push("error", "Selecciona al menos 2 empresas para el benchmark");
      return;
    }
    // C — diversidad mínima de relaciones (best practice mundial: ≥2 tipos)
    const selectedCompanies = companies.filter((c) => selected.has(c.id));
    const relationTypes = new Set(selectedCompanies.map((c) => c.relation));
    if (relationTypes.size < 2) {
      push(
        "warning",
        "Todas las empresas son del mismo tipo de relación. Considera agregar al menos un tipo diferente (sector, cadena de valor, etc.) para un benchmark más robusto."
      );
    }
    try {
      const res = await fetch(`/api/clients/${clientId}/dm-benchmark`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "compare", company_ids: Array.from(selected) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al ejecutar benchmark");
      onStartPolling();
    } catch (e) {
      push("error", e instanceof Error ? e.message : "Error al ejecutar benchmark");
    }
  }, [clientId, selected, companies, push, onStartPolling]);

  const handleAddManual = useCallback(async (data: {
    name: string; relation: CompanyRelation; country: string | null;
    sector: string | null; website: string | null; justification: string | null;
  }) => {
    const res = await fetch(`/api/clients/${clientId}/dm-benchmark`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add_manual", ...data }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Error al agregar empresa");
    push("success", `${data.name} agregada al benchmark.`);
    setShowAddForm(false);
    onDataMutate();
  }, [clientId, push, onDataMutate]);

  const handleRemoveCompany = useCallback(async (companyId: string) => {
    try {
      const res = await fetch(`/api/clients/${clientId}/dm-benchmark`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", company_id: companyId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al eliminar empresa");
      onDataMutate();
    } catch (e) {
      push("error", e instanceof Error ? e.message : "Error al eliminar empresa");
    }
  }, [clientId, push, onDataMutate]);

  // Wave 7 C: ingestar reporte de competidor manualmente (cuando IA no encontró URL
  // o consultor quiere agregar una específica). El cron embed-chunks lo procesará
  // automáticamente en próximo ciclo (≤24h).
  const [ingestingId, setIngestingId] = useState<string | null>(null);
  const handleIngestReport = useCallback(async (companyId: string, suggestedUrl: string | null) => {
    const url = window.prompt(
      suggestedUrl
        ? `URL del reporte de sustentabilidad del competidor (PDF/HTML):`
        : `URL del reporte de sustentabilidad del competidor (PDF/HTML).\nSi no la tienes, pega el link a su página de sostenibilidad y la IA descargará lo público:`,
      suggestedUrl ?? "https://"
    );
    if (!url || !url.trim() || !/^https?:\/\//i.test(url.trim())) return;
    setIngestingId(companyId);
    try {
      const res = await fetch(`/api/clients/${clientId}/dm-benchmark/embed-competitor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          benchmark_company_id: companyId,
          source_url: url.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      if (json.data?.cached) {
        push("info", `Reporte ya estaba persistido para esta empresa (${json.data.company_name}).`);
      } else {
        push(
          "success",
          `Reporte ingerido. La IA lo procesará en las próximas horas y estará listo para benchmarks futuros.`
        );
      }
      onDataMutate();
    } catch (e) {
      push("error", e instanceof Error ? e.message : "Error al ingerir reporte");
    } finally {
      setIngestingId(null);
    }
  }, [clientId, push, onDataMutate]);

  const groupedByRelation = companies.reduce<Record<string, BenchmarkCompany[]>>((acc, c) => {
    if (!acc[c.relation]) acc[c.relation] = [];
    acc[c.relation]!.push(c);
    return acc;
  }, {});

  const hasComparisonData =
    hasDone &&
    latestResult!.companies_snapshot?.length > 0 &&
    latestResult!.fields_snapshot?.length > 0 &&
    Object.keys(latestResult!.comparison ?? {}).length > 0;

  return (
    <div className="space-y-4">
      {/* ── Configuración: colapsada cuando hay resultado ── */}
      {hasDone && !configExpanded ? (
        // Fila resumen colapsada
        <div className="flex items-center justify-between border border-slate-200 rounded px-3 py-2 bg-slate-50/60 gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-emerald-600 shrink-0" viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" d="M8 15A7 7 0 108 1a7 7 0 000 14zm3.354-9.354a.5.5 0 00-.708 0L7 9.293 5.354 7.646a.5.5 0 00-.708.708l2 2a.5.5 0 00.708 0l4-4a.5.5 0 000-.708z" clipRule="evenodd" />
            </svg>
            <span className="text-xs text-slate-600">
              Benchmark ejecutado el{" "}
              {new Date(latestResult!.created_at).toLocaleDateString("es-MX", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}{" "}
              con {latestResult!.companies_snapshot.length} empresa
              {latestResult!.companies_snapshot.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="secondary"
              loading={isPolling}
              onClick={() => void handleCompare()}
              disabled={isPolling || selected.size < 2}
              title={selected.size < 2 ? "Selecciona al menos 2 empresas para re-ejecutar" : `Re-ejecutar con ${selected.size} empresas`}
            >
              {isPolling ? "Ejecutando…" : "Re-ejecutar"}
            </Button>
          </div>
        </div>
      ) : (
        // Configuración expandida
        <div className="space-y-4">
          {/* Campos del benchmark — oculto en modo Etapa 3 */}
          {!hasReferentes && (
            <div className="bg-slate-50 rounded p-3">
              <button
                type="button"
                onClick={() => setFieldsExpanded((v) => !v)}
                aria-expanded={fieldsExpanded}
                aria-controls="esrs-fields-panel"
                className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 w-full text-left"
              >
                Estándares ESRS ({iros.length > 0 ? iros.length : 10} · 2 dimensiones c/u)
                <svg
                  className={`w-3 h-3 transition-transform ${fieldsExpanded ? "rotate-180" : ""}`}
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path strokeLinecap="round" d="M3 4.5l3 3 3-3" />
                </svg>
              </button>
              {fieldsExpanded && (
                <div id="esrs-fields-panel" className="flex flex-wrap gap-1.5 mt-2">
                  {(iros.length > 0 ? iros : []).map((iro) => (
                    <span
                      key={iro.id}
                      className="text-xs bg-white border border-slate-200 text-slate-600 px-2 py-0.5 rounded-sm"
                      title={`Impacto: ${iro.impact_desc}\nRiesgo: ${iro.risk_desc}`}
                    >
                      {iro.esrs_standard} · {iro.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Fuente de empresas — solo en modo clásico (sin Etapa 3) */}
          {!hasReferentes && (
            <div className="flex items-center gap-3 flex-wrap">
              <Button
                size="sm"
                variant={companies.length > 0 ? "secondary" : "primary"}
                loading={proposing}
                onClick={companies.length > 0 ? () => setConfirmRepropose(true) : handlePropose}
              >
                {companies.length > 0 ? (
                  <>
                    <svg className="w-3 h-3 mr-1.5 shrink-0" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 4a4 4 0 11-7.9 1" />
                      <path d="M2 2v3h3" />
                    </svg>
                    Regenerar lista IA
                  </>
                ) : (
                  <>
                    <svg className="w-3 h-3 mr-1.5 shrink-0" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 1v7M6 8l-2.5-2.5M6 8l2.5-2.5" />
                      <path d="M1 11h10" />
                    </svg>
                    Proponer empresas con IA
                  </>
                )}
              </Button>
              <button
                type="button"
                onClick={() => setShowAddForm((v) => !v)}
                className="text-xs text-brand-primary hover:underline flex items-center gap-1"
              >
                <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M6 2v8M2 6h8" />
                </svg>
                Agregar manualmente
              </button>
              {companies.length > 0 && (
                <span className="text-xs text-slate-400">{companies.length} empresa{companies.length !== 1 ? "s" : ""}</span>
              )}
            </div>
          )}

          {/* Formulario agregar empresa manual — justo bajo el botón para visibilidad inmediata */}
          {showAddForm && (
            <ManualAddCompanyForm
              onAdd={(data) => handleAddManual(data)}
              onCancel={() => setShowAddForm(false)}
            />
          )}

          {/* Selección masiva — oculta en modo Etapa 3 (empresas vienen de Referentes) */}
          {!hasReferentes && companies.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelected(new Set(companies.map((c) => c.id)))}
                className="text-[11px] text-brand-primary hover:underline"
              >
                Seleccionar todas
              </button>
              <span className="text-slate-300 text-[11px]">·</span>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-[11px] text-slate-500 hover:underline"
              >
                Limpiar
              </button>
              <span className="text-[11px] text-slate-400">{selected.size} seleccionadas</span>
            </div>
          )}

          {/* Lista de empresas — oculta en modo Etapa 3 (gestionado en etapa anterior) */}
          {!hasReferentes && RELATION_ORDER.filter((r) => groupedByRelation[r]?.length).map((relation) => {
            const group = groupedByRelation[relation]!;
            return (
            <div key={relation}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
                {RELATION_LABELS[relation as CompanyRelation] ?? relation}
              </p>
              <div className="space-y-1">
                {group.map((company) => (
                  <div key={company.id} className="border border-slate-200 rounded overflow-hidden">
                    {/* Fila principal — clic en cualquier parte del row (excepto controles) activa el checkbox */}
                    <div
                      className="flex items-start gap-2.5 p-2.5 hover:bg-slate-50 transition-colors cursor-pointer"
                      onClick={(e) => {
                        const t = e.target as HTMLElement;
                        if (t.closest("a, button, input")) return;
                        handleToggle(company.id);
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(company.id)}
                        onChange={() => handleToggle(company.id)}
                        className="mt-0.5 accent-brand-primary cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        {/* Nombre + país + link web */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-medium text-slate-800">{company.name}</span>
                          {company.country && (
                            <span className="text-xs text-slate-400">{company.country}</span>
                          )}
                          {company.website && (
                            <a
                              href={company.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-brand-primary hover:text-brand-primary-dark shrink-0"
                              title={company.website}
                            >
                              <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M7 1h4v4M11 1L5.5 6.5M4 2H2a1 1 0 00-1 1v7a1 1 0 001 1h7a1 1 0 001-1V9" />
                              </svg>
                            </a>
                          )}
                          {/* Razón de rechazo guardada */}
                          {!selected.has(company.id) && company.rejection_reason && (
                            <span className="text-[9px] bg-slate-100 text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded-sm">
                              {REJECTION_OPTIONS.find((r) => r.value === company.rejection_reason)?.label ?? company.rejection_reason}
                            </span>
                          )}
                          {/* Wave 7 C: indicador reporte embeddido (chunks Voyage listos para reuso) */}
                          {company.has_embedded_report && (
                            <span
                              className="text-[9px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded-sm font-bold inline-flex items-center gap-0.5"
                              title="Reporte oficial embeddido — la IA usa chunks vectoriales en benchmarks (más rápido, más preciso, sin web_search)"
                            >
                              ★ Embeddido
                            </span>
                          )}
                        </div>
                        {/* Sector */}
                        {company.sector && (
                          <p className="text-xs text-slate-500 truncate mt-0.5">{company.sector}</p>
                        )}
                        {/* Justificación IA — line-clamp-3, expandible */}
                        {company.justification && (
                          <div className="mt-1">
                            <ExpandableCell text={company.justification} />
                          </div>
                        )}
                      </div>
                      {/* Controles derecha */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Wave 7 C — botón ingerir reporte para reuso vector benchmark */}
                        {!company.has_embedded_report && (
                          <button
                            type="button"
                            onClick={() => void handleIngestReport(company.id, company.sustainability_report_url ?? null)}
                            disabled={ingestingId === company.id}
                            title={
                              company.sustainability_report_url
                                ? `Ingerir reporte oficial (URL sugerida por IA): ${company.sustainability_report_url}`
                                : "Pegar URL del reporte de sustentabilidad del competidor para que la IA lo use en benchmarks futuros"
                            }
                            className={`text-[9px] px-1.5 py-0.5 rounded-sm font-medium border transition-colors ${
                              ingestingId === company.id
                                ? "bg-slate-100 text-slate-400 border-slate-200 cursor-wait"
                                : "bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                            }`}
                          >
                            {ingestingId === company.id ? "Ingiriendo…" : "↓ Reporte"}
                          </button>
                        )}
                        {/* B — toggle reporte ESG público */}
                        <button
                          type="button"
                          onClick={() => void handleToggleReportsPublicly(company.id, company.reports_publicly)}
                          title={
                            company.reports_publicly === true
                              ? "Tiene reporte ESG público — clic para cambiar"
                              : company.reports_publicly === false
                              ? "Sin reporte ESG público — clic para cambiar"
                              : "¿Tiene reporte ESG público? (GRI/CSRD/TCFD)"
                          }
                          className={`p-0.5 rounded transition-colors ${
                            company.reports_publicly === true
                              ? "text-teal-600"
                              : company.reports_publicly === false
                              ? "text-slate-300 line-through"
                              : "text-slate-300 hover:text-slate-500"
                          }`}
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 1h6l3 3v9H3V1z" />
                            <path d="M9 1v3h3" />
                            <path d="M5 7h4M5 9.5h3" />
                          </svg>
                        </button>
                        {company.proposed_by === "ia" && (
                          <span className="text-[9px] font-bold text-brand-primary bg-brand-primary/10 px-1.5 py-0.5 rounded-sm">
                            IA
                          </span>
                        )}
                        {company.proposed_by === "consultor" && (
                          <button
                            type="button"
                            onClick={() => void handleRemoveCompany(company.id)}
                            className="text-slate-300 hover:text-rose-500 transition-colors"
                            title="Eliminar empresa"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M2 3.5h10M5 3.5V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5v1M5.5 6v4M8.5 6v4M3 3.5l.75 7a.5.5 0 00.5.5h5.5a.5.5 0 00.5-.5L11 3.5" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* A — picker razón de rechazo (aparece al desmarcar) */}
                    {rejectingId === company.id && (
                      <div className="border-t border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
                          ¿Por qué no incluyes esta empresa?
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {REJECTION_OPTIONS.map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => void handleRejectionPick(company.id, opt.value)}
                              className="text-xs bg-white border border-slate-200 text-slate-600 px-2 py-1 rounded-sm hover:border-brand-primary hover:text-brand-primary transition-colors"
                            >
                              {opt.label}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => void handleRejectionPick(company.id, null)}
                            className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1"
                          >
                            Omitir
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ); })}

          {/* Botón ejecutar benchmark — sin paréntesis */}
          {companies.length > 0 && (
            <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
              <Button
                size="md"
                variant="primary"
                loading={isPolling}
                onClick={handleCompare}
                disabled={isPolling || selected.size < 2}
                title={selected.size < 2 ? "Selecciona al menos 2 empresas para ejecutar" : undefined}
              >
                Ejecutar benchmark
              </Button>
              {selected.size > 0 && !isPolling && (
                <span className="text-xs text-slate-500">
                  {selected.size} empresa{selected.size !== 1 ? "s" : ""} + {clientName}
                </span>
              )}
              {hasDone && !isPolling && (
                <span className="text-xs text-emerald-600 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                    <path fillRule="evenodd" d="M8 15A7 7 0 108 1a7 7 0 000 14zm3.354-9.354a.5.5 0 00-.708 0L7 9.293 5.354 7.646a.5.5 0 00-.708.708l2 2a.5.5 0 00.708 0l4-4a.5.5 0 000-.708z" clipRule="evenodd" />
                  </svg>
                  Benchmark anterior disponible
                </span>
              )}
            </div>
          )}

          {/* Colapsar cuando hay resultado */}
          {hasDone && (
            <button
              type="button"
              onClick={() => setConfigExpanded(false)}
              className="text-[11px] text-slate-400 hover:text-slate-600 hover:underline"
            >
              ↑ Colapsar configuración
            </button>
          )}
        </div>
      )}

      {/* ── Progreso durante ejecución async ── */}
      {isPolling && (
        <div className="flex items-center gap-2 text-xs text-slate-500 py-2 border-l-4 border-l-amber-400 pl-4">
          <svg className="w-4 h-4 animate-spin text-brand-primary shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Procesando con IA (Sonnet) — tarda 1-3 minutos. No cierres esta página.
        </div>
      )}

      {/* ── Resultado narrativo del último benchmark ── */}
      {hasDone && latestResult!.narrative && (
        <SynthesisBlock
          narrative={latestResult!.narrative}
          createdAt={latestResult!.created_at}
        />
      )}

      {/* ── Tabla comparativa ── */}
      {hasComparisonData && <BenchmarkComparisonTable clientId={clientId} clientName={clientName} latestResult={latestResult!} />}


      {latestResult?.status === "failed" && (
        <div className="border-l-4 border-l-rose-500 pl-4 py-2 bg-rose-50 rounded-r">
          <p className="text-xs text-rose-700">
            El benchmark anterior falló.{" "}
            <button
              type="button"
              onClick={() => void handleCompare()}
              className="underline font-medium"
            >
              Intenta de nuevo
            </button>
            .
          </p>
          <p className="text-[10px] text-rose-400 mt-0.5">
            {new Date(latestResult.created_at).toLocaleString("es-MX", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
      )}

      <ConfirmModal
        open={confirmRepropose}
        title="¿Regenerar lista de empresas?"
        description="La IA generará nuevas propuestas. Las empresas que ya tienes seleccionadas se conservarán — solo se reemplazarán las no seleccionadas."
        confirmLabel="Regenerar lista"
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
