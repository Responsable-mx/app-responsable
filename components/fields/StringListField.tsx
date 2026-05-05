"use client";

import { useState } from "react";

/**
 * Lista de strings editable tipo chips con input al final.
 * Enter → agrega; × en chip → elimina; Backspace vacío → borra último.
 */
export function StringListField({
  value,
  onChange,
  placeholder,
  maxItems,
}: {
  value: string[] | null | undefined;
  onChange: (next: string[]) => void;
  placeholder?: string;
  maxItems?: number;
}) {
  const list = value ?? [];
  const [draft, setDraft] = useState("");

  function add() {
    const s = draft.trim();
    if (!s) return;
    if (maxItems && list.length >= maxItems) return;
    if (list.includes(s)) {
      setDraft("");
      return;
    }
    onChange([...list, s]);
    setDraft("");
  }

  function removeAt(i: number) {
    onChange(list.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5 border border-slate-300 rounded-lg bg-white focus-within:ring-2 focus-within:ring-brand-primary">
        {list.map((s, i) => (
          <span
            key={`${s}-${i}`}
            className="inline-flex items-center gap-1 bg-brand-primary-light text-brand-primary-dark text-xs px-2 py-0.5 rounded-full"
          >
            {s}
            <button
              type="button"
              onClick={() => removeAt(i)}
              className="hover:text-brand-primary-dark"
              aria-label={`Quitar ${s}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            } else if (e.key === "," ) {
              e.preventDefault();
              add();
            } else if (e.key === "Backspace" && draft === "" && list.length > 0) {
              removeAt(list.length - 1);
            }
          }}
          onBlur={() => add()}
          placeholder={list.length === 0 ? placeholder ?? "Escribe y Enter" : ""}
          className="flex-1 min-w-[120px] outline-none text-sm py-0.5"
          disabled={maxItems !== undefined && list.length >= maxItems}
        />
      </div>
      {maxItems && (
        <div className="text-[10px] text-slate-600 mt-0.5">
          {list.length}/{maxItems}
        </div>
      )}
    </div>
  );
}
