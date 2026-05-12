"use client";

// Sesión 26: dropdown con position:fixed — escapa overflow:hidden/auto de modales y contenedores.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ServiceOption } from "@/components/documents/doc-types";

export function ServiceMultiSelect({
  options,
  selected,
  onChange,
}: {
  options: ServiceOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [fixedPos, setFixedPos] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  }

  // Calcula posición fixed al abrir — escapa cualquier overflow:hidden/auto ancestro.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    // Alinear borde derecho del dropdown con el borde derecho del trigger.
    setFixedPos({
      top: rect.bottom + 4,
      right: window.innerWidth - rect.right,
    });
  }, [open]);

  // Click fuera → cerrar (trigger + dropdown son referencias separadas porque
  // el dropdown se renderiza con position:fixed fuera del árbol DOM del trigger).
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      const insideTrigger = triggerRef.current?.contains(target) ?? false;
      const insideDropdown = dropdownRef.current?.contains(target) ?? false;
      if (!insideTrigger && !insideDropdown) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const label =
    selected.length === 0
      ? "Todos los servicios"
      : selected.length === 1
      ? (options.find((o) => o.id === selected[0])?.label ?? "1 servicio")
      : `${selected.length} servicios`;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="text-xs border border-slate-300 rounded px-2.5 py-1.5 bg-white text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 min-w-[120px] justify-between"
      >
        <span className="truncate max-w-[140px]">{label}</span>
        <svg className="w-3 h-3 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div
          ref={dropdownRef}
          style={{ position: "fixed", ...fixedPos, zIndex: 9999 }}
          className="bg-white border border-slate-200 rounded shadow-sm min-w-[200px] py-1"
        >
          {options.map((o) => (
            <label
              key={o.id}
              className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.includes(o.id)}
                onChange={() => toggle(o.id)}
                className="rounded border-slate-300 text-brand-primary"
              />
              {o.label}
            </label>
          ))}
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full text-left px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 border-t border-slate-100 mt-1"
            >
              Limpiar selección
            </button>
          )}
        </div>
      )}
    </div>
  );
}
