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
import type { ReferentesData } from "@/lib/dm/referentes-types";
import type { BenchmarkEmpresasData } from "@/lib/dm/benchmark-empresas-types";
import type { NisItem } from "@/components/doble-materialidad/NisSection";
import type { IroBatchStatus } from "@/components/doble-materialidad/IroSection";
import type { BenchmarkData } from "@/components/doble-materialidad/benchmark-types";
import { StagePill } from "@/components/doble-materialidad/StagePill";
import { useBenchmarkPolling, useIroPolling, useReportPolling } from "@/hooks/useDmPolling";
import { CollapsibleStageSection } from "@/components/doble-materialidad/CollapsibleStageSection";

// ── Lazy loading por etapa (A — Wave 2) ──────────────────────
// Cada sección carga solo cuando el consultor llega a su pill.
// Bundle inicial DM-IA baja ~40-60%.
const dmFallback = <div className="h-32 bg-slate-50 animate-pulse rounded" aria-label="Cargando etapa" role="status" />;

const MatrizDM = dynamic(
  () => import("@/components/doble-materialidad/MatrizDM").then((m) => ({ default: m.MatrizDM })),
  { loading: () => <div className="h-40 bg-slate-50 animate-pulse rounded" />, ssr: false }
);
const ReferentesSection = dynamic(
  () => import("@/components/doble-materialidad/ReferentesSection").then((m) => ({ default: m.ReferentesSection })),
  { loading: () => dmFallback, ssr: false }
);
const BenchmarkEmpresasSection = dynamic(
  () => import("@/components/doble-materialidad/BenchmarkEmpresasSection").then((m) => ({ default: m.BenchmarkEmpresasSection })),
  { loading: () => dmFallback, ssr: false }
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
const BenchmarkIrosSection = dynamic(
  () => import("@/components/doble-materialidad/BenchmarkIrosSection").then((m) => ({ default: m.BenchmarkIrosSection })),
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

type BenchmarkCompanyIrosGroup = { company_id: string; batch: { status: string } | null; iros: unknown[] };

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
  { id: "dm-sec-contexto",           label: "Contexto"       },
  { id: "dm-sec-referentes",         label: "Referentes"     },
  { id: "dm-sec-benchmark-empresas", label: "Emp. referencia"},
  { id: "dm-sec-benchmark",          label: "Benchmark"      },
  { id: "dm-sec-benchmark-iros",     label: "IROs ref."      },
  { id: "dm-sec-iros",               label: "IROs"           },
  { id: "dm-sec-matriz",             label: "Matriz"         },
  { id: "dm-sec-nis",                label: "NIS/IBSO"       },
  { id: "dm-sec-resumen",            label: "Resumen IA"     },
  { id: "dm-sec-validacion",         label: "Validación"     },
  { id: "dm-sec-reporte",            label: "Reporte"        },
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
  const referentesKey       = `/api/clients/${clientId}/dm-referentes`;
  const benchmarkEmpresasKey = `/api/clients/${clientId}/dm-benchmark-empresas`;
  const benchmarkKey        = `/api/clients/${clientId}/dm-benchmark`;
  const irosKey        = `/api/clients/${clientId}/dm-iros`;
  const nisKey         = `/api/clients/${clientId}/dm-nis`;
  const reportKey      = `/api/clients/${clientId}/dm-report`;
  const resumenKey     = `/api/clients/${clientId}/dm-resumen`;
  const validacionKey  = `/api/clients/${clientId}/dm-validacion`;
  const benchmarkCompanyIrosKey = `/api/clients/${clientId}/dm-benchmark-company-iros`;

  const { push } = useToast();
  const [isPolling, setIsPolling] = useState(false);
  const [isIroPolling, setIsIroPolling] = useState(false);
  const [isReportPolling, setIsReportPolling] = useState(false);

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


  const { data: referentesResp, mutate: mutateReferentes } = useSWR<{
    data: ReferentesData | null;
  }>(referentesKey, fetcher, { revalidateOnFocus: false });

  const { data: benchmarkEmpresasResp, mutate: mutateBenchmarkEmpresas } = useSWR<{
    data: BenchmarkEmpresasData | null;
  }>(benchmarkEmpresasKey, fetcher, { revalidateOnFocus: false });

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

  const { data: benchmarkCompanyIrosResp } = useSWR<{ data: { groups: BenchmarkCompanyIrosGroup[] } }>(
    benchmarkCompanyIrosKey, fetcher, { revalidateOnFocus: false }
  );

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


  const referentesRec      = referentesResp?.data ?? null;
  const benchmarkEmpresasRec = benchmarkEmpresasResp?.data ?? null;
  const companies    = benchmarkResp?.data?.companies ?? [];
  const latestResult = benchmarkResp?.data?.latest_result ?? null;
  const irosStatus  = irosResp?.data?.status ?? "idle";
  const iros        = irosResp?.data?.iros ?? [];
  const nisRows     = nisResp?.data ?? [];
  const latestReport = reportResp?.data ?? null;
  const validatedCompanies = companies.filter((c) => c.validated).length;

  const { startPolling: startBenchmarkPolling } = useBenchmarkPolling(
    isPolling, setIsPolling, latestResult?.id, latestResult?.status, push
  );
  const { startPolling: startIroPolling } = useIroPolling(
    isIroPolling, setIsIroPolling, irosStatus, iros.length, push
  );
  const { startPolling: startReportPolling } = useReportPolling(
    isReportPolling, setIsReportPolling, latestReport?.id, latestReport?.parse_status, latestReport?.batch_id, push
  );

  const stage1Status: StageStatus =
    questionnaireProgress &&
    questionnaireProgress.filled >= questionnaireProgress.total &&
    questionnaireProgress.total > 0
      ? "done"
      : "active";

  // stage2 = Referentes de Sostenibilidad (nuevos frameworks + tabla de temas)
  const hasReferentes = referentesRec?.topics_status === "done" && (referentesRec?.enabled_frameworks ?? []).length > 0;
  const stage2HasContent = (referentesRec?.enabled_frameworks ?? []).length > 0;
  const stage2Status: StageStatus = hasReferentes
    ? "done"
    : stage1Status === "done"
    ? "active"
    : stage2HasContent
    ? "pending"
    : "locked";

  // stage3 = Benchmark de empresas — activo cuando Referentes done
  const hasEmpresasReferencia =
    benchmarkEmpresasRec?.generation_status === "done" &&
    (benchmarkEmpresasRec?.enabled_companies ?? []).length > 0;
  const stage3HasContent = benchmarkEmpresasRec !== null;
  const stage3Status: StageStatus = hasEmpresasReferencia
    ? "done"
    : stage2Status === "done"
    ? "active"
    : stage3HasContent
    ? "pending"
    : "locked";

  const hasBenchmark = latestResult?.status === "done";
  const hasIros      = irosStatus === "done" && iros.length > 0;
  const hasNis       = nisRows.length > 0;
  const hasReport    = latestReport?.parse_status === "ok";

  // stage4 = Benchmark — activo cuando Empresas de referencia done
  const stage4HasContent = companies.length > 0 || latestResult !== null;
  const stage4Status: StageStatus = hasBenchmark
    ? "done"
    : stage3Status === "done"
    ? "active"
    : stage4HasContent
    ? "pending"
    : "locked";

  // stage4b = IROs de empresas de referencia — activo cuando Benchmark done
  const benchmarkCompanyIrosGroups = benchmarkCompanyIrosResp?.data?.groups ?? [];
  const validatedCompanyIds = companies.filter((c) => c.validated).map((c) => c.id);
  const benchmarkIrosDoneCount = validatedCompanyIds.filter((id) => {
    const g = benchmarkCompanyIrosGroups.find((grp) => grp.company_id === id);
    return g?.batch?.status === "done";
  }).length;
  const hasBenchmarkIros = validatedCompanyIds.length > 0 && benchmarkIrosDoneCount === validatedCompanyIds.length;
  const stage4bHasContent = benchmarkCompanyIrosGroups.some((g) => g.iros.length > 0);
  const stage4bStatus: StageStatus = hasBenchmarkIros
    ? "done"
    : stage4Status === "done"
    ? "active"
    : stage4bHasContent
    ? "pending"
    : "locked";

  // stage5 = IROs del cliente — activo cuando IROs de empresas de referencia done
  const stage5Status: StageStatus = hasIros
    ? "done"
    : hasBenchmarkIros
    ? "active"
    : iros.length > 0
    ? "pending"
    : "locked";

  // stage6 = Matriz (visualización IROs scored) — done solo cuando ≥3 IROs tienen score
  // (hasIros = batch done, pero sin scores la matriz no muestra nada útil)
  const scoredIros = iros.filter(i => i.incluido && i.score_impacto && i.score_financiero).length;
  const stage6Status: StageStatus = scoredIros >= 3
    ? "done"
    : hasIros
      ? "active"
      : iros.length > 0
        ? "pending"
        : "locked";

  // stage7 = NIS / IBSO — locked si no hay IROs completos y tampoco datos NIS existentes
  const stage7Status: StageStatus = hasNis
    ? "done"
    : hasIros
    ? "active"
    : nisRows.length > 0
    ? "pending"
    : "locked";

  // stage8 = Resumen ejecutivo IA — locked si no hay IROs calificados
  const hasResumen = resumenResp?.data?.status === "done";
  const stage8Status: StageStatus = hasResumen
    ? "done"
    : hasIros
    ? "active"
    : "locked";

  // stage9 = Validación con el cliente
  const validacionRec = validacionResp?.data ?? null;
  const includedIros  = iros.filter((i) => i.incluido);
  const allIrosDecided =
    includedIros.length > 0 &&
    includedIros.every((i) => validacionRec?.iro_decisions?.[i.id]?.decision);
  // Si hay IROs pero todos excluidos por el consultor, no hay nada que validar → done
  const noIncludedIros = hasIros && includedIros.length === 0;
  const stage9Status: StageStatus = allIrosDecided || noIncludedIros
    ? "done"
    : hasResumen
    ? "active"
    : "locked";

  // stage10 = Reporte (etapa final — requiere benchmark + IROs + resumen IA)
  const stage10Status: StageStatus = hasReport
    ? "done"
    : hasBenchmark && hasIros && hasResumen
    ? "active"
    : latestReport !== null
    ? "pending"
    : "locked";

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

  // Badge [N/10] — notifica al padre cuántas etapas están completas
  const stageStatuses: StageStatus[] = [
    stage1Status, stage2Status, stage3Status, stage4Status, stage4bStatus,
    stage5Status, stage6Status, stage7Status, stage8Status, stage9Status, stage10Status,
  ];
  const dmDoneCount = stageStatuses.filter((s) => s === "done").length;
  useEffect(() => {
    onStagesProgress?.(dmDoneCount, 11);
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
  }, [stage1Status, stage2Status, stage3Status, stage4Status, stage4bStatus, stage5Status, stage6Status, stage7Status, stage8Status, stage9Status, stage10Status]);

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
  const stagesData: Array<{ label: string; status: StageStatus; sectionId: string; doneDate?: string | null; count?: string; lockedReason?: string }> = [
    { label: "Contexto",       status: stage1Status,  sectionId: "dm-sec-contexto" },
    { label: "Referentes",     status: stage2Status,  sectionId: "dm-sec-referentes",
      lockedReason: "Completa el Cuestionario de Contexto para habilitar esta etapa",
      count: (referentesRec?.enabled_frameworks ?? []).length > 0
        ? `${(referentesRec?.enabled_frameworks ?? []).length} ref.`
        : undefined },
    { label: "Emp. ref.",      status: stage3Status,  sectionId: "dm-sec-benchmark-empresas",
      lockedReason: "Completa los Referentes de Sostenibilidad primero",
      count: (benchmarkEmpresasRec?.enabled_companies ?? []).length > 0
        ? `${(benchmarkEmpresasRec?.enabled_companies ?? []).length} emp.`
        : undefined },
    { label: "Benchmark",      status: stage4Status,  sectionId: "dm-sec-benchmark", doneDate: latestResult?.created_at,
      lockedReason: "Selecciona y valida empresas de referencia en la etapa anterior",
      count: validatedCompanies > 0 ? `${validatedCompanies} val.` : undefined },
    { label: "IROs ref.",      status: stage4bStatus, sectionId: "dm-sec-benchmark-iros",
      lockedReason: "Ejecuta el Benchmark competitivo primero",
      count: benchmarkIrosDoneCount > 0 ? `${benchmarkIrosDoneCount}/${validatedCompanies} emp.` : undefined },
    { label: "IROs",           status: stage5Status,  sectionId: "dm-sec-iros",
      lockedReason: "Extrae los IROs de las empresas de referencia (etapa anterior) primero",
      count: iros.length > 0 ? `${iros.length} IROs` : undefined },
    { label: "Matriz",         status: stage6Status,  sectionId: "dm-sec-matriz",
      lockedReason: "Genera y califica al menos 3 IROs del cliente para visualizar la Matriz",
      count: quadrantCounts.doble_material > 0 ? `${quadrantCounts.doble_material} DM` : undefined },
    { label: "NIS/IBSO",       status: stage7Status,  sectionId: "dm-sec-nis",
      lockedReason: "Genera los IROs del cliente primero" },
    { label: "Resumen IA",     status: stage8Status,  sectionId: "dm-sec-resumen",
      lockedReason: "Genera y califica los IROs del cliente primero" },
    { label: "Validación",     status: stage9Status,  sectionId: "dm-sec-validacion",
      lockedReason: "Genera el Resumen Ejecutivo IA primero" },
    { label: "Reporte",        status: stage10Status, sectionId: "dm-sec-reporte", doneDate: latestReport?.created_at,
      lockedReason: "Requiere Benchmark + IROs calificados + Resumen IA completados" },
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
      {/* ── Panel maestro: síntesis ejecutiva del estudio ── */}
      {dmDoneCount > 0 && (() => {
        const nextStage = stagesData.find((s) => s.status === "active" || s.status === "pending");
        const pct = Math.round((dmDoneCount / 11) * 100);
        return (
          <div className="border border-slate-200 rounded bg-white shadow-sm overflow-hidden">
            <div className="grid grid-cols-3 divide-x divide-slate-100">
              {/* Col 1 — Progreso global */}
              <div className="px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Progreso del estudio</p>
                <div className="flex items-end gap-2 mb-1.5">
                  <span className="text-2xl font-bold tabular-nums text-slate-700 leading-none">{dmDoneCount}</span>
                  <span className="text-xs text-slate-400 mb-0.5">/ 11 etapas</span>
                  <span className="ml-auto text-xs font-bold tabular-nums text-brand-primary">{pct}%</span>
                </div>
                <div className="h-1 bg-slate-100 overflow-hidden">
                  <div className="h-full bg-brand-primary transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>
                {/* Mini pipeline de etapas */}
                <div className="flex gap-px mt-2" aria-hidden="true">
                  {stageStatuses.map((s, i) => (
                    <div
                      key={i}
                      className={`flex-1 h-0.5 rounded-sm ${s === "done" ? "bg-brand-primary" : s === "active" || s === "pending" ? "bg-amber-400" : "bg-slate-200"}`}
                    />
                  ))}
                </div>
              </div>

              {/* Col 2 — KPIs críticos */}
              <div className="px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Hallazgos clave</p>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-600 flex items-center gap-1">
                      <span className="inline-block w-2 h-2 rounded-full bg-rose-400 shrink-0" />
                      Temas doble material
                    </span>
                    <span className={`tabular-nums text-sm font-bold ${quadrantCounts.doble_material > 0 ? "text-rose-600" : "text-slate-300"}`}>
                      {quadrantCounts.doble_material > 0 ? quadrantCounts.doble_material : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-600 flex items-center gap-1">
                      <span className="inline-block w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                      IROs calificados
                    </span>
                    <span className={`tabular-nums text-sm font-bold ${iros.filter(i => i.incluido && i.score_impacto && i.score_financiero).length > 0 ? "text-amber-600" : "text-slate-300"}`}>
                      {iros.filter(i => i.incluido && i.score_impacto && i.score_financiero).length > 0
                        ? `${iros.filter(i => i.incluido && i.score_impacto && i.score_financiero).length}/${iros.filter(i => i.incluido).length}`
                        : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-600 flex items-center gap-1">
                      <span className="inline-block w-2 h-2 rounded-full bg-rose-300 shrink-0" />
                      Brechas de datos críticas
                    </span>
                    <span className={`tabular-nums text-sm font-bold ${quadrantCounts.brechas_criticas > 0 ? "text-rose-600" : "text-slate-300"}`}>
                      {quadrantCounts.brechas_criticas > 0 ? quadrantCounts.brechas_criticas : "—"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Col 3 — Siguiente paso */}
              <div className="px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                  {nextStage ? "Siguiente paso" : "Estado del estudio"}
                </p>
                {nextStage ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${nextStage.status === "active" ? "bg-brand-primary" : "bg-amber-400"}`} />
                      <span className="text-xs font-semibold text-slate-700 leading-snug">{nextStage.label}</span>
                    </div>
                    {nextStage.lockedReason && nextStage.status !== "active" && (
                      <p className="text-[10px] text-slate-400 leading-snug">{nextStage.lockedReason}</p>
                    )}
                    <button
                      type="button"
                      onClick={() => navigateTo(nextStage.sectionId)}
                      className="mt-1 text-[11px] font-semibold text-brand-primary hover:text-brand-primary-dark transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 rounded-sm"
                    >
                      Ir a {nextStage.label} →
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-xs font-semibold text-emerald-700">Estudio completo</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Sentinel: IntersectionObserver lo monitorea — al salir de viewport, stepper queda pinned */}
      <div ref={stepperSentinelRef} className="h-px -mb-px" aria-hidden="true" />
      {/* ── Stepper V3 — card con pill bar + progress + chips ── */}
      <div className={`bg-white border border-slate-200 rounded shadow-sm sticky top-[96px] z-20 transition-all ${stepperCompact ? "shadow-none border-x-0 border-t-0 rounded-none" : ""}`}>
        <div className={`flex items-center gap-2 px-4 transition-all ${stepperCompact ? "py-1" : "py-2"}`}>
          {/* Pills — ancho completo distribuido. overflow-x-auto como fallback en mobile */}
          <div
            role="tablist"
            aria-label="Etapas del estudio de Doble Materialidad"
            className="flex items-center flex-1 min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
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
                    compact={stepperCompact}
                    className="flex-1"
                    subtitle={subtitle}
                    sectionId={s.sectionId}
                    title={
                      s.status === "locked" && s.lockedReason
                        ? `🔒 ${s.lockedReason}`
                        : `${s.label} — ${subtitle}`
                    }
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
        isNextLocked={stage2Status === "locked"}
        subtitle="Estado del llenado — base para el benchmark y los IROs"
        headerRight={
          questionnaireProgress && questionnaireProgress.total > 0 ? (
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="h-[3px] w-14 bg-slate-200 overflow-hidden">
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

      {/* ── Etapa 2: Referentes de Sostenibilidad ── */}
      <CollapsibleStageSection
        id="dm-sec-referentes"
        stageNum={2}
        label="Referentes de Sostenibilidad"
        status={stage2Status}
        accent="border-l-green-600"
        isActive={activeStageId === "dm-sec-referentes"}
        isNextLocked={stage3Status === "locked"}
        lockReason="Completa el cuestionario de contexto del cliente (Etapa 1) para identificar los referentes de sostenibilidad aplicables al sector."
        subtitle="Frameworks de sostenibilidad aplicables al sector · tabla de temas y agrupación"
        headerRight={
          (referentesRec?.enabled_frameworks ?? []).length > 0 ? (
            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded-sm font-bold whitespace-nowrap tabular-nums">
              {(referentesRec?.enabled_frameworks ?? []).length} referentes activos
            </span>
          ) : null
        }
      >
        <ReferentesSection
          clientId={clientId}
          clientName={clientName}
          onDataMutate={() => void mutateReferentes()}
        />
      </CollapsibleStageSection>

      {/* ── Etapa 3: Benchmark de empresas ── */}
      <CollapsibleStageSection
        id="dm-sec-benchmark-empresas"
        stageNum={3}
        label="Empresas de referencia"
        status={stage3Status}
        accent="border-l-cyan-600"
        isActive={activeStageId === "dm-sec-benchmark-empresas"}
        isNextLocked={stage4Status === "locked"}
        lockReason="Confirma los referentes de sostenibilidad (Etapa 2) para identificar las empresas de referencia del benchmark."
        subtitle="Identifica empresas con informes de sostenibilidad públicos · valida las que entran al benchmark"
        headerRight={null}
      >
        <BenchmarkEmpresasSection
          clientId={clientId}
          onDataMutate={() => void mutateBenchmarkEmpresas()}
        />
      </CollapsibleStageSection>

      {/* ── Etapa 4: Benchmark ── */}
      <CollapsibleStageSection
        id="dm-sec-benchmark"
        stageNum={4}
        label="Benchmark competitivo"
        status={stage4Status}
        accent="border-l-blue-600"
        isActive={activeStageId === "dm-sec-benchmark"}
        isNextLocked={stage4bStatus === "locked"}
        lockReason="Valida las empresas de referencia (Etapa 3) para ejecutar el benchmark competitivo ESG. Las empresas del benchmark deben estar confirmadas antes de comparar desempeño."
        subtitle="Compara el desempeño ESG contra las empresas de referencia seleccionadas en Etapa 3"
        headerRight={null}
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
            startBenchmarkPolling(latestResult?.id);
            void mutateBenchmark();
          }}
          referentCompanies={(benchmarkEmpresasRec?.proposed_companies ?? []).filter(
            (c) => (benchmarkEmpresasRec?.enabled_companies ?? []).includes(c.id)
          )}
          onGoToIros={() => navigateTo("dm-sec-iros")}
        />

      </CollapsibleStageSection>

      {/* ── Etapa 5 — IROs de empresas de referencia ── */}
      <CollapsibleStageSection
        id="dm-sec-benchmark-iros"
        stageNum={5}
        label="IROs de empresas de referencia"
        status={stage4bStatus}
        accent="border-l-indigo-600"
        isActive={activeStageId === "dm-sec-benchmark-iros"}
        isNextLocked={stage5Status === "locked"}
        lockReason="Ejecuta el benchmark competitivo (Etapa 4) para analizar los IROs de las empresas de referencia."
        subtitle="Impactos, Riesgos y Oportunidades identificados en las empresas del benchmark · base comparativa para el inventario del cliente"
        headerRight={
          hasBenchmarkIros ? (
            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded-sm font-bold whitespace-nowrap tabular-nums">
              {validatedCompanies} completadas
            </span>
          ) : benchmarkIrosDoneCount > 0 ? (
            <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-1 rounded-sm font-bold whitespace-nowrap tabular-nums">
              {benchmarkIrosDoneCount}/{validatedCompanies} generadas
            </span>
          ) : null
        }
      >
        <BenchmarkIrosSection
          clientId={clientId}
          companies={companies}
          clientSector={clientSector}
          onIrosAdapted={() => void mutateIros()}
        />
      </CollapsibleStageSection>

      {/* ── Etapa 6 — IROs del cliente ── */}
      <CollapsibleStageSection
        id="dm-sec-iros"
        stageNum={6}
        label="Inventario de IROs"
        status={stage5Status}
        accent="border-l-violet-600"
        isActive={activeStageId === "dm-sec-iros"}
        isNextLocked={stage6Status === "locked"}
        lockReason="Completa los IROs de las empresas de referencia (Etapa 5) para identificar y calificar los Impactos, Riesgos y Oportunidades del cliente."
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
            startIroPolling();
            void mutateIros();
          }}
        />
      </CollapsibleStageSection>

      {/* ── Etapa 7 — Matriz de Doble Materialidad ── */}
      <CollapsibleStageSection
        id="dm-sec-matriz"
        stageNum={7}
        label="Matriz de Doble Materialidad"
        status={stage6Status}
        accent="border-l-brand-primary"
        isActive={activeStageId === "dm-sec-matriz"}
        isNextLocked={stage7Status === "locked"}
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

      {/* ── Etapa 8 — NIS / IBSO ── */}
      <CollapsibleStageSection
        id="dm-sec-nis"
        stageNum={8}
        label="Brechas de información por área material"
        status={stage7Status}
        accent="border-l-amber-600"
        isActive={activeStageId === "dm-sec-nis"}
        isNextLocked={stage8Status === "locked"}
        lockReason="Completa el inventario de IROs (Etapa 6) para analizar las brechas de información por área material."
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

      {/* ── Etapa 9 — Resumen ejecutivo IA ── */}
      <CollapsibleStageSection
        id="dm-sec-resumen"
        stageNum={9}
        label="Resumen Ejecutivo (IA)"
        status={stage8Status}
        accent="border-l-sky-600"
        isActive={activeStageId === "dm-sec-resumen"}
        isNextLocked={stage9Status === "locked"}
        lockReason="Completa el inventario de IROs (Etapa 6) para generar el resumen ejecutivo con IA."
        subtitle="Narrativa generada por IA con insights, trade-offs y recomendaciones estratégicas"
      >
        <ResumenEjecutivoSection clientId={clientId} quadrantCounts={quadrantCounts} />
      </CollapsibleStageSection>

      {/* ── Etapa 10 — Validación con el cliente ── */}
      <CollapsibleStageSection
        id="dm-sec-validacion"
        stageNum={10}
        label="Validación con el cliente"
        status={stage9Status}
        accent="border-l-amber-500"
        isActive={activeStageId === "dm-sec-validacion"}
        isNextLocked={stage10Status === "locked"}
        lockReason="Genera el resumen ejecutivo (Etapa 9) para iniciar la sesión de validación con el cliente."
        subtitle="Decisiones del cliente sobre cada IRO incluido — aprobación, ajuste o descarte · paralela al Reporte (no bloquea)"
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

      {/* ── Etapa 11 — Reporte (etapa final) ── */}
      <CollapsibleStageSection
        id="dm-sec-reporte"
        stageNum={11}
        label="Reporte de Doble Materialidad"
        status={stage10Status}
        accent="border-l-emerald-600"
        isActive={activeStageId === "dm-sec-reporte"}
        lockReason="Completa el benchmark (Etapa 4), los IROs de empresas de referencia (Etapa 5), el inventario de IROs del cliente (Etapa 6) y el resumen ejecutivo (Etapa 9) para generar el reporte final de doble materialidad."
        subtitle="Documento final consolidado · benchmark + IROs + matriz + validación cliente"
        headerRight={
          hasReport ? (
            <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-1 rounded-sm font-bold whitespace-nowrap">
              Listo para descarga
            </span>
          ) : stage10Status === "active" && stage9Status !== "done" ? (
            <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded-sm whitespace-nowrap italic">
              Validación cliente: opcional
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
            startReportPolling(latestReport?.id);
            void mutateReport();
          }}
        />
      </CollapsibleStageSection>

    </div>
  );
}
