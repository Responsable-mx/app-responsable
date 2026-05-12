"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import useSWR from "swr";
import { useToast } from "@/components/ui/Toast";
import { SkeletonList } from "@/components/ui/Skeleton";
import type { IroInventoryItem } from "@/lib/dm/iro-generation";
// ContextoSection eager — etapa por default (primer panel visible)
import { ContextoSection } from "@/components/doble-materialidad/ContextoSection";
import { HorizontesConfig } from "@/components/doble-materialidad/HorizontesConfig";
import type { NisItem } from "@/components/doble-materialidad/NisSection";
import type { IroBatchStatus } from "@/components/doble-materialidad/IroSection";
import type { BenchmarkData } from "@/components/doble-materialidad/benchmark-types";
import { StagePill } from "@/components/doble-materialidad/StagePill";
import { CollapsibleStageSection } from "@/components/doble-materialidad/CollapsibleStageSection";

// ── Lazy loading por etapa (A — Wave 2) ──────────────────────
// Cada sección carga solo cuando el consultor llega a su pill.
// Bundle inicial DM-IA baja ~40-60%.
const dmFallback = <div className="h-32 bg-slate-50 animate-pulse rounded" aria-label="Cargando etapa" role="status" />;

const MatrizDM = dynamic(
  () => import("@/components/doble-materialidad/MatrizDM").then((m) => ({ default: m.MatrizDM })),
  { loading: () => <div className="h-40 bg-slate-50 animate-pulse rounded" />, ssr: false }
);
const BenchmarkSection = dynamic(
  () => import("@/components/doble-materialidad/BenchmarkSection").then((m) => ({ default: m.BenchmarkSection })),
  { loading: () => dmFallback, ssr: false }
);
const IroSection = dynamic(
  () => import("@/components/doble-materialidad/IroSection").then((m) => ({ default: m.IroSection })),
  { loading: () => dmFallback, ssr: false }
);
const NisSection = dynamic(
  () => import("@/components/doble-materialidad/NisSection").then((m) => ({ default: m.NisSection })),
  { loading: () => dmFallback, ssr: false }
);
const ResumenEjecutivoSection = dynamic(
  () => import("@/components/doble-materialidad/ResumenEjecutivoSection").then((m) => ({ default: m.ResumenEjecutivoSection })),
  { loading: () => dmFallback, ssr: false }
);
const ValidacionSection = dynamic(
  () => import("@/components/doble-materialidad/ValidacionSection").then((m) => ({ default: m.ValidacionSection })),
  { loading: () => dmFallback, ssr: false }
);
const ReporteSection = dynamic(
  () => import("@/components/doble-materialidad/ReporteSection").then((m) => ({ default: m.ReporteSection })),
  { loading: () => dmFallback, ssr: false }
);

// catalogLabel + _CATALOG_MAP movidos a catalog-lookup.ts (D-150 sesión 27)

// ── Tipos ────────────────────────────────────────────────────

// RejectionReason + REJECTION_OPTIONS + BenchmarkCompany + BenchmarkResult + BenchmarkData
// movidos a benchmark-types.ts (D-150 Phase C)

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
export const DM_STAGES_META = [
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
export const _dmNavigateRef: { current: ((id: string) => void) | null } = { current: null };

export function scrollToDmSection(sectionId: string) {
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

export type StageStatus = "done" | "active" | "pending" | "locked";

// ── Formato fecha de etapa ────────────────────────────────────

function formatStageDate(iso: string | null | undefined): string {
  if (!iso) return "Completado";
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
  });
}

// ExpandableCell movido a IroSection.tsx (uso interno) (D-150 sesión 27)

// ── Lookup fuzzy en comparison ────────────────────────────────

// lookupComparisonValue + abbrevCompanyName movidos a benchmark-helpers.ts (D-150 Phase C)

// ── Etapa 1: Contexto ────────────────────────────────────────

// ContextoSection movido a ContextoSection.tsx (D-150 sesión 27)

// HorizontesConfig + DmHorizons movidos a HorizontesConfig.tsx (D-150 sesión 27)

// ── Etapa 2: Benchmark ───────────────────────────────────────

// BenchmarkSection movido a BenchmarkSection.tsx (D-150 Phase C)

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- SSR-safe: estado inicial "dm-sec-contexto" evita mismatch de hidratación (#418); hash solo disponible en cliente
    if (DM_SECTION_IDS.includes(hash)) setActiveStageId(hash);
  }, []);
  const navigateTo = useCallback((sectionId: string) => {
    if (!DM_SECTION_IDS.includes(sectionId)) return;
    setActiveStageId(sectionId);
    // Sync URL hash sin scroll — permite back/forward + deep-link.
    // IMPORTANTE: siempre forzar tab=doble-materialidad-ia en la URL para evitar
    // race condition con router.replace async en ClientTabs: si window.location.search
    // aún refleja ?tab=cuestionario (valor stale), el replaceState dispararía un
    // cambio de searchParams que el useEffect de ClientTabs interpreta como "ir a cuestionario".
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      params.set("tab", "doble-materialidad-ia");
      const newUrl = `${window.location.pathname}?${params.toString()}#${sectionId}`;
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

  const companies    = benchmarkResp?.data?.companies ?? [];
  const latestResult = benchmarkResp?.data?.latest_result ?? null;
  const irosStatus  = irosResp?.data?.status ?? "idle";
  const iros        = irosResp?.data?.iros ?? [];
  const nisRows     = nisResp?.data ?? [];
  const latestReport = reportResp?.data ?? null;
  const validatedCompanies = companies.filter((c) => c.validated).length;

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

  // stage4 = Matriz (visualización IROs scored) — auto-done cuando IROs están validados
  const scoredIros = iros.filter(i => i.incluido && i.score_impacto && i.score_financiero).length;
  const stage4Status: StageStatus = hasIros
    ? "done"
    : scoredIros >= 3
      ? "active"
      : iros.length > 0
        ? "pending"
        : "locked";

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
    includedIros.every((i) => validacionRec?.iro_decisions?.[i.id]?.decision);
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

  // Stepper compacto al scroll — colapsa progress header + chips para evitar
  // doble sticky stack con el header de ClientTabs. Sentinel arriba del stepper:
  // cuando deja de ser visible → stepper está pinned → modo compacto.
  // IMPORTANTE: estos hooks deben ir ANTES del early return de loadingBenchmark
  // para que el conteo de hooks sea constante en todo render (#310).
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

  // Datos del stepper — extraído del IIFE (D-150 sesión 30)
  const stagesData: Array<{ label: string; status: StageStatus; sectionId: string; doneDate?: string | null; count?: string }> = [
    { label: "Contexto",    status: stage1Status, sectionId: "dm-sec-contexto" },
    { label: "Benchmark",   status: stage2Status, sectionId: "dm-sec-benchmark", doneDate: latestResult?.created_at,
      count: validatedCompanies > 0 ? `${validatedCompanies} emp.` : undefined },
    { label: "IROs",        status: stage3Status, sectionId: "dm-sec-iros",
      count: iros.length > 0 ? `${iros.length} IROs` : undefined },
    { label: "Matriz",      status: stage4Status, sectionId: "dm-sec-matriz",
      count: quadrantCounts.doble_material > 0 ? `${quadrantCounts.doble_material} DM` : undefined },
    { label: "NIS/IBSO",    status: stage5Status, sectionId: "dm-sec-nis" },
    { label: "Resumen IA",  status: stage6Status, sectionId: "dm-sec-resumen" },
    { label: "Validación",  status: stage7Status, sectionId: "dm-sec-validacion" },
    { label: "Reporte",     status: stage8Status, sectionId: "dm-sec-reporte", doneDate: latestReport?.created_at },
  ];

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
      <div className="bg-white border border-slate-200 rounded shadow-sm sticky top-[96px] z-20 transition-all">
        <div className="flex items-center gap-2 px-4 py-2">
          {/* Pills — ancho completo distribuido. overflow-x-auto como fallback en mobile */}
          <div className="flex items-center flex-1 min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {stagesData.map((s, idx) => {
              const isSel = s.sectionId === activeStageId;
              let base: string;
              if (isSel)                  base = s.status === "done" ? "En revisión" : "En curso";
              else if (s.status === "done")   base = formatStageDate(s.doneDate);
              else if (s.status === "active") base = "Disponible";
              else if (s.status === "locked") base = "Bloqueada";
              else                            base = "Pendiente";
              const subtitle = s.count && !isSel ? `${base} · ${s.count}` : base;
              return (
                <span key={s.sectionId} className="contents">
                  <StagePill
                    label={s.label}
                    status={s.status}
                    selected={isSel}
                    className="flex-1"
                    subtitle={subtitle}
                    sectionId={s.sectionId}
                  />
                  {idx < stagesData.length - 1 && (
                    <div
                      className={`w-3 h-0.5 shrink-0 rounded-sm ${
                        s.status === "done" ? "bg-brand-primary" : "bg-slate-200"
                      }`}
                      aria-hidden
                    />
                  )}
                </span>
              );
            })}
          </div>
          {/* Hint teclado — visible solo en sm+, solo expandido */}
          {!stepperCompact && (
            <span className="hidden sm:flex items-center gap-1 text-[10px] text-slate-400 shrink-0 select-none pl-2 border-l border-slate-100">
              <kbd className="inline-flex items-center px-1 py-0.5 border border-slate-200 rounded-sm text-[9px] text-slate-500 font-mono leading-none">←</kbd>
              <kbd className="inline-flex items-center px-1 py-0.5 border border-slate-200 rounded-sm text-[9px] text-slate-500 font-mono leading-none">→</kbd>
              teclado
            </span>
          )}
        </div>
      </div>

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
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="h-[3px] w-14 bg-slate-200 overflow-hidden rounded-sm">
                <div
                  className="h-full bg-teal-500 transition-all duration-300"
                  style={{ width: `${Math.round((questionnaireProgress.filled / questionnaireProgress.total) * 100)}%` }}
                />
              </div>
              <span className="text-[10px] text-slate-500 font-semibold tabular-nums whitespace-nowrap">
                {Math.round((questionnaireProgress.filled / questionnaireProgress.total) * 100)}%
              </span>
            </div>
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
              {validatedCompanies} de {companies.length} validadas
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
        accent="border-l-amber-500"
        isActive={activeStageId === "dm-sec-validacion"}
        lockReason="Genera el resumen ejecutivo (Etapa 6) para iniciar la sesión de validación con el cliente."
        subtitle="Decisiones del cliente sobre cada IRO incluido — aprobación, ajuste o descarte"
        headerRight={
          includedIros.length > 0 ? (
            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded-sm font-bold whitespace-nowrap tabular-nums">
              {includedIros.filter((i) => validacionRec?.iro_decisions?.[i.id]?.decision).length}/{includedIros.length} decididos
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
            benchmarkCompanies: validatedCompanies,
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
