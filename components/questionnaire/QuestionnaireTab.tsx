"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import {
  computeProgress,
  getFieldValue,
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
import { SkeletonCard } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<{ data: QuestionnaireBundle }>;
  });

const AUTOSAVE_DELAY_MS = 1200;
type SaveState = "idle" | "saving" | "saved" | "error";

const SOURCE_CHIP: Record<SourceType, { dot: string; bg: string; text: string; label: string }> = {
  public: { dot: "bg-emerald-500", bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", label: "público" },
  interpretation: { dot: "bg-amber-400", bg: "bg-amber-50 border-amber-200", text: "text-amber-700", label: "interpretación" },
  consultor_only: { dot: "bg-slate-400", bg: "bg-slate-50 border-slate-200", text: "text-slate-600", label: "solo consultor" },
};

export function QuestionnaireTab({ clientId }: { clientId: string }) {
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

  return <WizardEditor clientId={clientId} initial={data.data} mutate={() => mutate()} />;
}

function WizardEditor({
  clientId,
  initial,
  mutate,
}: {
  clientId: string;
  initial: QuestionnaireBundle;
  mutate: () => void;
}) {
  const { template } = initial;
  const schema = template.schema;
  const isWizard = isWizardSchema(schema);
  const steps: WizardStep[] = isWizard ? schema.steps : [];

  const [responses, setResponses] = useState<QuestionnaireResponseData>(
    initial.response?.responses ?? {}
  );
  const [activeStep, setActiveStep] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [drawerField, setDrawerField] = useState<{ stepKey: string; fieldKey: string } | null>(null);
  const [aiFilling, setAiFilling] = useState<string | null>(null); // step.key
  const toast = useToast();

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  const progress = useMemo(() => computeProgress(schema, responses), [schema, responses]);

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
    setResponses((prev) => {
      const stepObj = (prev[stepKey] as Record<string, FieldResponse>) ?? {};
      const existing = stepObj[fieldKey];
      if (!existing) return prev;
      const next: FieldResponse = { ...existing, validated: !existing.validated, updated_at: new Date().toISOString() };
      return { ...prev, [stepKey]: { ...stepObj, [fieldKey]: next } };
    });
    dirty.current = true;
    scheduleSave();
  }

  function scheduleSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void save(), AUTOSAVE_DELAY_MS);
  }

  async function save() {
    if (!dirty.current) return;
    dirty.current = false;
    setSaveState("saving");
    setErrorMsg(null);
    const completedSections = steps
      .filter((s) => (progress.sectionProgress[s.key]?.pct === 100 && s.fields.length > 0))
      .map((s) => s.key);
    try {
      const res = await fetch(`/api/clients/${clientId}/questionnaire`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service: template.service_key, responses, completedSections }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setSaveState("saved");
      setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 2000);
    } catch (e) {
      setSaveState("error");
      setErrorMsg(e instanceof Error ? e.message : "Error al guardar");
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
      setResponses((prev) => ({ ...prev, [stepKey]: json.data }));
      dirty.current = true;
      void save();
      toast.push("success", "IA llenó campos del paso");
      mutate();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Error en AI fill");
    } finally {
      setAiFilling(null);
    }
  }

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-5">
      {/* Stepper lateral */}
      <aside className="space-y-1">
        {steps.map((s, i) => {
          const sp = progress.sectionProgress[s.key] ?? { filled: 0, total: s.fields.length, pct: 0 };
          const complete = sp.pct === 100 && s.fields.length > 0;
          return (
            <button
              key={s.key}
              onClick={() => setActiveStep(i)}
              className={`w-full text-left px-3 py-2 rounded border transition-colors text-xs ${
                activeStep === i
                  ? "bg-brand-primary-light border-brand-primary text-brand-primary-dark"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
                    complete
                      ? "bg-emerald-500 text-white"
                      : sp.pct > 0
                        ? "bg-amber-100 text-amber-700"
                        : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {complete ? "✓" : s.step}
                </span>
                <span className="font-semibold leading-tight flex-1 truncate">{s.title}</span>
              </div>
              <div className="mt-1 ml-7 text-[10px] text-slate-500 tabular-nums">
                {sp.filled}/{sp.total} · {sp.pct}%
              </div>
            </button>
          );
        })}
      </aside>

      {/* Step content */}
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-3 mb-4 px-1">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Paso {step.step} de {steps.length}
            </p>
            <h2 className="text-lg font-bold text-slate-900 mt-0.5">{step.title}</h2>
            <p className="text-xs text-slate-600 mt-0.5">{step.subtitle}</p>
            {step.only_double_materialidad && (
              <span className="inline-flex items-center mt-2 text-[10px] font-bold uppercase tracking-wide bg-rose-50 text-rose-700 rounded-sm px-1.5 py-0.5">
                Solo Doble Materialidad
              </span>
            )}
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <SaveIndicator state={saveState} errorMsg={errorMsg} />
            {step.ai_can_fill && (
              <Button
                variant="primary"
                size="sm"
                loading={aiFilling === step.key}
                onClick={() => aiFill(step.key)}
              >
                ✨ Llenar con IA
              </Button>
            )}
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
                  sourcesCount={sources.length}
                  validated={validated}
                  filled={filled}
                  stale={stale}
                  hint={field.hint}
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
    </div>
  );
}

function SaveIndicator({ state, errorMsg }: { state: SaveState; errorMsg: string | null }) {
  if (state === "saving") return <span className="text-[11px] text-slate-500">Guardando…</span>;
  if (state === "saved") return <span className="text-[11px] text-emerald-700">✓ Guardado</span>;
  if (state === "error") return <span className="text-[11px] text-rose-700" title={errorMsg ?? ""}>Error</span>;
  return <span className="text-[11px] text-slate-400">Autoguardado activo</span>;
}

function FieldRow({
  field,
  value,
  sourceType,
  sourcesCount,
  validated,
  filled,
  stale,
  hint,
  onChange,
  onToggleValidated,
  onOpenDrawer,
}: {
  field: WizardField;
  value: FieldValue;
  sourceType: SourceType;
  sourcesCount: number;
  validated: boolean;
  filled: boolean;
  stale: boolean;
  hint?: string;
  onChange: (v: FieldValue) => void;
  onToggleValidated: () => void;
  onOpenDrawer: () => void;
}) {
  const chip = SOURCE_CHIP[sourceType];
  const baseInput = "w-full border border-slate-300 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary";

  return (
    <div className="px-4 py-3 hover:bg-slate-50/50 transition-colors">
      <div className="flex items-start gap-3 mb-1.5">
        <label className="text-xs font-semibold text-slate-700 flex-1 min-w-0">
          {field.label}
          {field.required && <span className="text-rose-500 ml-0.5">*</span>}
        </label>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onOpenDrawer}
            className={`inline-flex items-center gap-1 text-[10px] font-medium border rounded-full px-1.5 py-0.5 ${chip.bg} ${chip.text}`}
            title="Ver fuentes"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${chip.dot}`} />
            {chip.label}
            {sourcesCount > 0 && <span className="opacity-70">· {sourcesCount}</span>}
          </button>
          {stale && (
            <span title="Alguna fuente >2 años" className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5 font-medium">
              ⚠ desactualizada
            </span>
          )}
          <button
            type="button"
            onClick={onToggleValidated}
            disabled={!filled}
            className={`text-[10px] font-bold rounded-sm px-1.5 py-0.5 transition-colors ${
              validated
                ? "bg-emerald-100 text-emerald-700"
                : filled
                  ? "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  : "bg-slate-50 text-slate-300 cursor-not-allowed"
            }`}
            title={validated ? "Validado por consultor" : "Marcar como validado"}
          >
            {validated ? "✓ validado" : "validar"}
          </button>
        </div>
      </div>

      {field.type === "textarea" ? (
        <textarea
          className={`${baseInput} px-3 py-2 min-h-[64px] resize-y`}
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : field.type === "number" ? (
        <input
          type="number"
          className={`${baseInput} px-3 py-2 tabular-nums`}
          value={typeof value === "number" ? value : ""}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        />
      ) : field.type === "boolean" ? (
        <div className="flex gap-2">
          {[{ v: true, label: "Sí" }, { v: false, label: "No" }].map((opt) => (
            <button
              key={String(opt.v)}
              type="button"
              onClick={() => onChange(value === opt.v ? null : opt.v)}
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
        <select
          className={`${baseInput} px-3 py-2`}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">— Seleccionar —</option>
          {Array.isArray(field.options) && field.options.map((opt, i) => {
            const v = typeof opt === "string" ? opt : opt.value;
            const l = typeof opt === "string" ? opt : opt.label;
            return <option key={`${v}-${i}`} value={v}>{l}</option>;
          })}
        </select>
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
                onClick={() => onChange(active ? arr.filter((x) => x !== v) : [...arr, v])}
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
        <input
          type="text"
          className={`${baseInput} px-3 py-2`}
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {hint && <p className="text-[11px] text-slate-500 italic mt-1">{hint}</p>}
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

  function handleAdd() {
    if (!url || !title) return;
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
              <input type="url" placeholder="URL" value={url} onChange={(e) => setUrl(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs" />
              <input type="text" placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs" />
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs" />
              <Button variant="primary" size="sm" onClick={handleAdd} disabled={!url || !title}>+ Agregar</Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
