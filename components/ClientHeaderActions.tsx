"use client";

import { useEffect, useRef } from "react";

/**
 * Botón "Editar cliente" directo — icon pencil 40×40.
 *
 * Iteración: antes fue kebab `⋯` con Editar + Exportar PDF. User feedback:
 * - "Exportar PDF" deprecado en esta fase (poco usado).
 * - Con solo 1 acción restante, kebab es overkill: 2 clicks vs 1.
 * - Patrón industry (Linear/Notion/GitHub): 1 acción → icono directo. Kebab
 *   se reintroduce cuando haya 2+ acciones.
 *
 * También arregla bug: el <Link> de Next dentro de menú con onClick que
 * cerraba el menú desmontaba el Link antes de completar navegación, dejando
 * "click en Editar no hace nada". Ahora navegamos vía router.push() programático.
 *
 * Keyboard shortcut: `E` → /clientes/[id]/editar. Skip si focus en input/modal.
 */
export function ClientHeaderActions({
  clientId,
  isAdmin,
}: {
  clientId: string;
  /** clientName kept en API por compat — no se usa por ahora */
  clientName?: string;
  isAdmin: boolean;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);

  // Keyboard shortcut global: E → editar (admin)
  useEffect(() => {
    if (!isAdmin) return;
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (target?.isContentEditable) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        window.location.assign(`/clientes/${clientId}/editar`);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isAdmin, clientId]);

  if (!isAdmin) return null;

  return (
    <button
      ref={btnRef}
      type="button"
      onClick={() => window.location.assign(`/clientes/${clientId}/editar`)}
      className="inline-flex items-center justify-center w-9 h-9 text-slate-600 bg-white border border-slate-200 rounded hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 shrink-0"
      aria-label="Editar cliente"
      title="Editar cliente · atajo E"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    </button>
  );
}
