"use client";

// Sesión 10: Button primitives, rounded (no rounded-lg), focus:ring-brand-primary/40,
// resize-y textarea, copy fixes para tecnicismos internos.

import { useState } from "react";
import useSWR from "swr";
import { SkeletonDetail } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
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
  const { data, mutate, isLoading, error: swrError } = useSWR<{ data: PromptDetail }>(
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
        setInfo("Guardado. Versión anterior guardada en historial.");
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
        setInfo("Prompt original del sistema restaurado.");
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

  if (swrError && !data) {
    return (
      <div className="bg-white border border-slate-200 rounded p-6 text-sm text-rose-700">
        No se pudo cargar el prompt. Recarga la página o revisa tu conexión.
      </div>
    );
  }
  if (isLoading || !data) {
    return <SkeletonDetail />;
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
              <>Prompt original del sistema (sin ediciones)</>
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

      {/* resize-y + min-h: corto no deja espacio muerto, largo no fuerza scroll interno */}
      <textarea
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setDirty(e.target.value !== detail.content);
        }}
        className="w-full min-h-[200px] max-h-[70vh] resize-y px-4 py-3 border border-slate-300 rounded font-mono text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
        spellCheck={false}
      />
      <div className="mt-1 text-[10px] text-slate-600">
        {draft.length.toLocaleString("es-MX")} caracteres (~
        {Math.round(draft.length / 3).toLocaleString("es-MX")} tokens español)
      </div>

      {error && (
        <div className="mt-3 bg-red-50 border border-red-200 text-red-800 text-sm rounded p-2">
          {error}
        </div>
      )}
      {info && (
        <div className="mt-3 bg-green-50 border border-green-200 text-green-800 text-sm rounded p-2">
          {info}
        </div>
      )}

      <div className="flex items-center justify-between mt-4">
        <Button
          onClick={save}
          disabled={!dirty || saving || draft.trim().length < 10}
          loading={saving}
        >
          Guardar cambios
        </Button>

        {detail.has_override && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmReset(true)}
            disabled={saving}
          >
            Restaurar versión original
          </Button>
        )}
      </div>

      <ConfirmModal
        open={confirmReset}
        title="Restaurar versión original"
        description="Se elimina el override y el prompt vuelve al contenido original del sistema. El historial de ediciones se conserva — puedes restaurar cualquier versión pasada."
        confirmLabel="Restaurar"
        cancelLabel="Cancelar"
        tone="destructive"
        onConfirm={resetToDefault}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}
