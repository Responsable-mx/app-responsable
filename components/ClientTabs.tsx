"use client";

import { Fragment, useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import useSWR from "swr";
import type { Client } from "@/lib/clients";
import { getFieldValue, type FieldValue, type QuestionnaireBundle } from "@/lib/questionnaires/types";


import { TabErrorBoundary } from "@/components/TabErrorBoundary";
import { SkeletonDetail, SkeletonTable } from "@/components/ui/Skeleton";

// Los 6 tabs restantes son lazy: su JS (incluyendo react-markdown, swr fetchers,
// scatter plot) solo descarga cuando el usuario abre el tab por primera vez.
const QuestionnaireTab = dynamic(
  () => import("@/components/questionnaire/QuestionnaireTab").then((m) => m.QuestionnaireTab),
  { loading: () => <SkeletonDetail />, ssr: false }
);
const TeamTab = dynamic(
  () => import("@/components/equipo/TeamTab").then((m) => m.TeamTab),
  { loading: () => <SkeletonTable />, ssr: false }
);
const DocumentsTab = dynamic(
  () => import("@/components/documents/DocumentsTab").then((m) => m.DocumentsTab),
  { loading: () => <SkeletonTable />, ssr: false }
);
const DoubleMaterialidadTab = dynamic(
  () => import("@/components/doble-materialidad/DoubleMaterialidadTab").then((m) => m.DoubleMaterialidadTab),
  { loading: () => <SkeletonDetail />, ssr: false }
);

type Tab = "cuestionario" | "equipo" | "documentos" | "doble-materialidad-ia";

type Props = {
  client: Client;
  completeness: { filled: number; total: number };
  isAdmin?: boolean;
  // Datos prefetched server-side. SWR los usa como fallback inicial y revalida
  // en background. Evita waterfall de 2 fetches al montar tabs.
  initialQuestionnaire?: QuestionnaireBundle | null;
};

const questionnaireFetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<{ data: QuestionnaireBundle }>;
  });

// Type ligero — sólo campos usados en el tooltip del badge tab Documentos.
// Endpoint devuelve más; pinear acá mantiene el SWR cache estrecho.
type DocLite = {
  id: string;
  has_content: boolean;
  parse_status: "pending" | "ok" | "failed";
  kind: "general" | "sustainability_report" | "financial_report";
  created_at: string;
};
const docsFetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<{ data: DocLite[] }>;
  });


export function ClientTabs({
  client,
  completeness,
  isAdmin = false,
  initialQuestionnaire,
}: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();

  // SWR declarados ANTES de hasDmService para que el tab DM-IA sea reactivo:
  // cuando QuestionnaireTab llama mutate() tras guardar, el SWR global se actualiza,
  // hasDmService recomputa y el tab aparece sin reload.
  // fallbackData garantiza que el primer render use datos server-side (sin waterfall).
  const { data: questionnaireResp, error: questionnaireError } = useSWR(
    `/api/clients/${client.id}/questionnaire`,
    questionnaireFetcher,
    {
      revalidateOnFocus: false,
      revalidateOnMount: !initialQuestionnaire,
      fallbackData: initialQuestionnaire ? { data: initialQuestionnaire } : undefined,
      onError: (e: unknown) => console.warn("[ClientTabs] questionnaire revalidation failed:", e),
    }
  );
  void questionnaireError;

  // Tab DM-IA visible cuando client.services incluye "doble_materialidad_ia".
  // Fuente de verdad única: perfil del cliente (editable desde /editar).
  const hasDmService = client.services?.includes("doble_materialidad_ia") ?? false;
  const VALID_TABS: Tab[] = ["cuestionario", "equipo", "documentos", ...(hasDmService ? ["doble-materialidad-ia" as Tab] : [])];
  // Compat: ?tab=resumen redirige a cuestionario (tab eliminado may-2026, strip Tier 2 lo reemplaza)
  const rawTab = searchParams?.get("tab") as Tab | "resumen" | null;
  const initialTab: Tab = rawTab === "resumen" || !rawTab ? "cuestionario" : (rawTab as Tab);
  const [tab, setTab] = useState<Tab>(
    VALID_TABS.includes(initialTab) ? initialTab : "cuestionario"
  );

  useEffect(() => {
    const t = searchParams?.get("tab") as Tab | null;
    if (t && VALID_TABS.includes(t)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync de URL → state, no loop
      setTab(t);
      // Cerrar dropdown del strip si se navega a cuestionario (donde el botón no existe)
      if (t === "cuestionario") setShowStripDropdown(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Limpia autoFill=1 de la URL tras consumirlo para evitar retrigger en F5/bookmark.
  useEffect(() => {
    if (searchParams?.get("autoFill") === "1") {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("autoFill");
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
    }
    // Solo al montar — queremos limpiar una sola vez
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restaurar última tab visitada desde localStorage (solo si URL no trae ?tab=)
  useEffect(() => {
    if (rawTab) return; // URL gana sobre localStorage
    if (typeof window === "undefined") return;
    try {
      const saved = window.localStorage.getItem(`client-tab-${client.id}`) as Tab | null;
      if (saved && VALID_TABS.includes(saved) && saved !== tab) {
        setTab(saved);
        router.replace(`?tab=${saved}`, { scroll: false });
      }
    } catch {}
    // Solo al montar — restauración inicial
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goToTab(t: Tab) {
    setTab(t);
    router.replace(`?tab=${t}`, { scroll: false });
    // Cerrar dropdown del strip al cambiar de tab (evita estado huérfano si tab=cuestionario oculta botón)
    setShowStripDropdown(false);
    // Persist última tab por cliente — restaura al volver sin ?tab en URL
    if (typeof window !== "undefined") {
      try { window.localStorage.setItem(`client-tab-${client.id}`, t); } catch {}
    }
  }

  // Badge [N/8] en tab DM-IA — se actualiza cuando DoubleMaterialidadTab monta
  const [dmProgress, setDmProgress] = useState<{ done: number; total: number } | null>(null);

  // Extracción disparada desde DocumentsTab → QuestionnaireTab la consume
  const [pendingDocExtract, setPendingDocExtract] = useState<{ stepKey: string; text: string } | null>(null);

  function handleExtractForStep(stepKey: string, text: string) {
    setPendingDocExtract({ stepKey, text });
    goToTab("cuestionario");
  }

  // Strip Tier 2: estado del dropdown de avance por paso
  const [showStripDropdown, setShowStripDropdown] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);
  // Cerrar dropdown al click fuera
  useEffect(() => {
    if (!showStripDropdown) return;
    const onDown = (e: MouseEvent) => {
      if (!stripRef.current?.contains(e.target as Node)) setShowStripDropdown(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showStripDropdown]);

  // Strip Tier 2: colapsable. Default expandido. Estado persistido por cliente
  // en localStorage — el consultor que ya conoce el contexto del cliente puede
  // colapsar para ganar ~40px verticales en todas las tabs.
  const stripKey = `clientStripCollapsed:${client.id}`;
  const [stripCollapsed, setStripCollapsed] = useState(false);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(stripKey);
      if (stored === "1") setStripCollapsed(true);
    } catch {
      /* localStorage no disponible (SSR/private mode) — usa default */
    }
    // Solo al cambiar de cliente
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id]);
  function toggleStripCollapsed() {
    setStripCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(stripKey, next ? "1" : "0");
      } catch {
        /* no-op */
      }
      return next;
    });
  }

  // Tab scroll indicator — muestra flecha derecha cuando hay overflow horizontal
  const tablistRef = useRef<HTMLDivElement>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const checkTabScroll = useCallback(() => {
    const el = tablistRef.current;
    if (!el) return;
    setCanScrollRight(el.scrollWidth > el.clientWidth + el.scrollLeft + 4);
  }, []);
  useEffect(() => {
    checkTabScroll();
    const el = tablistRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkTabScroll, { passive: true });
    const ro = new ResizeObserver(checkTabScroll);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", checkTabScroll);
      ro.disconnect();
    };
  }, [checkTabScroll]);

  // SWR docs — misma URL que DocumentsTab → SWR deduplica; sin llamada extra cuando ese tab ya cargó
  const { data: docsData } = useSWR(
    `/api/clients/${client.id}/documents`,
    docsFetcher,
    { revalidateOnFocus: false }
  );
  // null = aún cargando; 0 = sin documentos; N = N docs
  const docCount: number | null = docsData ? docsData.data.length : null;

  // Métricas de cobertura para tooltip del badge tab Documentos.
  // Vive en ClientTabs (no en DocumentsTab) para que el usuario las vea sin
  // tener que estar dentro del tab — patrón Linear/Notion (info en badge).
  const docsTooltip = (() => {
    if (!docsData) return undefined;
    const ds = docsData.data;
    if (ds.length === 0) return "Sin documentos";
    const withContent = ds.filter((d) => d.has_content).length;
    const failed = ds.filter((d) => d.parse_status === "failed").length;
    const last = ds[0]?.created_at;
    const parts = [`${ds.length} doc${ds.length === 1 ? "" : "s"}`];
    parts.push(`${withContent} con contenido`);
    if (failed > 0) parts.push(`${failed} sin texto`);
    if (last) {
      parts.push(
        `último ${new Date(last).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}`
      );
    }
    return parts.join(" · ");
  })();

  const questionnaireProgress = questionnaireResp?.data.progress
    ? {
        filled: questionnaireResp.data.progress.filledFields,
        total: questionnaireResp.data.progress.totalFields,
      }
    : null;
  const schema = questionnaireResp?.data.template.schema;

  // Lista de pasos para el selector de extracción en DocumentsTab
  const questionnaireSteps: { key: string; title: string }[] =
    schema && "steps" in schema
      ? (schema as { steps: { key: string; title: string }[] }).steps.map((s) => ({
          key: s.key,
          title: s.title,
        }))
      : [];

  // Badge Cuestionario: pasos individuales del wizard (X/9 — consistente con sidebar del wizard).
  // Antes contaba 5 macro-grupos; el badge ahora refleja los pasos reales (paridad con sidebar).
  const sectionProg = questionnaireResp?.data.progress.sectionProgress ?? {};
  const wizardStepKeys = Object.keys(sectionProg);
  const totalSteps = wizardStepKeys.length || null;
  const completedSteps = wizardStepKeys.filter((k) => (sectionProg[k]?.pct ?? 0) === 100).length;
  const overallPct = questionnaireResp?.data.progress.pct ?? 0;

  // Strip Tier 2 — extracción de KPIs ejecutivos desde respuestas del cuestionario.
  // Field keys del schema canónico Cuestionario_Contexto_Negocio.md.
  const qResponses = questionnaireResp?.data.response?.responses ?? {};
  const genResp = (qResponses["informacion-general"] ?? {}) as Record<string, unknown>;
  const sostResp = (qResponses["estrategia-y-madurez"] ?? {}) as Record<string, unknown>;

  // ─ Limpieza de redundancias: el label de cada KPI carga la unidad/contexto,
  //   así que el value no debe repetirla. "3,400 colaboradores" + label
  //   "COLABORADORES" = duplicado → mostrar solo "3,400". "Distintivo ESR
  //   (Empresa Socialmente Responsable)" + label "CERTIFICACIÓN" + chip "ESR"
  //   en Tier 1 = triplicado → mostrar solo "ESR" (limpio).

  // Empleados: extrae primer número significativo o limpia sustantivos redundantes.
  function cleanCount(v: FieldValue): FieldValue {
    if (typeof v === "number") return v;
    if (typeof v !== "string") return v;
    const numMatch = v.match(/[\d][\d.,\s]*\d|\d/);
    if (numMatch) {
      const n = parseInt(numMatch[0].replace(/[^\d]/g, ""), 10);
      if (!isNaN(n)) return n;
    }
    // Fallback: quita sustantivos comunes que duplican el label
    return v.replace(/\b(colaborador(?:es)?|empleado(?:s)?|persona(?:s)?|trabajador(?:es)?|miembro(?:s)?)\b/gi, "").replace(/\s+/g, " ").trim();
  }

  // Certificaciones: quita prefijo "Distintivo " + paréntesis explicativos.
  // "Distintivo ESR (Empresa Socialmente Responsable) 2025" → "ESR 2025"
  function cleanCert(v: FieldValue): FieldValue {
    function clean(s: string): string {
      return s
        .replace(/^\s*distintivo\s+/i, "")
        .replace(/\s*\([^)]*\)\s*/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }
    if (typeof v === "string") return clean(v);
    if (Array.isArray(v)) return (v as unknown[]).map((x) => (typeof x === "string" ? clean(x) : String(x))) as string[];
    return v;
  }

  const stripEmpleados = cleanCount(getFieldValue(genResp["empleados"]));
  const stripPaises    = getFieldValue(genResp["paises"]);
  const stripCerts     = cleanCert(getFieldValue(sostResp["certificaciones"]));
  const stripModelo    = getFieldValue(sostResp["modelo_sostenibilidad"]);

  // KPI Presencia visible solo si hay >1 país (1 país solo = ya implícito en sector).
  const showPresencia = (() => {
    if (stripPaises === null || stripPaises === undefined) return true; // dejar como "—" CTA
    if (Array.isArray(stripPaises)) return stripPaises.filter(Boolean).length > 1;
    if (typeof stripPaises === "string") {
      return stripPaises.split(/[,·]|\sy\s/i).map((s) => s.trim()).filter(Boolean).length > 1;
    }
    return true;
  })();

  // Jump a un paso específico del wizard — usado por KPIs vacíos y mini-dots.
  function jumpToStep(stepKey: string) {
    const idx = questionnaireSteps.findIndex((s) => s.key === stepKey);
    if (idx < 0) return;
    goToTab("cuestionario");
    router.replace(`?tab=cuestionario&step=${idx + 1}`, { scroll: false });
  }

  // Trunca por palabra Y antes de paréntesis abierto. Evita "Distintivo ESR (Empres…":
  // si hay '(' después del lastSpace, corta antes del '(' (deja paréntesis huérfano fuera).
  function truncateByWord(s: string, maxLen: number): string {
    if (s.length <= maxLen) return s;
    const slice = s.slice(0, maxLen);
    const lastSpace = slice.lastIndexOf(" ");
    const lastParen = slice.lastIndexOf("(");
    const cut = Math.max(lastSpace, lastParen);
    const base = cut > Math.floor(maxLen * 0.5) ? slice.slice(0, cut) : slice;
    // Limpia trailing: comas, dos puntos, paréntesis sueltos, espacios
    return base.replace(/[\s,;:(]+$/, "") + "…";
  }

  // Disclaimers IA que aparecen como valor en campos research — no son KPIs reales.
  // Si el campo empieza con uno de estos, mejor mostrar "—" en el strip.
  // Nota: \w* en lugar de \b para capturar "información", "informaciones", etc.
  const DISCLAIMER_PREFIXES = /^(basado en (info\w*|datos)|estimado|sujeto a|pendiente de|informaci[óo]n p[úu]blica|no disponible|no aplica|sin informaci[óo]n|por confirmar|n\/a\b)/i;

  function fmtKpi(v: FieldValue, maxLen = 24): string {
    if (v === null || v === undefined) return "—";
    if (typeof v === "number") {
      // Separador de miles es-MX: 3400 → "3,400"
      return Number.isFinite(v) ? v.toLocaleString("es-MX") : "—";
    }
    if (Array.isArray(v)) {
      const joined = v.filter(Boolean).map(String).join(" · ");
      if (!joined) return "—";
      if (DISCLAIMER_PREFIXES.test(joined)) return "—";
      return truncateByWord(joined, maxLen);
    }
    if (typeof v === "boolean") return v ? "Sí" : "No";
    let s = String(v).trim();
    if (!s) return "—";
    if (DISCLAIMER_PREFIXES.test(s)) return "—";
    // Numérico embebido (ej "3400 colaboradores") → reformatea con separador miles.
    // EXCLUYE años (1900-2099): no queremos "2,025" en lugar de "2025".
    s = s.replace(/\b(\d{4,})\b/g, (m) => {
      const n = Number(m);
      if (n >= 1900 && n <= 2099) return m; // año, sin separador
      return n.toLocaleString("es-MX");
    });
    return truncateByWord(s, maxLen);
  }

  return (
    <div>
      {/* Strip Tier 2 — contexto ejecutivo del cliente.
          Reemplaza el tab Resumen eliminado may-2026: 4 KPIs extraídos del cuestionario
          + progreso global con dropdown de avance por paso.
          Sticky: cuando Tier 1 sale de viewport, el strip queda fijo arriba con KPIs + progreso. */}
      <div
        ref={stripRef}
        className="sticky top-0 z-30 border-t-2 border-b border-slate-200 bg-white mb-0 shadow-sm"
      >
        <div className={`max-w-6xl mx-auto flex items-center gap-3 flex-wrap ${stripCollapsed ? "py-1" : "py-2"}`}>
          {/* KPIs ejecutivos — sólo en modo expandido. Modo colapsado deja
              progress global + toggle, ahorra ~40px en tabs heavy-data.
              Empty KPI (valor "—") es clickeable → jump al wizard step relacionado. */}
          {!stripCollapsed && (
            <>
              {(() => {
                const kpis: Array<{
                  iconPath: string;
                  label: string;
                  value: string;
                  full: string;
                  stepKey: string;
                  numeric?: boolean;
                  show?: boolean;
                }> = [
                  {
                    iconPath: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
                    label: "Colaboradores",
                    value: fmtKpi(stripEmpleados),
                    full: fmtKpi(stripEmpleados, 200),
                    stepKey: "informacion-general",
                    numeric: true,
                  },
                  {
                    iconPath: "M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
                    label: "Presencia",
                    value: fmtKpi(stripPaises),
                    full: fmtKpi(stripPaises, 200),
                    stepKey: "informacion-general",
                    show: showPresencia,
                  },
                  {
                    iconPath: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
                    label: "Certificación",
                    value: fmtKpi(stripCerts, 26),
                    full: fmtKpi(stripCerts, 200),
                    stepKey: "estrategia-y-madurez",
                  },
                  {
                    iconPath: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
                    label: "Modelo ESG",
                    value: fmtKpi(stripModelo, 26),
                    full: fmtKpi(stripModelo, 200),
                    stepKey: "estrategia-y-madurez",
                  },
                ];
                return kpis.filter((k) => k.show !== false).map((k, i, arr) => {
                  const isEmpty = k.value === "—";
                  const valueCls = `text-xs font-semibold truncate ${k.numeric ? "tabular-nums" : ""} ${isEmpty ? "text-slate-400" : "text-slate-900"}`;
                  const inner = (
                    <>
                      <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={k.iconPath} />
                      </svg>
                      <div className="min-w-0">
                        <div className={valueCls}>
                          {isEmpty ? (
                            <span className="inline-flex items-center gap-0.5">
                              <span>—</span>
                              <span className="text-brand-primary-dark text-[10px]" aria-hidden="true">+</span>
                            </span>
                          ) : (
                            k.value
                          )}
                        </div>
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{k.label}</div>
                      </div>
                    </>
                  );
                  return (
                    <Fragment key={k.label}>
                      {isEmpty ? (
                        <button
                          type="button"
                          onClick={() => jumpToStep(k.stepKey)}
                          className="flex items-center gap-2 min-w-0 max-w-[26ch] hover:bg-slate-100 rounded-sm px-1 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 transition-colors cursor-pointer"
                          title={`Capturar ${k.label} ahora`}
                          aria-label={`Capturar ${k.label} en cuestionario`}
                        >
                          {inner}
                        </button>
                      ) : (
                        <div className="flex items-center gap-2 min-w-0 max-w-[26ch] cursor-help" title={k.full}>
                          {inner}
                        </div>
                      )}
                      {i < arr.length - 1 && <div className="w-px h-7 bg-slate-200 shrink-0 mx-1" aria-hidden="true" />}
                    </Fragment>
                  );
                });
              })()}
            </>
          )}

          {/* Progreso global — visible siempre. Dropdown solo cuando NO estamos
              en tab Cuestionario (allí el sidebar del wizard ya muestra los 9
              pasos con su progreso → dropdown sería redundante). Mini-dots
              inline dan glance state. */}
          <div className={`flex items-center gap-2 relative ${!stripCollapsed ? "ml-auto pl-5 border-l border-slate-200" : ""}`}>
            <span className="text-[11px] text-slate-600 tabular-nums whitespace-nowrap">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mr-1">Cuestionario</span>
              {questionnaireProgress?.filled ?? "–"}/{questionnaireProgress?.total ?? "–"}
            </span>
            <div className="w-20 h-1.5 bg-slate-200 shrink-0" aria-hidden="true">
              <div className="h-1.5 bg-brand-primary transition-all" style={{ width: `${overallPct}%` }} />
            </div>
            {/* Mini-dots: 1 dot por paso, click → jump. Glance del estado de los 9 pasos sin abrir dropdown */}
            {questionnaireSteps.length > 0 && (
              <div className="flex items-center gap-0.5 shrink-0" role="group" aria-label="Avance por paso (mini)">
                {questionnaireSteps.map((step, i) => {
                  const pct = sectionProg[step.key]?.pct ?? 0;
                  const dotCls = pct === 100 ? "bg-brand-primary" : pct > 0 ? "bg-brand-accent" : "bg-slate-300";
                  return (
                    <button
                      key={step.key}
                      type="button"
                      onClick={() => jumpToStep(step.key)}
                      className={`w-2 h-2 rounded-full ${dotCls} hover:ring-2 hover:ring-brand-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 transition-shadow`}
                      title={`${i + 1}. ${step.title} — ${pct}%`}
                      aria-label={`Paso ${i + 1}: ${step.title}, ${pct} por ciento completado`}
                    />
                  );
                })}
              </div>
            )}
            {/* Dropdown desglose — oculto cuando tab=cuestionario (sidebar ya lo muestra) */}
            {tab !== "cuestionario" && (
              <button
                type="button"
                onClick={() => setShowStripDropdown((v) => !v)}
                className="text-xs font-bold text-brand-primary-dark tabular-nums whitespace-nowrap hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 rounded-sm px-2 py-2 min-h-[40px] inline-flex items-center gap-1"
                aria-expanded={showStripDropdown}
                aria-haspopup="true"
                title="Ver avance por paso"
              >
                {overallPct}% <span aria-hidden="true">▾</span>
              </button>
            )}
            {tab === "cuestionario" && (
              <span
                className="text-xs font-bold text-brand-primary-dark tabular-nums whitespace-nowrap px-2 py-2 min-h-[40px] inline-flex items-center"
                title={`${overallPct}% global del cuestionario`}
              >
                {overallPct}%
              </span>
            )}
            {/* Toggle colapsar/expandir el strip — persiste por cliente */}
            <button
              type="button"
              onClick={toggleStripCollapsed}
              className="text-slate-400 hover:text-slate-700 rounded-sm p-2 min-h-[40px] min-w-[40px] inline-flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
              aria-label={stripCollapsed ? "Expandir contexto del cliente" : "Colapsar contexto del cliente"}
              title={stripCollapsed ? "Expandir contexto (KPIs)" : "Colapsar — más espacio para la tabla"}
            >
              <svg
                className={`w-3.5 h-3.5 transition-transform ${stripCollapsed ? "" : "rotate-180"}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showStripDropdown && (
              <div
                role="dialog"
                aria-label="Avance por paso"
                className="absolute top-full right-0 mt-2 w-80 bg-white border border-slate-200 rounded shadow-sm z-50 p-3"
              >
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Avance por paso</div>
                {questionnaireSteps.length === 0 && (
                  <div className="text-xs text-slate-600 italic">Sin datos del cuestionario.</div>
                )}
                {questionnaireSteps.map((step, i) => {
                  const prog = sectionProg[step.key];
                  const pct = prog?.pct ?? 0;
                  const colorCls = pct === 100 ? "bg-brand-primary" : pct > 0 ? "bg-brand-accent" : "bg-slate-200";
                  const textCls = pct === 100 ? "text-brand-primary-dark" : pct > 0 ? "text-amber-700" : "text-slate-600";
                  return (
                    <button
                      key={step.key}
                      type="button"
                      onClick={() => {
                        setShowStripDropdown(false);
                        goToTab("cuestionario");
                        router.replace(`?tab=cuestionario&step=${i + 1}`, { scroll: false });
                      }}
                      className="w-full flex items-center gap-2 hover:bg-slate-50 rounded-sm px-2 py-2 min-h-[40px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
                    >
                      <span className="text-[10px] font-bold text-slate-500 tabular-nums w-4 shrink-0">{i + 1}</span>
                      <span className="text-xs text-slate-700 flex-1 truncate">{step.title}</span>
                      <div className="w-12 h-1 bg-slate-100 shrink-0" aria-hidden="true">
                        <div className={`h-1 ${colorCls} transition-all`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className={`text-[10px] tabular-nums w-10 text-right font-semibold ${textCls}`}>
                        {prog ? `${prog.filled}/${prog.total}` : "—"}
                      </span>
                    </button>
                  );
                })}
                <div className="mt-2 pt-2 border-t border-slate-100 flex justify-between text-[10px] text-slate-600 tabular-nums">
                  <span>Total: {questionnaireProgress?.filled ?? 0}/{questionnaireProgress?.total ?? 0} campos</span>
                  {totalSteps !== null && completedSteps < totalSteps && (
                    <span className="text-brand-berry font-semibold">{totalSteps - completedSteps} pasos pendientes</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs — border-b full-width, botones alineados con max-w-6xl del header */}
      <div className="border-b border-slate-200 mb-5">
      <div className="max-w-6xl mx-auto relative">
      <div ref={tablistRef} role="tablist" aria-label="Secciones del cliente" className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* Documentos primero — es el paso 1 del workflow (subir antes de llenar cuestionario) */}
        <TabButton
          active={tab === "documentos"}
          tabId="documentos"
          onClick={() => goToTab("documentos")}
          icon={
            <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          }
          label="Documentos"
          badge={docCount !== null && docCount > 0 ? String(docCount) : null}
          badgeTitle={docsTooltip}
        />
        <TabButton
          active={tab === "cuestionario"}
          tabId="cuestionario"
          onClick={() => goToTab("cuestionario")}
          icon={
            <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          }
          label="Cuestionario"
          badge={totalSteps ? `${completedSteps}/${totalSteps}` : null}
          badgeTitle={
            totalSteps
              ? `${completedSteps} de ${totalSteps} pasos con todas sus preguntas respondidas`
              : undefined
          }
        />
        {hasDmService && (
          <TabButton
            active={tab === "doble-materialidad-ia"}
            tabId="doble-materialidad-ia"
            onClick={() => goToTab("doble-materialidad-ia")}
            icon={
              <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            }
            label="D. Materialidad IA"
            badge={dmProgress ? `${dmProgress.done}/${dmProgress.total}` : null}
            badgeTitle={dmProgress ? `${dmProgress.done} de ${dmProgress.total} etapas completadas` : undefined}
          />
        )}
        <TabButton
          active={tab === "equipo"}
          tabId="equipo"
          onClick={() => goToTab("equipo")}
          icon={
            <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
          label="Equipo"
          badge={null}
        />
      </div>
      {/* Scroll indicator — solo visible cuando hay overflow a la derecha */}
      {canScrollRight && (
        <button
          aria-hidden="true"
          tabIndex={-1}
          onClick={() => tablistRef.current?.scrollBy({ left: 220, behavior: "smooth" })}
          className="absolute inset-y-0 right-0 z-20 w-14 bg-gradient-to-l from-white via-white/90 to-transparent flex items-center justify-end pr-2 hover:from-slate-50 transition-colors"
        >
          <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}
      </div>{/* /relative wrapper */}
      </div>{/* /border-b wrapper */}

      <div className="max-w-6xl mx-auto">
      {tab === "cuestionario" && (
        <div role="tabpanel" id="panel-cuestionario" tabIndex={0} aria-labelledby="tab-cuestionario">
          <TabErrorBoundary tabName="Cuestionario">
            <QuestionnaireTab
              key="q-cuestionario"
              clientId={client.id}
              clientServices={client.services ?? []}
              initialStepIndex={(() => {
                const s = searchParams?.get("step");
                const n = s ? parseInt(s, 10) - 1 : 0;
                return isNaN(n) || n < 0 ? 0 : n;
              })()}
              autoFillOnMount={searchParams?.get("autoFill") === "1"}
              reportUrls={{
                sustainability: client.sustainability_report_url ?? null,
                financial: client.financial_report_url ?? null,
              }}
              docCount={docCount}
              onGoToDocumentos={() => goToTab("documentos")}
              pendingExtract={pendingDocExtract}
              onExtractDone={() => setPendingDocExtract(null)}
            />
          </TabErrorBoundary>
        </div>
      )}
      {tab === "equipo" && (
        <div role="tabpanel" id="panel-equipo" tabIndex={0} aria-labelledby="tab-equipo">
          <TabErrorBoundary tabName="Equipo">
            <TeamTab clientId={client.id} isAdmin={isAdmin} />
          </TabErrorBoundary>
        </div>
      )}
      {tab === "documentos" && (
        <div role="tabpanel" id="panel-documentos" tabIndex={0} aria-labelledby="tab-documentos">
          <TabErrorBoundary tabName="Documentos">
            <DocumentsTab
              clientId={client.id}
              isAdmin={isAdmin}
              questionnaireSteps={questionnaireSteps}
              onExtractForStep={handleExtractForStep}
            />
          </TabErrorBoundary>
        </div>
      )}
      {tab === "doble-materialidad-ia" && hasDmService && (
        <div role="tabpanel" id="panel-doble-materialidad-ia" tabIndex={0} aria-labelledby="tab-doble-materialidad-ia">
          <TabErrorBoundary tabName="DM-IA">
            <DoubleMaterialidadTab
              clientId={client.id}
              clientName={client.name}
              questionnaireProgress={questionnaireProgress}
              onGoToCuestionario={() => goToTab("cuestionario")}
              onStagesProgress={(done, total) => setDmProgress({ done, total })}
              clientSector={client.sector}
              clientSize={client.size}
              clientFrameworks={client.frameworks}
            />
          </TabErrorBoundary>
        </div>
      )}
      </div>{/* /panels wrapper */}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  badge,
  badgeTitle,
  tabId,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge: string | null;
  badgeTitle?: string;
  tabId: string;
}) {
  // aria-label compone label + badge para screen readers: "Cuestionario, 1 de 9 pasos completados"
  const ariaFull = badge ? `${label}, ${badgeTitle ?? badge}` : label;
  return (
    <button
      role="tab"
      id={`tab-${tabId}`}
      aria-selected={active}
      aria-controls={`panel-${tabId}`}
      aria-label={ariaFull}
      title={label}
      onClick={onClick}
      className={`px-3 py-2.5 border-b-2 -mb-px transition-colors flex items-center gap-1.5 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 focus-visible:ring-inset ${
        active
          ? "border-brand-primary text-brand-primary-dark"
          : "border-transparent text-slate-500 hover:text-slate-800"
      }`}
    >
      <span className={`${active ? "text-brand-primary-dark" : "text-slate-500"} w-[18px] h-[18px] flex items-center justify-center shrink-0`} aria-hidden="true">{icon}</span>
      <span className="text-xs font-medium">{label}</span>
      {badge !== null && (
        <span
          title={badgeTitle}
          aria-hidden="true"
          className={`text-[10px] font-semibold rounded-sm px-1.5 py-0.5 tabular-nums ${
            active
              ? "bg-brand-primary-light text-brand-primary-dark"
              : "bg-slate-100 text-slate-600"
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
