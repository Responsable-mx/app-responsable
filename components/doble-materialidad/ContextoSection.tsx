"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/Button";
import { catalogLabel } from "@/components/doble-materialidad/catalog-lookup";
import { getFieldValue, isFieldFilled } from "@/lib/questionnaires/types";
import type { QuestionnaireBundle } from "@/lib/questionnaires/types";

export type ContextoProgress = { filled: number; total: number } | null;

const bundleFetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<{ data: QuestionnaireBundle }>;
  });

type ClientEngagement = {
  id: string;
  service_key: string;
  year: number | null;
  alcance: string | null;
  status: "active" | "completed";
};

const engagementsFetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<{ data: ClientEngagement[] }>;
  });

type SchemaField = { key: string; label: string };
type SchemaStep = {
  key: string;
  title: string;
  ai_can_fill?: boolean;
  fields?: SchemaField[];
  sections?: { fields: SchemaField[] }[];
};

type MissingStep = {
  stepKey: string;
  stepTitle: string;
  stepIdx: number;
  aiCanFill: boolean;
  fields: Array<{ key: string; label: string }>;
};

function extractMissingByStep(bundle: QuestionnaireBundle | undefined): MissingStep[] {
  if (!bundle) return [];
  const schema = bundle.template.schema as unknown as { steps?: SchemaStep[] };
  const steps = schema.steps ?? [];
  const responses = bundle.response?.responses ?? {};
  const result: MissingStep[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step) continue;
    const fields: SchemaField[] = step.fields ?? step.sections?.flatMap((s) => s.fields ?? []) ?? [];
    const stepResp = (responses[step.key] ?? {}) as Record<string, unknown>;
    const missing: Array<{ key: string; label: string }> = [];

    for (const f of fields) {
      const val = getFieldValue(stepResp[f.key]);
      if (!isFieldFilled(val)) missing.push({ key: f.key, label: f.label });
    }

    if (missing.length > 0) {
      result.push({
        stepKey: step.key,
        stepTitle: step.title,
        stepIdx: i,
        aiCanFill: step.ai_can_fill ?? false,
        fields: missing,
      });
    }
  }

  return result;
}

const FIELDS_PER_GROUP = 3;

export function ContextoSection({
  progress,
  onGoToCuestionario,
  onGoToCuestionarioStep,
  clientId,
  sector,
  size,
  frameworks,
}: {
  progress: ContextoProgress;
  onGoToCuestionario: () => void;
  onGoToCuestionarioStep?: (stepIdx: number) => void;
  clientId: string;
  sector?: string | null;
  size?: string | null;
  frameworks?: string[] | null;
}) {
  const isComplete = progress && progress.filled >= progress.total && progress.total > 0;
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // SWR dedup: ClientTabs ya carga este endpoint con la misma key → 0 fetches extra.
  const { data: bundleResp } = useSWR<{ data: QuestionnaireBundle }>(
    progress && progress.total > 0 ? `/api/clients/${clientId}/questionnaire` : null,
    bundleFetcher,
    { revalidateOnFocus: false }
  );

  const { data: engagementsResp } = useSWR<{ data: ClientEngagement[] }>(
    `/api/clients/${clientId}/engagements`,
    engagementsFetcher,
    { revalidateOnFocus: false }
  );

  // Engagement DM activo más reciente (ordenado por year desc desde la API)
  const dmEngagement = (engagementsResp?.data ?? []).find(
    (e) => e.service_key === "doble_materialidad_ia"
  ) ?? null;

  const responses = (bundleResp?.data?.response?.responses ?? {}) as Record<string, Record<string, unknown>>;

  // Los campos guardados por AI-fill son objetos { value, sources, validated, updated_at, source_type }.
  // Extraer .value si es un objeto; si ya es string, usarlo directo.
  function extractStr(v: unknown): string | null {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "string") return v;
    if (typeof v === "object" && "value" in (v as object)) {
      const inner = (v as { value: unknown }).value;
      return typeof inner === "string" ? inner : null;
    }
    return null;
  }

  // Fuente canónica: engagement (editado en ficha cliente). Fallback: cuestionario.
  const alcanceGeo = dmEngagement?.alcance || extractStr(responses["informacion-base"]?.["alcance_geografico"]);
  const periodoInforme =
    (dmEngagement?.year != null ? String(dmEngagement.year) : null) ||
    extractStr(responses["estrategia-y-madurez"]?.["periodo_informe"]);

  const missingByStep = extractMissingByStep(bundleResp?.data);
  const hasKpis = sector || size || (frameworks && frameworks.length > 0) || alcanceGeo || periodoInforme;

  return (
    <div className="py-2">
      {/* KPI cards — Sector / Tamaño / Marcos / Alcance / Período */}
      {hasKpis && (
        <div className="grid grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
          {/* Sector */}
          {sector ? (
            <div className="border border-slate-200 rounded p-3 bg-slate-50/50">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Sector</p>
              <p className="text-sm font-semibold text-slate-800 truncate">{catalogLabel("sectors", sector)}</p>
            </div>
          ) : (
            <button type="button" onClick={onGoToCuestionario} title="Completar en Cuestionario"
              className="border border-dashed border-slate-300 rounded p-3 bg-slate-50/30 text-left hover:border-brand-primary hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Sector</p>
              <p className="text-sm text-slate-400">— Completar</p>
            </button>
          )}
          {/* Tamaño */}
          {size ? (
            <div className="border border-slate-200 rounded p-3 bg-slate-50/50">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Tamaño</p>
              <p className="text-sm font-semibold text-slate-800 truncate">{catalogLabel("client_sizes", size)}</p>
            </div>
          ) : (
            <button type="button" onClick={onGoToCuestionario} title="Completar en Cuestionario"
              className="border border-dashed border-slate-300 rounded p-3 bg-slate-50/30 text-left hover:border-brand-primary hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Tamaño</p>
              <p className="text-sm text-slate-400">— Completar</p>
            </button>
          )}
          {/* Marcos */}
          {frameworks && frameworks.length > 0 ? (
            <div className="border border-slate-200 rounded p-3 bg-slate-50/50">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Marcos</p>
              <p className="text-sm font-semibold text-slate-800 leading-relaxed">
                {frameworks.map((f) => catalogLabel("frameworks", f)).join(", ")}
              </p>
            </div>
          ) : (
            <button type="button" onClick={onGoToCuestionario} title="Completar en Cuestionario"
              className="border border-dashed border-slate-300 rounded p-3 bg-slate-50/30 text-left hover:border-brand-primary hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Marcos</p>
              <p className="text-sm text-slate-400">— Completar</p>
            </button>
          )}
          {/* Alcance */}
          {alcanceGeo ? (
            <div className="border border-slate-200 rounded p-3 bg-slate-50/50">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Alcance</p>
              <p className="text-sm font-semibold text-slate-800 truncate" title={alcanceGeo}>{alcanceGeo}</p>
            </div>
          ) : (
            <button type="button" onClick={onGoToCuestionario} title="Completar en Cuestionario"
              className="border border-dashed border-slate-300 rounded p-3 bg-slate-50/30 text-left hover:border-brand-primary hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Alcance</p>
              <p className="text-sm text-slate-400">— Completar</p>
            </button>
          )}
          {/* Período */}
          {periodoInforme ? (
            <div className="border border-slate-200 rounded p-3 bg-slate-50/50">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Período</p>
              <p className="text-sm font-semibold text-slate-800 truncate">{periodoInforme}</p>
            </div>
          ) : (
            <button type="button" onClick={onGoToCuestionario} title="Completar en Cuestionario"
              className="border border-dashed border-slate-300 rounded p-3 bg-slate-50/30 text-left hover:border-brand-primary hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Período</p>
              <p className="text-sm text-slate-400">— Completar</p>
            </button>
          )}
        </div>
      )}

      {/* Barra de progreso */}
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

      {/* Banner campos pendientes — agrupado por paso con deep-link */}
      {progress && !isComplete && progress.filled > 0 && missingByStep.length > 0 && (
        <div className="bg-amber-50 border border-amber-100 rounded mb-3 overflow-hidden">
          <div className="px-3 py-2 border-b border-amber-100">
            <p className="text-xs text-amber-800">
              Para mejorar la calidad del análisis —{" "}
              <strong>{progress.total - progress.filled} campo{progress.total - progress.filled !== 1 ? "s" : ""} pendiente{progress.total - progress.filled !== 1 ? "s" : ""}:</strong>
            </p>
          </div>
          <div className="divide-y divide-amber-100">
            {missingByStep.map((group) => (
              <div key={group.stepKey} className="px-3 py-2 space-y-1.5">
                {/* Cabecera del paso */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[11px] font-bold text-amber-900 truncate">
                      {group.stepTitle}
                    </span>
                    <span className="text-[10px] text-amber-600 tabular-nums whitespace-nowrap">
                      ({group.fields.length} campo{group.fields.length !== 1 ? "s" : ""})
                    </span>
                    {group.aiCanFill ? (
                      <span className="inline-flex items-center gap-1 text-[10px] bg-teal-50 border border-teal-200 text-teal-700 px-1.5 py-0.5 rounded-sm font-bold whitespace-nowrap shrink-0">
                        <svg className="w-2.5 h-2.5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>
                        IA puede llenar
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 whitespace-nowrap shrink-0 italic">
                        Info del cliente
                      </span>
                    )}
                  </div>
                  {onGoToCuestionarioStep && (
                    <button
                      type="button"
                      onClick={() => onGoToCuestionarioStep(group.stepIdx)}
                      className="text-[10px] font-semibold text-amber-700 hover:text-amber-900 underline whitespace-nowrap shrink-0 py-1.5 px-2 -mr-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                    >
                      Ir al paso →
                    </button>
                  )}
                </div>
                {/* Lista de campos — expand in-place */}
                {(() => {
                  const isExpanded = expandedGroups.has(group.stepKey);
                  const visible = isExpanded ? group.fields : group.fields.slice(0, FIELDS_PER_GROUP);
                  const hidden = group.fields.length - FIELDS_PER_GROUP;
                  return (
                    <ul className="space-y-0.5">
                      {visible.map((f) => (
                        <li key={f.key} className="flex items-start gap-1 text-[11px] text-amber-800">
                          <span className="mt-0.5 shrink-0 text-amber-400">•</span>
                          {onGoToCuestionarioStep ? (
                            <button
                              type="button"
                              onClick={() => onGoToCuestionarioStep(group.stepIdx)}
                              className="underline hover:text-amber-900 text-left py-1 -my-0.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500 rounded-sm"
                            >
                              {f.label}
                            </button>
                          ) : (
                            <span>{f.label}</span>
                          )}
                        </li>
                      ))}
                      {!isExpanded && hidden > 0 && (
                        <li>
                          <button
                            type="button"
                            onClick={() => setExpandedGroups((prev) => new Set([...prev, group.stepKey]))}
                            className="text-[10px] text-amber-600 hover:text-amber-800 underline ml-3 py-0.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500 rounded-sm"
                          >
                            …ver {hidden} más en este paso
                          </button>
                        </li>
                      )}
                      {isExpanded && group.fields.length > FIELDS_PER_GROUP && (
                        <li>
                          <button
                            type="button"
                            onClick={() => setExpandedGroups((prev) => { const s = new Set(prev); s.delete(group.stepKey); return s; })}
                            className="text-[10px] text-amber-500 hover:text-amber-700 underline ml-3 py-0.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500 rounded-sm"
                          >
                            Ver menos
                          </button>
                        </li>
                      )}
                    </ul>
                  );
                })()}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Botón solo si completo */}
      {isComplete && (
        <Button size="sm" variant="secondary" onClick={onGoToCuestionario}>
          Ver cuestionario
        </Button>
      )}
    </div>
  );
}
