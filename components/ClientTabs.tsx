"use client";

import { useState } from "react";
import useSWR from "swr";
import type { Client } from "@/lib/clients";
import { ClientForm } from "@/components/ClientForm";
import { ClientServicesTab } from "@/components/services/ClientServicesTab";
import { QuestionnaireTab } from "@/components/questionnaire/QuestionnaireTab";
import { MaterialityTab } from "@/components/materiality/MaterialityTab";
import type { QuestionnaireBundle } from "@/lib/questionnaires/types";
import type { MaterialityTopic } from "@/lib/materiality/types";

type Tab = "contexto" | "servicios" | "cuestionario" | "materialidad";

type Props = {
  client: Client;
  completeness: { filled: number; total: number };
};

const servicesFetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<{ data: unknown[] }>;
  });

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
  const [tab, setTab] = useState<Tab>("contexto");
  const { data: servicesResp } = useSWR(
    `/api/clients/${client.id}/services`,
    servicesFetcher
  );
  const { data: questionnaireResp } = useSWR(
    `/api/clients/${client.id}/questionnaire`,
    questionnaireFetcher
  );
  const { data: materialityResp } = useSWR(
    `/api/clients/${client.id}/materiality`,
    materialityFetcher
  );
  const servicesCount = servicesResp?.data?.length ?? null;
  const pctContexto = Math.round((completeness.filled / completeness.total) * 100);
  const pctCuestionario = questionnaireResp?.data.progress.pct ?? null;
  const materialityCount = materialityResp?.data?.length ?? null;

  return (
    <div>
      {/* KPI cards corporate */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <KpiCard
          label="Contexto"
          value={`${pctContexto}%`}
          sub={`${completeness.filled}/${completeness.total} campos`}
          tone={pctContexto === 100 ? "success" : pctContexto >= 50 ? "primary" : "warn"}
        />
        <KpiCard
          label="Servicios"
          value={servicesCount === null ? "—" : String(servicesCount)}
          sub={
            servicesCount === null
              ? "Cargando…"
              : servicesCount === 0
                ? "Sin servicios"
                : servicesCount === 1
                  ? "1 contratado"
                  : `${servicesCount} contratados`
          }
          tone="neutral"
        />
        <KpiCard
          label="Cuestionario"
          value={pctCuestionario === null ? "—" : `${pctCuestionario}%`}
          sub={
            pctCuestionario === null
              ? "Cargando…"
              : pctCuestionario === 100
                ? "Completo"
                : pctCuestionario === 0
                  ? "Sin iniciar"
                  : "En progreso"
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
        <KpiCard
          label="Materialidad"
          value={materialityCount === null ? "—" : String(materialityCount)}
          sub={
            materialityCount === null
              ? "Cargando…"
              : materialityCount === 0
                ? "Sin iniciar"
                : `${materialityCount} temas`
          }
          tone={
            materialityCount === null
              ? "neutral"
              : materialityCount === 0
                ? "neutral"
                : materialityCount >= 15
                  ? "success"
                  : "primary"
          }
        />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 mb-5 overflow-x-auto">
        <TabButton
          active={tab === "contexto"}
          onClick={() => setTab("contexto")}
          label="Contexto"
          badge={`${pctContexto}%`}
        />
        <TabButton
          active={tab === "servicios"}
          onClick={() => setTab("servicios")}
          label="Servicios"
          badge={servicesCount === null ? null : String(servicesCount)}
        />
        <TabButton
          active={tab === "cuestionario"}
          onClick={() => setTab("cuestionario")}
          label="Cuestionario"
          badge={pctCuestionario === null ? "…" : `${pctCuestionario}%`}
        />
        <TabButton
          active={tab === "materialidad"}
          onClick={() => setTab("materialidad")}
          label="Materialidad"
          badge={materialityCount === null ? "…" : String(materialityCount)}
        />
      </div>

      {tab === "contexto" && <ClientForm mode="edit" initial={client} />}
      {tab === "servicios" && <ClientServicesTab clientId={client.id} />}
      {tab === "cuestionario" && <QuestionnaireTab clientId={client.id} />}
      {tab === "materialidad" && <MaterialityTab clientId={client.id} />}
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "success" | "primary" | "warn" | "neutral" | "placeholder";
}) {
  const valueClass =
    tone === "success"
      ? "text-emerald-700"
      : tone === "primary"
        ? "text-brand-primary-dark"
        : tone === "warn"
          ? "text-amber-700"
          : tone === "placeholder"
            ? "text-slate-300"
            : "text-slate-900";
  const borderClass =
    tone === "placeholder" ? "border-slate-100 bg-slate-50/50" : "border-slate-200 bg-white";
  return (
    <div className={`border ${borderClass} rounded p-3 shadow-sm`}>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
        {label}
      </p>
      <p className={`text-2xl font-bold mt-1 tabular-nums ${valueClass}`}>{value}</p>
      <p className="text-[11px] text-slate-600 mt-0.5">{sub}</p>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  badge,
  muted = false,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge: string | null;
  muted?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-xs font-bold uppercase tracking-wider border-b-2 -mb-px transition-colors flex items-center gap-1.5 whitespace-nowrap ${
        active
          ? "border-brand-primary text-brand-primary-dark"
          : muted
            ? "border-transparent text-slate-400 hover:text-slate-600"
            : "border-transparent text-slate-500 hover:text-slate-900"
      }`}
    >
      {label}
      {badge !== null && (
        <span
          className={`text-[10px] font-semibold rounded-sm px-1.5 py-0.5 tabular-nums ${
            active
              ? "bg-brand-primary-light text-brand-primary-dark"
              : muted
                ? "bg-slate-100 text-slate-400"
                : "bg-slate-100 text-slate-600"
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function PlaceholderTab({ title }: { title: string }) {
  return (
    <div className="border border-slate-200 rounded bg-slate-50/50 p-8 text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 mb-3">
        <svg
          className="w-6 h-6 text-slate-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>
      <h3 className="text-sm font-bold text-slate-700 mb-1">{title}</h3>
      <p className="text-xs text-slate-500 max-w-sm mx-auto">
        Esta sección estará disponible próximamente. El backend y la UI editable
        se entregan en sprints siguientes.
      </p>
    </div>
  );
}
