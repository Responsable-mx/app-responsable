"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import useSWR from "swr";
import type { Client } from "@/lib/clients";
// ClientResumen es el tab default → eager (no lazy) para evitar skeleton en primera carga.
import { ClientResumen } from "@/components/ClientResumen";
import type { QuestionnaireBundle } from "@/lib/questionnaires/types";


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

type Tab = "resumen" | "cuestionario" | "equipo" | "documentos" | "doble-materialidad-ia";

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
  const VALID_TABS: Tab[] = ["resumen", "cuestionario", "equipo", "documentos", ...(hasDmService ? ["doble-materialidad-ia" as Tab] : [])];
  const initialTab = (searchParams?.get("tab") as Tab | null) ?? "resumen";
  const [tab, setTab] = useState<Tab>(
    VALID_TABS.includes(initialTab) ? initialTab : "resumen"
  );

  useEffect(() => {
    const t = searchParams?.get("tab") as Tab | null;
    if (t && VALID_TABS.includes(t)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync de URL → state, no loop
      setTab(t);
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

  function goToTab(t: Tab) {
    setTab(t);
    router.replace(`?tab=${t}`, { scroll: false });
  }

  // Badge [N/8] en tab DM-IA — se actualiza cuando DoubleMaterialidadTab monta
  const [dmProgress, setDmProgress] = useState<{ done: number; total: number } | null>(null);

  // Override de step desde Resumen (click en card macro → paso específico)
  const [jumpToStep, setJumpToStep] = useState<number | null>(null);

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

  const questionnaireProgress = questionnaireResp?.data.progress
    ? {
        filled: questionnaireResp.data.progress.filledFields,
        total: questionnaireResp.data.progress.totalFields,
      }
    : null;
  const schema = questionnaireResp?.data.template.schema;

  // Resumen tab: 5 cards macro. Una card está completa si TODOS sus stepKeys están en completed_sections.
  // Mapping idéntico al de ClientResumen.tsx
  const MACRO_STEP_KEYS: Record<string, string[]> = {
    "informacion-base": ["informacion-base"],
    "contexto-general": ["informacion-general"],
    "contexto-sostenibilidad": ["estrategia-y-madurez"],
    "regulatorio": ["regulacion-y-sector"],
    "modelo-negocio": [
      "modelo-de-negocio-estructura",
      "modelo-de-negocio-detalle",
      "cadena-de-valor",
      "riesgos-y-oportunidades",
      "stakeholders",
    ],
  };
  // Usa pct === 100 (misma fuente que los checkmarks en ClientResumen) para evitar
  // que el badge "N/5" y los ✓ en las cards muestren valores distintos.
  const completedMacro = (() => {
    const sectionProg = questionnaireResp?.data.progress.sectionProgress ?? {};
    let count = 0;
    for (const stepKeys of Object.values(MACRO_STEP_KEYS)) {
      const allComplete = stepKeys.every((sk) => {
        const sp = sectionProg[sk];
        return sp != null && sp.total > 0 && sp.pct === 100;
      });
      if (allComplete) count++;
    }
    return count;
  })();
  const totalMacro = Object.keys(MACRO_STEP_KEYS).length;

  return (
    <div>
      {/* Tabs — border-b full-width, botones alineados con max-w-6xl del header */}
      <div className="border-b border-slate-200 mb-5">
      <div className="max-w-6xl mx-auto relative">
      <div ref={tablistRef} role="tablist" aria-label="Secciones del cliente" className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <TabButton
          active={tab === "resumen"}
          tabId="resumen"
          onClick={() => goToTab("resumen")}
          icon={
            <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          }
          label="Resumen"
          badge={null}
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
          badge={questionnaireResp?.data ? `${completedMacro}/${totalMacro}` : null}
          badgeTitle={
            questionnaireResp?.data
              ? `${completedMacro} de ${totalMacro} secciones con todas sus preguntas respondidas`
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
      {tab === "resumen" && (
        <div role="tabpanel" id="panel-resumen" tabIndex={0} aria-labelledby="tab-resumen">
          <TabErrorBoundary tabName="Resumen">
            <ClientResumen
              questionnaire={questionnaireResp?.data ?? null}
              onJumpToCuestionario={(firstStepKey) => {
                goToTab("cuestionario");
                if (firstStepKey && schema && "steps" in schema) {
                  const idx = schema.steps.findIndex((s) => s.key === firstStepKey);
                  if (idx >= 0) setJumpToStep(idx);
                }
              }}
            />
          </TabErrorBoundary>
        </div>
      )}
      {tab === "cuestionario" && (
        <div role="tabpanel" id="panel-cuestionario" tabIndex={0} aria-labelledby="tab-cuestionario">
          <TabErrorBoundary tabName="Cuestionario">
            <QuestionnaireTab
              key={`q-${jumpToStep ?? "default"}`}
              clientId={client.id}
              clientServices={client.services ?? []}
              initialStepIndex={(() => {
                if (jumpToStep !== null) return jumpToStep;
                const s = searchParams?.get("step");
                const n = s ? parseInt(s, 10) - 1 : 0;
                return isNaN(n) || n < 0 ? 0 : n;
              })()}
              autoFillOnMount={searchParams?.get("autoFill") === "1"}
              reportUrls={{
                sustainability: client.sustainability_report_url ?? null,
                financial: client.financial_report_url ?? null,
              }}
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
            <DocumentsTab clientId={client.id} isAdmin={isAdmin} />
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
  return (
    <button
      role="tab"
      id={`tab-${tabId}`}
      aria-selected={active}
      aria-controls={`panel-${tabId}`}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`px-3 py-2.5 border-b-2 -mb-px transition-colors flex items-center gap-1.5 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 focus-visible:ring-inset ${
        active
          ? "border-brand-primary text-brand-primary-dark"
          : "border-transparent text-slate-400 hover:text-slate-700"
      }`}
    >
      <span className={`${active ? "text-brand-primary-dark" : "text-slate-400"} w-[18px] h-[18px] flex items-center justify-center shrink-0`}>{icon}</span>
      <span className="text-xs font-medium">{label}</span>
      {badge !== null && (
        <span
          title={badgeTitle}
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
