"use client";

import { useState } from "react";
import useSWR from "swr";
import type { Client } from "@/lib/clients";
import { QuestionnaireTab } from "@/components/questionnaire/QuestionnaireTab";
import { MaterialityTab } from "@/components/materiality/MaterialityTab";
import { ClientResumen } from "@/components/ClientResumen";
import { ChatWindow } from "@/components/chat/ChatWindow";
import type { QuestionnaireBundle } from "@/lib/questionnaires/types";
import type { MaterialityTopic } from "@/lib/materiality/types";

type Tab = "resumen" | "cuestionario" | "chat" | "materialidad";

type Props = {
  client: Client;
  completeness: { filled: number; total: number };
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

export function ClientTabs({ client, completeness }: Props) {
  const [tab, setTab] = useState<Tab>("resumen");
  const { data: questionnaireResp } = useSWR(
    `/api/clients/${client.id}/questionnaire`,
    questionnaireFetcher
  );
  const { data: materialityResp } = useSWR(
    `/api/clients/${client.id}/materiality`,
    materialityFetcher
  );

  const pctCuestionario = questionnaireResp?.data.progress.pct ?? null;
  const totalSections = questionnaireResp?.data.template.schema.sections.length ?? 0;
  const completedSections = questionnaireResp?.data.response?.completed_sections.length ?? 0;
  const materialityCount = materialityResp?.data?.length ?? null;
  const materialityValidated = materialityCount; // placeholder: en futuro será # validados
  const isQuestionnaireComplete = pctCuestionario === 100;

  return (
    <div>
      {/* KPI cards: 3 columnas según mockup */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-5">
        <KpiCardLarge
          label="Cuestionario"
          value={pctCuestionario === null ? "—" : `${pctCuestionario}`}
          unit={pctCuestionario === null ? "" : "%"}
          sub={
            questionnaireResp?.data
              ? `${questionnaireResp.data.progress.filledFields}/${questionnaireResp.data.progress.totalFields} campos · ${totalSections} secciones`
              : "Cargando…"
          }
          tone={
            pctCuestionario === null
              ? "neutral"
              : pctCuestionario === 100
                ? "success"
                : pctCuestionario >= 50
                  ? "primary"
                  : pctCuestionario > 0
                    ? "warn"
                    : "neutral"
          }
        />
        <KpiCardLarge
          label="Matrices materialidad"
          value={materialityCount === null ? "—" : String(materialityCount)}
          unit={materialityCount === null ? "" : "/20"}
          sub={null}
          rightBadge={
            materialityCount !== null && materialityValidated !== null && materialityValidated > 0
              ? { label: "Todas validadas", tone: "success" }
              : null
          }
          tone={
            materialityCount === null
              ? "neutral"
              : materialityCount >= 20
                ? "success"
                : materialityCount > 0
                  ? "primary"
                  : "neutral"
          }
        />
        <KpiCardLarge
          label="Metodología ResponSable"
          value="Por definir"
          unit=""
          sub="Los pasos de la metodología se definirán con el equipo."
          rightBadge={{ label: "Placeholder", tone: "warn" }}
          tone="placeholder"
        />
      </div>

      {/* Tabs: 4 según mockup */}
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
              ? `${completedSections}/${totalSections}`
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
      </div>

      {tab === "resumen" && (
        <ClientResumen
          questionnaire={questionnaireResp?.data ?? null}
          onJumpToCuestionario={() => setTab("cuestionario")}
        />
      )}
      {tab === "cuestionario" && <QuestionnaireTab clientId={client.id} />}
      {tab === "materialidad" && <MaterialityTab clientId={client.id} />}
      {tab === "chat" && (
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
          />
        </div>
      )}

      {/* Acceso secundario a Contexto/Servicios */}
      {tab === "resumen" && (
        <div className="mt-6 pt-4 border-t border-slate-200 flex items-center gap-3 text-xs text-slate-500">
          <span className="uppercase tracking-widest font-bold text-[10px] text-slate-400">Avanzado:</span>
          <a href={`/clientes/${client.id}?legacy=context`} className="hover:text-brand-primary hover:underline">
            Editar atributos legacy del cliente →
          </a>
          <a href={`/clientes/${client.id}?legacy=services`} className="hover:text-brand-primary hover:underline">
            Servicios contratados →
          </a>
        </div>
      )}
    </div>
  );
}

function KpiCardLarge({
  label,
  value,
  unit,
  sub,
  tone,
  rightBadge,
}: {
  label: string;
  value: string;
  unit: string;
  sub: string | null;
  tone: "success" | "primary" | "warn" | "neutral" | "placeholder";
  rightBadge?: { label: string; tone: "success" | "warn" } | null;
}) {
  const valueClass =
    tone === "success"
      ? "text-emerald-700"
      : tone === "primary"
        ? "text-brand-primary-dark"
        : tone === "warn"
          ? "text-amber-700"
          : tone === "placeholder"
            ? "text-slate-400"
            : "text-slate-900";
  const accentClass =
    tone === "success"
      ? "border-l-emerald-500"
      : tone === "primary"
        ? "border-l-brand-primary"
        : tone === "warn"
          ? "border-l-amber-500"
          : tone === "placeholder"
            ? "border-l-slate-300"
            : "border-l-slate-400";
  return (
    <div className={`bg-white border border-slate-200 ${accentClass} border-l-4 rounded p-4 shadow-sm`}>
      <div className="flex items-start justify-between mb-2">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          {label}
        </p>
        {rightBadge && (
          <span
            className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide rounded-sm px-1.5 py-0.5 ${
              rightBadge.tone === "success"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            {rightBadge.tone === "success" && (
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
            {rightBadge.label}
          </span>
        )}
      </div>
      <p className={`text-3xl font-bold tabular-nums ${valueClass}`}>
        {value}
        {unit && <span className="text-base font-medium ml-1">{unit}</span>}
      </p>
      {sub && <p className="text-[11px] text-slate-600 mt-1">{sub}</p>}
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
