"use client";

// Reemplaza <select> nativo donde la fuente del dropdown importa.
// El <select> nativo en Windows/Chrome abre un popup del SO que ignora CSS.
// Este componente usa un listbox custom: fuente Inter garantizada.

import { useEffect, useRef, useState } from "react";

export type SelectOption = { value: string; label: string };

export function SelectField({
  value,
  onChange,
  options,
  placeholder = "Todos",
  className,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? placeholder;

  return (
    <div ref={ref} className={`relative ${className ?? ""}`}>
      <button
        id={id}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between gap-1.5 w-full text-xs border border-slate-200 rounded px-2 py-1 bg-white hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 transition-colors"
      >
        <span className={value ? "text-slate-900" : "text-slate-500"}>{selectedLabel}</span>
        <svg
          className={`w-3.5 h-3.5 shrink-0 text-slate-400 transition-transform duration-100 ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute top-full left-0 mt-1 z-50 bg-white border border-slate-200 rounded shadow-md min-w-full max-h-52 overflow-y-auto"
        >
          <li
            role="option"
            aria-selected={value === ""}
            onClick={() => { onChange(""); setOpen(false); }}
            className={`text-xs px-3 py-1.5 cursor-pointer transition-colors ${
              value === ""
                ? "bg-brand-primary-light text-brand-primary-dark font-medium"
                : "text-slate-700 hover:bg-slate-50"
            }`}
          >
            {placeholder}
          </li>
          {options.map((o) => (
            <li
              key={o.value}
              role="option"
              aria-selected={value === o.value}
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={`text-xs px-3 py-1.5 cursor-pointer transition-colors ${
                value === o.value
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
