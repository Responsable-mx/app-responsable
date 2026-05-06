"use client";

import { useState } from "react";
import useSWR from "swr";
import type { PromptKey } from "@/lib/ai/prompts-public";

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

export function HistoryPanel({
  promptKey,
  onRestored,
}: {
  promptKey: PromptKey;
  onRestored: () => void;
}) {
  const { data, mutate, isLoading, error: swrError } = useSWR<{ data: PromptVersion[] }>(
    `/api/prompts/${encodeURIComponent(promptKey)}/versions`,
    fetcher,
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const [labeling, setLabeling] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState("");
  const [err, setErr] = useState("");

  async function restore(versionId: string) {
    setErr("");
    const res = await fetch(
      `/api/prompts/${encodeURIComponent(promptKey)}/versions/${versionId}/restore`,
      { method: "POST" },
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
      },
    );
    const j = await res.json().catch(() => ({}));
    if (!res.ok) setErr(j.error ?? "Error");
    setLabeling(null);
    setLabelDraft("");
    mutate();
  }

  if (swrError && !data) {
    return (
      <div className="mb-4 bg-rose-50 border border-rose-200 rounded p-3 text-xs text-rose-700">
        Error al cargar versiones.{" "}
        <button onClick={() => void mutate()} className="underline">Reintentar</button>
      </div>
    );
  }
  if (isLoading) {
    return <div className="text-sm text-slate-600 mb-4">Cargando…</div>;
  }

  const versions = data?.data ?? [];

  return (
    <div className="mb-4 bg-slate-50 border border-slate-200 rounded-lg p-4 max-h-80 overflow-y-auto">
      <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
        Historial ({versions.length})
      </h3>
      {err && (
        <div className="text-xs text-red-700 bg-red-50 p-1 rounded mb-2">
          {err}
        </div>
      )}
      {versions.length === 0 ? (
        <p className="text-xs text-slate-600">
          Sin versiones anteriores. Las versiones se crean automáticamente al
          guardar cambios.
        </p>
      ) : (
        <ul className="space-y-1">
          {versions.map((v) => (
            <li
              key={v.id}
              className="text-xs bg-white rounded border border-slate-200 overflow-hidden"
            >
              <div className="flex items-center gap-2 px-2 py-1.5">
                <span className="font-mono text-slate-600">
                  v{v.version_number}
                </span>
                <span className="text-slate-700">
                  {new Date(v.created_at).toLocaleString("es-MX")}
                </span>
                <span className="text-slate-600">· {v.created_by ?? "?"}</span>
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
                  className="text-brand-primary-dark hover:underline"
                >
                  Restaurar
                </button>
              </div>
              {labeling === v.id && (
                <div className="border-t border-slate-200 px-2 py-1.5 flex gap-2 bg-slate-50">
                  <input
                    value={labelDraft}
                    onChange={(e) => setLabelDraft(e.target.value)}
                    placeholder="Ej: pre-piloto CSRD"
                    className="flex-1 px-2 py-1 border border-slate-300 rounded text-xs"
                  />
                  <button
                    onClick={() => saveLabel(v.id)}
                    className="px-2 py-1 bg-brand-primary text-white rounded text-xs"
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
                <pre className="border-t border-slate-200 p-2 font-mono text-[10px] whitespace-pre-wrap max-h-60 overflow-y-auto bg-slate-50">
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
