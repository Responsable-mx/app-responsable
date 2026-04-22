"use client";

import { useState } from "react";
import useSWR from "swr";
import { PROMPT_KEYS, PROMPT_LABELS } from "@/lib/ai/prompts-public";
import type { PromptKey } from "@/lib/ai/prompts-public";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type PromptMeta = {
  key: PromptKey;
  label: string;
  description: string;
  has_override: boolean;
  updated_by: string | null;
  updated_at: string | null;
};

type PromptDetail = {
  key: PromptKey;
  content: string;
  has_override: boolean;
  updated_by: string | null;
  updated_at: string | null;
};

type PromptVersion = {
  id: string;
  version_number: number;
  content: string;
  label: string | null;
  created_by: string | null;
  created_at: string;
};

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

export function PromptsManager() {
  const [active, setActive] = useState<PromptKey>("role.aurora");
  const [showHistory, setShowHistory] = useState(false);

  const meta = useSWR<{ data: PromptMeta[] }>("/api/prompts", fetcher);

  return (
    <div>
      {/* Tabs horizontales de prompts */}
      <div className="flex flex-wrap gap-1 bg-stone-100 p-1 rounded-lg mb-4">
        {PROMPT_KEYS.map((k) => {
          const m = meta.data?.data.find((x) => x.key === k);
          const isActive = active === k;
          return (
            <button
              key={k}
              onClick={() => {
                setActive(k);
                setShowHistory(false);
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                isActive
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span>{PROMPT_LABELS[k]}</span>
              {m?.has_override && (
                <span className="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">
                  Custom
                </span>
              )}
            </button>
          );
        })}
      </div>

      <PromptEditor
        key={active}
        promptKey={active}
        showHistory={showHistory}
        onToggleHistory={() => setShowHistory((s) => !s)}
        onSaved={() => {
          meta.mutate();
        }}
      />
    </div>
  );
}

function PromptEditor({
  promptKey,
  showHistory,
  onToggleHistory,
  onSaved,
}: {
  promptKey: PromptKey;
  showHistory: boolean;
  onToggleHistory: () => void;
  onSaved: () => void;
}) {
  const { data, mutate, isLoading } = useSWR<{ data: PromptDetail }>(
    `/api/prompts/${encodeURIComponent(promptKey)}`,
    fetcher
  );
  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  // Sync del draft con data cuando cambia (patrón "store info from previous
  // renders" — preferido a useEffect + setState para evitar cascading renders).
  const [lastSyncedContent, setLastSyncedContent] = useState<string | null>(
    null
  );
  if (data?.data && data.data.content !== lastSyncedContent) {
    setLastSyncedContent(data.data.content);
    setDraft(data.data.content);
    setDirty(false);
  }

  async function save() {
    setSaving(true);
    setError("");
    setInfo("");
    try {
      const res = await fetch(`/api/prompts/${encodeURIComponent(promptKey)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draft }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Error al guardar");
      } else {
        setInfo("Guardado. Se creó un snapshot de la versión anterior.");
        setDirty(false);
        mutate();
        onSaved();
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  async function resetToDefault() {
    setSaving(true);
    setError("");
    setInfo("");
    try {
      const res = await fetch(`/api/prompts/${encodeURIComponent(promptKey)}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Error");
      } else {
        setInfo("Regresado al default del código.");
        mutate();
        onSaved();
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
      setConfirmReset(false);
    }
  }

  if (isLoading || !data) {
    return <div className="text-sm text-slate-500">Cargando…</div>;
  }

  const detail = data.data;

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-6">
      <div className="flex items-start justify-between mb-3 gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {PROMPT_LABELS[promptKey]}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {detail.has_override ? (
              <>
                Editado por{" "}
                <strong>{detail.updated_by ?? "desconocido"}</strong>{" "}
                {detail.updated_at
                  ? `el ${new Date(detail.updated_at).toLocaleString("es-MX")}`
                  : ""}
              </>
            ) : (
              <>Usando default del código (sin override en DB)</>
            )}
          </p>
        </div>
        <button
          onClick={onToggleHistory}
          className="text-xs text-teal-700 hover:underline whitespace-nowrap"
        >
          {showHistory ? "Ocultar historial" : "Ver historial"}
        </button>
      </div>

      {showHistory && (
        <HistoryPanel promptKey={promptKey} onRestored={() => mutate()} />
      )}

      <textarea
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setDirty(e.target.value !== detail.content);
        }}
        className="w-full h-[520px] px-4 py-3 border border-stone-300 rounded-lg font-mono text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-teal-600"
        spellCheck={false}
      />
      <div className="mt-1 text-[10px] text-slate-500">
        {draft.length.toLocaleString("es-MX")} caracteres (~
        {Math.round(draft.length / 3).toLocaleString("es-MX")} tokens español)
      </div>

      {error && (
        <div className="mt-3 bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg p-2">
          {error}
        </div>
      )}
      {info && (
        <div className="mt-3 bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg p-2">
          {info}
        </div>
      )}

      <div className="flex items-center justify-between mt-4">
        <button
          onClick={save}
          disabled={!dirty || saving || draft.trim().length < 10}
          className="px-4 py-2 bg-teal-700 text-white text-sm font-medium rounded-lg hover:bg-teal-800 disabled:bg-stone-300 disabled:cursor-not-allowed"
        >
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>

        {detail.has_override && (
          <button
            onClick={() => setConfirmReset(true)}
            className="text-xs text-slate-600 hover:text-red-700"
          >
            Restaurar default del código
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="Restaurar default"
        description="Se elimina el override y el prompt vuelve al contenido hardcoded en el código. El historial de versiones editadas se conserva (puedes restaurar cualquier versión pasada)."
        confirmLabel="Restaurar default"
        cancelLabel="Cancelar"
        variant="destructive"
        onConfirm={resetToDefault}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}

function HistoryPanel({
  promptKey,
  onRestored,
}: {
  promptKey: PromptKey;
  onRestored: () => void;
}) {
  const { data, mutate, isLoading } = useSWR<{ data: PromptVersion[] }>(
    `/api/prompts/${encodeURIComponent(promptKey)}/versions`,
    fetcher
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const [labeling, setLabeling] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState("");
  const [err, setErr] = useState("");

  async function restore(versionId: string) {
    setErr("");
    const res = await fetch(
      `/api/prompts/${encodeURIComponent(promptKey)}/versions/${versionId}/restore`,
      { method: "POST" }
    );
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(j.error ?? "Error al restaurar");
    } else {
      onRestored();
      mutate();
    }
  }

  async function saveLabel(versionId: string) {
    const res = await fetch(
      `/api/prompts/${encodeURIComponent(promptKey)}/versions/${versionId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: labelDraft || null }),
      }
    );
    const j = await res.json().catch(() => ({}));
    if (!res.ok) setErr(j.error ?? "Error");
    setLabeling(null);
    setLabelDraft("");
    mutate();
  }

  if (isLoading) {
    return <div className="text-sm text-slate-500 mb-4">Cargando…</div>;
  }

  const versions = data?.data ?? [];

  return (
    <div className="mb-4 bg-stone-50 border border-stone-200 rounded-lg p-4 max-h-80 overflow-y-auto">
      <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
        Historial ({versions.length})
      </h3>
      {err && (
        <div className="text-xs text-red-700 bg-red-50 p-1 rounded mb-2">
          {err}
        </div>
      )}
      {versions.length === 0 ? (
        <p className="text-xs text-slate-500">
          Sin versiones anteriores. Las versiones se crean automáticamente al
          guardar cambios.
        </p>
      ) : (
        <ul className="space-y-1">
          {versions.map((v) => (
            <li
              key={v.id}
              className="text-xs bg-white rounded border border-stone-200 overflow-hidden"
            >
              <div className="flex items-center gap-2 px-2 py-1.5">
                <span className="font-mono text-slate-500">v{v.version_number}</span>
                <span className="text-slate-700">
                  {new Date(v.created_at).toLocaleString("es-MX")}
                </span>
                <span className="text-slate-500">· {v.created_by ?? "?"}</span>
                {v.label && (
                  <span className="bg-indigo-50 text-indigo-800 px-1.5 py-0.5 rounded text-[10px]">
                    📌 {v.label}
                  </span>
                )}
                <div className="flex-1" />
                <button
                  onClick={() => setExpanded(expanded === v.id ? null : v.id)}
                  className="text-slate-600 hover:text-slate-900"
                >
                  {expanded === v.id ? "Ocultar" : "Ver"}
                </button>
                <button
                  onClick={() => {
                    setLabeling(v.id);
                    setLabelDraft(v.label ?? "");
                  }}
                  className="text-slate-600 hover:text-slate-900"
                  title={v.label ? "Editar label (pin)" : "Pin con label"}
                >
                  📌
                </button>
                <button
                  onClick={() => restore(v.id)}
                  className="text-teal-700 hover:underline"
                >
                  Restaurar
                </button>
              </div>
              {labeling === v.id && (
                <div className="border-t border-stone-200 px-2 py-1.5 flex gap-2 bg-stone-50">
                  <input
                    value={labelDraft}
                    onChange={(e) => setLabelDraft(e.target.value)}
                    placeholder="Ej: pre-piloto CSRD"
                    className="flex-1 px-2 py-1 border border-stone-300 rounded text-xs"
                  />
                  <button
                    onClick={() => saveLabel(v.id)}
                    className="px-2 py-1 bg-teal-700 text-white rounded text-xs"
                  >
                    Guardar
                  </button>
                  <button
                    onClick={() => {
                      setLabeling(null);
                      setLabelDraft("");
                    }}
                    className="px-2 py-1 text-slate-600 text-xs"
                  >
                    ×
                  </button>
                </div>
              )}
              {expanded === v.id && (
                <pre className="border-t border-stone-200 p-2 font-mono text-[10px] whitespace-pre-wrap max-h-60 overflow-y-auto bg-stone-50">
                  {v.content}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
