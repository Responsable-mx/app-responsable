"use client";

import { useState, useRef, useEffect } from "react";
import type { DocMeta } from "@/components/documents/doc-types";

export function RowActions({
  doc,
  isAdmin,
  onPreview,
  onEditServices,
  onDownload,
  onDelete,
}: {
  doc: DocMeta;
  isAdmin: boolean;
  onPreview: () => void;
  onEditServices: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex items-center justify-end gap-0.5">
      <button
        type="button"
        onClick={() => doc.has_content && onPreview()}
        disabled={!doc.has_content}
        className={`text-[11px] px-2 min-h-[40px] inline-flex items-center transition-colors rounded ${
          doc.has_content
            ? "text-brand-primary-dark hover:underline"
            : "text-slate-300 cursor-default"
        }`}
        title={doc.has_content ? "Ver Markdown extraído" : "Sin contenido extraído"}
      >
        Ver
      </button>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Más acciones"
        aria-expanded={open}
        className="min-h-[40px] min-w-[32px] inline-flex items-center justify-center rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
        title="Más acciones"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded shadow-sm min-w-[160px] py-1">
          <button
            type="button"
            onClick={() => { onEditServices(); setOpen(false); }}
            className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
          >
            Servicios
          </button>
          <button
            type="button"
            onClick={() => { onDownload(); setOpen(false); }}
            className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
          >
            Descargar
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => { onDelete(); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-xs text-rose-600 hover:bg-rose-50 border-t border-slate-100"
            >
              Borrar
            </button>
          )}
        </div>
      )}
    </div>
  );
}
