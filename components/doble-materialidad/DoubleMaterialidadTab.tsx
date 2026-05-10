"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import useSWR from "swr";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { SkeletonList } from "@/components/ui/Skeleton";
import { RELATION_LABELS, RELATION_ORDER, type CompanyRelation } from "@/lib/dm/fields";
import { CATALOG_SEEDS } from "@/lib/catalogs/seeds";
import { SelectField } from "@/components/ui/SelectField";
import type { DmIroConfig } from "@/lib/dm/iros";
import type { IroInventoryItem } from "@/lib/dm/iro-generation";
import { classifyEsg, ESG_BADGE } from "@/lib/dm/esg-classify";
import { ResumenEjecutivoSection } from "@/components/doble-materialidad/ResumenEjecutivoSection";
import { ValidacionSection } from "@/components/doble-materialidad/ValidacionSection";
import { ChecklistCierre } from "@/components/doble-materialidad/ChecklistCierre";
import { LogDecisionesSection } from "@/components/doble-materialidad/LogDecisionesSection";

const MatrizDM = dynamic(
  () => import("@/components/doble-materialidad/MatrizDM").then((m) => ({ default: m.MatrizDM })),
  {
    loading: () => <div className="h-40 bg-slate-50 animate-pulse rounded" />,
    ssr: false,
  }
);

// ── Catálogo lookup (cliente) ─────────────────────────────────

const _CATALOG_MAP = (() => {
  const m: Record<string, Record<string, string>> = {};
  for (const s of CATALOG_SEEDS) {
    if (!m[s.category]) m[s.category] = {};
    m[s.category]![s.value] = s.label;
  }
  return m;
})();

function catalogLabel(category: string, value: string): string {
  return _CATALOG_MAP[category]?.[value] ?? value;
}

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

type NisItem = {
  id: string;
  client_id: string;
  ibso_key: string;
  ibso_label: string;
  categoria: "ambiental" | "social" | "gobernanza";
  estado: "no_identificado" | "parcial" | "disponible";
  calidad_dato: "baja" | "media" | "alta";
  accion: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type IroBatchStatus = "idle" | "pending" | "done" | "failed";

type DmHorizons = {
  corto_year:   number;
  mediano_year: number;
  largo_year:   number;
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

// ── Scroll helper ────────────────────────────────────────────

function scrollToDmSection(sectionId: string) {
  const el = document.getElementById(sectionId);
  if (!el) return;
  const main = document.querySelector("main");
  if (main) {
    // 120px offset: compensa el stepper sticky + header de la app
    const top = el.getBoundingClientRect().top + main.scrollTop - 120;
    main.scrollTo({ top, behavior: "smooth" });
  } else {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

// Orden canónico de secciones — para navegación por teclado ← →
const DM_SECTION_IDS = [
  "dm-sec-contexto",
  "dm-sec-benchmark",
  "dm-sec-iros",
  "dm-sec-matriz",
  "dm-sec-nis",
  "dm-sec-resumen",
  "dm-sec-validacion",
  "dm-sec-reporte",
] as const;

// ── Tipo de estado de etapa ──────────────────────────────────

type StageStatus = "done" | "active" | "pending" | "locked";

// ── Pill del stepper ─────────────────────────────────────────
// Reemplaza StageIndicator (círculo + número) con pill compacto

function StagePill({
  label,
  status,
  subtitle,
  sectionId,
}: {
  label: string;
  status: StageStatus;
  /** Texto bajo el label: fecha de completado / "En curso" / "Pendiente" */
  subtitle: string;
  sectionId?: string;
}) {
  const pillBase =
    "flex flex-col items-center gap-0.5 px-3 py-2 rounded-sm border transition-all shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40";

  const pillStyle =
    status === "done"
      ? `${pillBase} bg-slate-50 border-slate-200 hover:bg-slate-100`
      : status === "active"
      ? `${pillBase} bg-brand-primary border-brand-primary`
      : status === "locked"
      ? `${pillBase} border-slate-100 opacity-40 cursor-not-allowed`
      : `${pillBase} border-slate-200 hover:border-slate-300`;

  const inner = (
    <>
      <div className="flex items-center gap-1.5">
        {status === "done" && (
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
        <span
          className={`text-[11px] whitespace-nowrap ${
            status === "done"
              ? "font-semibold text-brand-primary"
              : status === "active"
              ? "font-bold text-white"
              : "font-medium text-slate-500"
          }`}
        >
          {label}
        </span>
      </div>
      <span
        className={`text-[9px] whitespace-nowrap ${
          status === "done"
            ? "text-slate-500"
            : status === "active"
            ? "text-white/80"
            : "text-slate-400"
        }`}
      >
        {subtitle}
      </span>
    </>
  );

  // Locked: no-clickable div (siempre renderizado para no romper el stepper)
  if (status === "locked") {
    return <div className={pillStyle}>{inner}</div>;
  }

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

// ── Sección colapsable de etapa ───────────────────────────────

function CollapsibleStageSection({
  id,
  stageNum,
  label,
  status,
  accent,
  open,
  onToggle,
  nextSection,
  lockReason,
  children,
}: {
  id: string;
  stageNum: number;
  label: string;
  status: StageStatus;
  accent: string;
  open: boolean;
  onToggle: () => void;
  nextSection?: { id: string; label: string };
  /** Mensaje mostrado cuando status === "locked" — explica qué se necesita para desbloquear */
  lockReason?: string;
  children: React.ReactNode;
}) {
  // Estado bloqueado — siempre renderizado (preserva numerado y scroll targets),
  // pero no expandible. Muestra razón de bloqueo.
  if (status === "locked") {
    return (
      <section id={id} aria-labelledby={`stage-lbl-${id}`}>
        <div className={`bg-white border border-slate-200 rounded shadow-sm border-l-4 ${accent} opacity-50`}>
          <div className="flex items-center justify-between px-5 py-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                id={`stage-lbl-${id}`}
                className="text-base font-semibold text-slate-800 truncate"
              >
                {stageNum}. {label}
              </span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-slate-100 border border-slate-200 text-[10px] font-medium text-slate-400 shrink-0">
                <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                Bloqueada
              </span>
            </div>
          </div>
          {lockReason && (
            <p className="px-5 pb-3 text-[11px] text-slate-400 italic">
              {lockReason}
            </p>
          )}
        </div>
      </section>
    );
  }

  return (
    <section id={id} aria-labelledby={`stage-lbl-${id}`}>
      {/* Card blanca con border-l-4 accent — mismo patrón del mockup */}
      <div className={`bg-white border border-slate-200 rounded shadow-sm border-l-4 ${accent}`}>

        {/* Header clickable */}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={`${id}-body`}
          className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 rounded-r-sm"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              id={`stage-lbl-${id}`}
              className="text-base font-semibold text-slate-800 truncate"
            >
              {stageNum}. {label}
            </span>
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
          </div>
          {/* Chevron toggle */}
          <svg
            className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>

        {/* Body expandible */}
        {open && (
          <div id={`${id}-body`} className="border-t border-slate-100 px-5 py-4">
            {children}
            {nextSection && (
              <div className="mt-5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => scrollToDmSection(nextSection.id)}
                  className="w-full flex items-center justify-center gap-1.5 bg-brand-primary text-white text-xs font-semibold py-2.5 rounded hover:bg-brand-primary-dark transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
                >
                  {nextSection.label}
                  <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

// ── Celda expandible ─────────────────────────────────────────

function ExpandableCell({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  if (!text || text === "—") return <span className="text-slate-400">—</span>;
  const isLong = text.length > 140;
  return (
    <div>
      <p className={`text-slate-600 text-xs leading-relaxed${!expanded && isLong ? " line-clamp-3" : ""}`}>
        {text}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="min-h-[24px] inline-flex items-center text-[10px] text-brand-primary hover:underline mt-0.5 focus:outline-none"
        >
          {expanded ? "Ver menos" : "Ver más"}
        </button>
      )}
    </div>
  );
}

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

// ── Etapa 1: Contexto ────────────────────────────────────────

function ContextoSection({
  progress,
  onGoToCuestionario,
  sector,
  size,
  frameworks,
}: {
  progress: Props["questionnaireProgress"];
  onGoToCuestionario: () => void;
  sector?: string | null;
  size?: string | null;
  frameworks?: string[] | null;
}) {
  const isComplete = progress && progress.filled >= progress.total && progress.total > 0;
  const hasKpis = sector || size || (frameworks && frameworks.length > 0);

  return (
    <div className="py-2">
      <p className="text-xs text-slate-600 mb-3">
        El cuestionario de contexto es la base para que la IA entienda a tu cliente antes de ejecutar el benchmark.
      </p>

      {/* KPI cards — Sector / Tamaño / Marcos */}
      {hasKpis && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="border border-slate-200 rounded p-3 bg-slate-50/50">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Sector</p>
            <p className="text-sm font-semibold text-slate-800 truncate">
              {sector ? catalogLabel("sectors", sector) : "—"}
            </p>
          </div>
          <div className="border border-slate-200 rounded p-3 bg-slate-50/50">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Tamaño</p>
            <p className="text-sm font-semibold text-slate-800 truncate">
              {size ? catalogLabel("client_sizes", size) : "—"}
            </p>
          </div>
          <div className="border border-slate-200 rounded p-3 bg-slate-50/50">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Marcos</p>
            <p className="text-sm font-semibold text-slate-800 leading-relaxed">
              {frameworks && frameworks.length > 0
                ? frameworks.map((f) => catalogLabel("frameworks", f)).join(", ")
                : "—"}
            </p>
          </div>
        </div>
      )}

      {/* Barra de progreso — igual que mockup-v7 */}
      {progress ? (
        <div className="mb-3">
          <div className="flex justify-between items-center text-xs text-slate-600 mb-1.5">
            <span className="font-medium">Campos completados</span>
            <span className="flex items-center gap-2">
              <span className={`font-bold tabular-nums ${isComplete ? "text-emerald-600" : "text-brand-primary"}`}>
                {progress.filled} / {progress.total}
              </span>
              {!isComplete && progress.total > 0 && (
                <span className="bg-amber-100 text-amber-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-sm tabular-nums whitespace-nowrap">
                  {progress.total - progress.filled} pendientes
                </span>
              )}
            </span>
          </div>
          <div className="h-[3px] bg-slate-200 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${isComplete ? "bg-emerald-500" : "bg-brand-primary"}`}
              style={{ width: `${Math.round((progress.filled / progress.total) * 100)}%` }}
            />
          </div>
        </div>
      ) : (
        <button
          onClick={onGoToCuestionario}
          className="text-xs text-brand-primary hover:underline mb-3 block"
        >
          El cuestionario está vacío. Complétalo primero →
        </button>
      )}

      {/* Warning banner — campos pendientes (mockup-v7 pattern) */}
      {progress && !isComplete && progress.filled > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-100 rounded text-xs text-amber-800 mb-3">
          <strong>{progress.total - progress.filled} campos pendientes.</strong>{" "}
          Completarlos mejora la calidad del reporte final.{" "}
          <button onClick={onGoToCuestionario} className="underline font-semibold ml-0.5 hover:text-amber-900">
            Ir al cuestionario →
          </button>
        </div>
      )}

      {/* Solo mostrar botón si ya está completo (no competir con amber banner) */}
      {isComplete && (
        <Button size="sm" variant="secondary" onClick={onGoToCuestionario}>
          Ver cuestionario
        </Button>
      )}
    </div>
  );
}

// ── Horizontes temporales ────────────────────────────────────

const DM_HORIZON_DEFAULTS: DmHorizons = { corto_year: 2027, mediano_year: 2030, largo_year: 2040 };

function HorizontesConfig({
  clientId,
}: {
  clientId: string;
}) {
  const { push } = useToast();
  const { data, mutate } = useSWR<{ data: DmHorizons }>(
    `/api/clients/${clientId}/dm-config`,
    fetcher,
    { revalidateOnFocus: false }
  );

  const horizons = data?.data ?? DM_HORIZON_DEFAULTS;
  const [draft, setDraft] = useState<DmHorizons | null>(null);
  const [saving, setSaving] = useState(false);

  const current = draft ?? horizons;
  const isDirty = draft !== null && (
    draft.corto_year !== horizons.corto_year ||
    draft.mediano_year !== horizons.mediano_year ||
    draft.largo_year !== horizons.largo_year
  );

  const handleSave = async () => {
    if (!draft) return;
    // Validar orden y rango
    if (draft.corto_year >= draft.mediano_year || draft.mediano_year >= draft.largo_year) {
      push("error", "Corto plazo < Mediano plazo < Largo plazo — verifica los años");
      return;
    }
    if (draft.corto_year < 2025 || draft.largo_year > 2100) {
      push("error", "Los años deben estar entre 2025 y 2100");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/dm-config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al guardar");
      push("success", "Horizontes actualizados.");
      setDraft(null);
      mutate();
    } catch (e) {
      push("error", e instanceof Error ? e.message : "Error al guardar horizontes");
    } finally {
      setSaving(false);
    }
  };

  const HORIZON_LABELS = ["Corto plazo", "Mediano plazo", "Largo plazo"] as const;
  const HORIZON_KEYS:   Array<keyof DmHorizons> = ["corto_year", "mediano_year", "largo_year"];

  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
        Horizontes temporales del estudio
      </p>
      <div className="flex items-end gap-3 flex-wrap">
        {HORIZON_KEYS.map((key, i) => (
          <div key={key} className="flex flex-col gap-0.5">
            <label className="text-[10px] text-slate-500 uppercase tracking-wider">
              {HORIZON_LABELS[i]}
            </label>
            <input
              type="number"
              min={2024}
              max={2060}
              value={current[key]}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val)) setDraft((d) => ({ ...(d ?? horizons), [key]: val }));
              }}
              className="font-sans w-20 text-sm border border-slate-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-brand-primary/30 tabular-nums"
            />
          </div>
        ))}
        {isDirty && (
          <Button size="sm" variant="primary" loading={saving} onClick={() => void handleSave()}>
            Guardar
          </Button>
        )}
        {isDirty && (
          <button
            type="button"
            className="text-xs text-slate-400 hover:underline self-end pb-1"
            onClick={() => setDraft(null)}
          >
            Cancelar
          </button>
        )}
      </div>
      <p className="text-[10px] text-slate-400 mt-1.5">
        Usados por la IA para clasificar horizontes de cada IRO · Defaults: ≤{DM_HORIZON_DEFAULTS.corto_year} / {DM_HORIZON_DEFAULTS.mediano_year} / {DM_HORIZON_DEFAULTS.largo_year}
      </p>
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
      {hasComparisonData && (
        <div className="mt-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
            {clientName} vs {latestResult!.companies_snapshot.length} empresa
            {latestResult!.companies_snapshot.length !== 1 ? "s" : ""} — posición por dimensión ESG
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full w-max text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 pb-2 pr-6 whitespace-nowrap">
                    Dimensión
                  </th>
                  {/* Columna cliente — highlight */}
                  <th className="text-left text-[10px] font-bold uppercase tracking-widest pb-2 pr-6 whitespace-nowrap bg-brand-primary-light/30 px-3 rounded-t text-brand-primary-dark">
                    {clientName}
                    <span className="ml-1 font-normal normal-case text-brand-primary/60">· Cliente</span>
                  </th>
                  {/* Columnas competidores */}
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
                  <tr
                    key={field.key}
                    className="even:bg-slate-50/60 hover:bg-brand-primary-light/20 transition-colors"
                  >
                    <td className="py-3 pr-6 font-medium text-slate-700 whitespace-nowrap align-top">
                      {field.label}
                    </td>
                    {/* Celda cliente — highlight */}
                    <td className="py-3 pr-6 max-w-[220px] align-top bg-brand-primary-light/20 px-3">
                      <ExpandableCell
                        text={lookupComparisonValue(latestResult!.comparison, field.key, clientName)}
                      />
                    </td>
                    {/* Celdas competidores */}
                    {latestResult!.companies_snapshot.map((company) => (
                      <td key={company.name} className="py-3 pr-6 max-w-[220px] align-top">
                        <ExpandableCell
                          text={lookupComparisonValue(latestResult!.comparison, field.key, company.name)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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

// ── Score picker (1 / 2 / 3) ─────────────────────────────────

const SCORE_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: "1", color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  2: { label: "2", color: "bg-amber-100 text-amber-700 border-amber-300" },
  3: { label: "3", color: "bg-rose-100 text-rose-700 border-rose-300" },
};

// Etiquetas de criterio por tipo de IRO — siguiendo ESRS LSME / EFRAG
const SCORE_DIM1_LABEL: Record<string, string> = {
  impacto_negativo: "Severidad",   // Escala × Alcance × Remediabilidad
  impacto_positivo: "Escala/Alcance",
  riesgo:           "Prob.",
  oportunidad:      "Prob.",
};

const SCORE_DIM2_LABEL: Record<string, string> = {
  impacto_negativo: "Materialidad",
  impacto_positivo: "Materialidad",
  riesgo:           "Magnitud",
  oportunidad:      "Potencial",
};

// Tooltip explicativo por tipo de IRO
const SCORE_DIM1_TOOLTIP: Record<string, string> = {
  impacto_negativo: "Severidad: Escala (extensión del daño) × Alcance (nº afectados) × Remediabilidad (dificultad de reparar). 1=bajo · 2=medio · 3=alto",
  impacto_positivo: "Escala × Alcance (sin Remediabilidad para impactos positivos). 1=bajo · 2=medio · 3=alto",
  riesgo:           "Probabilidad de que el riesgo se materialice. 1=baja · 2=media · 3=alta",
  oportunidad:      "Probabilidad de capturar la oportunidad. 1=baja · 2=media · 3=alta",
};

function ScorePicker({
  value,
  onChange,
  disabled,
  dimLabel,
  dimTooltip,
}: {
  value: number | null;
  onChange: (v: number) => void;
  disabled?: boolean;
  dimLabel?: string;
  dimTooltip?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      {dimLabel && (
        <span
          className="text-[9px] text-slate-400 uppercase tracking-wide whitespace-nowrap cursor-default"
          title={dimTooltip}
        >
          {dimLabel}
        </span>
      )}
      <div className="flex gap-0.5">
        {[1, 2, 3].map((n) => {
          const active = value === n;
          const { label, color } = SCORE_LABELS[n]!;
          return (
            <button
              key={n}
              type="button"
              disabled={disabled}
              onClick={() => onChange(n)}
              className={`w-6 h-6 text-[10px] font-bold border rounded-sm flex items-center justify-center transition-colors
                ${active ? color : "bg-white text-slate-400 border-slate-200 hover:bg-slate-50"}
                ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
              aria-label={`${dimLabel ?? "Score"} ${n}`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function prioridad(impacto: number | null, financiero: number | null): { label: string; color: string } {
  if (!impacto || !financiero) return { label: "—", color: "text-slate-400" };
  const sum = impacto + financiero;
  if (sum >= 5) return { label: "Alta",  color: "text-rose-600 font-semibold" };
  if (sum >= 3) return { label: "Media", color: "text-amber-600 font-semibold" };
  return { label: "Baja", color: "text-emerald-600 font-semibold" };
}

const TIPO_SHORT: Record<string, string> = {
  impacto_positivo: "Imp+",
  impacto_negativo: "Imp−",
  riesgo:           "Riesgo",
  oportunidad:      "Opor.",
};

const TIPO_BADGE: Record<string, string> = {
  impacto_positivo: "bg-emerald-50 text-emerald-700",
  impacto_negativo: "bg-rose-50 text-rose-700",
  riesgo:           "bg-amber-50 text-amber-700",
  oportunidad:      "bg-teal-50 text-teal-700",
};

const CADENA_LABEL: Record<string, string> = {
  upstream:   "Upstream",
  ops_propia: "Operación",
  downstream: "Downstream",
};

// ── Etapa 3: IROs del cliente ────────────────────────────────

function IroSection({
  clientId,
  iros,
  status,
  isPolling,
  hasBenchmark,
  onMutate,
  onStartPolling,
}: {
  clientId: string;
  iros: IroInventoryItem[];
  status: IroBatchStatus;
  isPolling: boolean;
  hasBenchmark: boolean;
  onMutate: () => void;
  onStartPolling: () => void;
}) {
  const { push } = useToast();
  const [generating, setGenerating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/dm-iros`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al iniciar generación de IROs");
      onStartPolling();
      onMutate();
    } catch (e) {
      push("error", e instanceof Error ? e.message : "Error al generar IROs");
    } finally {
      setGenerating(false);
    }
  }, [clientId, push, onMutate, onStartPolling]);

  const patchIro = useCallback(async (id: string, patch: Partial<Pick<IroInventoryItem, "score_impacto" | "score_financiero" | "incluido">>) => {
    setSavingId(id);
    try {
      const res = await fetch(`/api/clients/${clientId}/dm-iros`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error ?? "Error al actualizar IRO");
      }
      onMutate();
    } catch (e) {
      push("error", e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSavingId(null);
    }
  }, [clientId, push, onMutate]);

  const includedCount = iros.filter((i) => i.incluido).length;

  // Agrupar por tema_esg preservando orden de aparición
  const groups: Array<{ tema: string; items: IroInventoryItem[] }> = [];
  for (const iro of iros) {
    const existing = groups.find((g) => g.tema === iro.tema_esg);
    if (existing) existing.items.push(iro);
    else groups.push({ tema: iro.tema_esg, items: [iro] });
  }

  if (!hasBenchmark && status === "idle") {
    return (
      <div className="border-l-4 border-l-slate-300 pl-4 py-2">
        <p className="text-xs text-slate-500">
          Completa el benchmark primero — los IROs se generan usando las señales del benchmark + el cuestionario del cliente.
        </p>
      </div>
    );
  }

  if (status === "idle") {
    return (
      <div className="border-l-4 border-l-amber-400 pl-4 py-2 space-y-3">
        <p className="text-xs text-slate-600">
          La IA generará un inventario preliminar de 15–25 IROs usando el cuestionario del cliente y las señales del benchmark. Tarda 1-3 minutos.
        </p>
        <Button size="md" variant="primary" loading={generating} onClick={handleGenerate}>
          <svg className="w-3.5 h-3.5 mr-1.5 shrink-0" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 1v7M6 8l-2.5-2.5M6 8l2.5-2.5" />
            <path d="M1 11h10" />
          </svg>
          Generar IROs con IA
        </Button>
      </div>
    );
  }

  if (status === "pending" && isPolling) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500 py-2 border-l-4 border-l-amber-400 pl-4">
        <svg className="w-4 h-4 animate-spin text-brand-primary shrink-0" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Generando IROs — puede tardar 1-3 minutos. No cierres esta página.
      </div>
    );
  }

  if (status === "pending" && !isPolling) {
    return (
      <div className="border-l-4 border-l-amber-400 pl-4 py-2 space-y-2">
        <p className="text-xs text-slate-500">Generación en proceso. Verifica el estado.</p>
        <Button size="sm" variant="secondary" onClick={onMutate}>Verificar estado</Button>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="border-l-4 border-l-rose-500 pl-4 py-2 bg-rose-50 rounded-r space-y-2">
        <p className="text-xs text-rose-700">La generación de IROs falló. Intenta de nuevo.</p>
        <Button size="sm" variant="primary" loading={generating} onClick={handleGenerate}>Reintentar</Button>
      </div>
    );
  }

  // status === "done"
  return (
    <div className="space-y-3">
      {/* Header resumen */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">
            <span className="font-bold text-slate-700">{groups.length}</span> bloques ·{" "}
            <span className="font-bold text-slate-700">{includedCount}</span>/{iros.length} IROs incluidos
          </span>
          <span
            className="text-[10px] uppercase tracking-widest text-slate-400 font-bold cursor-default"
            title="Dim 1: Severidad (impactos negativos) · Escala/Alcance (impactos positivos) · Probabilidad (riesgos/oportunidades) — Dim 2: Materialidad financiera para la empresa en todos los tipos"
          >
            Dim 1 (Severidad/Prob.) × Dim 2 (Materialidad) · 1=bajo · 2=medio · 3=alto ⓘ
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/clients/${clientId}/dm-export-iros`}
            download
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded hover:bg-slate-50 transition-colors"
          >
            <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 12h12M8 2v8m0 0-3-3m3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Exportar Excel
          </a>
          <Button size="sm" variant="secondary" loading={generating} onClick={handleGenerate}>
            <svg className="w-3 h-3 mr-1.5 shrink-0" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 4a4 4 0 11-7.9 1" />
              <path d="M2 2v3h3" />
            </svg>
            Regenerar IROs
          </Button>
        </div>
      </div>

      {/* Tabla IROs */}
      <div className="overflow-x-auto border border-slate-200 rounded">
        <table className="min-w-full w-max text-xs">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-200">
              <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 w-8">#</th>
              <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 w-32">Tema ESG</th>
              <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500">Descripción</th>
              <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 w-20">Tipo</th>
              <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 w-22">Cadena</th>
              <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 w-20">Horizonte</th>
              <th className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500 w-20" title="Severidad (impactos) · Probabilidad (riesgos/oport.)">Dim. 1 ⓘ</th>
              <th className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500 w-20" title="Materialidad financiera para la empresa (todos los tipos)">Dim. 2 ⓘ</th>
              <th className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500 w-16">Prioridad</th>
              <th className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500 w-16">Incluir</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <>
                {/* ── Cabecera de bloque temático ── */}
                <tr key={`group-${group.tema}`} className="bg-teal-50 border-b border-teal-200">
                  <td colSpan={10} className="px-2 py-1.5 border-l-2 border-l-brand-primary">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-teal-700">
                      {group.tema}
                    </span>
                    <span className="ml-2 text-[10px] text-teal-500">
                      · {group.items.filter((i) => i.incluido).length}/{group.items.length}
                    </span>
                    {(() => {
                      const cat = classifyEsg(group.tema);
                      return (
                        <span className={`ml-2 text-[9px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-widest ${ESG_BADGE[cat]}`}>
                          {cat}
                        </span>
                      );
                    })()}
                    {(() => {
                      const consolidado = Math.max(
                        ...group.items.filter(i => i.score_impacto || i.score_financiero)
                          .map(i => Math.max(i.score_impacto ?? 0, i.score_financiero ?? 0))
                      );
                      if (!isFinite(consolidado) || consolidado === 0) return null;
                      const color = consolidado === 3 ? "text-rose-600" : consolidado === 2 ? "text-amber-600" : "text-emerald-600";
                      return (
                        <span className={`ml-3 text-[9px] tabular-nums ${color}`} title="Score consolidado del tema (max de impacto y financiero)">
                          Score max: {consolidado}
                        </span>
                      );
                    })()}
                  </td>
                </tr>
                {/* ── IROs del bloque ── */}
                {group.items.map((iro, idx) => {
                  const isSaving = savingId === iro.id;
                  const pri = prioridad(iro.score_impacto, iro.score_financiero);
                  return (
                    <tr
                      key={iro.id}
                      className={`border-b border-slate-100 transition-colors ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"} ${!iro.incluido ? "opacity-50" : ""}`}
                    >
                      <td className="px-2 py-2 text-slate-400 tabular-nums">{iro.n_iro}</td>
                      <td className="px-2 py-2 text-slate-700 font-medium max-w-[128px]">
                        <span className="line-clamp-2 text-xs">{iro.tema_esg}</span>
                      </td>
                      <td className="px-2 py-2 text-slate-600 max-w-[300px]">
                        <ExpandableCell text={iro.descripcion} />
                        {iro.evidencia && (
                          <p className="text-[10px] text-slate-400 mt-0.5 italic line-clamp-1">
                            Fuente: {iro.evidencia}
                          </p>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-sm ${TIPO_BADGE[iro.tipo] ?? "bg-slate-100 text-slate-600"}`}>
                          {TIPO_SHORT[iro.tipo] ?? iro.tipo}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-xs text-slate-600">{CADENA_LABEL[iro.cadena] ?? iro.cadena}</td>
                      <td className="px-2 py-2 text-xs text-slate-600 capitalize">{iro.horizonte}</td>
                      <td className="px-2 py-2">
                        <div className="flex justify-center">
                          <ScorePicker
                            value={iro.score_impacto}
                            disabled={isSaving}
                            dimLabel={SCORE_DIM1_LABEL[iro.tipo]}
                            dimTooltip={SCORE_DIM1_TOOLTIP[iro.tipo]}
                            onChange={(v) => void patchIro(iro.id, { score_impacto: v })}
                          />
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex justify-center">
                          <ScorePicker
                            value={iro.score_financiero}
                            disabled={isSaving}
                            dimLabel={SCORE_DIM2_LABEL[iro.tipo]}
                            onChange={(v) => void patchIro(iro.id, { score_financiero: v })}
                          />
                        </div>
                      </td>
                      <td className={`px-2 py-2 text-center text-[11px] tabular-nums ${pri.color}`}>
                        {pri.label}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => void patchIro(iro.id, { incluido: !iro.incluido })}
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center mx-auto transition-colors
                            ${iro.incluido ? "bg-brand-primary border-brand-primary" : "bg-white border-slate-300 hover:border-slate-400"}
                            ${isSaving ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
                          aria-label={iro.incluido ? "Excluir IRO" : "Incluir IRO"}
                        >
                          {iro.incluido && (
                            <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M2 6l3 3 5-5" />
                            </svg>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-slate-400">
        Confianza IA: {iros.filter((i) => i.confianza === "alto").length} alta · {iros.filter((i) => i.confianza === "medio").length} media · {iros.filter((i) => i.confianza === "bajo").length} baja.
        Los scores son editables — ajusta según criterio del consultor.
      </p>
    </div>
  );
}

// ── Etapa 4: NIS / IBSO ──────────────────────────────────────

const ESTADO_LABEL: Record<NisItem["estado"], string> = {
  no_identificado: "No identificado",
  parcial:         "Parcial",
  disponible:      "Disponible",
};

const ESTADO_COLOR: Record<NisItem["estado"], string> = {
  no_identificado: "bg-slate-100 text-slate-500",
  parcial:         "bg-amber-50 text-amber-700",
  disponible:      "bg-emerald-50 text-emerald-700",
};

const CALIDAD_LABEL: Record<NisItem["calidad_dato"], string> = {
  baja:  "Baja",
  media: "Media",
  alta:  "Alta",
};

const CATEGORIA_LABEL: Record<NisItem["categoria"], string> = {
  ambiental:  "Ambiental",
  social:     "Social",
  gobernanza: "Gobernanza",
};

const CATEGORIA_COLOR: Record<NisItem["categoria"], string> = {
  ambiental:  "bg-teal-50 text-teal-700",
  social:     "bg-violet-50 text-violet-700",
  gobernanza: "bg-slate-100 text-slate-600",
};

function NisSection({
  clientId,
  nisRows,
  iros,
  hasBenchmark,
  onMutate,
}: {
  clientId: string;
  nisRows: NisItem[];
  iros: IroInventoryItem[];
  hasBenchmark: boolean;
  onMutate: () => void;
}) {
  const { push } = useToast();
  const [generating, setGenerating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const handleAutoGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/dm-nis`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al generar NIS");
      onMutate();
      push("success", "Indicadores NIS/IBSO generados desde el cuestionario.");
    } catch (e) {
      push("error", e instanceof Error ? e.message : "Error al generar NIS");
    } finally {
      setGenerating(false);
    }
  }, [clientId, push, onMutate]);

  const patchNis = useCallback(async (id: string, patch: Partial<Pick<NisItem, "estado" | "calidad_dato" | "accion">>) => {
    setSavingId(id);
    try {
      const res = await fetch(`/api/clients/${clientId}/dm-nis`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error ?? "Error al actualizar NIS");
      }
      onMutate();
    } catch (e) {
      push("error", e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSavingId(null);
    }
  }, [clientId, push, onMutate]);

  const disponiblesCount = nisRows.filter((r) => r.estado === "disponible").length;
  const parcialesCount   = nisRows.filter((r) => r.estado === "parcial").length;

  // IROs de alta/media prioridad que requieren seguimiento de datos
  const priorityIros = iros.filter(
    (i) => i.incluido && ((i.score_impacto ?? 0) + (i.score_financiero ?? 0)) >= 4
  );

  return (
    <div className="space-y-3">
      {/* Banner: IROs priorizados que generan necesidad de datos ── */}
      {priorityIros.length > 0 && (
        <div className="border-l-4 border-l-brand-primary pl-3 py-2 bg-brand-primary-light/20 rounded-r">
          <p className="text-[10px] font-bold uppercase tracking-widest text-brand-primary-dark mb-1.5">
            IROs priorizados que requieren datos ({priorityIros.length})
          </p>
          <div className="flex flex-wrap gap-1">
            {priorityIros.map((iro) => {
              const total = (iro.score_impacto ?? 0) + (iro.score_financiero ?? 0);
              const isAlta = total >= 5;
              return (
                <span
                  key={iro.id}
                  className={`text-[10px] px-2 py-0.5 rounded-sm font-medium ${
                    isAlta
                      ? "bg-rose-50 text-rose-700 border border-rose-200"
                      : "bg-amber-50 text-amber-700 border border-amber-200"
                  }`}
                  title={`${iro.descripcion} — Dim1: ${iro.score_impacto ?? "—"} · Dim2: ${iro.score_financiero ?? "—"}`}
                >
                  {isAlta ? "●" : "◆"} {iro.tema_esg}
                </span>
              );
            })}
          </div>
          <p className="text-[10px] text-slate-500 mt-1.5">
            ● Alta prioridad (Dim1+Dim2 ≥ 5) · ◆ Media (≥ 4) — verifica que tienes datos disponibles para estos temas
          </p>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-slate-600">
          Mapa de brechas de información para los indicadores NIS/IBSO más relevantes del sector.
          {nisRows.length > 0 && (
            <span className="ml-1 text-slate-400">
              {disponiblesCount} disponibles · {parcialesCount} parciales · {nisRows.length - disponiblesCount - parcialesCount} por identificar.
            </span>
          )}
        </p>
        <Button
          size="sm"
          variant={nisRows.length > 0 ? "secondary" : "primary"}
          loading={generating}
          onClick={handleAutoGenerate}
          disabled={!hasBenchmark}
          title={!hasBenchmark ? "Completa el benchmark primero para generar el mapa NIS/IBSO" : undefined}
        >
          {nisRows.length > 0 ? "Actualizar desde cuestionario" : "Auto-completar desde cuestionario"}
        </Button>
      </div>

      {nisRows.length === 0 ? (
        <div className="border-l-4 border-l-slate-300 pl-4 py-2">
          <p className="text-xs text-slate-500">
            Haz clic en &ldquo;Auto-completar&rdquo; para pre-llenar el mapa de brechas basado en el cuestionario del cliente.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded">
          <table className="min-w-full w-max text-xs">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200">
                <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500">Indicador IBSO</th>
                <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 w-24">Categoría</th>
                <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 w-32">Estado del dato</th>
                <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 w-24">Calidad</th>
                <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 w-48">Acción recomendada</th>
              </tr>
            </thead>
            <tbody>
              {nisRows.map((row, idx) => {
                const isSaving = savingId === row.id;
                return (
                  <tr
                    key={row.id}
                    className={`border-b border-slate-100 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"}`}
                  >
                    <td className="px-2 py-2 text-slate-700 font-medium">{row.ibso_label}</td>
                    <td className="px-2 py-2">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-sm ${CATEGORIA_COLOR[row.categoria]}`}>
                        {CATEGORIA_LABEL[row.categoria]}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <select
                        disabled={isSaving}
                        value={row.estado}
                        onChange={(e) => void patchNis(row.id, { estado: e.target.value as NisItem["estado"] })}
                        className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-sm border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-primary/40 ${ESTADO_COLOR[row.estado]}`}
                      >
                        {(["no_identificado", "parcial", "disponible"] as NisItem["estado"][]).map((v) => (
                          <option key={v} value={v}>{ESTADO_LABEL[v]}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <select
                        disabled={isSaving}
                        value={row.calidad_dato}
                        onChange={(e) => void patchNis(row.id, { calidad_dato: e.target.value as NisItem["calidad_dato"] })}
                        className="text-[11px] text-slate-600 border border-slate-200 rounded px-1 py-0.5 bg-white cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-primary/40"
                      >
                        {(["baja", "media", "alta"] as NisItem["calidad_dato"][]).map((v) => (
                          <option key={v} value={v}>{CALIDAD_LABEL[v]}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="text"
                        disabled={isSaving}
                        defaultValue={row.accion ?? ""}
                        placeholder="Ej: Solicitar datos a operaciones..."
                        onBlur={(e) => {
                          const val = e.target.value.trim() || null;
                          if (val !== row.accion) void patchNis(row.id, { accion: val });
                        }}
                        className="w-full text-[11px] text-slate-600 border border-slate-200 rounded px-1.5 py-0.5 bg-white placeholder:text-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-primary/40 font-sans"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Etapa 5: Reporte ─────────────────────────────────────────

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

  // Estado de colapso por sección — key=sectionId, value=abierto
  // Por defecto: solo la etapa "active" está abierta; done y pending colapsadas
  const [sectionOpen, setSectionOpen] = useState<Record<string, boolean>>({});
  const isSectionOpen = useCallback(
    (sectionId: string, status: StageStatus) => {
      if (status === "locked") return false;
      return sectionId in sectionOpen ? sectionOpen[sectionId]! : status === "active";
    },
    [sectionOpen]
  );
  const toggleSection = useCallback(
    (sectionId: string, status: StageStatus) => {
      if (status === "locked") return; // bloqueada — no toggle
      setSectionOpen((prev) => ({ ...prev, [sectionId]: !isSectionOpen(sectionId, status) }));
    },
    [isSectionOpen]
  );

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
  const { data: resumenResp } = useSWR<{ data: { status: string } | null }>(
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
  const dmDoneCount = [
    stage1Status, stage2Status, stage3Status, stage4Status,
    stage5Status, stage6Status, stage7Status, stage8Status,
  ].filter((s) => s === "done").length;
  useEffect(() => {
    onStagesProgress?.(dmDoneCount, 8);
  }, [dmDoneCount, onStagesProgress]);

  // Navegación por teclado ← → entre secciones DM
  // Activo en toda la página; se salta si el foco está en un campo de texto.
  const kbIdxRef = useRef(0);
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.key === "ArrowRight") {
        kbIdxRef.current = Math.min(kbIdxRef.current + 1, DM_SECTION_IDS.length - 1);
      } else {
        kbIdxRef.current = Math.max(kbIdxRef.current - 1, 0);
      }
      scrollToDmSection(DM_SECTION_IDS[kbIdxRef.current]!);
      e.preventDefault();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

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

  return (
    <div className="space-y-6 py-4">
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
          <div className="bg-white border border-slate-200 rounded shadow-sm sticky top-2 z-10">
            {/* Cabecera progreso */}
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

            {/* Pill bar */}
            <div className="flex items-center gap-1 px-4 py-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {stagesData.map((s, idx) => (
                <span key={s.sectionId} className="contents">
                  <StagePill
                    label={s.label}
                    status={s.status}
                    subtitle={
                      s.status === "done"
                        ? formatStageDate(s.doneDate)
                        : s.status === "active"
                        ? "En curso"
                        : "Pendiente"
                    }
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

            {/* Context chips — siempre visibles; 0-count comunica acción pendiente */}
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
        open={isSectionOpen("dm-sec-contexto", stage1Status)}
        onToggle={() => toggleSection("dm-sec-contexto", stage1Status)}
        nextSection={{ id: "dm-sec-benchmark", label: "Siguiente: Benchmark" }}
      >
        <ContextoSection
          progress={questionnaireProgress}
          onGoToCuestionario={onGoToCuestionario}
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
        open={isSectionOpen("dm-sec-benchmark", stage2Status)}
        onToggle={() => toggleSection("dm-sec-benchmark", stage2Status)}
        nextSection={{ id: "dm-sec-iros", label: "Siguiente: IROs" }}
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
        open={isSectionOpen("dm-sec-iros", stage3Status)}
        onToggle={() => toggleSection("dm-sec-iros", stage3Status)}
        nextSection={{ id: "dm-sec-matriz", label: "Siguiente: Matriz" }}
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
        open={isSectionOpen("dm-sec-matriz", stage4Status)}
        onToggle={() => toggleSection("dm-sec-matriz", stage4Status)}
        nextSection={{ id: "dm-sec-nis", label: "Siguiente: NIS/IBSO" }}
        lockReason="Registra y califica al menos 3 IROs con score de impacto y financiero para activar la matriz."
      >
        <MatrizDM iros={iros.filter((i) => i.incluido)} />
      </CollapsibleStageSection>

      {/* ── Etapa 5 — NIS / IBSO ── */}
      <CollapsibleStageSection
        id="dm-sec-nis"
        stageNum={5}
        label="NIS / IBSO — Brechas de información"
        status={stage5Status}
        accent="border-l-amber-600"
        open={isSectionOpen("dm-sec-nis", stage5Status)}
        onToggle={() => toggleSection("dm-sec-nis", stage5Status)}
        nextSection={{ id: "dm-sec-resumen", label: "Siguiente: Resumen ejecutivo" }}
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
        open={isSectionOpen("dm-sec-resumen", stage6Status)}
        onToggle={() => toggleSection("dm-sec-resumen", stage6Status)}
        nextSection={{ id: "dm-sec-validacion", label: "Siguiente: Validación" }}
        lockReason="Completa el inventario de IROs (Etapa 3) para generar el resumen ejecutivo con IA."
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
        open={isSectionOpen("dm-sec-validacion", stage7Status)}
        onToggle={() => toggleSection("dm-sec-validacion", stage7Status)}
        nextSection={{ id: "dm-sec-reporte", label: "Siguiente: Reporte final" }}
        lockReason="Genera el resumen ejecutivo (Etapa 6) para iniciar la sesión de validación con el cliente."
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
        open={isSectionOpen("dm-sec-reporte", stage8Status)}
        onToggle={() => toggleSection("dm-sec-reporte", stage8Status)}
      >
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
            void mutateReport();
          }}
        />
      </CollapsibleStageSection>

      {/* ── Checklist de cierre ── */}
      <section aria-labelledby="stage-checklist">
        <h2 id="stage-checklist" className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">
          Checklist de Cierre
        </h2>
        <ChecklistCierre
          questionnaireProgress={questionnaireProgress}
          hasCompletedBenchmark={hasBenchmark}
          iroCount={iros.length}
          includedIroCount={includedIros.length}
          scoredIroCount={iros.filter((i) => i.score_impacto !== null && i.score_financiero !== null).length}
          hasNisData={hasNis}
          hasReport={hasReport}
          hasResumen={hasResumen}
        />
      </section>

      {/* ── Log de decisiones ── */}
      <section aria-labelledby="stage-log">
        <h2 id="stage-log" className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">
          Log de Decisiones
        </h2>
        <LogDecisionesSection clientId={clientId} />
      </section>
    </div>
  );
}
