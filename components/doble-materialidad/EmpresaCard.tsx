"use client";

import { useState, useLayoutEffect, useRef } from "react";
import type { BenchmarkEmpresa } from "@/lib/dm/benchmark-empresas-types";

const METHOD_COLORS: Record<string, string> = {
  GRI:    "bg-emerald-50 text-emerald-700 border border-emerald-200",
  SASB:   "bg-blue-50 text-blue-700 border border-blue-200",
  TCFD:   "bg-violet-50 text-violet-700 border border-violet-200",
  CSRD:   "bg-orange-50 text-orange-700 border border-orange-200",
  IPIECA: "bg-amber-50 text-amber-700 border border-amber-200",
};

function MethodBadge({ methods }: { methods: string[] }) {
  if (methods.length === 1) {
    const m = methods[0]!;
    const cls = METHOD_COLORS[m] ?? "bg-slate-50 text-slate-600 border border-slate-200";
    return (
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[9px] font-bold ${cls}`}>
        {m}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[9px] font-bold bg-violet-50 text-violet-700 border border-violet-200">
      {methods.join(" + ")}
    </span>
  );
}

type Props = {
  empresa: BenchmarkEmpresa;
  selected: boolean;
  onToggle: () => void;
  onUpdate: (id: string, reporte_url: string | null) => Promise<void>;
};

export function EmpresaCard({ empresa, selected, onToggle, onUpdate }: Props) {
  const [expanded, setExpanded]     = useState(false);
  const [editingUrl, setEditingUrl] = useState(false);
  const [urlDraft, setUrlDraft]     = useState(empresa.reporte_url ?? "");
  const [saving, setSaving]         = useState(false);
  const [isClamped, setIsClamped]   = useState(false);
  const justRef = useRef<HTMLParagraphElement>(null);

  const hasJustification = !!empresa.justificacion;

  useLayoutEffect(() => {
    if (!expanded && justRef.current) {
      setIsClamped(justRef.current.scrollHeight > justRef.current.clientHeight);
    }
  }, [empresa.justificacion, expanded]);

  const handleSaveUrl = async () => {
    setSaving(true);
    try {
      await onUpdate(empresa.id, urlDraft.trim() || null);
      setEditingUrl(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={`bg-white border border-slate-200 rounded shadow-sm mb-2 px-4 py-3 transition-all ${
        selected ? "border-l-4 border-l-teal-600" : "border-l-4 border-l-transparent"
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Seleccionar ${empresa.nombre}`}
          className="mt-1 h-3.5 w-3.5 rounded-sm accent-teal-600 cursor-pointer shrink-0"
        />
        <div className="flex-1 min-w-0">
          {/* Row 1: nombre + país + link + metodología + edit */}
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <span className="font-semibold text-slate-800 text-sm">{empresa.nombre}</span>
              <span className="text-xs text-slate-400 font-medium">{empresa.pais}</span>
              {empresa.reporte_url && !editingUrl && (
                <a
                  href={empresa.reporte_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Ver informe de sostenibilidad"
                  className="shrink-0"
                >
                  <svg className="w-3 h-3 text-slate-400 hover:text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              )}
              <MethodBadge methods={empresa.metodologia} />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {empresa.reporte_url && !editingUrl && (
                <a
                  href={empresa.reporte_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[11px] text-teal-600 hover:text-teal-800 font-medium"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Informe
                </a>
              )}
              {!empresa.reporte_url && !editingUrl && (
                <button
                  type="button"
                  onClick={() => { setUrlDraft(""); setEditingUrl(true); }}
                  title="La IA no pudo verificar un informe público. Haz clic para agregar la URL manualmente."
                  className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-amber-600 font-medium italic transition-colors"
                >
                  <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  Sin URL verificada
                </button>
              )}
              {empresa.reporte_url && !editingUrl && (
                <button
                  type="button"
                  onClick={() => { setUrlDraft(empresa.reporte_url ?? ""); setEditingUrl(true); }}
                  title="Editar URL del informe"
                  className="p-0.5 text-slate-300 hover:text-slate-500 transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Inline URL editor */}
          {editingUrl && (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="url"
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                placeholder="https://... (dejar vacío para quitar)"
                className="flex-1 min-w-0 px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSaveUrl();
                  if (e.key === "Escape") setEditingUrl(false);
                }}
              />
              <button
                type="button"
                onClick={() => void handleSaveUrl()}
                disabled={saving}
                className="px-2 py-1 bg-teal-600 text-white text-[10px] font-bold rounded hover:bg-teal-700 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {saving ? "…" : "Guardar"}
              </button>
              <button
                type="button"
                onClick={() => setEditingUrl(false)}
                className="px-2 py-1 border border-slate-200 text-slate-400 text-[10px] rounded hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
            </div>
          )}

          {empresa.subsector && (
            <div className="text-[11px] text-slate-400 mt-0.5">{empresa.subsector}</div>
          )}
          {hasJustification && (
            <div className="mt-2">
              <p
                ref={justRef}
                className={`text-xs text-slate-500 leading-relaxed ${!expanded ? "line-clamp-2" : ""}`}
              >
                {empresa.justificacion}
              </p>
              {(isClamped || expanded) && (
                <button
                  type="button"
                  onClick={() => setExpanded((x) => !x)}
                  className="text-[11px] text-teal-600 hover:text-teal-800 font-medium mt-1"
                >
                  {expanded ? "Ver menos" : "Ver más"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
