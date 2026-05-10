"use client";

import Link from "next/link";
import { useState, useRef, useEffect, useCallback } from "react";
import { useToast } from "@/components/ui/Toast";

/**
 * Kebab `⋯` consolidando acciones secundarias del cliente.
 * Reemplaza los 2 botones del header (Editar + Exportar PDF) por un solo
 * elemento — libera ~150px horizontal. Patrón Linear/Stripe Dashboard.
 *
 * Keyboard shortcuts:
 * - `E` → editar cliente (admin)
 * - `P` → exportar PDF
 * Activos solo si no hay modal/input enfocado.
 */
export function ClientHeaderActions({
  clientId,
  clientName,
  isAdmin,
}: {
  clientId: string;
  clientName: string;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const editLinkRef = useRef<HTMLAnchorElement>(null);
  const toast = useToast();

  // Cerrar al click fuera o Escape
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const exportPdf = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setOpen(false);
    try {
      const res = await fetch(`/api/clients/${clientId}/export-pdf`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.push("error", data.error ?? "Error al generar PDF");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `responsable-${clientName
        .replace(/[^a-zA-Z0-9À-ɏ\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .toLowerCase()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.push("success", "PDF descargado");
    } finally {
      setBusy(false);
    }
  }, [busy, clientId, clientName, toast]);

  // Keyboard shortcuts globales: E = editar · P = exportar
  // No disparan si el foco está en input/textarea/contenteditable o si hay modal abierto
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (target?.isContentEditable) return;
      // Si hay modal abierto, skip
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (e.key === "e" || e.key === "E") {
        if (isAdmin) {
          e.preventDefault();
          editLinkRef.current?.click();
        }
      } else if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        void exportPdf();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isAdmin, exportPdf]);

  return (
    <div ref={ref} className="relative shrink-0">
      {/* Link Editar oculto para keyboard shortcut "E" — renderizado pero invisible */}
      {isAdmin && (
        <Link
          ref={editLinkRef}
          href={`/clientes/${clientId}/editar`}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        >
          Editar cliente (atajo)
        </Link>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center w-9 h-9 text-slate-600 bg-white border border-slate-200 rounded hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
        aria-label="Acciones del cliente"
        aria-expanded={open}
        aria-haspopup="menu"
        title="Acciones · atajo E o P"
        disabled={busy}
      >
        {busy ? (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        ) : (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="12" cy="5" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="12" cy="19" r="1.5" />
          </svg>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Acciones del cliente"
          className="absolute top-full right-0 mt-1 z-50 bg-white border border-slate-200 rounded shadow-sm min-w-[220px] py-1"
        >
          {isAdmin && (
            <Link
              role="menuitem"
              href={`/clientes/${clientId}/editar`}
              onClick={() => setOpen(false)}
              className="flex items-center justify-between gap-3 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:bg-slate-50"
            >
              <span className="flex items-center gap-2">
                <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Editar cliente
              </span>
              <kbd className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-sm font-mono">E</kbd>
            </Link>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => void exportPdf()}
            disabled={busy}
            className="w-full flex items-center justify-between gap-3 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 text-left disabled:opacity-50 focus-visible:outline-none focus-visible:bg-slate-50"
          >
            <span className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
              Exportar ficha en PDF
            </span>
            <kbd className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-sm font-mono">P</kbd>
          </button>
        </div>
      )}
    </div>
  );
}
