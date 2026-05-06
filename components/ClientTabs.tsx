"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import useSWR from "swr";
import type { Client } from "@/lib/clients";
import { QuestionnaireTab } from "@/components/questionnaire/QuestionnaireTab";
import { MaterialityTab } from "@/components/materiality/MaterialityTab";
import { ClientResumen } from "@/components/ClientResumen";
import { ChatWindow } from "@/components/chat/ChatWindow";
import type { QuestionnaireBundle } from "@/lib/questionnaires/types";
import type { MaterialityTopic } from "@/lib/materiality/types";
import { TabErrorBoundary } from "@/components/TabErrorBoundary";
import { TeamTab } from "@/components/equipo/TeamTab";
import { ClientCronogramaTab } from "@/components/services/ClientCronogramaTab";

type Tab = "resumen" | "cuestionario" | "chat" | "materialidad" | "cronograma" | "equipo";

type Props = {
  client: Client;
  completeness: { filled: number; total: number };
  isAdmin?: boolean;
  // Datos prefetched server-side. SWR los usa como fallback inicial y revalida
  // en background. Evita waterfall de 2 fetches al montar tabs.
  initialQuestionnaire?: QuestionnaireBundle | null;
  initialMateriality?: MaterialityTopic[];
};

const questionnaireFetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<{ data: QuestionnaireBundle }>;
  });

const materialityFetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<{ data: MaterialityTopic[] }>;
  });

export function ClientTabs({
  client,
  completeness,
  isAdmin = false,
  initialQuestionnaire,
  initialMateriality,
}: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = (searchParams?.get("tab") as Tab | null) ?? "resumen";
  const [tab, setTab] = useState<Tab>(
    initialTab === "resumen" || initialTab === "cuestionario" || initialTab === "chat" || initialTab === "materialidad" || initialTab === "cronograma" || initialTab === "equipo"
      ? initialTab
      : "resumen"
  );

  useEffect(() => {
    const t = searchParams?.get("tab");
    if (t === "resumen" || t === "cuestionario" || t === "chat" || t === "materialidad" || t === "cronograma" || t === "equipo") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync de URL → state, no loop
      setTab(t);
    }
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

  // Override de step desde Resumen (click en card macro → paso específico)
  const [jumpToStep, setJumpToStep] = useState<number | null>(null);
  // Ambos fetches inmediatos: KPIs los necesitan para count.
  // revalidateOnFocus: false evita spam si el usuario alterna tabs.
  const { data: questionnaireResp, error: questionnaireError } = useSWR(
    `/api/clients/${client.id}/questionnaire`,
    questionnaireFetcher,
    {
      revalidateOnFocus: false,
      fallbackData: initialQuestionnaire ? { data: initialQuestionnaire } : undefined,
      onError: (e: unknown) => console.warn("[ClientTabs] questionnaire revalidation failed:", e),
    }
  );
  const { data: materialityResp, error: materialityError } = useSWR(
    `/api/clients/${client.id}/materiality`,
    materialityFetcher,
    {
      revalidateOnFocus: false,
      fallbackData: initialMateriality ? { data: initialMateriality } : undefined,
      onError: (e: unknown) => console.warn("[ClientTabs] materiality revalidation failed:", e),
    }
  );
  // D-74: fallbackData garantiza la carga inicial. Si revalidación falla, los badges
  // quedan con datos del servidor (aceptable). El console.warn permite detectar en logs.
  void questionnaireError;
  void materialityError;

  const questionnaireProgress = questionnaireResp?.data.progress
    ? {
        filled: questionnaireResp.data.progress.filledFields,
        total: questionnaireResp.data.progress.totalFields,
      }
    : null;
  const schema = questionnaireResp?.data.template.schema;
  const materialityCount = materialityResp?.data?.length ?? null;

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
  const completedMacro = (() => {
    const completedSet = new Set(questionnaireResp?.data.response?.completed_sections ?? []);
    let count = 0;
    for (const stepKeys of Object.values(MACRO_STEP_KEYS)) {
      if (stepKeys.every((sk) => completedSet.has(sk))) count++;
    }
    return count;
  })();
  const totalMacro = Object.keys(MACRO_STEP_KEYS).length;

  return (
    <div>
      {/* Tabs — border-b full-width, botones alineados con max-w-6xl del header */}
      <div className="border-b border-slate-200 mb-5">
      <div role="tablist" aria-label="Secciones del cliente" className="max-w-6xl mx-auto flex items-center gap-2 overflow-x-auto">
        <TabButton
          active={tab === "resumen"}
          tabId="resumen"
          onClick={() => goToTab("resumen")}
          icon={
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          }
          label="Resumen"
          badge={
            questionnaireResp?.data
              ? `${completedMacro}/${totalMacro}`
              : null
          }
        />
        <TabButton
          active={tab === "cuestionario"}
          tabId="cuestionario"
          onClick={() => goToTab("cuestionario")}
          icon={
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          }
          label="Cuestionario"
          badge={questionnaireProgress === null ? null : `${questionnaireProgress.filled}/${questionnaireProgress.total}`}
        />
        <TabButton
          active={tab === "chat"}
          tabId="chat"
          onClick={() => goToTab("chat")}
          icon={
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          }
          label="Chat IA"
          badge={null}
        />
        <TabButton
          active={tab === "materialidad"}
          tabId="materialidad"
          onClick={() => goToTab("materialidad")}
          icon={
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
            </svg>
          }
          label="Materialidad"
          badge={materialityCount === null ? null : `${materialityCount} temas`}
        />
        <TabButton
          active={tab === "cronograma"}
          tabId="cronograma"
          onClick={() => goToTab("cronograma")}
          icon={
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          }
          label="Cronograma"
          badge={null}
        />
        <TabButton
          active={tab === "equipo"}
          tabId="equipo"
          onClick={() => goToTab("equipo")}
          icon={
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
          label="Equipo"
          badge={null}
        />
      </div>
      </div>{/* /border-b wrapper */}

      {/* Panels: cronograma sin max-w (gantt full-width), resto con max-w-6xl */}
      <div className={tab === "cronograma" ? "" : "max-w-6xl mx-auto"}>
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
              initialStepIndex={(() => {
                if (jumpToStep !== null) return jumpToStep;
                const s = searchParams?.get("step");
                const n = s ? parseInt(s, 10) - 1 : 0;
                return isNaN(n) || n < 0 ? 0 : n;
              })()}
              autoFillOnMount={searchParams?.get("autoFill") === "1"}
            />
          </TabErrorBoundary>
        </div>
      )}
      {tab === "materialidad" && (
        <div role="tabpanel" id="panel-materialidad" tabIndex={0} aria-labelledby="tab-materialidad">
          <TabErrorBoundary tabName="Materialidad">
            <MaterialityTab clientId={client.id} />
          </TabErrorBoundary>
        </div>
      )}
      {tab === "chat" && (
        <div role="tabpanel" id="panel-chat" tabIndex={0} aria-labelledby="tab-chat">
          <TabErrorBoundary tabName="Chat IA">
            <div className="border border-slate-200 rounded shadow-sm overflow-hidden bg-white h-[min(75vh,720px)]">
              <ChatWindow
                key={client.id}
                clients={[
                  {
                    id: client.id,
                    name: client.name,
                    sector: client.sector,
                    completeness,
                  },
                ]}
                initialClientId={client.id}
                clientLocked
              />
            </div>
          </TabErrorBoundary>
        </div>
      )}
      {tab === "cronograma" && (
        <div role="tabpanel" id="panel-cronograma" tabIndex={0} aria-labelledby="tab-cronograma">
          <TabErrorBoundary tabName="Cronograma">
            <ClientCronogramaTab
              clientId={client.id}
              isAdmin={isAdmin}
              initialView={searchParams?.get("view") === "gantt" ? "gantt" : "list"}
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
  tabId,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge: string | null;
  tabId: string;
}) {
  return (
    <button
      role="tab"
      id={`tab-${tabId}`}
      aria-selected={active}
      aria-controls={`panel-${tabId}`}
      onClick={onClick}
      className={`px-3 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 -mb-px transition-colors flex items-center gap-1.5 whitespace-nowrap ${
        active
          ? "border-brand-primary text-brand-primary-dark"
          : "border-transparent text-slate-500 hover:text-slate-900"
      }`}
    >
      <span className={active ? "text-brand-primary-dark" : "text-slate-400"}>{icon}</span>
      {label}
      {badge !== null && (
        <span
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
