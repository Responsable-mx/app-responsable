"use client";

import { useMemo } from "react";
import type { FieldDef, FieldType } from "@/lib/clients/narrative-schemas";
import { MultiSelectCombobox } from "@/components/MultiSelectCombobox";
import { BoolTriField } from "./BoolTriField";
import { StringListField } from "./StringListField";

type Item = Record<string, unknown>;

/**
 * Lista editable de objetos con sub-campos definidos por schema.
 * Cada item tiene [Edit inline] [Eliminar] [Agregar] abajo.
 */
export function ObjectListField({
  value,
  onChange,
  schema,
  itemLabel,
  maxItems,
}: {
  value: Item[] | null | undefined;
  onChange: (next: Item[]) => void;
  schema: FieldDef[];
  itemLabel: string;
  maxItems?: number;
}) {
  const list = useMemo(() => value ?? [], [value]);

  function updateItem(idx: number, field: string, v: unknown) {
    const next = list.map((it, i) =>
      i === idx ? { ...it, [field]: v } : it
    );
    onChange(next);
  }

  function removeAt(idx: number) {
    onChange(list.filter((_, i) => i !== idx));
  }

  function add() {
    if (maxItems && list.length >= maxItems) return;
    onChange([...list, {}]);
  }

  return (
    <div className="space-y-2">
      {list.map((item, idx) => (
        <div
          key={idx}
          className="bg-stone-50 border border-stone-200 rounded-lg p-3 relative"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-wide text-slate-500">
              {itemLabel} {idx + 1}
            </span>
            <button
              type="button"
              onClick={() => removeAt(idx)}
              className="text-xs text-red-600 hover:underline"
              aria-label="Eliminar"
            >
              Eliminar
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {schema.map((f) => (
              <div
                key={f.key}
                className={
                  f.type.kind === "text" && f.type.multiline
                    ? "col-span-2"
                    : ""
                }
              >
                <label className="block text-[10px] font-medium text-slate-600 mb-0.5">
                  {f.label}
                </label>
                <SubFieldRenderer
                  type={f.type}
                  value={item[f.key]}
                  onChange={(v) => updateItem(idx, f.key, v)}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        disabled={maxItems !== undefined && list.length >= maxItems}
        className="text-xs px-3 py-1.5 border border-dashed border-stone-300 rounded-lg text-slate-600 hover:bg-stone-50 disabled:opacity-50"
      >
        + Agregar {itemLabel}
      </button>
    </div>
  );
}

function SubFieldRenderer({
  type,
  value,
  onChange,
}: {
  type: FieldType;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const inputCls =
    "w-full px-2 py-1.5 border border-stone-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-teal-600 bg-white";

  switch (type.kind) {
    case "text":
      return type.multiline ? (
        <textarea
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className={inputCls}
          placeholder={type.placeholder}
        />
      ) : (
        <input
          type="text"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={inputCls}
          placeholder={type.placeholder}
        />
      );
    case "number":
      return (
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={(value as number | undefined) ?? ""}
            onChange={(e) =>
              onChange(
                e.target.value === "" ? null : Number(e.target.value)
              )
            }
            min={type.min}
            max={type.max}
            className={inputCls + " flex-1"}
          />
          {type.unit && (
            <span className="text-xs text-slate-500">{type.unit}</span>
          )}
        </div>
      );
    case "year":
      return (
        <input
          type="number"
          value={(value as number | undefined) ?? ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? null : Number(e.target.value))
          }
          min={2000}
          max={2050}
          placeholder="AAAA"
          className={inputCls}
        />
      );
    case "bool_tri":
      return (
        <BoolTriField
          value={value as boolean | null}
          onChange={(v) => onChange(v)}
        />
      );
    case "string_list":
      return (
        <StringListField
          value={value as string[] | null}
          onChange={(v) => onChange(v)}
          placeholder={type.placeholder}
          maxItems={type.maxItems}
        />
      );
    case "catalog_multi":
      return (
        <MultiSelectCombobox
          category={type.category}
          label=""
          value={value as string[] | null}
          onChange={(v) => onChange(v)}
        />
      );
    case "catalog_single":
      return (
        <MultiSelectCombobox
          category={type.category}
          label=""
          mode="single"
          value={value as string | null}
          onChange={(v) => onChange(v)}
        />
      );
    case "object_list":
      return (
        <ObjectListField
          value={value as Item[] | null}
          onChange={(v) => onChange(v)}
          schema={type.schema}
          itemLabel={type.itemLabel}
          maxItems={type.maxItems}
        />
      );
  }
}
