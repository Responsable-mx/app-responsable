"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import {
  computeProgress,
  isFieldFilled,
  type FieldValue,
  type QuestionField,
  type QuestionSection,
  type QuestionnaireBundle,
  type QuestionnaireResponseData,
} from "@/lib/questionnaires/types";
import { SkeletonCard } from "@/components/ui/Skeleton";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<{ data: QuestionnaireBundle }>;
  });

const AUTOSAVE_DELAY_MS = 1200;

type SaveState = "idle" | "saving" | "saved" | "error";

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
        <button
          onClick={() => mutate()}
          className="underline hover:no-underline"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return <QuestionnaireEditor clientId={clientId} initial={data.data} />;
}

function QuestionnaireEditor({
  clientId,
  initial,
}: {
  clientId: string;
  initial: QuestionnaireBundle;
}) {
  const { template } = initial;
  const [responses, setResponses] = useState<QuestionnaireResponseData>(
    initial.response?.responses ?? {}
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [openSection, setOpenSection] = useState<string | null>(
    template.schema.sections[0]?.key ?? null
  );

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  const progress = useMemo(
    () => computeProgress(template.schema, responses),
    [template.schema, responses]
  );

  const completedSections = useMemo(
    () =>
      template.schema.sections
        .filter(
          (s) => progress.sectionProgress[s.key]?.pct === 100 && s.fields.length > 0
        )
        .map((s) => s.key),
    [template.schema.sections, progress.sectionProgress]
  );

  function setField(sectionKey: string, fieldKey: string, value: FieldValue) {
    setResponses((prev) => ({
      ...prev,
      [sectionKey]: {
        ...(prev[sectionKey] ?? {}),
        [fieldKey]: value,
      },
    }));
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
    try {
      const res = await fetch(`/api/clients/${clientId}/questionnaire`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service: template.service_key,
          responses,
          completedSections,
        }),
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

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  return (
    <div className="space-y-4">
      {/* Header de progreso global */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-50 border border-slate-200 rounded">
        <div className="flex items-center gap-3 min-w-0">
          <div className="text-2xl font-bold text-brand-primary-dark tabular-nums">
            {progress.pct}%
          </div>
          <div className="text-xs text-slate-600">
            <p className="font-semibold text-slate-700">
              {progress.filledFields} de {progress.totalFields} campos
            </p>
            <p>
              {completedSections.length} de {template.schema.sections.length}{" "}
              secciones completas
            </p>
          </div>
        </div>
        <SaveIndicator state={saveState} errorMsg={errorMsg} />
      </div>

      {/* Secciones */}
      <div className="space-y-2">
        {template.schema.sections.map((section) => (
          <SectionAccordion
            key={section.key}
            section={section}
            open={openSection === section.key}
            onToggle={() =>
              setOpenSection((c) => (c === section.key ? null : section.key))
            }
            sectionResponses={responses[section.key] ?? {}}
            onChange={(fieldKey, value) =>
              setField(section.key, fieldKey, value)
            }
            progress={
              progress.sectionProgress[section.key] ?? { filled: 0, total: 0, pct: 0 }
            }
          />
        ))}
      </div>
    </div>
  );
}

function SaveIndicator({ state, errorMsg }: { state: SaveState; errorMsg: string | null }) {
  if (state === "saving") {
    return (
      <span className="text-xs text-slate-500 inline-flex items-center gap-1.5">
        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Guardando…
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="text-xs text-emerald-700 inline-flex items-center gap-1">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
        Guardado
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="text-xs text-rose-700" title={errorMsg ?? ""}>
        Error al guardar
      </span>
    );
  }
  return <span className="text-xs text-slate-400">Autoguardado activo</span>;
}

function SectionAccordion({
  section,
  open,
  onToggle,
  sectionResponses,
  onChange,
  progress,
}: {
  section: QuestionSection;
  open: boolean;
  onToggle: () => void;
  sectionResponses: Record<string, FieldValue>;
  onChange: (fieldKey: string, value: FieldValue) => void;
  progress: { filled: number; total: number; pct: number };
}) {
  const isComplete = progress.pct === 100 && section.fields.length > 0;

  return (
    <div className="border border-slate-200 rounded bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                isComplete ? "bg-emerald-500" : progress.filled > 0 ? "bg-amber-500" : "bg-slate-300"
              }`}
            />
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              {section.label}
            </h3>
          </div>
          {section.description && (
            <p className="text-xs text-slate-600 truncate">{section.description}</p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-slate-600 tabular-nums">
            {progress.filled}/{progress.total}
          </span>
          <span
            className={`text-xs font-bold tabular-nums px-2 py-0.5 rounded-sm ${
              isComplete
                ? "bg-emerald-50 text-emerald-700"
                : progress.filled > 0
                  ? "bg-amber-50 text-amber-700"
                  : "bg-slate-100 text-slate-500"
            }`}
          >
            {progress.pct}%
          </span>
          <svg
            className={`w-4 h-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-200 p-4 space-y-4 bg-slate-50/40">
          {section.fields.map((field) => (
            <FieldRenderer
              key={field.key}
              field={field}
              value={sectionResponses[field.key] ?? null}
              onChange={(v) => onChange(field.key, v)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FieldRenderer({
  field,
  value,
  onChange,
}: {
  field: QuestionField;
  value: FieldValue;
  onChange: (v: FieldValue) => void;
}) {
  const filled = isFieldFilled(value);

  const labelEl = (
    <label className="block text-xs font-semibold text-slate-700 mb-1">
      {field.label}
      {field.required && <span className="text-rose-500 ml-0.5">*</span>}
      {filled && (
        <span className="ml-2 text-[10px] text-emerald-600 font-normal">✓ Capturado</span>
      )}
    </label>
  );
  const helperEl = field.helper && (
    <p className="text-[11px] text-slate-500 mt-1">{field.helper}</p>
  );

  const baseInput =
    "w-full border border-slate-300 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary";

  if (field.type === "text") {
    return (
      <div>
        {labelEl}
        <input
          type="text"
          className={`${baseInput} px-3 py-2`}
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
        {helperEl}
      </div>
    );
  }

  if (field.type === "textarea") {
    return (
      <div>
        {labelEl}
        <textarea
          className={`${baseInput} px-3 py-2 min-h-[80px] resize-y`}
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
        {helperEl}
      </div>
    );
  }

  if (field.type === "number") {
    return (
      <div>
        {labelEl}
        <input
          type="number"
          className={`${baseInput} px-3 py-2 tabular-nums`}
          value={typeof value === "number" ? value : ""}
          placeholder={field.placeholder}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === "" ? null : Number(v));
          }}
        />
        {helperEl}
      </div>
    );
  }

  if (field.type === "boolean") {
    const v: boolean | null = typeof value === "boolean" ? value : null;
    return (
      <div>
        {labelEl}
        <div className="flex gap-2">
          {[
            { val: true, label: "Sí" },
            { val: false, label: "No" },
          ].map((opt) => (
            <button
              key={String(opt.val)}
              type="button"
              onClick={() => onChange(v === opt.val ? null : opt.val)}
              className={`px-3 py-1.5 text-xs font-medium rounded border transition-colors ${
                v === opt.val
                  ? "bg-brand-primary-light border-brand-primary text-brand-primary-dark"
                  : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {helperEl}
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div>
        {labelEl}
        <select
          className={`${baseInput} px-3 py-2`}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">— Seleccionar —</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {helperEl}
      </div>
    );
  }

  if (field.type === "multiselect") {
    const arr = Array.isArray(value) ? value : [];
    return (
      <div>
        {labelEl}
        <div className="flex flex-wrap gap-1.5">
          {(field.options ?? []).map((opt) => {
            const active = arr.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() =>
                  onChange(
                    active
                      ? arr.filter((v) => v !== opt.value)
                      : [...arr, opt.value]
                  )
                }
                className={`px-2.5 py-1 text-xs rounded-sm border transition-colors ${
                  active
                    ? "bg-brand-primary-light border-brand-primary text-brand-primary-dark"
                    : "bg-white border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        {helperEl}
      </div>
    );
  }

  return null;
}
