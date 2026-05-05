"use client";

import { useState } from "react";
import type { ServiceKey } from "@/lib/services/service-schemas";
import { SERVICE_BY_KEY } from "@/lib/services/service-schemas";
import type { FieldDef, FieldType } from "@/lib/clients/narrative-schemas";
import { MultiSelectCombobox } from "@/components/MultiSelectCombobox";
import { BoolTriField } from "@/components/fields/BoolTriField";
import { StringListField } from "@/components/fields/StringListField";
import { ObjectListField } from "@/components/fields/ObjectListField";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

type Mode =
  | { kind: "create"; clientId: string }
  | { kind: "edit"; serviceId: string; initialService: ServiceKey; initialData: Record<string, unknown> };

export function ServiceEditor({
  mode,
  onClose,
  onSaved,
}: {
  mode: Mode;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [service, setService] = useState<ServiceKey>(
    mode.kind === "edit" ? mode.initialService : "doble_materialidad"
  );
  const [data, setData] = useState<Record<string, unknown>>(
    mode.kind === "edit" ? mode.initialData : {}
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const schema = SERVICE_BY_KEY[service];

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      if (mode.kind === "create") {
        const res = await fetch(`/api/clients/${mode.clientId}/services`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ service, data }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setError(j.error ?? "Error al crear");
          setSaving(false);
          return;
        }
      } else {
        const res = await fetch(`/api/client-services/${mode.serviceId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setError(j.error ?? "Error al guardar");
          setSaving(false);
          return;
        }
      }
      onSaved();
    } catch {
      setError("Error de conexión");
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={saving ? () => {} : onClose}
      title={mode.kind === "create" ? "Nuevo servicio" : "Editar servicio"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} loading={saving}>
            {mode.kind === "create" ? "Crear servicio" : "Guardar"}
          </Button>
        </>
      }
    >
      <p className="text-xs text-slate-600 mb-4">{schema.description}</p>
      <div className="space-y-4">
        {mode.kind === "create" && (
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Tipo de servicio
            </label>
            <div className="flex flex-wrap gap-2">
              {Object.values(SERVICE_BY_KEY).map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setService(s.key)}
                  className={`px-3 py-2 border rounded text-sm transition-colors ${
                    service === s.key
                      ? `${s.color} border-current font-medium`
                      : "bg-white border-slate-300 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="border-t border-slate-100 pt-4 space-y-4">
          {schema.fields.map((field) => (
            <FieldRow
              key={field.key}
              field={field}
              value={data[field.key]}
              onChange={(v) => setData((d) => ({ ...d, [field.key]: v }))}
            />
          ))}
        </div>

        {error && (
          <div
            role="alert"
            className="bg-red-50 border border-red-200 text-red-800 text-sm rounded p-3"
          >
            {error}
          </div>
        )}
      </div>
    </Modal>
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
  return (
    <div>
      <label className="block text-xs font-medium text-slate-700 mb-1">
        {field.label}
      </label>
      {field.hint && (
        <p className="text-[10px] text-slate-600 mb-1">{field.hint}</p>
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
  const cls =
    "w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary bg-white";

  switch (type.kind) {
    case "text":
      return type.multiline ? (
        <textarea
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className={cls + " resize-y"}
          placeholder={type.placeholder}
        />
      ) : (
        <input
          type="text"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={cls}
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
            className={cls + " max-w-[200px]"}
          />
          {type.unit && (
            <span className="text-xs text-slate-600">{type.unit}</span>
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
          className={cls + " max-w-[120px]"}
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
          hasGroups
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
          hasGroups
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
