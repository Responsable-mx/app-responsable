"use client";

import { useRef, useState } from "react";
import useSWR from "swr";

type Option = { value: string; label: string };

const fetcher = (url: string) =>
  fetch(url)
    .then((r) => r.json())
    .then((j) => (j.data ?? []) as Option[]);

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
  excludeId?: string;
};

export function ClientRelationsSelect({ value, onChange, excludeId }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const url = excludeId
    ? `/api/clients?catalog=1&exclude=${excludeId}`
    : "/api/clients?catalog=1";

  const { data: options = [] } = useSWR<Option[]>(url, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });

  const filtered = query.trim()
    ? options.filter((o) =>
        o.label.toLowerCase().includes(query.trim().toLowerCase())
      )
    : options;

  const notSelected = filtered.filter((o) => !value.includes(o.value));

  function toggle(id: string) {
    onChange(
      value.includes(id) ? value.filter((v) => v !== id) : [...value, id]
    );
  }

  function remove(id: string) {
    onChange(value.filter((v) => v !== id));
  }

  function nameOf(id: string) {
    return options.find((o) => o.value === id)?.label ?? id;
  }

  return (
    <div className="space-y-2">
      {/* Chips seleccionados */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 bg-brand-primary/10 text-brand-primary-dark text-xs font-medium rounded-sm px-2 py-0.5"
            >
              {nameOf(id)}
              <button
                type="button"
                onClick={() => remove(id)}
                className="ml-0.5 text-brand-primary-dark/60 hover:text-brand-primary-dark"
                aria-label={`Quitar ${nameOf(id)}`}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Buscador */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Buscar empresa…"
          className="w-full text-sm border border-slate-200 rounded px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 placeholder:text-slate-400"
        />

        {open && notSelected.length > 0 && (
          <ul className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded shadow-sm max-h-52 overflow-y-auto text-sm">
            {notSelected.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    toggle(o.value);
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-slate-800"
                >
                  {o.label}
                </button>
              </li>
            ))}
          </ul>
        )}

        {open && query.trim() && notSelected.length === 0 && (
          <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded shadow-sm px-3 py-2 text-sm text-slate-400">
            Sin resultados
          </div>
        )}
      </div>
    </div>
  );
}
