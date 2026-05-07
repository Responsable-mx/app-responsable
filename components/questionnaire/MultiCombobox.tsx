"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  options: { value: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}

export function MultiCombobox({ options, value, onChange, placeholder = "Buscar…" }: Props) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = options.filter(
    (o) =>
      !value.includes(o.value) &&
      o.label.toLowerCase().includes(search.toLowerCase())
  );

  const remove = (v: string) => onChange(value.filter((x) => x !== v));
  const add = (v: string) => {
    onChange([...value, v]);
    setSearch("");
  };

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      {/* Chips seleccionados */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map((v) => {
            const opt = options.find((o) => o.value === v);
            return (
              <span
                key={v}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-sm border bg-brand-primary-light border-brand-primary text-brand-primary-dark"
              >
                {opt?.label ?? v}
                <button
                  type="button"
                  onClick={() => remove(v)}
                  className="text-brand-primary-dark/60 hover:text-brand-primary-dark leading-none ml-0.5"
                  aria-label={`Quitar ${opt?.label ?? v}`}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}
      {/* Buscador */}
      <div className="relative">
        <input
          type="text"
          className="w-full text-sm border border-slate-200 rounded px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 placeholder:text-slate-400"
          placeholder={placeholder}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
        {open && filtered.length > 0 && (
          <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded shadow-sm max-h-52 overflow-y-auto">
            {filtered.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(opt.value);
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
        {open && search && filtered.length === 0 && (
          <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded shadow-sm px-3 py-2 text-xs text-slate-400">
            Sin coincidencias
          </div>
        )}
      </div>
    </div>
  );
}
