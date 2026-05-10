"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { isSourceStale } from "@/lib/questionnaires/types";
import type { SourceItem, SourceType, WizardField } from "@/lib/questionnaires/types";
import type { FieldResponse } from "@/lib/questionnaires/types";
import { SOURCE_CHIP } from "./wizard-ui-types";

interface Props {
  field: WizardField;
  response: FieldResponse | null;
  /** "drawer" = overlay lateral flotante (default). "panel" = columna inline sin overlay. */
  mode?: "drawer" | "panel";
  onClose: () => void;
  onUpdateSourceType: (type: SourceType) => void;
  onAddSource: (src: SourceItem) => void;
  onRemoveSource: (idx: number) => void;
}

// ── Cuerpo compartido entre drawer y panel ────────────────────

function SourceBody({
  response,
  url, setUrl,
  title, setTitle,
  date, setDate,
  isValidUrl,
  onUpdateSourceType,
  onAddSource: _onAddSource,
  onRemoveSource,
  handleAdd,
}: {
  response: FieldResponse | null;
  url: string; setUrl: (v: string) => void;
  title: string; setTitle: (v: string) => void;
  date: string; setDate: (v: string) => void;
  isValidUrl: boolean;
  onUpdateSourceType: (type: SourceType) => void;
  onAddSource: (src: SourceItem) => void;
  onRemoveSource: (idx: number) => void;
  handleAdd: () => void;
}) {
  return (
    <>
      {/* Tipo de origen */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
          Tipo de origen
        </p>
        <div className="flex gap-1.5 flex-wrap">
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
        {(response?.source_type === "public" || response?.source_type === "interpretation") &&
          (!response?.sources || response.sources.length === 0) && (
            <p className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
              {response.source_type === "interpretation"
                ? "Interpretación requiere al menos una fuente. Agrega una URL o cambia a «solo consultor»."
                : "Dato público requiere al menos una fuente verificable. Agrega una URL abajo."}
            </p>
          )}
      </div>

      {/* Lista de fuentes */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
          Fuentes documentadas{response?.sources.length ? ` (${response.sources.length})` : ""}
        </p>
        <div className="space-y-2">
          {(response?.sources ?? []).map((src, i) => {
            const stale = isSourceStale(src.date);
            return (
              <div key={i} className="flex items-start gap-2 border border-slate-200 rounded p-2">
                <div className="min-w-0 flex-1">
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-brand-primary-dark hover:underline truncate block"
                  >
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

      {/* Agregar fuente */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
          Agregar fuente
        </p>
        <div className="space-y-2">
          <div>
            <input
              type="url"
              placeholder="https://..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className={`font-sans w-full border rounded px-2 py-1.5 text-xs ${
                url && !isValidUrl ? "border-rose-400 bg-rose-50" : "border-slate-300"
              }`}
            />
            {url && !isValidUrl && (
              <p className="text-[10px] text-rose-600 mt-0.5">
                La URL debe iniciar con https:// o http://
              </p>
            )}
          </div>
          <input
            type="text"
            placeholder="Título"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="font-sans w-full border border-slate-300 rounded px-2 py-1.5 text-xs"
          />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="font-sans w-full border border-slate-300 rounded px-2 py-1.5 text-xs"
          />
          <Button
            variant="primary"
            size="sm"
            onClick={handleAdd}
            disabled={!url || !title || !isValidUrl}
          >
            + Agregar
          </Button>
        </div>
      </div>
    </>
  );
}

// ── Componente principal ──────────────────────────────────────

export function SourceDrawer({
  field,
  response,
  mode = "drawer",
  onClose,
  onUpdateSourceType,
  onAddSource,
  onRemoveSource,
}: Props) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  // D-26: validar URL antes de agregar — previene XSS via "javascript:" URIs.
  const isValidUrl = url.startsWith("https://") || url.startsWith("http://");

  function handleAdd() {
    if (!url || !title || !isValidUrl) return;
    onAddSource({ url, title, date, type: "manual" });
    setUrl("");
    setTitle("");
    setDate(new Date().toISOString().slice(0, 10));
  }

  const bodyProps = {
    response, url, setUrl, title, setTitle, date, setDate,
    isValidUrl, onUpdateSourceType, onAddSource, onRemoveSource, handleAdd,
  };

  if (mode === "panel") {
    return (
      <div
        role="complementary"
        aria-label={`Fuentes — ${field.label}`}
        className="sticky top-[100px] z-20 self-start bg-white border border-slate-200 rounded shadow-sm flex flex-col max-h-[calc(100vh-116px)] overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Fuentes</p>
            <h3 className="text-xs font-bold text-slate-900 truncate">{field.label}</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none ml-2 shrink-0">
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <SourceBody {...bodyProps} />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white shadow-2xl border-l border-slate-200 flex flex-col"
      >
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Fuentes</p>
            <h3 className="text-sm font-bold text-slate-900">{field.label}</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <SourceBody {...bodyProps} />
        </div>
      </div>
    </>
  );
}
