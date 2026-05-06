"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import {
  computeProgress,
  isFieldFilled,
  isFieldResponse,
  isSourceStale,
  isWizardSchema,
  type FieldResponse,
  type FieldValue,
  type QuestionnaireBundle,
  type QuestionnaireResponseData,
  type SourceItem,
  type SourceType,
  type WizardField,
  type WizardStep,
} from "@/lib/questionnaires/types";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Modal } from "@/components/ui/Modal";
import { SelectField } from "@/components/ui/SelectField";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { WizardStepNav } from "@/components/questionnaire/WizardStepNav";
import { AiBulkBanner } from "@/components/questionnaire/AiBulkBanner";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<{ data: QuestionnaireBundle }>;
  });

const AUTOSAVE_DELAY_MS = 1200;
type SaveState = "idle" | "saving" | "saved" | "error" | "conflict";

const SOURCE_CHIP: Record<SourceType, { dot: string; bg: string; text: string; label: string }> = {
  public: { dot: "bg-emerald-500", bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", label: "público" },
  interpretation: { dot: "bg-amber-400", bg: "bg-amber-50 border-amber-200", text: "text-amber-700", label: "interpretación" },
  consultor_only: { dot: "bg-slate-400", bg: "bg-slate-50 border-slate-200", text: "text-slate-600", label: "solo consultor" },
};

export function QuestionnaireTab({
  clientId,
  clientServices = [],
  initialStepIndex = 0,
  autoFillOnMount = false,
}: {
  clientId: string;
  clientServices?: string[];
  initialStepIndex?: number;
  autoFillOnMount?: boolean;
}) {
  const { data, error, isLoading, mutate } = useSWR(
    `/api/clients/${clientId}/questionnaire`,
    fetcher
  );

  if (isLoading) return <SkeletonCard />;
  if (error || !data) {
    return (
      <div className="border border-rose-200 bg-rose-50 rounded p-4 text-sm text-rose-700">
        No se pudo cargar el cuestionario.{" "}
        <button onClick={() => mutate()} className="underline hover:no-underline">
          Reintentar
        </button>
      </div>
    );
  }

  return <WizardEditor clientId={clientId} clientServices={clientServices} initial={data.data} mutate={() => mutate()} initialStepIndex={initialStepIndex} autoFillOnMount={autoFillOnMount} />;
}

function WizardEditor({
  clientId,
  clientServices = [],
  initial,
  mutate,
  initialStepIndex = 0,
  autoFillOnMount = false,
}: {
  clientId: string;
  clientServices?: string[];
  initial: QuestionnaireBundle;
  mutate: () => void;
  initialStepIndex?: number;
  autoFillOnMount?: boolean;
}) {
  const { template } = initial;
  const schema = template.schema;
  const isWizard = isWizardSchema(schema);
  const steps: WizardStep[] = isWizard ? schema.steps : [];

  const [responses, setResponses] = useState<QuestionnaireResponseData>(
    initial.response?.responses ?? {}
  );
  const [activeStep, setActiveStep] = useState(Math.min(Math.max(0, initialStepIndex), steps.length - 1 || 0));
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [drawerField, setDrawerField] = useState<{ stepKey: string; fieldKey: string } | null>(null);
  const [aiFilling, setAiFilling] = useState<string | null>(null); // step.key
  const [aiBulkProgress, setAiBulkProgress] = useState<{ current: number; total: number; stepTitle: string } | null>(null);
  // Estado del modal "Importar texto" para doc-fill.
  const [docFillOpen, setDocFillOpen] = useState(false);
  const [docFillText, setDocFillText] = useState("");
  const [docFilling, setDocFilling] = useState(false);
  const toast = useToast();

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);
  // Ref que siempre espeja responses — permite que save() y el flush de unmount
  // lean el valor más reciente sin depender del closure (D-38 stale closure bug).
  const responsesRef = useRef<QuestionnaireResponseData>(responses);
  // Optimistic concurrency: trackeamos updated_at del último response server-side.
  // El PATCH lo manda como expectedUpdatedAt; si otro consultor escribió en el medio
  // el server retorna 409 y reload manual.
  const lastServerUpdatedAt = useRef<string | null>(initial.response?.updated_at ?? null);
  // Backoff exponencial: 1s, 2s, 4s, 8s. Tope en MAX_RETRIES para evitar
  // loop infinito en falla de red prolongada (D-15).
  const MAX_RETRIES = 5;
  const retryAttempt = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const progress = useMemo(() => computeProgress(schema, responses), [schema, responses]);

  // D-38: mantener ref siempre actualizado para que save() y el flush de unmount
  // lean la versión más reciente sin depender del closure estale de useState.
  useEffect(() => {
    responsesRef.current = responses;
  }, [responses]);

  // Hooks de ciclo de vida — deben estar antes del early-return (Rules of Hooks).
  // aiFillAll está definida más abajo pero es function declaration → hoisting la hace accesible.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (retryTimer.current) clearTimeout(retryTimer.current);
      // D-38: flush inmediato al desmontar (ej. cambio de tab antes de que expire
      // el debounce de 1.2s). keepalive=true permite que el fetch complete aunque
      // el componente ya no esté montado.
      if (dirty.current) {
        const snap = responsesRef.current;
        const prog = computeProgress(schema, snap);
        const completedSections = steps
          .filter((s) => prog.sectionProgress[s.key]?.pct === 100 && s.fields.length > 0)
          .map((s) => s.key);
        void fetch(`/api/clients/${clientId}/questionnaire`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            service: template.service_key,
            responses: snap,
            completedSections,
            expectedUpdatedAt: lastServerUpdatedAt.current,
          }),
          keepalive: true,
        });
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-trigger bulk AI fill al montar (cuando viene de /clientes/nuevo con &autoFill=1)
  const autoFiredRef = useRef(false);
  useEffect(() => {
    if (autoFillOnMount && !autoFiredRef.current && steps.length > 0) {
      autoFiredRef.current = true;
      void aiFillAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFillOnMount]);

  if (!isWizard) {
    return (
      <div className="border border-amber-200 bg-amber-50 rounded p-4 text-sm text-amber-700">
        Template legacy detectado. Aplicar migración 0023 para usar wizard.
      </div>
    );
  }

  const step = steps[activeStep];
  const stepProgress = progress.sectionProgress[step.key] ?? { filled: 0, total: step.fields.length, pct: 0 };
  const isStepComplete = stepProgress.pct === 100 && step.fields.length > 0;

  function getFieldRaw(stepKey: string, fieldKey: string): FieldResponse | null {
    const raw = (responses[stepKey] as Record<string, unknown> | undefined)?.[fieldKey];
    if (isFieldResponse(raw)) return raw;
    return null;
  }

  function setFieldValue(stepKey: string, fieldKey: string, value: FieldValue) {
    setResponses((prev) => {
      const stepObj = (prev[stepKey] as Record<string, FieldResponse>) ?? {};
      const existing = stepObj[fieldKey] ?? {
        value: null,
        source_type: "consultor_only" as SourceType,
        sources: [] as SourceItem[],
        validated: false,
        updated_at: new Date().toISOString(),
      };
      const next: FieldResponse = {
        ...existing,
        value,
        updated_at: new Date().toISOString(),
      };
      return { ...prev, [stepKey]: { ...stepObj, [fieldKey]: next } };
    });
    dirty.current = true;
    scheduleSave();
  }

  function toggleValidated(stepKey: string, fieldKey: string) {
    const stepObj = (responses[stepKey] as Record<string, FieldResponse>) ?? {};
    const wasValidated = (stepObj[fieldKey] as FieldResponse | undefined)?.validated ?? false;
    setResponses((prev) => {
      const prevStepObj = (prev[stepKey] as Record<string, FieldResponse>) ?? {};
      const existing = prevStepObj[fieldKey];
      if (!existing) return prev;
      const next: FieldResponse = { ...existing, validated: !existing.validated, updated_at: new Date().toISOString() };
      return { ...prev, [stepKey]: { ...prevStepObj, [fieldKey]: next } };
    });
    if (!wasValidated) {
      toast.push("success", "Campo marcado como validado ✓");
    }
    dirty.current = true;
    scheduleSave();
  }

  function scheduleSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void save(), AUTOSAVE_DELAY_MS);
  }

  async function save(overrideResponses?: QuestionnaireResponseData) {
    if (!dirty.current) return;
    // Cancelar retry pendiente — esta save reemplaza al pendiente.
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
    dirty.current = false;
    setSaveState("saving");
    setErrorMsg(null);
    // D-38: usar ref para evitar stale closure — responsesRef siempre tiene el valor
    // más reciente aunque save() se llame desde un closure viejo (autosave timer,
    // retry, o flush de unmount).
    const responsesToSave = overrideResponses ?? responsesRef.current;
    const computedProgress = computeProgress(schema, responsesToSave);
    const completedSections = steps
      .filter((s) => (computedProgress.sectionProgress[s.key]?.pct === 100 && s.fields.length > 0))
      .map((s) => s.key);
    try {
      const res = await fetch(`/api/clients/${clientId}/questionnaire`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service: template.service_key,
          responses: responsesToSave,
          completedSections,
          // Optimistic lock: server rechaza con 409 si alguien más escribió primero.
          expectedUpdatedAt: lastServerUpdatedAt.current,
        }),
      });
      if (res.status === 409) {
        // Conflicto de edición. No reintentamos auto — el usuario debe ver el estado
        // remoto antes de re-aplicar. Estado dedicado "conflict" con CTA de recarga.
        const json = await res.json().catch(() => ({}));
        if (json.server_updated_at) {
          lastServerUpdatedAt.current = json.server_updated_at as string;
        }
        dirty.current = true;
        setSaveState("conflict");
        setErrorMsg(
          json.error ??
            "Otro consultor guardó cambios. Recarga el cuestionario antes de seguir editando."
        );
        retryAttempt.current = 0;
        return;
      }
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json().catch(() => ({}))) as {
        data?: { updated_at?: string };
      };
      if (json.data?.updated_at) {
        lastServerUpdatedAt.current = json.data.updated_at;
      }
      retryAttempt.current = 0;
      setSaveState("saved");
      setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 2000);
    } catch (e) {
      // Re-marcar dirty para que el próximo schedule/retry reintente con cambios actuales.
      dirty.current = true;
      setSaveState("error");
      setErrorMsg(e instanceof Error ? e.message : "Error al guardar");
      // D-15: tope en MAX_RETRIES. Sin este límite, retryAttempt crece indefinidamente
      // y el componente reintenta cada 8s para siempre si el server está caído.
      if (retryAttempt.current >= MAX_RETRIES) {
        // Dejar en estado error persistente; el consultor ve CTA "Guardar manualmente".
        setSaveState("error");
        setErrorMsg("Guardado automático falló repetidamente. Recarga la página para reintentar.");
        return;
      }
      // Backoff exponencial: 1s, 2s, 4s, 8s.
      const delay = Math.min(1000 * 2 ** retryAttempt.current, 8000);
      retryAttempt.current += 1;
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = setTimeout(() => {
        retryTimer.current = null;
        void save();
      }, delay);
    }
  }

  async function aiFill(stepKey: string) {
    setAiFilling(stepKey);
    try {
      const res = await fetch(`/api/clients/${clientId}/wizard/${stepKey}/ai-fill`, {
        method: "POST",
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as { data: Record<string, FieldResponse> };
      // Computar el merged ANTES de setState para pasarlo a save() y evitar
      // closure stale: si save() lee `responses` del closure, está vacío.
      const merged: QuestionnaireResponseData = { ...responses, [stepKey]: json.data };
      setResponses(merged);
      dirty.current = true;
      await save(merged);
      toast.push("success", "IA llenó campos del paso");
      mutate();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Error en AI fill");
    } finally {
      setAiFilling(null);
    }
  }

  // Llena el paso activo extrayendo datos del texto pegado por el consultor.
  // Reutiliza el mismo merge/save que aiFill — misma respuesta {data: Record<string, FieldResponse>}.
  async function docFill(stepKey: string) {
    if (!docFillText.trim()) return;
    setDocFilling(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/wizard/${stepKey}/doc-fill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: docFillText }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as { data: Record<string, FieldResponse> };
      const merged: QuestionnaireResponseData = { ...responses, [stepKey]: json.data };
      setResponses(merged);
      dirty.current = true;
      await save(merged);
      toast.push("success", "Texto importado — campos del paso actualizados");
      setDocFillOpen(false);
      setDocFillText("");
      mutate();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Error al importar el documento");
    } finally {
      setDocFilling(false);
    }
  }

  async function aiFillAll() {
    const aiSteps = steps.filter((s) => s.ai_can_fill);
    if (aiSteps.length === 0) return;
    let completedCount = 0;
    let success = 0;
    const failures: { step: string; error: string }[] = [];
    setAiBulkProgress({ current: 0, total: aiSteps.length, stepTitle: "Iniciando…" });

    // Acumulador de respuestas IA durante todo el bulk. Se persiste al final con
    // un solo PATCH al server (atomic). Evita race conditions de saves
    // concurrentes con state stale del closure.
    const accum: Record<string, Record<string, FieldResponse>> = {};

    async function fillOne(s: WizardStep) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 290_000);
        const res = await fetch(`/api/clients/${clientId}/wizard/${s.key}/ai-fill`, {
          method: "POST",
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error ?? `HTTP ${res.status}`);
        }
        const json = (await res.json()) as { data: Record<string, FieldResponse> };
        accum[s.key] = json.data;
        setResponses((prev) => ({ ...prev, [s.key]: json.data }));
        success++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Error desconocido";
        console.error(`[aiFillAll] ${s.key}:`, msg);
        failures.push({ step: s.title, error: msg });
      } finally {
        completedCount++;
        setAiBulkProgress({
          current: completedCount,
          total: aiSteps.length,
          stepTitle: `${aiSteps.length - completedCount} pasos restantes`,
        });
      }
    }

    // Batches de 3 concurrent — paraleliza llamadas Anthropic respetando rate limit
    const BATCH_SIZE = 3;
    for (let i = 0; i < aiSteps.length; i += BATCH_SIZE) {
      const batch = aiSteps.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(fillOne));
    }

    // D-16: usar functional update para obtener el estado ACTUAL de responses al
    // momento del merge final — evita stale closure si el consultor editó campos
    // manualmente mientras el bulk AI corría en paralelo.
    if (Object.keys(accum).length > 0) {
      let mergedForSave: QuestionnaireResponseData = {};
      setResponses((prev) => {
        mergedForSave = { ...prev, ...accum };
        return mergedForSave;
      });
      dirty.current = true;
      await save(mergedForSave);
    }

    setAiBulkProgress(null);
    mutate();
    if (failures.length === 0) {
      toast.push("success", `IA llenó ${success} pasos correctamente`);
    } else if (success === 0) {
      toast.push("error", `AI fill falló: ${failures[0].error}`);
    } else {
      toast.push("warning", `${success} OK · ${failures.length} fallaron: ${failures.map((f) => f.step).join(", ")}`);
    }
  }

  const aiCapableCount = steps.filter((s) => s.ai_can_fill).length;
  const someStepHasResponses = Object.values(responses).some(
    (v) => typeof v === "object" && v !== null && Object.keys(v as object).length > 0
  );

  const hasIaService = clientServices.includes("doble_materialidad_ia");

  return (
    <div>
      {/* Banner servicio Doble materialidad por IA */}
      {hasIaService && (
        <div className="mb-4 flex items-center gap-2 border border-brand-primary/30 bg-brand-primary/5 rounded px-4 py-2.5">
          <svg className="w-4 h-4 shrink-0 text-brand-primary-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <span className="text-xs font-semibold text-brand-primary-dark">Doble materialidad por IA</span>
          <span className="text-xs text-slate-600">— todos los pasos habilitados con llenado automático IA.</span>
        </div>
      )}
      {/* Banner global AI fill */}
      <AiBulkBanner
        aiCapableCount={aiCapableCount}
        totalSteps={steps.length}
        someStepHasResponses={someStepHasResponses}
        progress={aiBulkProgress}
        onFillAll={aiFillAll}
      />

    <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-5">
      {/* Stepper lateral */}
      <WizardStepNav
        steps={steps}
        activeStep={activeStep}
        sectionProgress={progress.sectionProgress}
        onSelect={setActiveStep}
      />

      {/* Step content */}
      <div className="min-w-0">
        {/* Banner conflicto de edición — otro consultor guardó cambios mientras
            editabas. Bloquea visualmente sobre la lista de campos hasta recargar. */}
        {saveState === "conflict" && (
          <div className="mb-4 rounded border border-amber-300 bg-amber-50 px-4 py-3">
            <div className="flex items-start gap-3 text-xs">
              <svg
                className="w-5 h-5 shrink-0 mt-0.5 text-amber-700"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div className="flex-1">
                <p className="font-bold text-amber-900 mb-1">
                  Conflicto de edición — otro consultor guardó cambios
                </p>
                <p className="text-amber-800 mb-2">
                  Tus ediciones no se han guardado. Recarga el cuestionario para ver el estado actual y vuelve a aplicar tus cambios. Si reintentas sin recargar, sobrescribirás lo que guardó el otro consultor.
                </p>
                <div className="flex items-center gap-3">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => mutate()}
                  >
                    Recargar cuestionario
                  </Button>
                  <button
                    onClick={() => {
                      // Forzar reintento sobreescribiendo: limpia expectedUpdatedAt
                      // para que el server acepte sin chequear lock.
                      lastServerUpdatedAt.current = null;
                      dirty.current = true;
                      void save();
                    }}
                    className="text-xs text-amber-700 hover:underline"
                  >
                    Sobrescribir igual
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* UDN banner: cuando estás en pasos 5-9 (only_double_materialidad) y el cliente
            indicó que sus unidades son materialmente distintas (paso 5) */}
        {step.only_double_materialidad && (() => {
          const udnRaw = (responses["modelo-de-negocio-estructura"] as Record<string, unknown> | undefined)?.["unidades_distintas"];
          const udnValue = typeof udnRaw === "object" && udnRaw && "value" in udnRaw ? (udnRaw as { value: unknown }).value : udnRaw;
          const isDistinct = typeof udnValue === "string" && /^s[ií]/i.test(udnValue.trim());
          if (!isDistinct) return null;
          return (
            <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="flex items-start gap-2 text-xs text-amber-800">
                <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <p className="font-bold mb-0.5">Unidades de negocio materialmente distintas detectadas</p>
                  <p>
                    Según el cuestionario, las unidades del cliente son materialmente distintas entre sí. Los campos
                    de los pasos 5 al 9 deben llenarse <strong>una vez por unidad de negocio</strong> (sectores,
                    cadenas de valor, perfiles de riesgo distintos). Documenta cada unidad en el campo correspondiente.
                  </p>
                </div>
              </div>
            </div>
          );
        })()}

        <div className="flex items-start justify-between gap-3 mb-4 px-1">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-slate-900">{step.title}</h2>
            <p className="text-xs text-slate-600 mt-0.5">{step.subtitle}</p>
            {step.only_double_materialidad && (
              <span className="inline-flex items-center mt-2 text-[10px] font-bold uppercase tracking-wide bg-rose-50 text-rose-700 rounded-sm px-1.5 py-0.5">
                Solo Doble Materialidad
              </span>
            )}
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <SaveIndicator state={saveState} errorMsg={errorMsg} />
            <div className="flex items-center gap-2">
              {/* Botón "Importar" — abre modal para pegar transcripción/notas */}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setDocFillOpen(true)}
                disabled={!!aiBulkProgress || !!aiFilling}
                title="Pegar transcripción, notas de entrevista o datos de Excel/Word para que Aurora extraiga los campos"
              >
                <svg className="w-3.5 h-3.5 mr-1 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Importar
              </Button>
              {step.ai_can_fill && (() => {
                const stepHasData = stepProgress.filled > 0;
                return (
                  <Button
                    variant="primary"
                    size="sm"
                    loading={aiFilling === step.key}
                    onClick={() => aiFill(step.key)}
                    disabled={!!aiBulkProgress}
                  >
                    {stepHasData ? "Refrescar este paso" : "Llenar con IA"}
                  </Button>
                );
              })()}
            </div>
          </div>
        </div>

        <div className="border border-slate-200 rounded bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
            <div className="flex-1 h-1 bg-slate-100 rounded-sm overflow-hidden">
              <div
                className={`h-full transition-all ${isStepComplete ? "bg-emerald-500" : stepProgress.pct > 0 ? "bg-brand-primary" : "bg-slate-300"}`}
                style={{ width: `${stepProgress.pct}%` }}
              />
            </div>
            <span className={`text-[11px] font-bold tabular-nums ${isStepComplete ? "text-emerald-700" : "text-slate-700"}`}>
              {stepProgress.pct}%
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {step.fields.map((field) => {
              const resp = getFieldRaw(step.key, field.key);
              const value = resp?.value ?? null;
              const sourceType = resp?.source_type ?? "consultor_only";
              const sources = resp?.sources ?? [];
              const validated = !!resp?.validated;
              const filled = isFieldFilled(value);
              const stale = sources.some((s) => isSourceStale(s.date));
              return (
                <FieldRow
                  key={field.key}
                  field={field}
                  value={value}
                  sourceType={sourceType}
                  sources={sources}
                  validated={validated}
                  filled={filled}
                  stale={stale}
                  hint={field.hint}
                  updatedAt={resp?.updated_at}
                  onChange={(v) => setFieldValue(step.key, field.key, v)}
                  onToggleValidated={() => toggleValidated(step.key, field.key)}
                  onOpenDrawer={() => setDrawerField({ stepKey: step.key, fieldKey: field.key })}
                />
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between mt-4 px-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveStep((i) => Math.max(0, i - 1))}
            disabled={activeStep === 0}
          >
            ← Anterior
          </Button>
          <span className="text-xs text-slate-500 tabular-nums">
            {activeStep + 1} / {steps.length}
          </span>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setActiveStep((i) => Math.min(steps.length - 1, i + 1))}
            disabled={activeStep === steps.length - 1}
          >
            Siguiente →
          </Button>
        </div>
      </div>

      {drawerField && (() => {
        const sf = steps.find((x) => x.key === drawerField.stepKey);
        const f = sf?.fields.find((x) => x.key === drawerField.fieldKey);
        const resp = getFieldRaw(drawerField.stepKey, drawerField.fieldKey);
        if (!sf || !f) return null;
        return (
          <SourceDrawer
            field={f}
            response={resp}
            onClose={() => setDrawerField(null)}
            onUpdateSourceType={(type) => {
              setResponses((prev) => {
                const stepObj = (prev[drawerField.stepKey] as Record<string, FieldResponse>) ?? {};
                const existing = stepObj[drawerField.fieldKey] ?? {
                  value: null, source_type: "consultor_only" as SourceType, sources: [], validated: false, updated_at: new Date().toISOString(),
                };
                return { ...prev, [drawerField.stepKey]: { ...stepObj, [drawerField.fieldKey]: { ...existing, source_type: type, updated_at: new Date().toISOString() } } };
              });
              dirty.current = true;
              scheduleSave();
            }}
            onAddSource={(src) => {
              setResponses((prev) => {
                const stepObj = (prev[drawerField.stepKey] as Record<string, FieldResponse>) ?? {};
                const existing = stepObj[drawerField.fieldKey] ?? {
                  value: null, source_type: "consultor_only" as SourceType, sources: [], validated: false, updated_at: new Date().toISOString(),
                };
                return { ...prev, [drawerField.stepKey]: { ...stepObj, [drawerField.fieldKey]: { ...existing, sources: [...existing.sources, src], updated_at: new Date().toISOString() } } };
              });
              dirty.current = true;
              scheduleSave();
            }}
            onRemoveSource={(idx) => {
              setResponses((prev) => {
                const stepObj = (prev[drawerField.stepKey] as Record<string, FieldResponse>) ?? {};
                const existing = stepObj[drawerField.fieldKey];
                if (!existing) return prev;
                return { ...prev, [drawerField.stepKey]: { ...stepObj, [drawerField.fieldKey]: { ...existing, sources: existing.sources.filter((_, i) => i !== idx), updated_at: new Date().toISOString() } } };
              });
              dirty.current = true;
              scheduleSave();
            }}
          />
        );
      })()}

      {/* Modal "Importar texto" — pegar transcripción/notas/datos para doc-fill */}
      <Modal
        open={docFillOpen}
        onClose={() => { setDocFillOpen(false); setDocFillText(""); }}
        title={`Importar texto para "${step.title}"`}
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600">
            Pega una transcripción de entrevista, notas de reunión, datos de un Excel copiado
            o cualquier texto del cliente. Aurora extraerá solo los datos relevantes para
            este paso y los llenará como borrador para que los valides.
          </p>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
              Texto / transcripción
            </label>
            <textarea
              className="font-sans w-full text-sm border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 resize-y min-h-[180px] max-h-[400px]"
              placeholder="Pega aquí la transcripción, notas de la entrevista, datos del Excel u otro documento del cliente…"
              value={docFillText}
              onChange={(e) => setDocFillText(e.target.value)}
              disabled={docFilling}
            />
            <p className="text-[10px] text-slate-400 mt-1 tabular-nums">
              {docFillText.length.toLocaleString()} / 50,000 chars
            </p>
          </div>
          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={() => { setDocFillOpen(false); setDocFillText(""); }}
              className="text-sm text-slate-500 hover:text-slate-800 transition-colors"
              disabled={docFilling}
            >
              Cancelar
            </button>
            <Button
              variant="primary"
              size="md"
              loading={docFilling}
              disabled={docFillText.trim().length < 10 || docFillText.length > 50_000}
              onClick={() => void docFill(step.key)}
            >
              Extraer y llenar campos
            </Button>
          </div>
        </div>
      </Modal>
    </div>
    </div>
  );
}

function SaveIndicator({ state, errorMsg }: { state: SaveState; errorMsg: string | null }) {
  if (state === "saving") return <span className="text-[11px] text-slate-500">Guardando…</span>;
  if (state === "saved") return <span className="text-[11px] text-emerald-700">✓ Guardado</span>;
  if (state === "conflict")
    return (
      <span className="text-[11px] text-amber-700 font-semibold" title={errorMsg ?? ""}>
        Conflicto · recargar
      </span>
    );
  if (state === "error")
    return (
      <span className="text-[11px] text-rose-700 max-w-[200px] text-right leading-tight block">
        {errorMsg ?? "Error al guardar"}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-slate-600">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
      Autoguardado activo
    </span>
  );
}

function FieldRow({
  field,
  value,
  sourceType,
  sources,
  validated,
  filled,
  stale,
  hint,
  updatedAt,
  onChange,
  onToggleValidated,
  onOpenDrawer,
}: {
  field: WizardField;
  value: FieldValue;
  sourceType: SourceType;
  sources: SourceItem[];
  validated: boolean;
  filled: boolean;
  stale: boolean;
  hint?: string;
  updatedAt?: string;
  onChange: (v: FieldValue) => void;
  onToggleValidated: () => void;
  onOpenDrawer: () => void;
}) {
  const [pendingEdit, setPendingEdit] = useState<{ v: FieldValue } | null>(null);
  const chip = SOURCE_CHIP[sourceType];
  const baseInput = "font-sans w-full border border-slate-300 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary";

  function handleChange(newValue: FieldValue) {
    if (validated) {
      setPendingEdit({ v: newValue });
      return;
    }
    onChange(newValue);
  }

  return (
    <div className="px-4 py-3 hover:bg-slate-50/50 transition-colors">
      <div className="flex items-start gap-3 mb-1.5">
        <label className="text-xs font-semibold text-slate-700 flex-1 min-w-0">
          {field.label}
          {field.required && <span className="text-rose-500 ml-0.5">*</span>}
        </label>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Chip de origen: si hay exactamente 1 fuente → link directo; >1 → drawer */}
          {(sourceType !== "consultor_only" || sources.length > 0) && (
            sources.length === 1 ? (
              <a
                href={sources[0].url}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1 text-[10px] font-medium border rounded-full px-1.5 py-0.5 ${chip.bg} ${chip.text} hover:underline`}
                title={sources[0].title}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${chip.dot}`} />
                {chip.label}
                <svg className="w-2.5 h-2.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            ) : (
              <button
                type="button"
                onClick={onOpenDrawer}
                className={`inline-flex items-center gap-1 text-[10px] font-medium border rounded-full px-1.5 py-0.5 ${chip.bg} ${chip.text}`}
                title="Ver fuentes"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${chip.dot}`} />
                {chip.label}
                {sources.length > 0 && <span className="opacity-70">· {sources.length}</span>}
              </button>
            )
          )}
          {/* Fuentes vacías: botón minimal para abrir drawer */}
          {sourceType === "consultor_only" && sources.length === 0 && (
            <button
              type="button"
              onClick={onOpenDrawer}
              className="text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
              title="Agregar fuentes"
            >
              + fuente
            </button>
          )}
          {stale && (
            <span title="Alguna fuente >2 años" className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5 font-medium">
              ⚠ desactualizada
            </span>
          )}
          {/* Badge validado: solo cuando validado o cuando está lleno y no validado */}
          {validated && (
            <button
              type="button"
              onClick={onToggleValidated}
              className="text-[10px] font-bold rounded-sm px-1.5 py-0.5 bg-emerald-100 text-emerald-700 transition-colors"
              title="Validado por consultor"
            >
              ✓ validado
            </button>
          )}
          {!validated && filled && (
            <button
              type="button"
              onClick={onToggleValidated}
              className="text-[10px] font-bold rounded-sm px-1.5 py-0.5 bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors"
              title="Marcar como validado"
            >
              validar
            </button>
          )}
        </div>
      </div>

      {field.type === "textarea" ? (
        <AutoResizeTextarea
          className={`${baseInput} px-3 py-2 min-h-[40px] resize-none overflow-hidden`}
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          onChange={(v) => handleChange(v)}
        />
      ) : field.type === "number" ? (
        <input
          type="number"
          className={`${baseInput} px-3 py-2 tabular-nums`}
          value={typeof value === "number" ? value : ""}
          onChange={(e) => handleChange(e.target.value === "" ? null : Number(e.target.value))}
        />
      ) : field.type === "boolean" ? (
        <div className="flex gap-2">
          {[{ v: true, label: "Sí" }, { v: false, label: "No" }].map((opt) => (
            <button
              key={String(opt.v)}
              type="button"
              onClick={() => handleChange(value === opt.v ? null : opt.v)}
              className={`px-3 py-1.5 text-xs font-medium rounded border transition-colors ${
                value === opt.v
                  ? "bg-brand-primary-light border-brand-primary text-brand-primary-dark"
                  : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : field.type === "select" ? (
        <SelectField
          value={typeof value === "string" ? value : ""}
          onChange={(v) => handleChange(v || null)}
          options={
            Array.isArray(field.options)
              ? field.options.map((opt) => {
                  const v = typeof opt === "string" ? opt : opt.value;
                  const l = typeof opt === "string" ? opt : opt.label;
                  return { value: v, label: l };
                })
              : []
          }
          placeholder="— Seleccionar —"
        />
      ) : field.type === "multiselect" ? (
        <div className="flex flex-wrap gap-1.5">
          {(field.options ?? []).map((opt, i) => {
            const v = typeof opt === "string" ? opt : opt.value;
            const l = typeof opt === "string" ? opt : opt.label;
            const arr = Array.isArray(value) ? value : [];
            const active = arr.includes(v);
            return (
              <button
                key={`${v}-${i}`}
                type="button"
                onClick={() => handleChange(active ? arr.filter((x) => x !== v) : [...arr, v])}
                className={`px-2.5 py-1 text-xs rounded-sm border transition-colors ${
                  active
                    ? "bg-brand-primary-light border-brand-primary text-brand-primary-dark"
                    : "bg-white border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {l}
              </button>
            );
          })}
        </div>
      ) : (
        <AutoResizeTextarea
          className={`${baseInput} px-3 py-2 min-h-[36px] resize-none overflow-hidden`}
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          onChange={(v) => handleChange(v)}
        />
      )}

      {hint && <p className="text-[11px] text-slate-500 italic mt-1">{hint}</p>}
      {updatedAt && (
        <p className="text-[10px] text-slate-400 mt-1 tabular-nums">
          Actualizado {new Date(updatedAt).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}
        </p>
      )}

      {pendingEdit && (
        <ConfirmModal
          open
          title="Editar campo validado"
          description="Este campo ya fue validado. Si lo editas, perderá la marca de validado. ¿Continuar?"
          tone="primary"
          confirmLabel="Editar igual"
          onConfirm={async () => {
            onChange(pendingEdit.v);
            onToggleValidated();
            setPendingEdit(null);
          }}
          onCancel={() => setPendingEdit(null)}
        />
      )}
    </div>
  );
}

function SourceDrawer({
  field,
  response,
  onClose,
  onUpdateSourceType,
  onAddSource,
  onRemoveSource,
}: {
  field: WizardField;
  response: FieldResponse | null;
  onClose: () => void;
  onUpdateSourceType: (type: SourceType) => void;
  onAddSource: (src: SourceItem) => void;
  onRemoveSource: (idx: number) => void;
}) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  // D-26: validar que la URL sea http/https antes de agregar. Previene XSS via
  // "javascript:" URIs que se renderizan como <a href> en la lista de fuentes.
  const isValidUrl =
    url.startsWith("https://") || url.startsWith("http://");

  function handleAdd() {
    if (!url || !title || !isValidUrl) return;
    onAddSource({ url, title, date, type: "manual" });
    setUrl(""); setTitle(""); setDate(new Date().toISOString().slice(0, 10));
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white shadow-2xl border-l border-slate-200 flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Fuentes</p>
            <h3 className="text-sm font-bold text-slate-900">{field.label}</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Tipo de origen</p>
            <div className="flex gap-1.5">
              {(["public", "interpretation", "consultor_only"] as SourceType[]).map((t) => {
                const meta = SOURCE_CHIP[t];
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onUpdateSourceType(t)}
                    className={`px-2.5 py-1.5 text-xs rounded border transition-colors flex items-center gap-1.5 ${
                      response?.source_type === t
                        ? `${meta.bg} ${meta.text} border-current`
                        : "bg-white border-slate-300 text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                    {meta.label}
                  </button>
                );
              })}
            </div>
            {/* Aviso inline: "public" e "interpretation" exigen al menos 1 fuente */}
            {(response?.source_type === "public" || response?.source_type === "interpretation") &&
              (!response?.sources || response.sources.length === 0) && (
                <p className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
                  {response.source_type === "interpretation"
                    ? "Interpretación requiere al menos una fuente que sustente el juicio. Agrega una URL abajo o cambia a «solo consultor»."
                    : "Dato público requiere al menos una fuente verificable. Agrega una URL abajo."}
                </p>
              )}
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
              Fuentes documentadas {response?.sources.length ? `(${response.sources.length})` : ""}
            </p>
            <div className="space-y-2">
              {(response?.sources ?? []).map((src, i) => {
                const stale = isSourceStale(src.date);
                return (
                  <div key={i} className="flex items-start gap-2 border border-slate-200 rounded p-2">
                    <div className="min-w-0 flex-1">
                      <a href={src.url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-brand-primary-dark hover:underline truncate block">
                        {src.title}
                      </a>
                      <p className="text-[10px] text-slate-500 truncate">{src.url}</p>
                      <p className={`text-[10px] mt-0.5 tabular-nums ${stale ? "text-amber-700" : "text-slate-400"}`}>
                        {new Date(src.date).toLocaleDateString("es-MX")}
                        {stale && " · ⚠ >2 años"}
                      </p>
                    </div>
                    <button
                      onClick={() => onRemoveSource(i)}
                      className="text-rose-400 hover:text-rose-600 text-xs"
                      title="Eliminar fuente"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
              {(!response?.sources || response.sources.length === 0) && (
                <p className="text-xs text-slate-400 italic">Sin fuentes registradas.</p>
              )}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Agregar fuente</p>
            <div className="space-y-2">
              <div>
                <input type="url" placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} className={`font-sans w-full border rounded px-2 py-1.5 text-xs ${url && !isValidUrl ? "border-rose-400 bg-rose-50" : "border-slate-300"}`} />
                {url && !isValidUrl && (
                  <p className="text-[10px] text-rose-600 mt-0.5">La URL debe iniciar con https:// o http://</p>
                )}
              </div>
              <input type="text" placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} className="font-sans w-full border border-slate-300 rounded px-2 py-1.5 text-xs" />
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="font-sans w-full border border-slate-300 rounded px-2 py-1.5 text-xs" />
              <Button variant="primary" size="sm" onClick={handleAdd} disabled={!url || !title || !isValidUrl}>+ Agregar</Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function AutoResizeTextarea({
  value,
  placeholder,
  className,
  onChange,
}: {
  value: string;
  placeholder?: string;
  className: string;
  onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function resize() {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }

  useEffect(() => {
    resize();
  }, [value]);

  return (
    <textarea
      ref={ref}
      className={className}
      value={value}
      placeholder={placeholder}
      onChange={(e) => {
        onChange(e.target.value);
        resize();
      }}
      onInput={resize}
    />
  );
}
