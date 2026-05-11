"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import useSWR from "swr";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { SelectField } from "@/components/ui/SelectField";
import { RELATION_LABELS, RELATION_ORDER, type CompanyRelation } from "@/lib/dm/fields";
import type { DmIroConfig } from "@/lib/dm/iros";
import { ExpandableCell } from "@/components/doble-materialidad/ExpandableCell";
import type { BenchmarkCompany, BenchmarkResult, RejectionReason } from "./benchmark-types";
import { REJECTION_OPTIONS, lookupComparisonValue, abbrevCompanyName } from "./benchmark-helpers";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

export function BenchmarkSection({
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
  const { data: irosData } = useSWR<{ data: DmIroConfig[] }>("/api/iros", fetcher);
  const iros = irosData?.data ?? [];

  const [proposing, setProposing] = useState(false);
  const [confirmRepropose, setConfirmRepropose] = useState(false);
  const [fieldsExpanded, setFieldsExpanded] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addingManual, setAddingManual] = useState(false);
  const [manualForm, setManualForm] = useState({
    name: "",
    relation: "competitor_nacional" as CompanyRelation,
    country: "",
    sector: "",
    website: "",
    justification: "",
  });
  const hasDone = latestResult?.status === "done";
  // Colapsar configuración por default cuando ya existe un resultado
  const [configExpanded, setConfigExpanded] = useState(() => latestResult?.status !== "done");
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(companies.filter((c) => c.validated).map((c) => c.id))
  );
  const [tableFilter, setTableFilter] = useState<"all" | "E" | "S" | "G">("all");
  const [onlyBrechas, setOnlyBrechas] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [tableFullscreen, setTableFullscreen] = useState(false);
  const [colFilter, setColFilter] = useState<"all" | "competitor_nacional" | "competitor_internacional" | "sector" | "cadena_valor">("all");
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
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

  const handleAddManual = useCallback(async () => {
    if (!manualForm.name.trim()) return;
    setAddingManual(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/dm-benchmark`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_manual",
          name: manualForm.name.trim(),
          relation: manualForm.relation,
          country: manualForm.country.trim() || null,
          sector: manualForm.sector.trim() || null,
          website: manualForm.website.trim() || null,
          justification: manualForm.justification.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al agregar empresa");
      push("success", `${manualForm.name.trim()} agregada al benchmark.`);
      setShowAddForm(false);
      setManualForm({ name: "", relation: "competitor_nacional", country: "", sector: "", website: "", justification: "" });
      onDataMutate();
    } catch (e) {
      push("error", e instanceof Error ? e.message : "Error al agregar empresa");
    } finally {
      setAddingManual(false);
    }
  }, [clientId, manualForm, push, onDataMutate]);

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

  useEffect(() => {
    if (!tableFullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setTableFullscreen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tableFullscreen]);

  return (
    <div className="space-y-4">
      {/* ── Configuración: colapsada cuando hay resultado ── */}
      {hasDone && !configExpanded ? (
        // Fila resumen colapsada
        <div className="flex items-center justify-between border border-slate-200 rounded px-3 py-2 bg-slate-50/60">
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
          <button
            type="button"
            onClick={() => setConfigExpanded(true)}
            className="text-xs text-brand-primary hover:underline flex items-center gap-0.5"
          >
            Editar
            <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" d="M3 4.5l3 3 3-3" />
            </svg>
          </button>
        </div>
      ) : (
        // Configuración expandida
        <div className="space-y-4">
          {/* Campos del benchmark — colapsable */}
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

          {/* Botón proponer + agregar manual */}
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

          {/* Formulario agregar empresa manual — justo bajo el botón para visibilidad inmediata */}
          {showAddForm && (
            <div className="border border-brand-primary/30 rounded p-3 space-y-2.5 bg-slate-50/60">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                Agregar empresa manualmente
              </p>
              {/* Nombre + Relación */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">
                    Nombre <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={manualForm.name}
                    onChange={(e) => setManualForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Ej: Grupo Bimbo"
                    maxLength={200}
                    className="font-sans w-full text-sm border border-slate-200 rounded px-2.5 py-1.5 bg-white placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
                  />
                </div>
                <div className="w-52 shrink-0">
                  <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">
                    Tipo de relación <span className="text-rose-500">*</span>
                  </label>
                  <SelectField
                    value={manualForm.relation}
                    onChange={(v) => setManualForm((f) => ({ ...f, relation: v as CompanyRelation }))}
                    options={[
                      { value: "competitor_nacional",       label: RELATION_LABELS.competitor_nacional },
                      { value: "competitor_internacional",  label: RELATION_LABELS.competitor_internacional },
                      { value: "sector",                    label: RELATION_LABELS.sector },
                      { value: "cadena_valor",              label: RELATION_LABELS.cadena_valor },
                    ]}
                  />
                </div>
              </div>
              {/* País + Sector */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">País</label>
                  <input
                    type="text"
                    value={manualForm.country}
                    onChange={(e) => setManualForm((f) => ({ ...f, country: e.target.value }))}
                    placeholder="Ej: México"
                    maxLength={100}
                    className="font-sans w-full text-sm border border-slate-200 rounded px-2.5 py-1.5 bg-white placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Sector</label>
                  <input
                    type="text"
                    value={manualForm.sector}
                    onChange={(e) => setManualForm((f) => ({ ...f, sector: e.target.value }))}
                    placeholder="Ej: Alimentos y bebidas"
                    maxLength={200}
                    className="font-sans w-full text-sm border border-slate-200 rounded px-2.5 py-1.5 bg-white placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
                  />
                </div>
              </div>
              {/* Website */}
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">
                  Sitio web
                </label>
                <input
                  type="url"
                  value={manualForm.website}
                  onChange={(e) => setManualForm((f) => ({ ...f, website: e.target.value }))}
                  placeholder="https://www.ejemplo.com"
                  maxLength={300}
                  className="font-sans w-full text-sm border border-slate-200 rounded px-2.5 py-1.5 bg-white placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
                />
              </div>
              {/* Justificación */}
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">
                  Justificación
                </label>
                <textarea
                  value={manualForm.justification}
                  onChange={(e) => setManualForm((f) => ({ ...f, justification: e.target.value }))}
                  placeholder="¿Por qué incluir esta empresa en el benchmark? ¿Qué reporta en sostenibilidad?"
                  maxLength={600}
                  rows={2}
                  className="font-sans w-full text-sm border border-slate-200 rounded px-2.5 py-1.5 bg-white placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 resize-none"
                />
                <p className="text-[10px] text-slate-300 text-right">{manualForm.justification.length}/600</p>
              </div>
              {/* Acciones */}
              <div className="flex items-center gap-2 pt-0.5">
                <Button
                  size="sm"
                  variant="primary"
                  loading={addingManual}
                  disabled={!manualForm.name.trim()}
                  onClick={() => void handleAddManual()}
                >
                  Agregar empresa
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setManualForm({ name: "", relation: "competitor_nacional", country: "", sector: "", website: "", justification: "" });
                  }}
                  className="text-xs text-slate-500 hover:underline"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Selección masiva — links inline, no botones */}
          {companies.length > 0 && (
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

          {/* Lista de empresas por categoría — orden canónico fijo */}
          {RELATION_ORDER.filter((r) => groupedByRelation[r]?.length).map((relation) => {
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
        <div className="border-l-4 border-l-brand-primary pl-4 py-2 bg-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
            Síntesis del benchmark
          </p>
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
            {latestResult!.narrative}
          </p>
          <p className="text-[10px] text-slate-400 mt-2">
            {new Date(latestResult!.created_at).toLocaleDateString("es-MX", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
      )}

      {/* ── Tabla comparativa — con columna cliente highlight ── */}
      {hasComparisonData && (() => {
        const allFields = latestResult!.fields_snapshot;
        const allCompanies = latestResult!.companies_snapshot;
        const isBrechaText = (t: string) =>
          /ausencia|brecha|carece|sin reporte|sin meta|no publica|no mide|no tiene|no cuenta/.test(t.toLowerCase());

        // Counts por categoría E/S/G (filas)
        const catCounts = allFields.reduce<Record<string, number>>((acc, f) => {
          const cat = f.key.charAt(0).toUpperCase();
          acc[cat] = (acc[cat] ?? 0) + 1;
          return acc;
        }, {});

        // Filtro de columnas por tipo de empresa
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
            lookupComparisonValue(latestResult!.comparison, f.key, clientName),
            ...visibleCompanies.map((c) =>
              lookupComparisonValue(latestResult!.comparison, f.key, c.name)
            ),
          ];
          return texts.some(isBrechaText);
        });

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

        // Barra de filtros (2 filas) — reutilizada en modo normal y fullscreen
        const filterBar = (
          <div className="flex flex-col gap-1.5">
            {/* Fila 1: filtro dimensión (filas) + acciones */}
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
              <button
                type="button"
                disabled={exporting}
                onClick={handleExport}
                className="px-2 py-0.5 rounded-sm text-[10px] font-medium border border-slate-200 bg-white text-slate-500 hover:border-slate-400 transition-colors disabled:opacity-50"
              >
                {exporting ? "Exportando…" : "↓ Excel"}
              </button>
            </div>
            {/* Fila 2: filtro por tipo de empresa (columnas) */}
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

        // tableElement — solo la tabla, sin wrapper de scroll
        // sticky top-0 en cada <th> con shadow bottom: header fijo al scroll vertical
        // (shadow reemplaza border-bottom — border-collapse: collapse lo rompe con sticky)
        const tableElement = (
          <table className="min-w-full w-max text-xs border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-[20] bg-white text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 pb-2 pr-6 whitespace-nowrap shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06),0_1px_0_0_#e2e8f0]">
                  Dimensión
                </th>
                <th className="sticky top-0 z-[11] text-left text-[10px] font-bold uppercase tracking-widest pb-2 pr-6 whitespace-nowrap bg-brand-primary-light/30 px-3 rounded-t text-brand-primary-dark shadow-[0_1px_0_0_#e2e8f0]">
                  {clientName}
                  <span className="ml-1 font-normal normal-case text-[10px] text-brand-primary/60">· Cliente</span>
                </th>
                {visibleCompanies.map((company) => (
                  <th
                    key={company.name}
                    title={company.name}
                    className="sticky top-0 z-[11] bg-white text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 pb-2 pr-6 whitespace-nowrap shadow-[0_1px_0_0_#e2e8f0]"
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
                  const clientText = lookupComparisonValue(latestResult!.comparison, field.key, clientName);
                  return (
                    <tr
                      key={field.key}
                      className="group even:bg-slate-50/60 hover:bg-brand-primary-light/20 transition-colors"
                    >
                      {/* Columna dimensión: badge E/S/G + label */}
                      <td className="sticky left-0 z-10 bg-white group-even:bg-slate-50/60 group-hover:bg-brand-primary-light/20 py-3 pr-6 align-top shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]">
                        <div className="flex flex-col gap-0.5">
                          {badge && (
                            <span className={`inline-flex w-fit items-center px-1 py-px rounded-sm text-[9px] font-medium border ${badge.cls}`}>
                              {badge.label}
                            </span>
                          )}
                          <span className="font-medium text-slate-700 whitespace-nowrap">{field.label}</span>
                        </div>
                      </td>
                      {/* Celda cliente */}
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
                      {/* Celdas competidores */}
                      {visibleCompanies.map((company) => {
                        const compText = lookupComparisonValue(latestResult!.comparison, field.key, company.name);
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

        // tableGrid — wrapper con scroll horizontal para modo normal
        const tableGrid = (
          <div className="relative overflow-x-auto">
            {tableElement}
          </div>
        );

        const scrollHint = visibleCompanies.length > 2 && (
          <p className="text-[10px] text-slate-400 mt-1 text-right">
            ← desliza para ver todas las empresas
          </p>
        );

        return (
          <>
            {/* ── Modo normal ── */}
            <div className="mt-2">
              <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {clientName} vs {allCompanies.length} empresa
                  {allCompanies.length !== 1 ? "s" : ""} — posición por dimensión ESG
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  {filterBar}
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
              {tableGrid}
              {scrollHint}
            </div>

            {/* ── Overlay fullscreen ── */}
            {tableFullscreen && (
              <div className="fixed inset-0 z-50 bg-white flex flex-col">
                <div className="flex items-center justify-between gap-4 px-6 pt-4 pb-3 border-b border-slate-200 flex-shrink-0 flex-wrap">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    {clientName} vs {allCompanies.length} empresa
                    {allCompanies.length !== 1 ? "s" : ""} — posición por dimensión ESG
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {filterBar}
                    <button
                      type="button"
                      onClick={() => setTableFullscreen(false)}
                      title="Cerrar (Esc)"
                      className="ml-2 px-2 py-0.5 rounded-sm text-[10px] font-medium border border-slate-200 bg-white text-slate-500 hover:border-slate-400 transition-colors"
                    >
                      ✕ Cerrar
                    </button>
                  </div>
                </div>
                <div
                  className="flex-1 overflow-auto px-6 py-4 outline-none"
                  tabIndex={0}
                  // eslint-disable-next-line jsx-a11y/no-autofocus
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
          </>
        );
      })()}

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
