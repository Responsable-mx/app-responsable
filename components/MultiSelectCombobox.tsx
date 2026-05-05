"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import type { CatalogCategory } from "@/lib/catalogs/seeds";

type Mode = "multi" | "single";

type CatalogItem = {
  id: string;
  value: string;
  label: string;
  group_name: string | null;
  is_active: boolean;
};

type Props = {
  category: CatalogCategory;
  label: string;
  hint?: string;
  mode?: Mode;
  value: string[] | string | null | undefined; // arreglo si multi, string si single
  onChange: (next: string[] | string | null) => void;
  hasSearch?: boolean;
  hasGroups?: boolean;
  placeholder?: string;
};

const fetcher = (url: string) =>
  fetch(url).then((r) => r.json() as Promise<{ data: CatalogItem[] }>);

/**
 * Combobox con búsqueda, chips multi-select, agrupado opcional.
 * Lee el catálogo de /api/catalogs. Sin dependencias externas de UI.
 */
export function MultiSelectCombobox({
  category,
  label,
  hint,
  mode = "multi",
  value,
  onChange,
  hasSearch = true,
  hasGroups = false,
  placeholder,
}: Props) {
  const { data } = useSWR(
    `/api/catalogs?category=${category}`,
    fetcher,
    { revalidateOnFocus: false }
  );
  const items = useMemo(
    () => (data?.data ?? []).filter((i) => i.is_active),
    [data]
  );

  const selectedValues: string[] = useMemo(
    () =>
      mode === "multi"
        ? Array.isArray(value)
          ? value
          : []
        : typeof value === "string" && value
        ? [value]
        : [],
    [mode, value]
  );

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cierra al click fuera
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (it) =>
        !selectedValues.includes(it.value) &&
        (!q ||
          it.label.toLowerCase().includes(q) ||
          it.value.includes(q) ||
          (it.group_name ?? "").toLowerCase().includes(q))
    );
  }, [items, query, selectedValues]);

  // Clamp highlight en render (evita setState-in-effect cascading).
  const safeHighlight =
    filtered.length === 0 ? 0 : Math.min(highlight, filtered.length - 1);

  const select = useCallback(
    (val: string) => {
      if (mode === "multi") {
        onChange([...selectedValues, val]);
      } else {
        onChange(val);
        setOpen(false);
      }
      setQuery("");
    },
    [mode, onChange, selectedValues]
  );

  const removeChip = useCallback(
    (val: string) => {
      if (mode === "multi") {
        onChange(selectedValues.filter((v) => v !== val));
      } else {
        onChange(null);
      }
    },
    [mode, onChange, selectedValues]
  );

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = filtered[safeHighlight];
      if (it) select(it.value);
    } else if (e.key === "Backspace" && query === "" && mode === "multi") {
      if (selectedValues.length > 0) {
        removeChip(selectedValues[selectedValues.length - 1]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  // Agrupado
  const grouped = useMemo(() => {
    if (!hasGroups) return null;
    const groups = new Map<string, CatalogItem[]>();
    for (const it of filtered) {
      const g = it.group_name ?? "Otros";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(it);
    }
    return groups;
  }, [filtered, hasGroups]);

  // Label para mostrar en chips
  function labelOf(val: string): string {
    return items.find((i) => i.value === val)?.label ?? val;
  }

  return (
    <div ref={rootRef} className="relative">
      <label className="block text-xs font-medium text-slate-700 mb-1">
        {label}
      </label>
      {hint && <p className="text-[10px] text-slate-600 mb-1">{hint}</p>}
      <div
        className="flex flex-wrap gap-1 px-2 py-1.5 border border-slate-300 rounded-lg bg-white focus-within:ring-2 focus-within:ring-brand-primary"
        onClick={() => {
          setOpen(true);
          inputRef.current?.focus();
        }}
      >
        {selectedValues.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 bg-brand-primary-light text-brand-primary-dark text-xs px-2 py-0.5 rounded-full"
          >
            {labelOf(v)}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeChip(v);
              }}
              aria-label={`Quitar ${labelOf(v)}`}
              className="hover:text-brand-primary-dark"
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={
            selectedValues.length === 0
              ? placeholder ?? (hasSearch ? "Buscar o elegir…" : "Elegir…")
              : ""
          }
          className="flex-1 min-w-[120px] outline-none text-sm py-0.5"
        />
      </div>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-xs text-slate-600 text-center">
              {items.length === 0
                ? "Cargando…"
                : query
                ? "Sin resultados. Pide a un admin que lo agregue desde /configuracion."
                : "Todo seleccionado"}
            </div>
          ) : grouped ? (
            Array.from(grouped.entries()).map(([group, list]) => (
              <div key={group}>
                <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-slate-600 bg-slate-50 sticky top-0">
                  {group}
                </div>
                {list.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    data-value={it.value}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      select(it.value);
                    }}
                    className={`block w-full text-left px-3 py-1.5 text-sm ${
                      filtered.indexOf(it) === safeHighlight
                        ? "bg-brand-primary-light text-brand-primary-dark"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    {it.label}
                  </button>
                ))}
              </div>
            ))
          ) : (
            filtered.map((it, idx) => (
              <button
                key={it.id}
                type="button"
                data-value={it.value}
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(it.value);
                }}
                className={`block w-full text-left px-3 py-1.5 text-sm ${
                  idx === safeHighlight
                    ? "bg-brand-primary-light text-brand-primary-dark"
                    : "hover:bg-slate-50"
                }`}
              >
                {it.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

