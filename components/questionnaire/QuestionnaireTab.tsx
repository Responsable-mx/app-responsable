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
  type WizardStep,
} from "@/lib/questionnaires/types";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { WizardStepNav } from "@/components/questionnaire/WizardStepNav";
import { AiBulkBanner } from "@/components/questionnaire/AiBulkBanner";
import { SaveIndicator } from "@/components/questionnaire/SaveIndicator";
import { FieldRow } from "@/components/questionnaire/FieldRow";
import { SourceDrawer } from "@/components/questionnaire/SourceDrawer";
import type { SaveState } from "@/components/questionnaire/wizard-ui-types";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<{ data: QuestionnaireBundle }>;
  });

const AUTOSAVE_DELAY_MS = 1200;

export function QuestionnaireTab({
  clientId,
  clientServices = [],
  initialStepIndex = 0,
  autoFillOnMount = false,
  reportUrls,
  docCount,
  onGoToDocumentos,
  pendingExtract,
  onExtractDone,
}: {
  clientId: string;
  clientServices?: string[];
  initialStepIndex?: number;
  autoFillOnMount?: boolean;
  reportUrls?: { sustainability: string | null; financial: string | null };
  /** null = aún cargando; 0 = sin docs; N = con docs */
  docCount?: number | null;
  onGoToDocumentos?: () => void;
  /** Extracción disparada desde DocumentsTab — navega al paso y llena */
  pendingExtract?: { stepKey: string; text: string } | null;
  onExtractDone?: () => void;
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

  return (
    <>
      {/* Banner: sin documentos del cliente → Aurora solo usará fuentes públicas */}
      {docCount === 0 && onGoToDocumentos && (
        <div className="mb-4 flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800" role="alert">
          <svg className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <p>
            <strong>Sin documentos del cliente.</strong>{" "}
            Aurora usará solo fuentes públicas — los resultados pueden ser menos precisos.{" "}
            <button
              type="button"
              onClick={onGoToDocumentos}
              className="underline font-semibold hover:text-amber-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded-sm"
            >
              Subir documentos →
            </button>
          </p>
        </div>
      )}
      <WizardEditor
        clientId={clientId}
        clientServices={clientServices}
        initial={data.data}
        mutate={() => mutate()}
        initialStepIndex={initialStepIndex}
        autoFillOnMount={autoFillOnMount}
        reportUrls={reportUrls}
        pendingExtract={pendingExtract}
        onExtractDone={onExtractDone}
      />
    </>
  );
}

function WizardEditor({
  clientId,
  clientServices: _clientServices = [],
  initial,
  mutate,
  initialStepIndex = 0,
  autoFillOnMount = false,
  reportUrls,
  pendingExtract,
  onExtractDone,
}: {
  clientId: string;
  clientServices?: string[];
  initial: QuestionnaireBundle;
  mutate: () => void;
  initialStepIndex?: number;
  autoFillOnMount?: boolean;
  reportUrls?: { sustainability: string | null; financial: string | null };
  pendingExtract?: { stepKey: string; text: string } | null;
  onExtractDone?: () => void;
}) {
  const { template } = initial;
  const schema = template.schema;
  const isWizard = isWizardSchema(schema);
  const steps = useMemo<WizardStep[]>(() => isWizardSchema(schema) ? schema.steps : [], [schema]);

  const [responses, setResponses] = useState<QuestionnaireResponseData>(
    initial.response?.responses ?? {}
  );
  const [activeStep, setActiveStep] = useState(Math.min(Math.max(0, initialStepIndex), steps.length - 1 || 0));
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [drawerField, setDrawerField] = useState<{ stepKey: string; fieldKey: string } | null>(null);
  const [aiFilling, setAiFilling] = useState<string | null>(null); // step.key
  const [aiBulkProgress, setAiBulkProgress] = useState<{ current: number; total: number; stepTitle: string } | null>(null);
  const [confirmBulkFill, setConfirmBulkFill] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  // Staging de AI fill por paso: guarda propuesta IA para que el consultor valide antes de aplicar.
  const [stagedFill, setStagedFill] = useState<{ stepKey: string; stepTitle: string; data: Record<string, FieldResponse> } | null>(null);
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

  // Campos llenos pero no validados por paso → badge en WizardStepNav.
  const pendingValidation = useMemo(() => {
    const result: Record<string, number> = {};
    for (const step of steps) {
      const stepObj = (responses[step.key] as Record<string, unknown> | undefined) ?? {};
      let count = 0;
      for (const field of step.fields) {
        const raw = stepObj[field.key];
        if (isFieldResponse(raw) && isFieldFilled(raw.value) && !raw.validated) count++;
      }
      result[step.key] = count;
    }
    return result;
  }, [responses, steps]);

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
        // Guardrail anti-wipe: si el snap está vacío y la DB tenía data (sabemos
        // porque lastServerUpdatedAt no es null), no enviar el PATCH. Defensa
        // contra unmount keepalive con responsesRef stale o race condition que
        // borre data legítima del usuario.
        let filledCount = 0;
        for (const stepKey in snap) {
          const stepObj = snap[stepKey] as Record<string, unknown> | undefined;
          if (!stepObj || typeof stepObj !== "object") continue;
          for (const fieldKey in stepObj) {
            const raw = stepObj[fieldKey];
            if (isFieldResponse(raw) && isFieldFilled(raw.value)) filledCount++;
          }
        }
        if (filledCount === 0 && lastServerUpdatedAt.current) {
          // Skip flush: snap vacío sobre DB no-vacía = casi seguro stale/race.
          // Mejor perder un cambio reciente que borrar todo lo guardado.
          console.warn("[questionnaire] Unmount flush skipped — empty snap over non-empty DB (anti-wipe)");
          return;
        }
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

  // activeStep está siempre en rango por el useState initializer
  const step = steps[activeStep]!;
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
      const stepHasExistingData = Object.keys((responses[stepKey] as object | undefined) ?? {}).length > 0;
      if (stepHasExistingData) {
        // Paso ya tiene datos → mostrar staging para que el consultor valide antes de aplicar.
        const stepTitle = steps.find((s) => s.key === stepKey)?.title ?? stepKey;
        setStagedFill({ stepKey, stepTitle, data: json.data });
      } else {
        // Paso vacío → aplicar directo sin staging.
        const merged: QuestionnaireResponseData = { ...responses, [stepKey]: json.data };
        setResponses(merged);
        dirty.current = true;
        await save(merged);
        toast.push("success", "IA llenó campos del paso");
        mutate();
      }
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Error en AI fill");
    } finally {
      setAiFilling(null);
    }
  }

  // Aplica campos aceptados del staging. Quita validación de los campos que cambian.
  async function applyStaged(accepted: Set<string>) {
    if (!stagedFill) return;
    const { stepKey, data } = stagedFill;
    const prevStep = (responses[stepKey] as Record<string, FieldResponse> | undefined) ?? {};
    const nextStep: Record<string, FieldResponse> = { ...prevStep };
    for (const fieldKey of accepted) {
      const proposed = data[fieldKey];
      if (!proposed) continue;
      // Quita validación porque el valor cambia.
      nextStep[fieldKey] = { ...proposed, validated: false, updated_at: new Date().toISOString() };
    }
    const merged: QuestionnaireResponseData = { ...responses, [stepKey]: nextStep };
    setResponses(merged);
    dirty.current = true;
    await save(merged);
    toast.push("success", `${accepted.size} campo${accepted.size > 1 ? "s" : ""} actualizado${accepted.size > 1 ? "s" : ""}. Validación quitada para revisión.`);
    mutate();
    setStagedFill(null);
  }

  // Extracción disparada desde DocumentsTab — navega al paso y ejecuta docFill automáticamente.
  useEffect(() => {
    if (!pendingExtract) return;
    const idx = steps.findIndex((s) => s.key === pendingExtract.stepKey);
    if (idx >= 0) setActiveStep(idx);
    void docFill(pendingExtract.stepKey, pendingExtract.text).finally(() => {
      onExtractDone?.();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingExtract]);

  // Llena el paso activo con texto/markdown extraído (de paste o de docs subidos).
  // Reutiliza merge/save de aiFill — misma respuesta {data: Record<string, FieldResponse>}.
  async function docFill(stepKey: string, text: string) {
    if (!text.trim()) return;
    try {
      const res = await fetch(`/api/clients/${clientId}/wizard/${stepKey}/doc-fill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
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
      toast.push("success", "Documento procesado — campos del paso actualizados");
      mutate();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Error al importar");
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
      toast.push("error", `AI fill falló: ${failures[0]!.error}`);
    } else {
      toast.push("warning", `${success} OK · ${failures.length} fallaron: ${failures.map((f) => f.step).join(", ")}`);
    }
  }

  const aiCapableCount = steps.filter((s) => s.ai_can_fill).length;
  const someStepHasResponses = Object.values(responses).some(
    (v) => typeof v === "object" && v !== null && Object.keys(v as object).length > 0
  );

  return (
    <div>
      {/* (Banner "Informes del cliente" eliminado may-2026 — los informes están
          en tab Documentos y URLs editables desde /editar. Redundante en wizard.) */}

      {/* Banner global AI fill */}
      <AiBulkBanner
        aiCapableCount={aiCapableCount}
        totalSteps={steps.length}
        someStepHasResponses={someStepHasResponses}
        progress={aiBulkProgress}
        onFillAll={() => someStepHasResponses ? setConfirmBulkFill(true) : void aiFillAll()}
      />

    <div className={`grid grid-cols-1 gap-5 ${drawerField ? "lg:grid-cols-[200px_1fr_280px]" : "lg:grid-cols-[200px_1fr]"}`}>
      {/* Stepper lateral */}
      <WizardStepNav
        steps={steps}
        activeStep={activeStep}
        sectionProgress={progress.sectionProgress}
        pendingValidation={pendingValidation}
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
                    onClick={() => setConfirmOverwrite(true)}
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
                    {stepHasData ? "Refrescar este paso con IA" : "Llenar este paso con IA"}
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
                  sectionComplete={isStepComplete}
                  hideSource={step.key === "informacion-base"}
                  skipValidationGuard={step.key === "informacion-base"}
                  selfClientId={clientId}
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
            mode="panel"
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

      {/* Modal de staging: IA propone, consultor valida campo por campo antes de aplicar */}
      {stagedFill && (() => {
        const currentStep = steps.find((s) => s.key === stagedFill.stepKey);
        if (!currentStep) return null;
        return (
          <AiFillStagingModal
            stepTitle={stagedFill.stepTitle}
            fields={currentStep.fields}
            existing={(responses[stagedFill.stepKey] as Record<string, FieldResponse> | undefined) ?? {}}
            proposed={stagedFill.data}
            onApply={applyStaged}
            onDiscard={() => setStagedFill(null)}
          />
        );
      })()}

      <ConfirmModal
        open={confirmBulkFill}
        title="¿Llenar todo con IA?"
        description="La IA sobreescribirá las respuestas existentes en todos los pasos. Esta acción no se puede deshacer."
        confirmLabel="Llenar todo con IA"
        cancelLabel="Cancelar"
        tone="destructive"
        onConfirm={() => {
          setConfirmBulkFill(false);
          void aiFillAll();
        }}
        onCancel={() => setConfirmBulkFill(false)}
      />

      <ConfirmModal
        open={confirmOverwrite}
        title="¿Sobrescribir cambios remotos?"
        description="Tus cambios locales reemplazarán lo que guardó el otro consultor. Esta acción no se puede deshacer."
        confirmLabel="Sobrescribir"
        cancelLabel="Cancelar"
        tone="destructive"
        onConfirm={() => {
          setConfirmOverwrite(false);
          lastServerUpdatedAt.current = null;
          dirty.current = true;
          void save();
        }}
        onCancel={() => setConfirmOverwrite(false)}
      />
    </div>
    </div>
  );
}

// ── Modal de staging de AI fill ───────────────────────────────
// Muestra propuesta de la IA vs. valor actual campo por campo.
// Consultor acepta/rechaza individualmente antes de que se aplique.

function formatFieldValue(v: FieldResponse["value"]): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

function AiFillStagingModal({
  stepTitle,
  fields,
  existing,
  proposed,
  onApply,
  onDiscard,
}: {
  stepTitle: string;
  fields: import("@/lib/questionnaires/types").WizardField[];
  existing: Record<string, FieldResponse>;
  proposed: Record<string, FieldResponse>;
  onApply: (accepted: Set<string>) => Promise<void>;
  onDiscard: () => void;
}) {
  const [accepted, setAccepted] = useState<Set<string>>(() => new Set(Object.keys(proposed)));
  const [applying, setApplying] = useState(false);

  function toggle(key: string) {
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function handleApply() {
    if (accepted.size === 0) { onDiscard(); return; }
    setApplying(true);
    await onApply(accepted);
    setApplying(false);
  }

  // Solo mostrar campos que la IA propone y que cambian respecto al valor actual.
  const changedFields = fields.filter((f) => {
    const prop = proposed[f.key];
    if (!prop) return false;
    const curr = existing[f.key];
    return formatFieldValue(prop.value) !== formatFieldValue(curr?.value ?? null);
  });

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onDiscard} />
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div className="bg-white rounded shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[85vh] flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Propuesta de IA — revisar antes de aplicar</p>
              <h3 className="text-sm font-bold text-slate-900">{stepTitle}</h3>
            </div>
            <button onClick={onDiscard} className="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {changedFields.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8">La IA no propone cambios respecto al valor actual.</p>
            ) : (
              <>
                <p className="text-xs text-slate-600 mb-4">
                  La IA propone cambios en <strong>{changedFields.length} campo{changedFields.length > 1 ? "s" : ""}</strong>. Marca los que quieres aceptar. Los campos aceptados perderán su validación para que los revises.
                </p>
                <div className="flex gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => setAccepted(new Set(changedFields.map((f) => f.key)))}
                    className="text-[11px] font-semibold text-brand-primary-dark border border-brand-primary/40 rounded px-2 py-1 hover:bg-brand-primary/5"
                  >
                    Aceptar todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccepted(new Set())}
                    className="text-[11px] font-semibold text-slate-600 border border-slate-300 rounded px-2 py-1 hover:bg-slate-50"
                  >
                    Rechazar todos
                  </button>
                </div>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded">
                  {changedFields.map((f) => {
                    const curr = existing[f.key];
                    const prop = proposed[f.key]!;
                    const isAccepted = accepted.has(f.key);
                    return (
                      <label
                        key={f.key}
                        className={`flex items-start gap-3 p-3 cursor-pointer transition-colors ${isAccepted ? "bg-brand-primary-light/30" : "bg-white hover:bg-slate-50"}`}
                      >
                        <input
                          type="checkbox"
                          checked={isAccepted}
                          onChange={() => toggle(f.key)}
                          className="mt-0.5 accent-brand-primary shrink-0"
                        />
                        <div className="flex-1 min-w-0 text-xs">
                          <p className="font-semibold text-slate-800 mb-1">{f.label}</p>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-slate-50 rounded p-2">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Actual</p>
                              <p className="text-slate-600 break-words">{formatFieldValue(curr?.value ?? null)}</p>
                            </div>
                            <div className="bg-emerald-50 rounded p-2">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 mb-0.5">IA propone</p>
                              <p className="text-slate-800 break-words">{formatFieldValue(prop.value)}</p>
                            </div>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div className="px-5 py-4 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
            <button onClick={onDiscard} className="text-xs text-slate-500 hover:text-slate-700">
              Descartar propuesta
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 tabular-nums">{accepted.size} de {changedFields.length} aceptados</span>
              <button
                onClick={() => void handleApply()}
                disabled={applying || changedFields.length === 0}
                className="px-4 py-1.5 text-xs font-semibold bg-brand-primary text-white rounded hover:bg-brand-primary-hover disabled:opacity-50 transition-colors"
              >
                {applying ? "Aplicando…" : `Aplicar ${accepted.size} campo${accepted.size !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
