"use client";

import { useState } from "react";
import type {
  BlockSchema,
  FieldDef,
  FieldType,
} from "@/lib/clients/narrative-schemas";
import {
  countFilledInBlock,
  isFieldFilled,
} from "@/lib/clients/narrative-schemas";
import { MultiSelectCombobox } from "@/components/MultiSelectCombobox";
import { BoolTriField } from "@/components/fields/BoolTriField";
import { StringListField } from "@/components/fields/StringListField";
import { ObjectListField } from "@/components/fields/ObjectListField";

type BlockValue = Record<string, unknown>;

/**
 * Renderiza un bloque narrativo como accordeón con todos sus sub-campos
 * según schema. Muestra contador "X/N llenos" en el header.
 */
export function StructuredBlockEditor({
  schema,
  value,
  onChange,
  defaultOpen = false,
}: {
  schema: BlockSchema;
  value: BlockValue;
  onChange: (next: BlockValue) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const filled = countFilledInBlock(schema, value);
  const total = schema.fields.length;

  function updateField(key: string, v: unknown) {
    onChange({ ...value, [key]: v });
  }

  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-stone-50 transition-colors"
      >
        <div className="text-left">
          <div className="font-semibold text-slate-900">{schema.title}</div>
          <div className="text-xs text-slate-500 mt-0.5">
            {schema.description}
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span
            className={`px-2 py-0.5 rounded-full ${
              filled === 0
                ? "bg-stone-100 text-slate-500"
                : filled === total
                ? "bg-green-50 text-green-800"
                : "bg-amber-50 text-amber-800"
            }`}
          >
            {filled}/{total}
          </span>
          <span className="text-slate-400">{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open && (
        <div className="px-6 pb-6 pt-2 space-y-4 border-t border-stone-100">
          {schema.fields.map((field) => (
            <FieldRow
              key={field.key}
              field={field}
              value={value[field.key]}
              onChange={(v) => updateField(field.key, v)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FieldRow({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const isFilled = isFieldFilled(field.type, value);
  return (
    <div>
      <label className="flex items-center justify-between text-xs font-medium text-slate-700 mb-1">
        <span className="flex items-center gap-1.5">
          {field.label}
          {isFilled && <span className="text-green-600">•</span>}
        </span>
      </label>
      {field.hint && (
        <p className="text-[10px] text-slate-500 mb-1">{field.hint}</p>
      )}
      <FieldRenderer type={field.type} value={value} onChange={onChange} />
    </div>
  );
}

function FieldRenderer({
  type,
  value,
  onChange,
}: {
  type: FieldType;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const inputCls =
    "w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-600 bg-white";

  switch (type.kind) {
    case "text":
      return type.multiline ? (
        <textarea
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className={inputCls + " resize-y"}
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
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={(value as number | undefined) ?? ""}
            onChange={(e) =>
              onChange(e.target.value === "" ? null : Number(e.target.value))
            }
            min={type.min}
            max={type.max}
            className={inputCls + " flex-1 max-w-xs"}
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
          className={inputCls + " max-w-[120px]"}
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
          value={value as Array<Record<string, unknown>> | null}
          onChange={(v) => onChange(v)}
          schema={type.schema}
          itemLabel={type.itemLabel}
          maxItems={type.maxItems}
        />
      );
  }
}
