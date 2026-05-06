"use client";

// Reemplaza <select> nativo donde la fuente del dropdown importa.
// El <select> nativo en Windows/Chrome abre un popup del SO que ignora CSS.
// Este componente usa un listbox custom: fuente Inter garantizada.
// Sesión 10: + role=combobox, aria-expanded, arrow key navigation, disabled prop, shadow-sm.

import { useEffect, useId, useRef, useState } from "react";

export type SelectOption = { value: string; label: string };

export function SelectField({
  value,
  onChange,
  options,
  placeholder = "Todos",
  className,
  id: externalId,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const uid = useId();
  const listId = `${externalId ?? uid}-listbox`;

  // Todas las opciones incluyendo placeholder como índice 0
  const allOptions: SelectOption[] = [{ value: "", label: placeholder }, ...options];

  // Click fuera → cerrar
  useEffect(() => {
    if (!open) { setFocusedIdx(-1); return; }
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Teclado: todo en el trigger para mantener el foco en él (patrón WAI-ARIA combobox).
  function handleTriggerKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setOpen(true);
        setFocusedIdx(Math.max(0, allOptions.findIndex(o => o.value === value)));
      }
    } else {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIdx(i => Math.min(i + 1, allOptions.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIdx(i => Math.max(i - 1, 0));
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (focusedIdx >= 0) onChange(allOptions[focusedIdx].value);
        setOpen(false);
      } else if (e.key === "Escape" || e.key === "Tab") {
        setOpen(false);
      }
    }
  }

  const selectedLabel = options.find(o => o.value === value)?.label ?? placeholder;
  const activeDescId = open && focusedIdx >= 0 ? `${externalId ?? uid}-opt-${focusedIdx}` : undefined;

  return (
    <div ref={ref} className={`relative ${className ?? ""}`}>
      <button
        id={externalId}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        aria-activedescendant={activeDescId}
        onClick={() => { if (!disabled) setOpen(o => !o); }}
        onKeyDown={handleTriggerKeyDown}
        disabled={disabled}
        className={`flex items-center justify-between gap-1.5 w-full text-xs border border-slate-200 rounded px-2 py-1 bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/30 ${
          disabled ? "opacity-50 cursor-not-allowed" : "hover:border-slate-300"
        }`}
      >
        <span className={value ? "text-slate-900" : "text-slate-500"}>{selectedLabel}</span>
        <svg
          className={`w-3.5 h-3.5 shrink-0 text-slate-400 transition-transform duration-100 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          tabIndex={-1}
          className="absolute top-full left-0 mt-1 z-50 bg-white border border-slate-200 rounded shadow-sm min-w-full max-h-52 overflow-y-auto focus:outline-none"
        >
          {allOptions.map((o, i) => (
            <li
              key={o.value === "" ? "__placeholder__" : o.value}
              id={`${externalId ?? uid}-opt-${i}`}
              role="option"
              aria-selected={value === o.value}
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={`text-xs px-3 py-1.5 cursor-pointer transition-colors ${
                i === focusedIdx || value === o.value
                  ? "bg-brand-primary-light text-brand-primary-dark font-medium"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
