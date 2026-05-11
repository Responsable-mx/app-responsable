"use client";

import useSWR from "swr";
import { Button } from "@/components/ui/Button";
import { catalogLabel } from "@/components/doble-materialidad/catalog-lookup";
import type { QuestionnaireBundle } from "@/lib/questionnaires/types";

export type ContextoProgress = { filled: number; total: number } | null;

const bundleFetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<{ data: QuestionnaireBundle }>;
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
      const v = stepResp[f.key];
      const empty = v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
      if (empty) missing.push({ key: f.key, label: f.label });
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

  // SWR dedup: ClientTabs ya carga este endpoint con la misma key → 0 fetches extra.
  const { data: bundleResp } = useSWR<{ data: QuestionnaireBundle }>(
    progress && progress.total > 0 ? `/api/clients/${clientId}/questionnaire` : null,
    bundleFetcher,
    { revalidateOnFocus: false }
  );

  const responses = (bundleResp?.data?.response?.responses ?? {}) as Record<string, Record<string, unknown>>;
  const alcanceGeo = (responses["informacion-base"]?.["alcance_geografico"] as string | null) ?? null;
  const periodoInforme = (responses["estrategia-y-madurez"]?.["periodo_informe"] as string | null) ?? null;

  const missingByStep = extractMissingByStep(bundleResp?.data);
  const hasKpis = sector || size || (frameworks && frameworks.length > 0) || alcanceGeo || periodoInforme;

  return (
    <div className="py-2">
      {/* KPI cards — Sector / Tamaño / Marcos / Alcance / Período */}
      {hasKpis && (
        <div className="grid grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
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
          <div className="border border-slate-200 rounded p-3 bg-slate-50/50">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Alcance</p>
            <p className="text-sm font-semibold text-slate-800 truncate" title={alcanceGeo ?? undefined}>
              {alcanceGeo || "—"}
            </p>
          </div>
          <div className="border border-slate-200 rounded p-3 bg-slate-50/50">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Período</p>
            <p className="text-sm font-semibold text-slate-800 truncate">
              {periodoInforme || "—"}
            </p>
          </div>
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
              <strong>{progress.total - progress.filled} campos pendientes</strong>
              {" "}— completarlos mejora la calidad del reporte final.
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
                    {group.aiCanFill && (
                      <span className="text-[9px] bg-teal-50 border border-teal-200 text-teal-700 px-1.5 py-0.5 rounded-sm font-bold whitespace-nowrap shrink-0">
                        ✦ IA puede llenar
                      </span>
                    )}
                  </div>
                  {onGoToCuestionarioStep && (
                    <button
                      type="button"
                      onClick={() => onGoToCuestionarioStep(group.stepIdx)}
                      className="text-[10px] font-semibold text-amber-700 hover:text-amber-900 underline whitespace-nowrap shrink-0"
                    >
                      Ir al paso →
                    </button>
                  )}
                </div>
                {/* Lista de campos (máx FIELDS_PER_GROUP visible) */}
                <ul className="space-y-0.5">
                  {group.fields.slice(0, FIELDS_PER_GROUP).map((f) => (
                    <li key={f.key} className="flex items-start gap-1 text-[11px] text-amber-800">
                      <span className="mt-0.5 shrink-0 text-amber-400">•</span>
                      {onGoToCuestionarioStep ? (
                        <button
                          type="button"
                          onClick={() => onGoToCuestionarioStep(group.stepIdx)}
                          className="underline hover:text-amber-900 text-left"
                        >
                          {f.label}
                        </button>
                      ) : (
                        <span>{f.label}</span>
                      )}
                    </li>
                  ))}
                  {group.fields.length > FIELDS_PER_GROUP && (
                    <li className="text-[10px] italic text-amber-600 ml-3">
                      …y {group.fields.length - FIELDS_PER_GROUP} más en este paso
                    </li>
                  )}
                </ul>
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
