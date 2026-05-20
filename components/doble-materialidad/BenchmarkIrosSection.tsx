"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
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
  type BenchmarkIroCadena,
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

// ── Síntesis constants ─────────────────────────────────────────────────────────

const SYNTHESIS_TAB_ID = "__synthesis__";

const ESRS_TOPICS = [
  { id: "E1", label: "E1 — Cambio climático",       keywords: ["clima", "carbono", "ghg", "emisiones", "scope", "temperatura", "net-zero", "co2", "calentamiento"] },
  { id: "E2", label: "E2 — Contaminación",            keywords: ["contaminación", "contaminante", "tóxico", "químico", "derrame", "residuo peligroso", "polución"] },
  { id: "E3", label: "E3 — Agua",                    keywords: ["agua", "hídric", "oceano", "marino", "consumo de agua", "descarga", "acuífero"] },
  { id: "E4", label: "E4 — Biodiversidad",            keywords: ["biodiversidad", "ecosistema", "hábitat", "deforestación", "especie", "flora", "fauna"] },
  { id: "E5", label: "E5 — Economía circular",        keywords: ["circular", "reciclaje", "reutilización", "packaging", "residuos", "desecho", "envase"] },
  { id: "S1", label: "S1 — Personal propio",          keywords: ["empleado", "trabajador", "plantilla", "diversidad", "inclusión", "género", "salud laboral", "seguridad laboral", "formación", "capacitación", "laboral"] },
  { id: "S2", label: "S2 — Cadena de suministro",     keywords: ["cadena suministro", "proveedor", "contratista", "trabajo forzoso", "trabajo infantil", "abastecimiento"] },
  { id: "S3", label: "S3 — Comunidades",              keywords: ["comunidad", "territorio", "local", "indígena", "reasentamiento", "pueblos"] },
  { id: "S4", label: "S4 — Consumidores",             keywords: ["cliente", "consumidor", "usuario", "privacidad", "datos personales", "producto seguro"] },
  { id: "G1", label: "G1 — Gobernanza",               keywords: ["gobernanza", "anticorrupción", "ética", "compliance", "transparencia fiscal", "cabildeo", "consejo", "directiv"] },
] as const;

function matchEsrsTopic(text: string): string | null {
  const lower = text.toLowerCase();
  for (const topic of ESRS_TOPICS) {
    if ((topic.keywords as readonly string[]).some((kw) => lower.includes(kw))) return topic.id;
  }
  return null;
}

function computeRelevanceScore(iro: BenchmarkCompanyIro): number {
  let s = 0;
  if (iro.tipo === "riesgo")                s += 3;
  else if (iro.tipo === "impacto_negativo") s += 2;
  else if (iro.tipo === "oportunidad")      s += 2;
  else                                      s += 1;
  if (iro.horizonte === "corto")            s += 3;
  else if (iro.horizonte === "mediano")     s += 2;
  else                                      s += 1;
  if (iro.cadena === "operacion")           s += 2;
  else if (iro.cadena === "upstream")       s += 1;
  if (iro.confianza === "alto")             s += 2;
  else if (iro.confianza === "medio")       s += 1;
  return Math.min(s, 10);
}

function relevanceBadgeClass(score: number): string {
  if (score >= 8) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (score >= 5) return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-slate-50 text-slate-500 border-slate-200";
}

// ── CSV export ─────────────────────────────────────────────────────────────────

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

function downloadAdaptedCsv(adapted: AdaptedIro[]) {
  const header = ["Descripción adaptada", "Tipo", "Cadena", "Horizonte", "Tema", "Justificación", "Referencia original"];
  const rows = adapted.map((a) => [
    a.adapted_descripcion,
    TIPO_LABELS[a.tipo],
    CADENA_LABELS[a.cadena],
    HORIZONTE_LABELS[a.horizonte],
    a.tema_asociado ?? "",
    a.justificacion,
    a.original_descripcion,
  ]);
  const csv = [header, ...rows]
    .map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "IROs-adaptados-cliente.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ── Summary ────────────────────────────────────────────────────────────────────

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

// ── Adapted IRO type ───────────────────────────────────────────────────────────

type AdaptedIro = {
  original_descripcion: string;
  adapted_descripcion: string;
  tipo: BenchmarkIroTipo;
  cadena: BenchmarkIroCadena;
  horizonte: BenchmarkIroHorizonte;
  tema_asociado: string | null;
  justificacion: string;
};

// ── Main component ─────────────────────────────────────────────────────────────

export function BenchmarkIrosSection({
  clientId,
  companies,
  clientSector,
  clientIroTopics,
  onIrosAdapted,
}: {
  clientId: string;
  companies: BenchmarkCompany[];
  clientSector?: string | null;
  /** Temas ESG del inventario del cliente (incluido=true) — se usa en la síntesis para marcar qué temas del sector ya están cubiertos. */
  clientIroTopics?: string[];
  onIrosAdapted?: () => void;
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
    return SYNTHESIS_TAB_ID;
  });
  const [showCallout, setShowCallout] = useState(true);
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);

  // Síntesis — carga desde DB al montar; persiste entre recargas
  const { data: empresasData } = useSWR<{ data: { synthesis_narrative?: string | null } | null }>(
    `/api/clients/${clientId}/dm-benchmark-empresas`,
    fetcher,
    { revalidateOnFocus: false }
  );
  const persistedNarrative = empresasData?.data?.synthesis_narrative ?? null;
  const [userNarrative, setNarrative] = useState<string | null>(null);
  const narrative = userNarrative ?? persistedNarrative;
  const [isGeneratingNarrative, setIsGeneratingNarrative] = useState(false);

  // Adaptación
  const [selectedIroIds, setSelectedIroIds] = useState<Set<string>>(new Set());
  const [isAdapting, setIsAdapting] = useState(false);
  const [adaptResult, setAdaptResult] = useState<AdaptedIro[] | null>(null);
  const [showAdaptModal, setShowAdaptModal] = useState(false);

  // Write empresa param to URL when active company changes (skip synthesis tab)
  useEffect(() => {
    if (!activeCompanyId || activeCompanyId === SYNTHESIS_TAB_ID) return;
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

  useEffect(() => {
    if (!isPolling || groups.length === 0) return;
    let hasPending = false;
    for (const g of groups) {
      const prev = prevStatusesRef.current[g.company_id];
      const curr = g.batch?.status;
      if (prev === "pending" && curr === "done") push("success", `IROs de ${g.company_name} generados.`);
      if (prev === "pending" && curr === "failed") push("error", `Falló la generación para ${g.company_name}. Intenta de nuevo.`);
      if (curr) prevStatusesRef.current[g.company_id] = curr;
      if (curr === "pending") hasPending = true;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza estado polling con estado real de batches; isPolling en deps previene loop
    if (!hasPending) setIsPolling(false);
  }, [groups, isPolling, push]);

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

  const generateNarrative = async () => {
    if (isGeneratingNarrative || groups.filter((g) => g.iros.length > 0).length === 0) return;
    setIsGeneratingNarrative(true);
    try {
      const groupsSummary = groups
        .filter((g) => g.iros.length > 0)
        .map((g) => ({
          company_name: g.company_name,
          tipo_counts: g.iros.reduce((acc, iro) => {
            acc[iro.tipo] = (acc[iro.tipo] ?? 0) + 1;
            return acc;
          }, {} as Record<string, number>),
          top_temas: [...new Set(g.iros.map((i) => i.tema_asociado).filter(Boolean))].slice(0, 5) as string[],
        }));
      const res = await fetch(`/api/clients/${clientId}/dm-iro-synthesis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groups_summary: groupsSummary, client_sector: clientSector ?? null }),
      });
      if (!res.ok) { push("error", "Error al generar narrativa."); return; }
      const data = await res.json() as { data: { narrative: string } };
      setNarrative(data.data.narrative);
    } catch {
      push("error", "Error de conexión.");
    } finally {
      setIsGeneratingNarrative(false);
    }
  };

  const adaptIros = async () => {
    const allIros = groups.flatMap((g) => g.iros);
    const selected = allIros.filter((iro) => selectedIroIds.has(iro.id));
    if (selected.length === 0) return;
    setIsAdapting(true);
    setAdaptResult(null);
    setShowAdaptModal(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/dm-iro-adapt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          iros: selected.map((iro) => ({
            id: iro.id,
            descripcion: iro.descripcion,
            tipo: iro.tipo,
            cadena: iro.cadena,
            horizonte: iro.horizonte,
            tema_asociado: iro.tema_asociado,
          })),
          client_sector: clientSector ?? null,
        }),
      });
      if (!res.ok) { push("error", "Error al adaptar IROs."); setShowAdaptModal(false); return; }
      const data = await res.json() as { data: { adapted: AdaptedIro[] } };
      setAdaptResult(data.data.adapted);
    } catch {
      push("error", "Error de conexión.");
      setShowAdaptModal(false);
    } finally {
      setIsAdapting(false);
    }
  };

  const [isSavingToInventory, setIsSavingToInventory] = useState(false);

  const saveToInventory = async () => {
    if (!adaptResult || isSavingToInventory) return;
    setIsSavingToInventory(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/dm-client-iros`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adapted: adaptResult }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        push("error", err.error ?? "Error al guardar IROs.");
        return;
      }
      const data = await res.json() as { data: { inserted: number } };
      push("success", `${data.data.inserted} IRO${data.data.inserted !== 1 ? "s" : ""} guardados en tu inventario.`);
      setShowAdaptModal(false);
      setAdaptResult(null);
      setSelectedIroIds(new Set());
      onIrosAdapted?.();
    } catch {
      push("error", "Error de conexión.");
    } finally {
      setIsSavingToInventory(false);
    }
  };

  const toggleIroSelection = useCallback((iroId: string) => {
    setSelectedIroIds((prev) => {
      const next = new Set(prev);
      if (next.has(iroId)) next.delete(iroId);
      else next.add(iroId);
      return next;
    });
  }, [setSelectedIroIds]);

  if (validatedCompanies.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-slate-400 border border-dashed border-slate-200 rounded">
        No hay empresas validadas. Valida al menos una empresa en Etapa 3.
      </div>
    );
  }

  const activeGroup = groups.find((g) => g.company_id === activeCompanyId) ?? null;
  const activeCompany = validatedCompanies.find((c) => c.id === activeCompanyId);

  const pendingGeneration = validatedCompanies.filter((c) => {
    const group = groups.find((g) => g.company_id === c.id);
    const status = group?.batch?.status;
    return status !== "done" && status !== "pending" && !generating.has(c.id);
  });

  const dataLoaded = !loadingIros && resp !== undefined;
  const isFirstUse = dataLoaded && pendingGeneration.length === validatedCompanies.length;

  const generateAll = async () => {
    if (bulkGenerating || pendingGeneration.length === 0) return;
    setBulkGenerating(true);
    let queued = 0;
    for (const company of pendingGeneration) {
      await generateIros(company.id);
      queued++;
      if (queued < pendingGeneration.length) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }
    setBulkGenerating(false);
  };

  const isSynthesisActive = activeCompanyId === SYNTHESIS_TAB_ID;
  const hasAnyIros = groups.some((g) => g.iros.length > 0);

  return (
    <div className="space-y-4">
      {/* ── Callout pedagógico ── */}
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
          <div className="flex h-2 w-32 rounded overflow-hidden shrink-0 gap-px" aria-hidden="true">
            {summary.byTipo.riesgo > 0 && (
              <div className="h-full bg-amber-400" style={{ width: `${(summary.byTipo.riesgo / summary.total) * 100}%` }} title={`Riesgos: ${summary.byTipo.riesgo}`} />
            )}
            {summary.byTipo.impacto_negativo > 0 && (
              <div className="h-full bg-rose-400" style={{ width: `${(summary.byTipo.impacto_negativo / summary.total) * 100}%` }} title={`Impactos negativos: ${summary.byTipo.impacto_negativo}`} />
            )}
            {summary.byTipo.oportunidad > 0 && (
              <div className="h-full bg-blue-400" style={{ width: `${(summary.byTipo.oportunidad / summary.total) * 100}%` }} title={`Oportunidades: ${summary.byTipo.oportunidad}`} />
            )}
            {summary.byTipo.impacto_positivo > 0 && (
              <div className="h-full bg-emerald-400" style={{ width: `${(summary.byTipo.impacto_positivo / summary.total) * 100}%` }} title={`Impactos positivos: ${summary.byTipo.impacto_positivo}`} />
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap text-[10px] text-slate-500">
            {summary.byTipo.riesgo > 0 && <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-amber-400" />{summary.byTipo.riesgo} Riesgos</span>}
            {summary.byTipo.impacto_negativo > 0 && <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-rose-400" />{summary.byTipo.impacto_negativo} Imp. neg.</span>}
            {summary.byTipo.oportunidad > 0 && <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-blue-400" />{summary.byTipo.oportunidad} Oport.</span>}
            {summary.byTipo.impacto_positivo > 0 && <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-emerald-400" />{summary.byTipo.impacto_positivo} Imp. pos.</span>}
          </div>
          {/* Exportar Excel — acción global, icon-only */}
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
          isFirstUse ? "bg-brand-primary-light border-brand-primary/30" : "bg-slate-50 border-slate-200"
        }`}>
          <span className="text-xs text-slate-600">
            {isFirstUse ? (
              <>Analiza los IROs de las <span className="font-medium text-slate-700">{pendingGeneration.length} empresas</span> de referencia con IA</>
            ) : (
              <><span className="font-medium text-slate-700">{pendingGeneration.length}</span> empresa{pendingGeneration.length !== 1 ? "s" : ""} sin IROs generados</>
            )}
          </span>
          <Button variant="primary" size="sm" loading={bulkGenerating || isPolling} onClick={() => void generateAll()}>
            {isFirstUse ? `Generar todos (${pendingGeneration.length})` : `Generar pendientes (${pendingGeneration.length})`}
          </Button>
        </div>
      )}

      {/* ── Tabs + acciones ── */}
      {(() => {
        const activeGroupLocal = groups.find((g) => g.company_id === activeCompanyId) ?? null;
        const activeHasIros = (activeGroupLocal?.iros ?? []).length > 0;
        const activeIsPending = activeGroupLocal?.batch?.status === "pending";
        const activeIsGenerating = generating.has(activeCompanyId);
        const showRegenBtn = !isSynthesisActive && (!isFirstUse || activeHasIros);

        return (
          <>
            <div className="flex gap-1 flex-wrap items-center pb-1 border-b border-slate-100">
              {/* Síntesis tab — primer tab si hay datos */}
              {hasAnyIros && (
                <button
                  type="button"
                  onClick={() => setActiveCompanyId(SYNTHESIS_TAB_ID)}
                  className={[
                    "px-3 py-1.5 text-xs font-medium rounded-sm border transition-colors inline-flex items-center gap-1",
                    isSynthesisActive
                      ? "bg-white border-brand-primary text-brand-primary"
                      : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-white hover:border-slate-300",
                  ].join(" ")}
                  title="Vista de síntesis del sector"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Síntesis
                </button>
              )}

              {/* Company tabs */}
              {validatedCompanies.map((company) => {
                const group = groups.find((g) => g.company_id === company.id);
                const batch = group?.batch ?? null;
                const hasIros = (group?.iros ?? []).length > 0;
                const isPending = batch?.status === "pending";
                const isFailed = batch?.status === "failed";
                const isDone = batch?.status === "done" && hasIros;
                const isActive = activeCompanyId === company.id;
                const MAX_TAB = 22;
                const tabLabel = company.name.length > MAX_TAB ? company.name.slice(0, MAX_TAB) + "…" : company.name;

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
                    {hasIros && <span className="ml-1.5 tabular-nums text-[10px] opacity-60">[{group!.iros.length}]</span>}
                    {isDone && !isActive && <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" aria-label="revisado" />}
                    {isPending && <span className="ml-1.5 inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" aria-label="generando" />}
                    {isFailed && <span className="ml-1.5 text-rose-500" aria-label="falló">!</span>}
                  </button>
                );
              })}

              {/* Acción per-empresa (solo cuando empresa activa, no síntesis) */}
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

            {/* ConfirmModal regenerar */}
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

      {/* ── Panel activo ── */}
      {isSynthesisActive ? (
        <SynthesisPanel
          groups={groups}
          narrative={narrative}
          isGeneratingNarrative={isGeneratingNarrative}
          onGenerateNarrative={() => void generateNarrative()}
          clientIroTopics={clientIroTopics}
        />
      ) : (
        activeCompany && (
          <CompanyIroPanel
            company={activeCompany}
            group={activeGroup}
            isGenerating={generating.has(activeCompanyId)}
            selectedIroIds={selectedIroIds}
            onToggleIro={toggleIroSelection}
          />
        )
      )}

      {/* ── Barra de adaptación (sticky) ── */}
      {selectedIroIds.size > 0 && (
        <div className="sticky bottom-0 z-10 bg-white border border-slate-200 rounded px-3 py-2 flex items-center justify-between gap-3 shadow-sm">
          <span className="text-xs text-slate-600">
            <span className="font-medium text-slate-700">{selectedIroIds.size}</span> IRO{selectedIroIds.size !== 1 ? "s" : ""} seleccionado{selectedIroIds.size !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedIroIds(new Set())}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              Limpiar
            </button>
            <Button variant="primary" size="sm" loading={isAdapting} onClick={() => void adaptIros()}>
              Adaptar al cliente →
            </Button>
          </div>
        </div>
      )}

      {/* ── Modal: IROs adaptados ── */}
      <Modal
        open={showAdaptModal}
        onClose={() => { setShowAdaptModal(false); setAdaptResult(null); }}
        title="IROs adaptados al cliente"
        size="lg"
        footer={
          adaptResult ? (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => downloadAdaptedCsv(adaptResult)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-600 bg-white border border-slate-200 rounded-sm hover:bg-slate-50 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Descargar CSV
              </button>
              <Button
                variant="primary"
                size="sm"
                loading={isSavingToInventory}
                onClick={() => void saveToInventory()}
              >
                <svg className="w-3.5 h-3.5 mr-1.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Agregar a inventario
              </Button>
            </div>
          ) : undefined
        }
      >
        {isAdapting && (
          <div className="flex items-center gap-2 py-8 text-sm text-slate-500 justify-center">
            <svg className="w-4 h-4 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Adaptando IROs al contexto del cliente…
          </div>
        )}
        {!isAdapting && adaptResult && (
          <div className="space-y-3">
            {adaptResult.map((item, i) => (
              <div key={i} className="border border-slate-200 rounded p-3 space-y-2 hover:bg-slate-50/50 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-slate-700 font-medium leading-snug flex-1">{item.adapted_descripcion}</p>
                  <button
                    type="button"
                    onClick={() => { void navigator.clipboard.writeText(item.adapted_descripcion); push("success", "Copiado."); }}
                    className="shrink-0 p-1 text-slate-400 hover:text-slate-600 transition-colors"
                    title="Copiar descripción"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 italic">↳ {item.justificacion}</p>
                <div className="flex flex-wrap gap-1 pt-0.5">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-medium border ${TIPO_BADGE[item.tipo]}`}>{TIPO_LABELS[item.tipo]}</span>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] bg-slate-100 text-slate-600 border border-slate-200">{CADENA_LABELS[item.cadena]}</span>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] bg-slate-100 text-slate-600 border border-slate-200">{HORIZONTE_LABELS[item.horizonte]}</span>
                  {item.tema_asociado && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] bg-slate-50 text-slate-500 border border-slate-200 max-w-[200px] truncate" title={item.tema_asociado}>{item.tema_asociado}</span>
                  )}
                </div>
                <p className="text-[10px] text-slate-400">Ref: {item.original_descripcion.length > 100 ? item.original_descripcion.slice(0, 100) + "…" : item.original_descripcion}</p>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}

// ── Tooltip constants ──────────────────────────────────────────────────────────

const FUENTE_TOOLTIP: Record<string, string> = {
  reporte:           "Dato extraído directamente del informe de sostenibilidad de la empresa.",
  sitio_web:         "Dato obtenido del sitio web corporativo.",
  interpretacion_ia: "La IA interpretó este IRO a partir del contexto del informe, no está enunciado literalmente.",
};

const CONFIANZA_TOOLTIP: Record<string, string> = {
  alto:  "Alta confianza: el IRO está respaldado por evidencia explícita en el informe.",
  medio: "Confianza media: el IRO se infiere de forma razonable a partir del informe.",
  bajo:  "Confianza baja: el IRO es una interpretación con poca evidencia directa — verificar manualmente.",
};

// ── SynthesisPanel ─────────────────────────────────────────────────────────────

function SynthesisPanel({
  groups,
  narrative,
  isGeneratingNarrative,
  onGenerateNarrative,
  clientIroTopics,
}: {
  groups: IroGroup[];
  narrative: string | null;
  isGeneratingNarrative: boolean;
  onGenerateNarrative: () => void;
  clientIroTopics?: string[];
}) {
  const allIros = useMemo(() => groups.flatMap((g) => g.iros), [groups]);

  // Top temas por frecuencia de empresas
  const temaFreq = useMemo(() => {
    const map = new Map<string, { companyIds: Set<string>; companyNames: string[]; count: number }>();
    const nameById = new Map(groups.map((g) => [g.company_id, g.company_name]));
    for (const g of groups) {
      for (const iro of g.iros) {
        const tema = iro.tema_asociado?.trim() || "Sin tema";
        if (!map.has(tema)) map.set(tema, { companyIds: new Set(), companyNames: [], count: 0 });
        const entry = map.get(tema)!;
        if (!entry.companyIds.has(g.company_id)) {
          entry.companyIds.add(g.company_id);
          entry.companyNames.push(nameById.get(g.company_id) ?? g.company_id);
        }
        entry.count++;
      }
    }
    return [...map.entries()]
      .map(([tema, { companyIds, companyNames, count }]) => ({ tema, companies: companyIds.size, companyNames, count }))
      .sort((a, b) => b.companies - a.companies || b.count - a.count)
      .slice(0, 15);
  }, [groups]);

  const maxCompanies = temaFreq[0]?.companies ?? 1;

  // ESRS coverage
  const esrsCoverage = useMemo(() => {
    const covered = new Set<string>();
    for (const iro of allIros) {
      const text = iro.descripcion + " " + (iro.tema_asociado ?? "");
      const topic = matchEsrsTopic(text);
      if (topic) covered.add(topic);
    }
    return covered;
  }, [allIros]);

  // Distribución cadena de valor
  const cadenaFreq = useMemo(() => {
    const map: Partial<Record<BenchmarkIroCadena, number>> = {};
    for (const iro of allIros) {
      map[iro.cadena] = (map[iro.cadena] ?? 0) + 1;
    }
    return Object.entries(map).sort((a, b) => (b[1] as number) - (a[1] as number)) as [BenchmarkIroCadena, number][];
  }, [allIros]);

  // IROs agrupados por tema ESRS — top 3 por tema para la lista comparativa
  const esrsGrouped = useMemo(() => {
    const map = new Map<string, { label: string; iros: Array<{ descripcion: string; company: string; tipo: BenchmarkIroTipo }> }>();
    for (const topic of ESRS_TOPICS) {
      map.set(topic.id, { label: topic.label, iros: [] });
    }
    for (const g of groups) {
      for (const iro of g.iros) {
        const text = iro.descripcion + " " + (iro.tema_asociado ?? "");
        const topicId = matchEsrsTopic(text);
        if (topicId) {
          map.get(topicId)!.iros.push({ descripcion: iro.descripcion, company: g.company_name, tipo: iro.tipo });
        }
      }
    }
    return [...map.entries()]
      .map(([id, { label, iros }]) => ({ id, label, iros: iros.slice(0, 3), total: iros.length }))
      .filter(({ total }) => total > 0)
      .sort((a, b) => b.total - a.total);
  }, [groups]);

  // P9 — Distribución E/S/G de IROs del sector
  const esgDist = useMemo(() => {
    const counts: Record<string, number> = { E: 0, S: 0, G: 0 };
    for (const iro of allIros) {
      const text = (iro.tema_asociado ?? iro.descripcion ?? "").toLowerCase();
      const cat =
        /climat|emision|energia|agua|biodiv|resid|ambient|co2|carbono/.test(text) ? "E" :
        /social|laboral|trabajo|emplead|comunidad|salud|derecho|diversidad|igualdad|salarial/.test(text) ? "S" :
        /gobernanz|etica|corrupcion|transparent|director|consejo|cumplimiento|compliance/.test(text) ? "G" : "E";
      counts[cat]!++;
    }
    const total = allIros.length;
    return { counts, total };
  }, [allIros]);

  if (allIros.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-slate-400 border border-dashed border-slate-200 rounded">
        Genera IROs de al menos una empresa para ver la síntesis del sector.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* P9 — Distribución E/S/G del sector */}
      {esgDist.total > 0 && (
        <div>
          <span className="uppercase tracking-widest text-[10px] font-bold text-slate-400 block mb-2">
            Distribución E/S/G del sector
          </span>
          <div className="flex items-center gap-3">
            <div className="flex h-3 flex-1 rounded-sm overflow-hidden gap-px">
              {(["E", "S", "G"] as const).map((cat) => {
                const n = esgDist.counts[cat] ?? 0;
                if (n === 0) return null;
                const pct = (n / esgDist.total) * 100;
                const bg = cat === "E" ? "bg-emerald-400" : cat === "S" ? "bg-violet-400" : "bg-slate-400";
                return <div key={cat} className={`h-full ${bg}`} style={{ width: `${pct}%` }} title={`${cat}: ${n}`} />;
              })}
            </div>
            <div className="flex gap-2 shrink-0">
              {(["E", "S", "G"] as const).map((cat) => {
                const n = esgDist.counts[cat] ?? 0;
                const pct = Math.round((n / esgDist.total) * 100);
                const cls = cat === "E" ? "text-emerald-700 border-emerald-200 bg-emerald-50" : cat === "S" ? "text-violet-700 border-violet-200 bg-violet-50" : "text-slate-600 border-slate-200 bg-slate-50";
                const label = cat === "E" ? "Amb." : cat === "S" ? "Social" : "Gov.";
                return (
                  <span key={cat} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-bold border ${cls}`}>
                    {cat} · {label} <span className="tabular-nums font-normal">{pct}%</span>
                  </span>
                );
              })}
            </div>
          </div>
          {(() => {
            const sorted = (["E", "S", "G"] as string[]).sort((a, b) => (esgDist.counts[b] ?? 0) - (esgDist.counts[a] ?? 0));
            const dominant = sorted[0];
            const labels: Record<string, string> = { E: "Ambiental", S: "Social", G: "Gobernanza" };
            const pctDom = dominant ? Math.round(((esgDist.counts[dominant] ?? 0) / esgDist.total) * 100) : 0;
            return (
              <p className="text-[10px] text-slate-500 mt-1.5">
                El sector concentra el <span className="font-semibold">{pctDom}% de los IROs en {dominant ? labels[dominant] : "—"}</span> — considera que el cliente deberá reportar más en esta dimensión.
              </p>
            );
          })()}
        </div>
      )}

      {/* NP9 — Brechas: temas sectoriales no cubiertos en el inventario del cliente */}
      {clientIroTopics && clientIroTopics.length > 0 && temaFreq.length > 0 && (() => {
        const gaps = temaFreq.filter(({ tema }) =>
          !clientIroTopics.some((t) => {
            const a = t.toLowerCase(); const b = tema.toLowerCase();
            return a.includes(b) || b.includes(a);
          })
        );
        if (gaps.length === 0) return null;
        return (
          <div className="border-l-4 border-l-amber-400 pl-3 py-2 bg-amber-50/40 rounded-r">
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700 mb-1.5">
              {gaps.length} tema{gaps.length !== 1 ? "s" : ""} sectorial{gaps.length !== 1 ? "es" : ""} no {gaps.length !== 1 ? "están" : "está"} en tu inventario
            </p>
            <div className="flex flex-wrap gap-1">
              {gaps.slice(0, 8).map(({ tema }) => (
                <span key={tema} className="text-[10px] px-1.5 py-0.5 rounded-sm bg-amber-100 text-amber-700 border border-amber-200">
                  {tema}
                </span>
              ))}
              {gaps.length > 8 && (
                <span className="text-[10px] text-amber-500 self-center">+{gaps.length - 8} más</span>
              )}
            </div>
            <p className="text-[10px] text-amber-600/70 mt-1">
              Considera agregarlos en la Etapa 6 — Inventario de IROs.
            </p>
          </div>
        );
      })()}

      {/* Top temas */}
      <div>
        <span className="uppercase tracking-widest text-[10px] font-bold text-slate-400 block mb-3">
          Temas más frecuentes del sector
        </span>
        <div className="space-y-2.5">
          {temaFreq.map(({ tema, companies, companyNames, count }) => (
            <div key={tema} className="group">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-600 w-44 truncate shrink-0" title={tema}>{tema}</span>
                <div className="flex-1 h-1.5 bg-slate-100 rounded-sm overflow-hidden">
                  <div
                    className="h-full bg-brand-primary/50 rounded-sm transition-all"
                    style={{ width: `${(companies / maxCompanies) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] text-slate-400 tabular-nums shrink-0 w-24 text-right">
                  {companies} emp. · {count} IROs
                </span>
                {clientIroTopics && clientIroTopics.some((t) => {
                  const a = t.toLowerCase(); const b = tema.toLowerCase();
                  return a.includes(b) || b.includes(a);
                }) && (
                  <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-sm bg-brand-primary-light text-brand-primary-dark border border-brand-primary/20 whitespace-nowrap">
                    ✓ en cliente
                  </span>
                )}
                {clientIroTopics && clientIroTopics.length > 0 && !clientIroTopics.some((t) => {
                  const a = t.toLowerCase(); const b = tema.toLowerCase();
                  return a.includes(b) || b.includes(a);
                }) && (
                  <button
                    type="button"
                    onClick={() => { window.location.hash = "#dm-sec-iros"; }}
                    className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-sm bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap hover:bg-amber-100 transition-colors"
                    title="Ir a inventario de IROs para agregar este tema"
                  >
                    ⚠ No en inventario →
                  </button>
                )}
              </div>
              {companyNames.length > 0 && (
                <div className="ml-[11.5rem] flex flex-wrap gap-1 mt-1">
                  {companyNames.map((name) => (
                    <span key={name} className="text-[9px] px-1.5 py-0.5 rounded-sm bg-slate-50 text-slate-400 border border-slate-200 truncate max-w-[120px]" title={name}>
                      {name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ESRS coverage */}
      <div>
        <span className="uppercase tracking-widest text-[10px] font-bold text-slate-400 block mb-2">
          Cobertura ESRS del sector
        </span>
        <div className="flex flex-wrap gap-1.5">
          {ESRS_TOPICS.map((topic) => (
            <span
              key={topic.id}
              className={`px-2 py-0.5 text-[10px] font-medium rounded-sm border cursor-default transition-colors ${
                esrsCoverage.has(topic.id)
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-slate-50 text-slate-400 border-slate-200"
              }`}
              title={`${topic.label}${esrsCoverage.has(topic.id) ? " — cubierto en el benchmark" : " — no detectado en el benchmark"}`}
            >
              {topic.id}
            </span>
          ))}
        </div>
        <p className="text-[10px] text-slate-400 mt-1.5">
          {esrsCoverage.size}/{ESRS_TOPICS.length} temas ESRS identificados en el benchmark
          {esrsCoverage.size < ESRS_TOPICS.length && (
            <> · {ESRS_TOPICS.filter((t) => !esrsCoverage.has(t.id)).map((t) => t.id).join(", ")} sin cobertura</>
          )}
        </p>
      </div>

      {/* Distribución cadena de valor */}
      <div>
        <span className="uppercase tracking-widest text-[10px] font-bold text-slate-400 block mb-2">
          Distribución cadena de valor
        </span>
        <div className="flex flex-wrap gap-1.5">
          {cadenaFreq.map(([cadena, count]) => (
            <span key={cadena} className="px-2 py-0.5 text-[10px] bg-slate-50 text-slate-600 border border-slate-200 rounded-sm tabular-nums">
              {CADENA_LABELS[cadena]} <span className="text-slate-400">· {count}</span>
            </span>
          ))}
        </div>
      </div>

      {/* IROs por tema ESRS */}
      {esrsGrouped.length > 0 && (
        <div>
          <span className="uppercase tracking-widest text-[10px] font-bold text-slate-400 block mb-2">
            IROs sectoriales por tema ESRS
          </span>
          <div className="space-y-2">
            {esrsGrouped.map(({ id, label, iros, total }) => (
              <details key={id} className="group/esrs">
                <summary className="flex items-center gap-2 cursor-pointer list-none py-1.5 px-2 rounded-sm hover:bg-slate-50 transition-colors">
                  <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-sm border ${
                    id.startsWith("E") ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                    id.startsWith("S") ? "bg-violet-50 text-violet-700 border-violet-200" :
                    "bg-slate-50 text-slate-600 border-slate-200"
                  }`}>{id}</span>
                  <span className="text-xs text-slate-600 flex-1 truncate">{label.replace(/^[A-Z]\d — /, "")}</span>
                  <span className="shrink-0 text-[10px] text-slate-400 tabular-nums">{total} IROs</span>
                  <svg className="w-3 h-3 text-slate-400 shrink-0 transition-transform group-open/esrs:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </summary>
                <div className="mt-1 ml-2 space-y-1.5 pb-1">
                  {iros.map((iro, i) => (
                    <div key={i} className="flex items-start gap-2 px-2 py-1.5 rounded-sm bg-slate-50/60 border border-slate-100">
                      <span className={`shrink-0 mt-0.5 text-[9px] font-bold px-1 py-0.5 rounded-sm border ${TIPO_BADGE[iro.tipo]}`}>
                        {TIPO_LABELS[iro.tipo].slice(0, 3)}
                      </span>
                      <span className="text-[11px] text-slate-600 leading-snug flex-1 line-clamp-2">{iro.descripcion}</span>
                      <span className="shrink-0 text-[9px] text-slate-400 italic truncate max-w-[80px]" title={iro.company}>{iro.company}</span>
                    </div>
                  ))}
                  {total > 3 && (
                    <p className="text-[9px] text-slate-400 px-2">+{total - 3} IROs más en este tema</p>
                  )}
                </div>
              </details>
            ))}
          </div>
        </div>
      )}

      {/* Narrativa ejecutiva */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="uppercase tracking-widest text-[10px] font-bold text-slate-400">
            Narrativa del sector
          </span>
          <Button
            variant="secondary"
            size="sm"
            loading={isGeneratingNarrative}
            onClick={onGenerateNarrative}
          >
            {narrative ? "↺ Regenerar" : "Generar narrativa"}
          </Button>
        </div>
        {narrative ? (
          <div className="text-sm text-slate-600 leading-relaxed border border-slate-200 rounded p-3 bg-slate-50/50 whitespace-pre-line">
            {narrative}
          </div>
        ) : !isGeneratingNarrative ? (
          <div className="text-xs text-slate-400 italic px-1">
            Resume los patrones de materialidad del sector — útil para contextualizar el estudio del cliente.
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── CompanyIroPanel ────────────────────────────────────────────────────────────

function CompanyIroPanel({
  company,
  group,
  isGenerating,
  selectedIroIds,
  onToggleIro,
}: {
  company: BenchmarkCompany;
  group: IroGroup | null;
  isGenerating: boolean;
  selectedIroIds: Set<string>;
  onToggleIro: (id: string) => void;
}) {
  const batch = group?.batch ?? null;
  const iros = useMemo(() => group?.iros ?? [], [group]);
  const isPending = batch?.status === "pending";
  const isFailed = batch?.status === "failed" && !isPending;

  const [filterTipo, setFilterTipo] = useState<BenchmarkIroTipo | "">("");
  const [filterHorizonte, setFilterHorizonte] = useState<BenchmarkIroHorizonte | "">("");

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
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-slate-700">{company.name}</span>
        {company.sector && (
          <span className="text-xs text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-sm">{company.sector}</span>
        )}
        {company.country && <span className="text-xs text-slate-400">{company.country}</span>}
        {company.sustainability_report_url && (
          <a
            href={company.sustainability_report_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-slate-400 hover:text-brand-primary inline-flex items-center gap-0.5"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Informe
          </a>
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

      {/* Filtros */}
      {iros.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 flex-wrap">
            <button
              type="button"
              onClick={() => setFilterTipo("")}
              className={["px-2 py-0.5 text-[10px] font-medium rounded-sm border transition-colors", filterTipo === "" ? "bg-slate-700 text-white border-slate-700" : "bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300"].join(" ")}
            >
              Todos
            </button>
            {availableTipos.map((tipo) => (
              <button
                key={tipo}
                type="button"
                onClick={() => setFilterTipo(filterTipo === tipo ? "" : tipo)}
                className={["px-2 py-0.5 text-[10px] font-medium rounded-sm border transition-colors", filterTipo === tipo ? TIPO_BADGE[tipo] : "bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300"].join(" ")}
              >
                {TIPO_LABELS[tipo]}
              </button>
            ))}
          </div>
          {availableHorizontes.length > 1 && (
            <span className="inline-block w-px h-4 bg-slate-200 shrink-0" aria-hidden="true" />
          )}
          {availableHorizontes.length > 1 && availableHorizontes.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setFilterHorizonte(filterHorizonte === h ? "" : h)}
              className={["px-2 py-0.5 text-[10px] font-medium rounded-sm border transition-colors", filterHorizonte === h ? "bg-slate-700 text-white border-slate-700" : "bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300"].join(" ")}
            >
              {HORIZONTE_LABELS[h]}
            </button>
          ))}
          {(filterTipo !== "" || filterHorizonte !== "") && (
            <span className="text-[10px] text-slate-400 ml-auto">{filteredIros.length} de {iros.length}</span>
          )}
        </div>
      )}

      {/* IRO list */}
      {filteredIros.length > 0 && (
        <div className="rounded border border-slate-200 divide-y divide-slate-100">
          {filteredIros.map((iro, idx) => {
            const score = computeRelevanceScore(iro);
            const isSelected = selectedIroIds.has(iro.id);
            return (
              <div
                key={iro.id}
                className={[
                  "flex gap-3 px-3 py-3 items-start transition-colors",
                  isSelected ? "bg-brand-primary-light border-l-2 border-l-brand-primary" : idx % 2 !== 0 ? "bg-slate-50/40 hover:bg-slate-50" : "bg-white hover:bg-slate-50",
                ].join(" ")}
              >
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleIro(iro.id)}
                  className="mt-0.5 shrink-0 w-3.5 h-3.5 rounded-sm border-slate-300 text-brand-primary focus:ring-brand-primary/30 cursor-pointer"
                  aria-label={`Seleccionar IRO ${iro.n_iro}`}
                />
                {/* Número + score */}
                <div className="flex flex-col items-center gap-1 shrink-0 w-7">
                  <span className="text-slate-400 tabular-nums font-mono text-[11px]">{iro.n_iro}</span>
                  <span
                    className={`text-[9px] font-bold px-1 rounded-sm border tabular-nums ${relevanceBadgeClass(score)}`}
                    title={`Relevancia estimada: ${score}/10 (tipo + horizonte + cadena + confianza)`}
                  >
                    {score}
                  </span>
                </div>
                {/* Descripción + chips */}
                <div className="flex-1 min-w-0">
                  <ExpandableCell text={iro.descripcion} showScore={false} />
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-medium border ${TIPO_BADGE[iro.tipo]}`}>{TIPO_LABELS[iro.tipo]}</span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] bg-slate-100 text-slate-600 border border-slate-200">{CADENA_LABELS[iro.cadena]}</span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] bg-slate-100 text-slate-600 border border-slate-200">{HORIZONTE_LABELS[iro.horizonte]}</span>
                    {iro.tema_asociado && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] bg-slate-50 text-slate-500 border border-slate-200 max-w-[200px] truncate" title={iro.tema_asociado}>{iro.tema_asociado}</span>
                    )}
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-medium border cursor-default ${FUENTE_BADGE[iro.fuente_tipo]}`} title={FUENTE_TOOLTIP[iro.fuente_tipo]}>{FUENTE_LABELS[iro.fuente_tipo]}</span>
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-medium border cursor-default ${CONFIANZA_BADGE[iro.confianza]}`} title={CONFIANZA_TOOLTIP[iro.confianza]}>{CONFIANZA_LABELS[iro.confianza]}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Filtered empty state */}
      {iros.length > 0 && filteredIros.length === 0 && (
        <div className="py-6 text-center text-sm text-slate-400 border border-dashed border-slate-200 rounded">
          Ningún IRO coincide con los filtros seleccionados.
          <button type="button" onClick={() => { setFilterTipo(""); setFilterHorizonte(""); }} className="ml-2 text-brand-primary hover:underline">
            Limpiar filtros
          </button>
        </div>
      )}

      {!isPending && !isFailed && iros.length === 0 && !isGenerating && (
        <div className="py-8 text-center text-sm text-slate-400 border border-dashed border-slate-200 rounded">
          Sin IROs generados. Usa el botón &ldquo;Generar IROs&rdquo; para analizar esta empresa.
        </div>
      )}
    </div>
  );
}
