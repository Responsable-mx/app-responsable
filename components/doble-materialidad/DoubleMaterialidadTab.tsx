"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import useSWR from "swr";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { SkeletonList } from "@/components/ui/Skeleton";
import { RELATION_LABELS, RELATION_ORDER, type CompanyRelation } from "@/lib/dm/fields";
import { SelectField } from "@/components/ui/SelectField";
import type { DmIroConfig } from "@/lib/dm/iros";
import type { IroInventoryItem } from "@/lib/dm/iro-generation";
import { ResumenEjecutivoSection } from "@/components/doble-materialidad/ResumenEjecutivoSection";
import { ValidacionSection } from "@/components/doble-materialidad/ValidacionSection";
import { HorizontesConfig } from "@/components/doble-materialidad/HorizontesConfig";
import { NisSection, type NisItem } from "@/components/doble-materialidad/NisSection";
import { ContextoSection } from "@/components/doble-materialidad/ContextoSection";
import { ReporteSection } from "@/components/doble-materialidad/ReporteSection";
import { IroSection, type IroBatchStatus } from "@/components/doble-materialidad/IroSection";
import { ExpandableCell } from "@/components/doble-materialidad/ExpandableCell";

const MatrizDM = dynamic(
  () => import("@/components/doble-materialidad/MatrizDM").then((m) => ({ default: m.MatrizDM })),
  {
    loading: () => <div className="h-40 bg-slate-50 animate-pulse rounded" />,
    ssr: false,
  }
);

// catalogLabel + _CATALOG_MAP movidos a catalog-lookup.ts (D-150 sesión 27)

// ── Tipos ────────────────────────────────────────────────────

type RejectionReason =
  | "sector_diferente"
  | "tamano_incomparable"
  | "sin_reporte"
  | "ya_es_cliente"
  | "otro";

const REJECTION_OPTIONS: { value: RejectionReason; label: string }[] = [
  { value: "sector_diferente",    label: "Sector diferente" },
  { value: "tamano_incomparable", label: "Tamaño incomparable" },
  { value: "sin_reporte",         label: "Sin reporte público" },
  { value: "ya_es_cliente",       label: "Ya es cliente" },
  { value: "otro",                label: "Otro motivo" },
];

type BenchmarkCompany = {
  id: string;
  client_id: string;
  name: string;
  country: string | null;
  sector: string | null;
  website: string | null;
  justification: string | null;
  relation: CompanyRelation;
  proposed_by: "ia" | "consultor";
  validated: boolean;
  rejection_reason: RejectionReason | null;
  reports_publicly: boolean | null;
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

// NisItem movido a NisSection.tsx (D-150 sesión 27)

// IroBatchStatus importado de IroSection.tsx (D-150 sesión 27)

type LatestReport = {
  id: string;
  file_name: string;
  created_at: string;
  parse_status: "pending" | "ok" | "failed";
  markdown_content?: string;
  batch_id?: string | null;
} | null;

type Props = {
  clientId: string;
  clientName: string;
  questionnaireProgress: { filled: number; total: number } | null;
  onGoToCuestionario: () => void;
  /** Callback para badge [N/8] en el tab de ClientTabs */
  onStagesProgress?: (done: number, total: number) => void;
  /** Campos del cliente para KPI cards en Etapa 1 */
  clientSector?: string | null;
  clientSize?: string | null;
  clientFrameworks?: string[] | null;
};

// ── Fetcher ──────────────────────────────────────────────────

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

// ── Navegación de panel activo (Ruta B — wizard) ─────────────
// Catálogo canónico de etapas con id + label para prev/next
const DM_STAGES_META = [
  { id: "dm-sec-contexto",   label: "Contexto" },
  { id: "dm-sec-benchmark",  label: "Benchmark" },
  { id: "dm-sec-iros",       label: "IROs" },
  { id: "dm-sec-matriz",     label: "Matriz" },
  { id: "dm-sec-nis",        label: "NIS/IBSO" },
  { id: "dm-sec-resumen",    label: "Resumen IA" },
  { id: "dm-sec-validacion", label: "Validación" },
  { id: "dm-sec-reporte",    label: "Reporte" },
] as const;

const DM_SECTION_IDS = DM_STAGES_META.map((s) => s.id) as readonly string[];

// Ref module-level — el componente la registra; helpers la invocan sin estar dentro del componente
const _dmNavigateRef: { current: ((id: string) => void) | null } = { current: null };

function scrollToDmSection(sectionId: string) {
  // Ruta B: cambiar panel activo + scroll al tope del stepper sticky
  _dmNavigateRef.current?.(sectionId);
  const main = document.querySelector("main");
  // Scroll a top del stepper tras render del nuevo panel
  requestAnimationFrame(() => {
    if (main) {
      main.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });
}

// ── Tipo de estado de etapa ──────────────────────────────────

type StageStatus = "done" | "active" | "pending" | "locked";

// ── Pill del stepper ─────────────────────────────────────────
// Reemplaza StageIndicator (círculo + número) con pill compacto

function StagePill({
  label,
  status,
  subtitle,
  sectionId,
  selected,
}: {
  label: string;
  status: StageStatus;
  /** Texto bajo el label: fecha de completado / "En curso" / "Pendiente" */
  subtitle: string;
  sectionId?: string;
  /** ¿Es el panel actualmente visible? (Ruta B — independiente del status) */
  selected: boolean;
}) {
  const pillBase =
    "flex flex-col items-center gap-0.5 px-3 py-2.5 rounded-sm border transition-all shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40";

  // selected = panel visible (ring teal + bg teal). status sólo determina estilo no-selected.
  const pillStyle = selected
    ? `${pillBase} bg-brand-primary border-brand-primary shadow-[0_0_0_2px_var(--color-brand-primary),0_1px_4px_rgba(15,118,110,0.18)]`
    : status === "done"
    ? `${pillBase} bg-slate-50 border-slate-200 hover:bg-slate-100`
    : status === "active"
    ? `${pillBase} bg-white border-brand-primary/60 hover:border-brand-primary`
    : status === "locked"
    ? `${pillBase} border-slate-100 opacity-50 hover:opacity-70`
    : `${pillBase} border-slate-200 hover:border-slate-300`;

  // Texto: cuando selected → blanco. Si no, color por status.
  const labelTextClass = selected
    ? "font-bold text-white"
    : status === "done"
    ? "font-semibold text-brand-primary"
    : status === "active"
    ? "font-bold text-brand-primary-dark"
    : "font-medium text-slate-500";

  const subTextClass = selected
    ? "text-white/80"
    : status === "done"
    ? "text-slate-500"
    : status === "active"
    ? "text-brand-primary"
    : "text-slate-500";

  const inner = (
    <>
      <div className="flex items-center gap-1.5">
        {status === "done" && !selected && (
          <svg
            className="w-2.5 h-2.5 text-brand-primary shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
        {status === "done" && selected && (
          <svg
            className="w-2.5 h-2.5 text-white shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
        <span className={`text-[11px] whitespace-nowrap ${labelTextClass}`}>
          {label}
        </span>
      </div>
      <span className={`text-[9px] whitespace-nowrap ${subTextClass}`}>
        {subtitle}
      </span>
    </>
  );

  // Ruta B: TODOS los pills son clickables (incluso locked — navegan al panel
  // que muestra la razón de bloqueo). Sólo el pill sin sectionId queda inerte.
  if (sectionId) {
    return (
      <button
        type="button"
        onClick={() => scrollToDmSection(sectionId)}
        aria-label={`Ir a ${label}`}
        className={pillStyle}
      >
        {inner}
      </button>
    );
  }

  return <div className={pillStyle}>{inner}</div>;
}

// ── Formato fecha de etapa ────────────────────────────────────

function formatStageDate(iso: string | null | undefined): string {
  if (!iso) return "Completado";
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
  });
}

// ── Panel de etapa (Ruta B — wizard, una etapa visible a la vez) ─────────

function CollapsibleStageSection({
  id,
  stageNum,
  label,
  status,
  accent,
  isActive,
  lockReason,
  subtitle,
  narrativeTitle,
  headerRight,
  children,
}: {
  id: string;
  stageNum: number;
  label: string;
  status: StageStatus;
  accent: string;
  /** Sólo se renderiza si isActive=true (Ruta B wizard) */
  isActive: boolean;
  /** Mensaje mostrado cuando status === "locked" — explica qué se necesita para desbloquear */
  lockReason?: string;
  /** Subtitle pedagógico bajo el H2 (mockup-v7 pattern) */
  subtitle?: string;
  /** Override del H2 — narrativa ejecutiva en lugar de "N. Label" genérico (mockup-v7 pattern) */
  narrativeTitle?: string;
  /** Slot opcional en esquina derecha del header — chips de estado por etapa (count, severidad) */
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  if (!isActive) return null;

  // Derivar prev/next desde DM_STAGES_META por id
  const idx = DM_STAGES_META.findIndex((s) => s.id === id);
  const prev = idx > 0 ? DM_STAGES_META[idx - 1] : null;
  const next = idx >= 0 && idx < DM_STAGES_META.length - 1 ? DM_STAGES_META[idx + 1] : null;

  return (
    <section
      id={id}
      aria-labelledby={`stage-lbl-${id}`}
      key={id}
      className="motion-safe:animate-[dmFadeIn_0.14s_ease-out]"
    >
      <div className={`bg-white border border-slate-200 rounded shadow-sm border-l-4 ${accent}`}>
        {/* Header — H2 + subtitle + chips estado (mockup-v7 pattern) */}
        <div className="flex items-start justify-between gap-3 px-5 py-3.5 border-b border-slate-100">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5 min-w-0">
              <h2
                id={`stage-lbl-${id}`}
                className="text-lg font-semibold text-slate-900 truncate"
              >
                {narrativeTitle ?? `${stageNum}. ${label}`}
              </h2>
              {status === "done" && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-sm bg-emerald-50 border border-emerald-200 text-[10px] font-semibold text-emerald-700 shrink-0">
                  <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Completado
                </span>
              )}
              {status === "active" && (
                <span className="px-1.5 py-0.5 rounded-sm bg-brand-primary border border-brand-primary text-[10px] font-semibold text-white shrink-0">
                  En curso
                </span>
              )}
              {status === "pending" && (
                <span className="px-1.5 py-0.5 rounded-sm bg-slate-100 border border-slate-200 text-[10px] font-medium text-slate-400 shrink-0">
                  Pendiente
                </span>
              )}
              {status === "locked" && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-slate-100 border border-slate-200 text-[10px] font-medium text-slate-400 shrink-0">
                  <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  Bloqueada
                </span>
              )}
            </div>
            {subtitle && (
              <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                {subtitle}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {headerRight}
            <span className="text-[10px] text-slate-400 tabular-nums whitespace-nowrap">
              Etapa {stageNum} de {DM_STAGES_META.length}
            </span>
          </div>
        </div>

        {/* Body */}
        <div id={`${id}-body`} className="px-5 py-4">
          {status === "locked" ? (
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
              <svg className="w-10 h-10 text-slate-300 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <p className="text-sm text-slate-600 max-w-md">
                {lockReason ?? "Completa las etapas anteriores para desbloquear esta sección."}
              </p>
            </div>
          ) : (
            children
          )}
        </div>

        {/* Footer navegación prev / next */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-slate-100 bg-slate-50">
          {prev ? (
            <button
              type="button"
              onClick={() => scrollToDmSection(prev.id)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-brand-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 rounded-sm px-1"
            >
              <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              {prev.label}
            </button>
          ) : (
            <span />
          )}
          {next ? (
            <button
              type="button"
              onClick={() => scrollToDmSection(next.id)}
              className="inline-flex items-center gap-1.5 bg-brand-primary text-white text-xs font-semibold py-2 px-4 rounded hover:bg-brand-primary-dark transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
            >
              Siguiente: {next.label}
              <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </button>
          ) : (
            <span className="text-[11px] text-slate-400 italic">Última etapa</span>
          )}
        </div>
      </div>
    </section>
  );
}

// ExpandableCell movido a IroSection.tsx (uso interno) (D-150 sesión 27)

// ── Lookup fuzzy en comparison ────────────────────────────────

function lookupComparisonValue(
  comparison: Record<string, Record<string, string>>,
  fieldKey: string,
  companyName: string,
): string {
  const fieldMap = comparison[fieldKey] ?? {};
  return (
    fieldMap[companyName] ??
    Object.entries(fieldMap).find(
      ([k]) => companyName.startsWith(k) || k.startsWith(companyName.split(" ")[0]!)
    )?.[1] ??
    "—"
  );
}

function abbrevCompanyName(name: string): string {
  // Strip parenthetical content (ej. "(AGD)") antes de abreviar para evitar duplicar la sigla
  const clean = name.replace(/\s*\([^)]*\)/g, "").trim() || name;
  if (clean.length <= 16) return clean;
  const words = clean.split(/[\s/]+/).filter((w) => w.length > 1);
  const caps = words.filter((w) => /^[A-ZÁÉÍÓÚÑ]/.test(w));
  if (caps.length >= 3) return caps.map((w) => w[0]).join("").slice(0, 6);
  if (caps.length === 2) return `${caps[0]!.slice(0, 6)} ${caps[1]!.slice(0, 5)}`;
  return clean.slice(0, 14) + "…";
}

// ── Etapa 1: Contexto ────────────────────────────────────────

// ContextoSection movido a ContextoSection.tsx (D-150 sesión 27)

// HorizontesConfig + DmHorizons movidos a HorizontesConfig.tsx (D-150 sesión 27)

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
        const isBrechaText = (t: string) =>
          /ausencia|brecha|carece|sin reporte|sin meta|no publica|no mide|no tiene|no cuenta/.test(t.toLowerCase());

        const catCounts = allFields.reduce<Record<string, number>>((acc, f) => {
          const cat = f.key.charAt(0).toUpperCase();
          acc[cat] = (acc[cat] ?? 0) + 1;
          return acc;
        }, {});

        const filteredFields = allFields.filter((f) => {
          const cat = f.key.charAt(0).toUpperCase();
          if (tableFilter !== "all" && cat !== tableFilter) return false;
          if (!onlyBrechas) return true;
          const texts = [
            lookupComparisonValue(latestResult!.comparison, f.key, clientName),
            ...latestResult!.companies_snapshot.map((c) =>
              lookupComparisonValue(latestResult!.comparison, f.key, c.name)
            ),
          ];
          return texts.some(isBrechaText);
        });

        const cats = ["E", "S", "G"] as const;
        const catLabel: Record<string, string> = { E: "Ambiental", S: "Social", G: "Gobernanza" };

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

        // Barra de filtros reutilizada en modo normal y fullscreen
        const filterBar = (
          <div className="flex items-center gap-2 flex-wrap">
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
        );

        // Grid de tabla reutilizado en modo normal y fullscreen
        const tableGrid = (
          <div className="relative overflow-x-auto">
            <table className="min-w-full w-max text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="sticky left-0 z-10 bg-white text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 pb-2 pr-6 whitespace-nowrap shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]">
                    Dimensión
                  </th>
                  <th className="text-left text-[10px] font-bold uppercase tracking-widest pb-2 pr-6 whitespace-nowrap bg-brand-primary-light/30 px-3 rounded-t text-brand-primary-dark">
                    {clientName}
                    <span className="ml-1 font-normal normal-case text-[10px] text-brand-primary/60">· Cliente</span>
                  </th>
                  {latestResult!.companies_snapshot.map((company) => (
                    <th
                      key={company.name}
                      title={company.name}
                      className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 pb-2 pr-6 whitespace-nowrap"
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
                      colSpan={2 + latestResult!.companies_snapshot.length}
                      className="py-6 text-center text-xs text-slate-400"
                    >
                      Sin dimensiones con ese filtro.
                    </td>
                  </tr>
                ) : (
                  filteredFields.map((field) => (
                    <tr
                      key={field.key}
                      className="group even:bg-slate-50/60 hover:bg-brand-primary-light/20 transition-colors"
                    >
                      <td className="sticky left-0 z-10 bg-white group-even:bg-slate-50/60 group-hover:bg-brand-primary-light/20 py-3 pr-6 font-medium text-slate-700 whitespace-nowrap align-top shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]">
                        {field.label}
                      </td>
                      <td className="py-3 pr-6 max-w-[220px] align-top bg-brand-primary-light/20 px-3">
                        <ExpandableCell
                          text={lookupComparisonValue(latestResult!.comparison, field.key, clientName)}
                        />
                      </td>
                      {latestResult!.companies_snapshot.map((company) => (
                        <td key={company.name} className="py-3 pr-6 max-w-[220px] align-top">
                          <ExpandableCell
                            text={lookupComparisonValue(latestResult!.comparison, field.key, company.name)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        );

        const scrollHint = latestResult!.companies_snapshot.length > 2 && (
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
                  {clientName} vs {latestResult!.companies_snapshot.length} empresa
                  {latestResult!.companies_snapshot.length !== 1 ? "s" : ""} — posición por dimensión ESG
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
                    {clientName} vs {latestResult!.companies_snapshot.length} empresa
                    {latestResult!.companies_snapshot.length !== 1 ? "s" : ""} — posición por dimensión ESG
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
                <div className="flex-1 overflow-auto px-6 py-4">
                  {tableGrid}
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

// IroSection + ScorePicker + prioridad + helpers movidos a IroSection.tsx (D-150 sesión 27)

// ── Etapa 4: NIS / IBSO ──────────────────────────────────────
// NisSection + helpers movidos a NisSection.tsx (D-150 sesión 27)

// ── Etapa 5: Reporte ─────────────────────────────────────────

// ReporteSection movido a ReporteSection.tsx (D-150 sesión 27)

// ── Componente principal ─────────────────────────────────────

export function DoubleMaterialidadTab({
  clientId,
  clientName,
  questionnaireProgress,
  onGoToCuestionario,
  onStagesProgress,
  clientSector,
  clientSize,
  clientFrameworks,
}: Props) {
  const benchmarkKey   = `/api/clients/${clientId}/dm-benchmark`;
  const irosKey        = `/api/clients/${clientId}/dm-iros`;
  const nisKey         = `/api/clients/${clientId}/dm-nis`;
  const reportKey      = `/api/clients/${clientId}/dm-report`;
  const resumenKey     = `/api/clients/${clientId}/dm-resumen`;
  const validacionKey  = `/api/clients/${clientId}/dm-validacion`;

  const [isPolling, setIsPolling] = useState(false);
  const { push } = useToast();
  const pollingNotified = useRef(false);
  const pollingStartId = useRef<string | null>(null);

  // Ruta B: una etapa visible a la vez.
  // Inicial: lee URL hash (#dm-sec-iros) si existe — permite deep-links y back/forward.
  // Si no hay hash → Contexto. (Smart-jump al primer pendiente se aplica más abajo
  // cuando ya tenemos los statuses calculados.)
  // Siempre iniciar con valor SSR-safe; leer hash en useEffect para evitar
  // mismatch de hidratación (#418) cuando la URL tiene un hash al recargar.
  const [activeStageId, setActiveStageId] = useState<string>("dm-sec-contexto");
  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (DM_SECTION_IDS.includes(hash)) setActiveStageId(hash);
  }, []);
  const navigateTo = useCallback((sectionId: string) => {
    if (!DM_SECTION_IDS.includes(sectionId)) return;
    setActiveStageId(sectionId);
    // Sync URL hash sin scroll — permite back/forward + deep-link
    if (typeof window !== "undefined") {
      const newUrl = `${window.location.pathname}${window.location.search}#${sectionId}`;
      window.history.replaceState(null, "", newUrl);
    }
  }, []);
  // Registrar navigate en ref module-level — permite a `scrollToDmSection` cambiar panel
  useEffect(() => {
    _dmNavigateRef.current = navigateTo;
    return () => {
      _dmNavigateRef.current = null;
    };
  }, [navigateTo]);
  // Sincronizar con cambios externos del hash (browser back/forward)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onHash = () => {
      const h = window.location.hash.replace(/^#/, "");
      if (DM_SECTION_IDS.includes(h)) setActiveStageId(h);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const [isIroPolling, setIsIroPolling] = useState(false);
  const pollingNotifiedIro = useRef(false);

  const [isReportPolling, setIsReportPolling] = useState(false);
  const pollingNotifiedReport = useRef(false);
  const pollingStartReportId = useRef<string | null>(null);

  const { data: benchmarkResp, isLoading: loadingBenchmark, mutate: mutateBenchmark } = useSWR<{
    data: BenchmarkData;
  }>(benchmarkKey, fetcher, {
    revalidateOnFocus: false,
    refreshInterval: isPolling ? 5_000 : 0,
  });

  const { data: irosResp, mutate: mutateIros } = useSWR<{
    data: { status: IroBatchStatus; iros: IroInventoryItem[] };
  }>(irosKey, fetcher, {
    revalidateOnFocus: false,
    refreshInterval: isIroPolling ? 5_000 : 0,
  });

  const { data: nisResp, mutate: mutateNis } = useSWR<{
    data: NisItem[];
  }>(nisKey, fetcher, { revalidateOnFocus: false });

  const { data: reportResp, mutate: mutateReport } = useSWR<{
    data: LatestReport;
  }>(reportKey, fetcher, {
    revalidateOnFocus: false,
    refreshInterval: isReportPolling ? 5_000 : 0,
  });

  // SWR para resumen y validación — deduplicado con los SWR de los hijos
  const { data: resumenResp } = useSWR<{ data: { status: string; reviewed_at?: string | null } | null }>(
    resumenKey, fetcher, { revalidateOnFocus: false }
  );
  const { data: validacionResp } = useSWR<{ data: {
    iro_decisions: Record<string, { decision: string | null }>;
  } | null }>(validacionKey, fetcher, { revalidateOnFocus: false });

  const companies    = benchmarkResp?.data.companies ?? [];
  const latestResult = benchmarkResp?.data.latest_result ?? null;
  const irosStatus  = irosResp?.data.status ?? "idle";
  const iros        = irosResp?.data.iros ?? [];
  const nisRows     = nisResp?.data ?? [];
  const latestReport = reportResp?.data ?? null;

  // Detectar cuando el batch del benchmark termina
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

  // Detectar cuando el batch de IROs termina
  useEffect(() => {
    if (!isIroPolling) {
      pollingNotifiedIro.current = false;
      return;
    }
    if (irosStatus === "done" && !pollingNotifiedIro.current) {
      pollingNotifiedIro.current = true;
      setIsIroPolling(false);
      push("success", `${iros.length} IROs generados. Revisa y ajusta los scores.`);
    }
    if (irosStatus === "failed" && !pollingNotifiedIro.current) {
      pollingNotifiedIro.current = true;
      setIsIroPolling(false);
      push("error", "La generación de IROs falló. Intenta de nuevo.");
    }
  }, [irosStatus, isIroPolling, iros.length, push]);

  // Detectar cuando el batch del reporte termina
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

  // Auto-restart polling si al montar/cargar hay un reporte pending con batch_id.
  // Caso: usuario disparó "Generar reporte", cambió de tab o refrescó — polling local murió,
  // batch sigue corriendo en Anthropic. GET handler procesa pending sólo si alguien lo llama.
  useEffect(() => {
    if (
      latestReport?.parse_status === "pending" &&
      latestReport?.batch_id &&
      !isReportPolling
    ) {
      pollingStartReportId.current = latestReport.id;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restart polling al detectar pending+batch_id externos (SWR refresh tras refresh/tab change); guard !isReportPolling previene loop
      setIsReportPolling(true);
    }
  }, [latestReport?.parse_status, latestReport?.batch_id, latestReport?.id, isReportPolling]);

  const stage1Status: StageStatus =
    questionnaireProgress &&
    questionnaireProgress.filled >= questionnaireProgress.total &&
    questionnaireProgress.total > 0
      ? "done"
      : "active";

  const hasBenchmark = latestResult?.status === "done";
  const hasIros      = irosStatus === "done" && iros.length > 0;
  const hasNis       = nisRows.length > 0;
  const hasReport    = latestReport?.parse_status === "ok";

  const stage2Status: StageStatus = hasBenchmark
    ? "done"
    : stage1Status === "done"
    ? "active"
    : "pending";

  const stage3Status: StageStatus = hasIros
    ? "done"
    : hasBenchmark
    ? "active"
    : "pending";

  // stage4 = Matriz (visualización IROs scored) — locked si no hay IROs en inventario
  const stage4Status: StageStatus = iros.filter(i => i.incluido && i.score_impacto && i.score_financiero).length >= 3
    ? "active"
    : hasIros ? "pending" : "locked";

  // stage5 = NIS / IBSO
  const stage5Status: StageStatus = hasNis
    ? "done"
    : hasIros
    ? "active"
    : "pending";

  // stage6 = Resumen ejecutivo IA — locked si no hay IROs calificados
  const hasResumen = resumenResp?.data?.status === "done";
  const stage6Status: StageStatus = hasResumen
    ? "done"
    : hasIros
    ? "active"
    : "locked";

  // stage7 = Validación con el cliente
  const validacionRec = validacionResp?.data ?? null;
  const includedIros  = iros.filter((i) => i.incluido);
  const allIrosDecided =
    includedIros.length > 0 &&
    includedIros.every((i) => validacionRec?.iro_decisions[i.id]?.decision);
  // stage7 = Validación — locked si no hay resumen ejecutivo generado
  const stage7Status: StageStatus = allIrosDecided
    ? "done"
    : hasResumen
    ? "active"
    : "locked";

  // stage8 = Reporte (etapa final — requiere benchmark + IROs)
  const stage8Status: StageStatus = hasReport
    ? "done"
    : hasBenchmark && hasIros
    ? "active"
    : "pending";

  // Conteos por cuadrante — pasados a ResumenEjecutivoSection para KPI cards
  const scoredIncluded = iros.filter(
    (i) => i.incluido && i.score_impacto != null && i.score_financiero != null
  );
  const quadrantCounts = {
    doble_material: scoredIncluded.filter(
      (i) => (i.score_impacto ?? 0) >= 2 && (i.score_financiero ?? 0) >= 2
    ).length,
    solo_impacto: scoredIncluded.filter(
      (i) => (i.score_impacto ?? 0) >= 2 && (i.score_financiero ?? 0) < 2
    ).length,
    solo_financiero: scoredIncluded.filter(
      (i) => (i.score_impacto ?? 0) < 2 && (i.score_financiero ?? 0) >= 2
    ).length,
    brechas_criticas: nisRows.filter((i) => i.estado === "no_identificado").length,
  };

  // Badge [N/8] — notifica al padre cuántas etapas están completas
  const stageStatuses: StageStatus[] = [
    stage1Status, stage2Status, stage3Status, stage4Status,
    stage5Status, stage6Status, stage7Status, stage8Status,
  ];
  const dmDoneCount = stageStatuses.filter((s) => s === "done").length;
  useEffect(() => {
    onStagesProgress?.(dmDoneCount, 8);
  }, [dmDoneCount, onStagesProgress]);

  // Smart-jump al primer pendiente — solo en mount inicial y sin hash en URL.
  // Permite que un usuario que regresa caiga directo en su trabajo pendiente
  // en vez de releer Contexto que ya completó.
  const didSmartJumpRef = useRef(false);
  useEffect(() => {
    if (didSmartJumpRef.current) return;
    if (typeof window === "undefined") return;
    if (window.location.hash) {
      didSmartJumpRef.current = true;
      return;
    }
    // Si Contexto ya está done y el activeStageId aún es Contexto, salta al primer
    // active/pending no-locked. Si todo está done, queda en Reporte.
    if (activeStageId !== "dm-sec-contexto") {
      didSmartJumpRef.current = true;
      return;
    }
    const firstPendingIdx = stageStatuses.findIndex(
      (s) => s === "active" || s === "pending"
    );
    if (firstPendingIdx > 0) {
      didSmartJumpRef.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- smart jump único al cargar status; ref didSmartJumpRef previene loop
      navigateTo(DM_SECTION_IDS[firstPendingIdx]!);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage1Status, stage2Status, stage3Status, stage4Status, stage5Status, stage6Status, stage7Status, stage8Status]);

  // Navegación por teclado ← → entre etapas (Ruta B — cambia panel activo)
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const curIdx = DM_SECTION_IDS.indexOf(activeStageId);
      const nextIdx = e.key === "ArrowRight"
        ? Math.min(curIdx + 1, DM_SECTION_IDS.length - 1)
        : Math.max(curIdx - 1, 0);
      scrollToDmSection(DM_SECTION_IDS[nextIdx]!);
      e.preventDefault();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [activeStageId]);

  if (loadingBenchmark) {
    return (
      <div className="py-6">
        <SkeletonList />
      </div>
    );
  }

  // Porcentaje de completitud del cuestionario (0-100)
  const questionnairePct =
    questionnaireProgress && questionnaireProgress.total > 0
      ? Math.round((questionnaireProgress.filled / questionnaireProgress.total) * 100)
      : null;

  // Stepper compacto al scroll — colapsa progress header + chips para evitar
  // doble sticky stack con el header de ClientTabs. Sentinel arriba del stepper:
  // cuando deja de ser visible → stepper está pinned → modo compacto.
  const stepperSentinelRef = useRef<HTMLDivElement>(null);
  const [stepperCompact, setStepperCompact] = useState(false);
  useEffect(() => {
    const el = stepperSentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry) setStepperCompact(!entry.isIntersecting); },
      { rootMargin: "-80px 0px 0px 0px", threshold: 0 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div className="space-y-6 py-4 max-w-5xl mx-auto">
      {/* Keyframe fade-in para transición entre paneles Ruta B (montado una vez) */}
      <style>{`@keyframes dmFadeIn{from{opacity:0;transform:translateY(2px)}to{opacity:1;transform:none}}`}</style>
      {/* Banner: cuestionario < 50% → calidad de análisis reducida */}
      {questionnairePct !== null && questionnairePct < 50 && (
        <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800" role="alert">
          <svg className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <p>
            <strong>Cuestionario al {questionnairePct}%.</strong>{" "}
            Un contexto incompleto reduce la calidad del análisis de materialidad — los temas e IROs generados serán menos precisos.{" "}
            <button
              type="button"
              onClick={onGoToCuestionario}
              className="underline font-semibold hover:text-amber-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded-sm"
            >
              Completar cuestionario →
            </button>
          </p>
        </div>
      )}
      {/* Sentinel: IntersectionObserver lo monitorea — al salir de viewport, stepper queda pinned */}
      <div ref={stepperSentinelRef} className="h-px -mb-px" aria-hidden="true" />
      {/* ── Stepper V3 — card con pill bar + progress + chips ── */}
      {(() => {
        const stagesData: Array<{ label: string; status: StageStatus; sectionId: string; doneDate?: string | null }> = [
          { label: "Contexto",    status: stage1Status, sectionId: "dm-sec-contexto" },
          { label: "Benchmark",   status: stage2Status, sectionId: "dm-sec-benchmark", doneDate: latestResult?.created_at },
          { label: "IROs",        status: stage3Status, sectionId: "dm-sec-iros" },
          { label: "Matriz",      status: stage4Status, sectionId: "dm-sec-matriz" },
          { label: "NIS/IBSO",    status: stage5Status, sectionId: "dm-sec-nis" },
          { label: "Resumen IA",  status: stage6Status, sectionId: "dm-sec-resumen" },
          { label: "Validación",  status: stage7Status, sectionId: "dm-sec-validacion" },
          { label: "Reporte",     status: stage8Status, sectionId: "dm-sec-reporte", doneDate: latestReport?.created_at },
        ];
        const doneCount = stagesData.filter((s) => s.status === "done").length;
        const pct = Math.round((doneCount / stagesData.length) * 100);
        const validatedCompanies = companies.filter((c) => c.validated).length;

        return (
          <div className="bg-white border border-slate-200 rounded shadow-sm sticky top-[96px] z-20 transition-all">
            {/* Cabecera progreso — solo visible cuando el stepper NO está pinned (modo expandido) */}
            {!stepperCompact && (
            <div className="flex items-center justify-between px-5 pt-3 pb-2 border-b border-slate-100">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 whitespace-nowrap">
                  Estado del estudio
                </span>
                <div className="h-[3px] w-28 bg-slate-200 flex-shrink-0 overflow-hidden">
                  <div
                    className="h-full bg-brand-primary transition-all duration-300"
                    style={{ width: `${pct}%` }}
                    role="progressbar"
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${doneCount} de ${stagesData.length} etapas completadas`}
                  />
                </div>
                <span className="text-[10px] text-slate-500 font-semibold tabular-nums whitespace-nowrap">
                  {doneCount}/{stagesData.length} completadas
                </span>
              </div>
              {/* Hint teclado — visible solo en sm+ */}
              <span className="hidden sm:flex items-center gap-1 text-[10px] text-slate-400 shrink-0 select-none">
                <kbd className="inline-flex items-center px-1 py-0.5 border border-slate-200 rounded-sm text-[9px] text-slate-500 font-mono leading-none">←</kbd>
                <kbd className="inline-flex items-center px-1 py-0.5 border border-slate-200 rounded-sm text-[9px] text-slate-500 font-mono leading-none">→</kbd>
                teclado
              </span>
            </div>
            )}

            {/* Pill bar */}
            <div className="flex items-center gap-1 px-4 py-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {stagesData.map((s, idx) => (
                <span key={s.sectionId} className="contents">
                  <StagePill
                    label={s.label}
                    status={s.status}
                    selected={s.sectionId === activeStageId}
                    subtitle={(() => {
                      const isSel = s.sectionId === activeStageId;
                      // Solo la etapa seleccionada dice "En curso" — evita 3 pills "En curso" simultáneas.
                      if (isSel) return s.status === "done" ? "Revisando" : "En curso";
                      if (s.status === "done")   return formatStageDate(s.doneDate);
                      if (s.status === "active") return "Lista";
                      if (s.status === "locked") return "Bloqueada";
                      return "Pendiente";
                    })()}
                    sectionId={s.sectionId}
                  />
                  {idx < stagesData.length - 1 && (
                    <div
                      className={`flex-1 h-0.5 min-w-1 max-w-9 rounded-sm shrink-0 ${
                        s.status === "done" ? "bg-brand-primary" : "bg-slate-200"
                      }`}
                      aria-hidden
                    />
                  )}
                </span>
              ))}
            </div>

            {/* Context chips — strip completo en expandido, mínimo en compact */}
            {stepperCompact && (iros.length > 0 || validatedCompanies > 0) && (
            <div className="border-t border-slate-100 px-5 py-1.5 flex items-center gap-3 text-[10px] text-slate-500">
              {validatedCompanies > 0 && (
                <span className="whitespace-nowrap tabular-nums font-medium">{validatedCompanies} empresas</span>
              )}
              {iros.length > 0 && (
                <span className="whitespace-nowrap tabular-nums font-medium">{scoredIncluded.length}/{iros.length} IROs</span>
              )}
              {quadrantCounts.doble_material > 0 && (
                <span className="whitespace-nowrap font-semibold text-rose-600">{quadrantCounts.doble_material} doble mat.</span>
              )}
              {quadrantCounts.solo_impacto > 0 && (
                <span className="whitespace-nowrap font-medium text-amber-600">{quadrantCounts.solo_impacto} impacto</span>
              )}
            </div>
            )}
            {!stepperCompact && (
            <div className="border-t border-slate-100 px-5 py-2">
              <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {/* Benchmark chip — siempre */}
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-white border border-slate-200 text-slate-600 px-2 py-1 rounded-sm whitespace-nowrap shrink-0">
                  {validatedCompanies > 0 ? (
                    <svg className="w-2 h-2 text-brand-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
                  ) : (
                    <svg className="w-2 h-2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  )}
                  {validatedCompanies} empresa{validatedCompanies !== 1 ? "s" : ""} benchmark
                </span>
                {/* IROs chip — siempre */}
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-white border border-slate-200 text-slate-600 px-2 py-1 rounded-sm whitespace-nowrap shrink-0">
                  {iros.length > 0 ? (
                    <svg className="w-2 h-2 text-brand-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
                  ) : (
                    <svg className="w-2 h-2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  )}
                  {iros.length} IROs{iros.length > 0 ? ` · ${scoredIncluded.length} calificados` : ""}
                </span>
                {quadrantCounts.doble_material > 0 && (
                  <span className="inline-flex text-[10px] font-semibold bg-rose-50 border border-rose-200 text-rose-700 px-2 py-1 rounded-sm whitespace-nowrap shrink-0">
                    {quadrantCounts.doble_material} doble material
                  </span>
                )}
                {quadrantCounts.solo_impacto > 0 && (
                  <span className="inline-flex text-[10px] font-semibold bg-amber-50 border border-amber-200 text-amber-700 px-2 py-1 rounded-sm whitespace-nowrap shrink-0">
                    {quadrantCounts.solo_impacto} mat. por impacto
                  </span>
                )}
              </div>
            </div>
            )}
          </div>
        );
      })()}

      {/* ── Etapa 1 ── */}
      <CollapsibleStageSection
        id="dm-sec-contexto"
        stageNum={1}
        label="Contexto del cliente"
        status={stage1Status}
        accent="border-l-teal-500"
        isActive={activeStageId === "dm-sec-contexto"}
        subtitle="Estado del llenado — base para el benchmark y los IROs"
        headerRight={
          questionnaireProgress && questionnaireProgress.total > 0 ? (
            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded-sm font-bold whitespace-nowrap tabular-nums">
              {questionnaireProgress.filled}/{questionnaireProgress.total} campos
            </span>
          ) : null
        }
      >
        <ContextoSection
          progress={questionnaireProgress}
          onGoToCuestionario={onGoToCuestionario}
          onGoToCuestionarioStep={(stepIdx) => {
            // ?tab=cuestionario&step=N gana sobre localStorage en ClientTabs.
            // Padre del DM tab maneja el switch tab via onGoToCuestionario+navegación.
            if (typeof window !== "undefined") {
              const params = new URLSearchParams(window.location.search);
              params.set("tab", "cuestionario");
              params.set("step", String(stepIdx + 1));
              window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
            }
            onGoToCuestionario();
          }}
          clientId={clientId}
          sector={clientSector}
          size={clientSize}
          frameworks={clientFrameworks}
        />
      </CollapsibleStageSection>

      {/* ── Etapa 2 ── */}
      <CollapsibleStageSection
        id="dm-sec-benchmark"
        stageNum={2}
        label="Benchmark competitivo"
        status={stage2Status}
        accent="border-l-blue-600"
        isActive={activeStageId === "dm-sec-benchmark"}
        subtitle="Selecciona empresas comparables y ejecuta el análisis sectorial"
        headerRight={
          companies.length > 0 ? (
            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded-sm font-bold whitespace-nowrap tabular-nums">
              {companies.filter((c) => c.validated).length} de {companies.length} validadas
            </span>
          ) : null
        }
      >
        {/* Horizontes temporales — config del estudio, mismo panel que Benchmark */}
        <div className="mb-5 pb-5 border-b border-slate-100">
          <HorizontesConfig clientId={clientId} />
        </div>
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
            void mutateBenchmark();
          }}
        />
      </CollapsibleStageSection>

      {/* ── Etapa 3 — IROs del cliente ── */}
      <CollapsibleStageSection
        id="dm-sec-iros"
        stageNum={3}
        label="Inventario de IROs"
        status={stage3Status}
        accent="border-l-violet-600"
        isActive={activeStageId === "dm-sec-iros"}
        subtitle="Impactos, Riesgos y Oportunidades identificados y calificados para inclusión en el estudio"
        headerRight={
          iros.length > 0 ? (
            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded-sm font-bold whitespace-nowrap tabular-nums">
              {scoredIncluded.length}/{iros.length} calificados
            </span>
          ) : null
        }
      >
        <IroSection
          clientId={clientId}
          iros={iros}
          status={irosStatus}
          isPolling={isIroPolling}
          hasBenchmark={hasBenchmark}
          onMutate={() => void mutateIros()}
          onStartPolling={() => {
            pollingNotifiedIro.current = false;
            setIsIroPolling(true);
            void mutateIros();
          }}
        />
      </CollapsibleStageSection>

      {/* ── Etapa 4 — Matriz de Doble Materialidad ── */}
      <CollapsibleStageSection
        id="dm-sec-matriz"
        stageNum={4}
        label="Matriz de Doble Materialidad"
        status={stage4Status}
        accent="border-l-brand-primary"
        isActive={activeStageId === "dm-sec-matriz"}
        lockReason="Registra y califica al menos 3 IROs con score de impacto y financiero para activar la matriz."
        subtitle="Visualización X/Y de IROs · Impacto vs Materialidad financiera · Ejes 0–10"
        narrativeTitle={
          quadrantCounts.doble_material > 0
            ? `${quadrantCounts.doble_material} tema${quadrantCounts.doble_material !== 1 ? "s" : ""} doble material · acción prioritaria`
            : undefined
        }
        headerRight={
          quadrantCounts.doble_material > 0 ? (
            <span className="text-[10px] bg-rose-100 text-rose-800 px-2 py-1 rounded-sm font-bold whitespace-nowrap">
              {quadrantCounts.doble_material} doble material
            </span>
          ) : null
        }
      >
        <MatrizDM
          iros={iros.filter((i) => i.incluido)}
          onGoToIros={() => scrollToDmSection("dm-sec-iros")}
        />
      </CollapsibleStageSection>

      {/* ── Etapa 5 — NIS / IBSO ── */}
      <CollapsibleStageSection
        id="dm-sec-nis"
        stageNum={5}
        label="Brechas de información por área material"
        status={stage5Status}
        accent="border-l-amber-600"
        isActive={activeStageId === "dm-sec-nis"}
        subtitle="NIS/IBSO (Normas de Información de Sostenibilidad · Indicadores de Brechas) — disponibilidad y calidad por IRO material"
        headerRight={
          quadrantCounts.brechas_criticas > 0 ? (
            <span className="text-[10px] bg-rose-100 text-rose-800 px-2 py-1 rounded-sm font-bold whitespace-nowrap">
              {quadrantCounts.brechas_criticas} brecha{quadrantCounts.brechas_criticas !== 1 ? "s" : ""} crítica{quadrantCounts.brechas_criticas !== 1 ? "s" : ""}
            </span>
          ) : null
        }
      >
        <NisSection
          clientId={clientId}
          nisRows={nisRows}
          iros={iros}
          hasBenchmark={hasBenchmark}
          onMutate={() => void mutateNis()}
        />
      </CollapsibleStageSection>

      {/* ── Etapa 6 — Resumen ejecutivo IA ── */}
      <CollapsibleStageSection
        id="dm-sec-resumen"
        stageNum={6}
        label="Resumen Ejecutivo (IA)"
        status={stage6Status}
        accent="border-l-cyan-600"
        isActive={activeStageId === "dm-sec-resumen"}
        lockReason="Completa el inventario de IROs (Etapa 3) para generar el resumen ejecutivo con IA."
        subtitle="Narrativa generada por IA con insights, trade-offs y recomendaciones estratégicas"
      >
        <ResumenEjecutivoSection clientId={clientId} quadrantCounts={quadrantCounts} />
      </CollapsibleStageSection>

      {/* ── Etapa 7 — Validación con el cliente ── */}
      <CollapsibleStageSection
        id="dm-sec-validacion"
        stageNum={7}
        label="Validación con el cliente"
        status={stage7Status}
        accent="border-l-rose-600"
        isActive={activeStageId === "dm-sec-validacion"}
        lockReason="Genera el resumen ejecutivo (Etapa 6) para iniciar la sesión de validación con el cliente."
        subtitle="Decisiones del cliente sobre cada IRO incluido — aprobación, ajuste o descarte"
        headerRight={
          includedIros.length > 0 ? (
            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded-sm font-bold whitespace-nowrap tabular-nums">
              {includedIros.filter((i) => validacionRec?.iro_decisions[i.id]?.decision).length}/{includedIros.length} decididos
            </span>
          ) : null
        }
      >
        <ValidacionSection clientId={clientId} iros={iros} />
      </CollapsibleStageSection>

      {/* ── Etapa 8 — Reporte (etapa final) ── */}
      <CollapsibleStageSection
        id="dm-sec-reporte"
        stageNum={8}
        label="Reporte de Doble Materialidad"
        status={stage8Status}
        accent="border-l-emerald-600"
        isActive={activeStageId === "dm-sec-reporte"}
        subtitle="Documento final consolidado · benchmark + IROs + matriz + validación cliente"
        headerRight={
          hasReport ? (
            <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-1 rounded-sm font-bold whitespace-nowrap">
              Listo para descarga
            </span>
          ) : null
        }
      >
        <ReporteSection
          clientId={clientId}
          clientName={clientName}
          latestResult={latestResult}
          latestReport={latestReport}
          readiness={{
            questionnairePct,
            benchmarkCompanies: companies.filter((c) => c.validated).length,
            irosTotal: iros.length,
            irosScored: scoredIncluded.length,
            hasMatriz: scoredIncluded.length >= 3,
            nisCount: nisRows.length,
            resumenReviewed: hasResumen && !!resumenResp?.data?.reviewed_at,
            validationDecided: allIrosDecided,
            onGoToStage: navigateTo,
          }}
          onReportMutate={() => mutateReport()}
          isReportPolling={isReportPolling}
          onStartReportPolling={() => {
            pollingStartReportId.current = latestReport?.id ?? null;
            setIsReportPolling(true);
            void mutateReport();
          }}
        />
      </CollapsibleStageSection>

    </div>
  );
}
