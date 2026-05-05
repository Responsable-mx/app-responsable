"use client";

import { useState } from "react";
import useSWR from "swr";
import { PROMPT_LABELS } from "@/lib/ai/prompts-public";
import type { PromptKey } from "@/lib/ai/prompts-public";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { HistoryPanel } from "./HistoryPanel";

type PromptDetail = {
  key: PromptKey;
  content: string;
  has_override: boolean;
  updated_by: string | null;
  updated_at: string | null;
};

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

export function PromptEditor({
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
    fetcher,
  );
  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [lastSyncedContent, setLastSyncedContent] = useState<string | null>(
    null,
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
      const res = await fetch(
        `/api/prompts/${encodeURIComponent(promptKey)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: draft }),
        },
      );
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
      const res = await fetch(
        `/api/prompts/${encodeURIComponent(promptKey)}`,
        { method: "DELETE" },
      );
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
    return <div className="text-sm text-slate-600">Cargando…</div>;
  }

  const detail = data.data;

  return (
    <div className="bg-white border border-slate-200 rounded p-6">
      <div className="flex items-start justify-between mb-3 gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {PROMPT_LABELS[promptKey]}
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
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
          className="text-xs text-brand-primary-dark hover:underline whitespace-nowrap"
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
        className="w-full h-[520px] px-4 py-3 border border-slate-300 rounded-lg font-mono text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-brand-primary"
        spellCheck={false}
      />
      <div className="mt-1 text-[10px] text-slate-600">
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
          className="px-4 py-2 bg-brand-primary hover:bg-brand-primary-hover text-white text-sm font-medium rounded-lg disabled:bg-slate-300 disabled:cursor-not-allowed"
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

      <ConfirmModal
        open={confirmReset}
        title="Restaurar default"
        description="Se elimina el override y el prompt vuelve al contenido hardcoded en el código. El historial de versiones editadas se conserva (puedes restaurar cualquier versión pasada)."
        confirmLabel="Restaurar default"
        cancelLabel="Cancelar"
        tone="destructive"
        onConfirm={resetToDefault}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}
