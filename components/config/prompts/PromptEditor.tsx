"use client";

import { useState, useRef, useEffect } from "react";
import useSWR from "swr";
import { SkeletonDetail } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
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
  description,
  showHistory,
  onToggleHistory,
  onSaved,
}: {
  promptKey: PromptKey;
  description?: string;
  showHistory: boolean;
  onToggleHistory: () => void;
  onSaved: () => void;
}) {
  const { push } = useToast();
  const { data, mutate, isLoading, error: swrError } = useSWR<{
    data: PromptDetail;
  }>(`/api/prompts/${encodeURIComponent(promptKey)}`, fetcher);

  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [lastSyncedContent, setLastSyncedContent] = useState<string | null>(
    null,
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  if (data?.data && data.data.content !== lastSyncedContent) {
    setLastSyncedContent(data.data.content);
    setDraft(data.data.content);
    setDirty(false);
  }

  // Auto-resize: crece con el contenido hasta 70vh, luego scroll interno
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "1px";
    const scrollH = el.scrollHeight;
    const minH = 300;
    const maxH = Math.round(window.innerHeight * 0.7);
    const target = Math.min(Math.max(scrollH, minH), maxH);
    el.style.height = `${target}px`;
    el.style.overflowY = scrollH > maxH ? "auto" : "hidden";
  }, [draft]);

  async function save() {
    setSaving(true);
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
        push("error", json.error ?? "Error al guardar");
      } else {
        push("success", "Guardado. Versión anterior en historial.");
        setDirty(false);
        mutate();
        onSaved();
      }
    } catch {
      push("error", "Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  async function resetToDefault() {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/prompts/${encodeURIComponent(promptKey)}`,
        { method: "DELETE" },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        push("error", json.error ?? "Error al restaurar");
      } else {
        push("success", "Prompt original del sistema restaurado.");
        mutate();
        onSaved();
      }
    } catch {
      push("error", "Error de conexión");
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
  const canSave = dirty && !saving && draft.trim().length >= 10;

  return (
    <div className="bg-white border border-slate-200 rounded p-6">
      {/* Header con acciones siempre visibles */}
      <div className="flex items-start justify-between mb-4 gap-4">
        <div className="min-w-0">
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
            ) : description ? (
              description
            ) : (
              "Prompt original del sistema (sin ediciones)"
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={onToggleHistory}
            className="text-xs text-brand-primary-dark hover:underline whitespace-nowrap"
          >
            {showHistory ? "Ocultar historial" : "Ver historial"}
          </button>
          {detail.has_override && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmReset(true)}
              disabled={saving}
            >
              Restaurar original
            </Button>
          )}
          <Button onClick={save} disabled={!canSave} loading={saving} size="sm">
            Guardar
          </Button>
        </div>
      </div>

      {showHistory && (
        <HistoryPanel promptKey={promptKey} onRestored={() => mutate()} />
      )}

      {/* Label + botón copiar */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="uppercase tracking-widest text-[10px] font-bold text-slate-400">
          Prompt
        </span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard
              .writeText(draft)
              .then(() => push("info", "Copiado al portapapeles"));
          }}
          className="text-slate-400 hover:text-slate-600 p-1 rounded transition-colors"
          title="Copiar prompt"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        </button>
      </div>

      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setDirty(e.target.value !== detail.content);
        }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "s") {
            e.preventDefault();
            if (canSave) void save();
          }
        }}
        className="w-full px-4 py-3 border border-slate-300 rounded font-mono text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
        spellCheck={false}
      />

      <div className="mt-1 text-[10px] text-slate-500 flex items-center gap-2">
        <span>
          {draft.length.toLocaleString("es-MX")} caracteres (~
          {Math.round(draft.length / 3).toLocaleString("es-MX")} tokens español)
        </span>
        {dirty && (
          <span className="text-amber-600 font-medium">
            · Cambios sin guardar · Ctrl+S
          </span>
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
