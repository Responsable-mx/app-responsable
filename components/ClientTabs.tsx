"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
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

type Tab = "resumen" | "cuestionario" | "chat" | "materialidad" | "equipo";

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
  const initialTab = (searchParams?.get("tab") as Tab | null) ?? "resumen";
  const [tab, setTab] = useState<Tab>(
    initialTab === "resumen" || initialTab === "cuestionario" || initialTab === "chat" || initialTab === "materialidad" || initialTab === "equipo"
      ? initialTab
      : "resumen"
  );

  useEffect(() => {
    const t = searchParams?.get("tab");
    if (t === "resumen" || t === "cuestionario" || t === "chat" || t === "materialidad" || t === "equipo") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync de URL → state, no loop
      setTab(t);
    }
  }, [searchParams]);

  // Override de step desde Resumen (click en card macro → paso específico)
  const [jumpToStep, setJumpToStep] = useState<number | null>(null);
  // Ambos fetches inmediatos: KPIs los necesitan para count.
  // revalidateOnFocus: false evita spam si el usuario alterna tabs.
  const { data: questionnaireResp } = useSWR(
    `/api/clients/${client.id}/questionnaire`,
    questionnaireFetcher,
    {
      revalidateOnFocus: false,
      fallbackData: initialQuestionnaire ? { data: initialQuestionnaire } : undefined,
    }
  );
  const { data: materialityResp } = useSWR(
    `/api/clients/${client.id}/materiality`,
    materialityFetcher,
    {
      revalidateOnFocus: false,
      fallbackData: initialMateriality ? { data: initialMateriality } : undefined,
    }
  );

  const pctCuestionario = questionnaireResp?.data.progress.pct ?? null;
  const schema = questionnaireResp?.data.template.schema;
  const totalSteps = schema
    ? "steps" in schema
      ? schema.steps.length
      : schema.sections.length
    : 0;
  const materialityCount = materialityResp?.data?.length ?? null;
  // Validación real (migración 0027): cuenta solo topics con validated=true.
  // Antes era placeholder = materialityCount, lo que mostraba "Todas validadas"
  // sin que el consultor hubiera revisado nada.
  const materialityValidated =
    materialityResp?.data?.filter((t) => t.validated === true).length ?? null;
  const allValidated =
    materialityCount !== null &&
    materialityValidated !== null &&
    materialityCount > 0 &&
    materialityValidated === materialityCount;

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
      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 mb-5 overflow-x-auto">
        <TabButton
          active={tab === "resumen"}
          onClick={() => setTab("resumen")}
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
          onClick={() => setTab("cuestionario")}
          icon={
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          }
          label="Cuestionario"
          badge={pctCuestionario === null ? "…" : `${pctCuestionario}%`}
        />
        <TabButton
          active={tab === "chat"}
          onClick={() => setTab("chat")}
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
          onClick={() => setTab("materialidad")}
          icon={
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
            </svg>
          }
          label="Materialidad"
          badge={materialityCount === null ? "…" : `${materialityCount}/20`}
        />
        <TabButton
          active={tab === "equipo"}
          onClick={() => setTab("equipo")}
          icon={
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
          label="Equipo"
          badge={null}
        />
      </div>

      {tab === "resumen" && (
        <TabErrorBoundary tabName="Resumen">
          <ClientResumen
            questionnaire={questionnaireResp?.data ?? null}
            onJumpToCuestionario={(firstStepKey) => {
              setTab("cuestionario");
              if (firstStepKey && schema && "steps" in schema) {
                const idx = schema.steps.findIndex((s) => s.key === firstStepKey);
                if (idx >= 0) setJumpToStep(idx);
              }
            }}
          />
        </TabErrorBoundary>
      )}
      {tab === "cuestionario" && (
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
      )}
      {tab === "materialidad" && (
        <TabErrorBoundary tabName="Materialidad">
          <MaterialityTab clientId={client.id} />
        </TabErrorBoundary>
      )}
      {tab === "chat" && (
        <TabErrorBoundary tabName="Chat IA">
          <div className="border border-slate-200 rounded shadow-sm overflow-hidden bg-white" style={{ height: "min(75vh, 720px)" }}>
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
      )}

      {tab === "equipo" && (
        <TabErrorBoundary tabName="Equipo">
          <TeamTab clientId={client.id} isAdmin={isAdmin} />
        </TabErrorBoundary>
      )}

    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge: string | null;
}) {
  return (
    <button
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
