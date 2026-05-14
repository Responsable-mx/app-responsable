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
import { Input } from "@/components/ui/Input";
import { SelectField } from "@/components/ui/SelectField";
import { useToast } from "@/components/ui/Toast";
import { ProjectCostCard } from "@/components/pricing/ProjectCostCard";
import type { ClientService } from "@/lib/client-services";

type AvailableTemplate = {
  id: string;
  name: string;
  description: string | null;
  data: { stages: { name: string; activities: { name: string }[] }[] };
};

type Mode =
  | { kind: "create"; clientId: string }
  | {
      kind: "edit";
      serviceId: string;
      initialService: ServiceKey;
      initialData: Record<string, unknown>;
      initialClientService?: ClientService;
    };

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
  // Post-create: si hay plantillas para el servicio, prompt para aplicar.
  const [postCreate, setPostCreate] = useState<{
    serviceId: string;
    templates: AvailableTemplate[];
  } | null>(null);

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
        const j = await res.json().catch(() => ({}));
        const newServiceId = j.data?.id as string | undefined;

        // Buscar plantillas que matchean el servicio recién creado
        if (newServiceId) {
          try {
            const tplRes = await fetch(
              `/api/stage-templates?service=${encodeURIComponent(service)}`
            );
            if (tplRes.ok) {
              const tplJson = await tplRes.json();
              const templates: AvailableTemplate[] = tplJson.data ?? [];
              if (templates.length > 0) {
                setPostCreate({ serviceId: newServiceId, templates });
                setSaving(false);
                return; // No cerrar todavía — mostrar prompt
              }
            }
          } catch {
            // Falló búsqueda de plantillas — no bloquea creación, solo skipea prompt
          }
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

  if (postCreate) {
    return (
      <ApplyTemplatePrompt
        clientServiceId={postCreate.serviceId}
        templates={postCreate.templates}
        onSkip={() => onSaved()}
        onApplied={() => onSaved()}
      />
    );
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

        {mode.kind === "edit" && mode.initialClientService && (
          <div className="border-t border-slate-100 pt-4">
            <ProjectCostCard service={mode.initialClientService} />
          </div>
        )}

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

function ApplyTemplatePrompt({
  clientServiceId,
  templates,
  onSkip,
  onApplied,
}: {
  clientServiceId: string;
  templates: AvailableTemplate[];
  onSkip: () => void;
  onApplied: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string>(
    templates.length === 1 ? templates[0]!.id : ""
  );
  const [startDate, setStartDate] = useState<string>(
    () => new Date().toISOString().slice(0, 10)
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { push } = useToast();

  const selected = templates.find((t) => t.id === selectedId);

  async function handleApply() {
    if (!selectedId) return;
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/stage-templates/${selectedId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_service_id: clientServiceId,
          start_date: startDate,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error ?? `Error ${res.status}`);
        return;
      }
      const j = await res.json().catch(() => ({}));
      const r = j.data ?? {};
      push(
        "success",
        `Servicio creado · plantilla aplicada (${r.stagesCreated} etapas, ${r.activitiesCreated} actividades)`
      );
      onApplied();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={busy ? () => {} : onSkip}
      title="Aplicar plantilla al cronograma"
      footer={
        <>
          <Button variant="ghost" onClick={onSkip} disabled={busy}>
            Saltar (sin estructura)
          </Button>
          <Button onClick={handleApply} disabled={!selectedId || busy} loading={busy}>
            Aplicar plantilla
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {err && (
          <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">
            {err}
          </div>
        )}
        <p className="text-xs text-slate-700 bg-brand-primary-light border border-brand-primary/20 rounded p-2.5">
          Servicio creado. Encontramos {templates.length}{" "}
          {templates.length === 1 ? "plantilla" : "plantillas"} para este servicio. Aplica una
          ahora para inicializar el cronograma con etapas y actividades.
        </p>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Plantilla</label>
          <SelectField
            value={selectedId}
            onChange={(v) => setSelectedId(v)}
            placeholder="— Selecciona una plantilla —"
            options={templates.map((t) => ({ value: t.id, label: t.name }))}
          />
        </div>
        {selected && (
          <div className="bg-slate-50 border border-slate-200 rounded p-2.5 text-xs space-y-1">
            {selected.description && <p className="text-slate-700">{selected.description}</p>}
            <p className="text-slate-600">
              {selected.data.stages.length}{" "}
              {selected.data.stages.length === 1 ? "etapa" : "etapas"} ·{" "}
              {selected.data.stages.reduce((s, st) => s + st.activities.length, 0)} actividades
            </p>
          </div>
        )}
        <Input
          label="Fecha base (día 0)"
          helper="Las fechas plan se calculan sumando los offsets desde aquí."
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
      </div>
    </Modal>
  );
}
