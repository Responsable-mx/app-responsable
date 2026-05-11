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

// Tipos mínimos del schema para extraer field labels — evita acoplarse al type completo.
type SchemaField = { key: string; label: string };
type SchemaStep = { key: string; title: string; fields?: SchemaField[]; sections?: { fields: SchemaField[] }[] };

function extractMissing(bundle: QuestionnaireBundle | undefined, max = 5): Array<{ key: string; label: string; stepKey: string; stepIdx: number }> {
  if (!bundle) return [];
  const schema = bundle.template.schema as unknown as { steps?: SchemaStep[] };
  const steps = schema.steps ?? [];
  const responses = bundle.response?.responses ?? {};
  const missing: Array<{ key: string; label: string; stepKey: string; stepIdx: number }> = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step) continue;
    // Schema soporta dos formas: { fields: [...] } o { sections: [{ fields: [...] }] }
    const fields: SchemaField[] = step.fields
      ?? step.sections?.flatMap((s) => s.fields ?? []) ?? [];
    const stepResp = (responses[step.key] ?? {}) as Record<string, unknown>;
    for (const f of fields) {
      const v = stepResp[f.key];
      const empty = v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
      if (empty) {
        missing.push({ key: f.key, label: f.label, stepKey: step.key, stepIdx: i });
        if (missing.length >= max) return missing;
      }
    }
  }
  return missing;
}

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
  /** Deep-link a un paso específico del wizard (opcional). */
  onGoToCuestionarioStep?: (stepIdx: number) => void;
  /** Necesario para fetch del bundle y calcular campos faltantes (SWR deduplicado con ClientTabs). */
  clientId: string;
  sector?: string | null;
  size?: string | null;
  frameworks?: string[] | null;
}) {
  const isComplete = progress && progress.filled >= progress.total && progress.total > 0;
  const hasKpis = sector || size || (frameworks && frameworks.length > 0);

  // SWR dedup: ClientTabs ya carga este endpoint con la misma key → 0 fetches extra.
  const { data: bundleResp } = useSWR<{ data: QuestionnaireBundle }>(
    !isComplete && progress && progress.total > 0 ? `/api/clients/${clientId}/questionnaire` : null,
    bundleFetcher,
    { revalidateOnFocus: false }
  );
  const missing = extractMissing(bundleResp?.data);
  const remaining = progress ? progress.total - progress.filled : 0;
  const extraCount = Math.max(0, remaining - missing.length);

  return (
    <div className="py-2">
      {/* KPI cards — Sector / Tamaño / Marcos */}
      {hasKpis && (
        <div className="grid grid-cols-3 gap-3 mb-4">
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
        </div>
      )}

      {/* Barra de progreso — igual que mockup-v7 */}
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

      {/* Warning banner — campos pendientes con lista explícita (mockup-v7 pattern) */}
      {progress && !isComplete && progress.filled > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-100 rounded text-xs text-amber-800 mb-3 space-y-2">
          <p>
            <strong>{progress.total - progress.filled} campos pendientes.</strong>{" "}
            Completarlos mejora la calidad del reporte final.
          </p>
          {missing.length > 0 && (
            <ul className="list-disc list-inside space-y-0.5 text-amber-900">
              {missing.map((f) => (
                <li key={`${f.stepKey}-${f.key}`}>
                  {onGoToCuestionarioStep ? (
                    <button
                      type="button"
                      onClick={() => onGoToCuestionarioStep(f.stepIdx)}
                      className="underline hover:text-amber-700 text-left"
                    >
                      {f.label}
                    </button>
                  ) : (
                    <span>{f.label}</span>
                  )}
                </li>
              ))}
              {extraCount > 0 && (
                <li className="italic text-amber-700 list-none ml-3">
                  …y {extraCount} {extraCount === 1 ? "campo" : "campos"} más
                </li>
              )}
            </ul>
          )}
          <button onClick={onGoToCuestionario} className="underline font-semibold hover:text-amber-900">
            Ir al cuestionario →
          </button>
        </div>
      )}

      {/* Solo mostrar botón si ya está completo (no competir con amber banner) */}
      {isComplete && (
        <Button size="sm" variant="secondary" onClick={onGoToCuestionario}>
          Ver cuestionario
        </Button>
      )}
    </div>
  );
}
