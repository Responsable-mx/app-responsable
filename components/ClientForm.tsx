"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Client } from "@/lib/clients";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type Props =
  | { mode: "create"; initial?: undefined }
  | { mode: "edit"; initial: Client };

type FormState = {
  name: string;
  sector: string;
  countries: string; // comma-separated en UI
  size: string;
  info_general: string;
  business_model: string;
  impacts: string;
  regulatory_context: string;
  sustainability_strategy: string;
  stakeholders: string;
};

const SIZE_OPTIONS = [
  { value: "", label: "—" },
  { value: "micro", label: "Micro" },
  { value: "pyme", label: "PyME" },
  { value: "mediana", label: "Mediana" },
  { value: "grande", label: "Grande" },
  { value: "corporativo", label: "Corporativo" },
];

// Los 6 bloques con su guía (los sub-puntos del Word como recordatorio)
const BLOCKS: Array<{
  key: keyof Pick<
    FormState,
    | "info_general"
    | "business_model"
    | "impacts"
    | "regulatory_context"
    | "sustainability_strategy"
    | "stakeholders"
  >;
  label: string;
  hint: string;
}> = [
  {
    key: "info_general",
    label: "1. Información general",
    hint: "Nombre, sector/subsector, países, unidades de negocio, % ingresos por línea, tamaño (empleados/ingresos), productos/servicios.",
  },
  {
    key: "business_model",
    label: "2. Modelo de negocio",
    hint: "Cómo genera ingresos, segmentos (B2B/B2C/gobierno), propuesta de valor, costos operativos, CAPEX, dependencias críticas.",
  },
  {
    key: "impacts",
    label: "3. Impactos sociales y ambientales actuales",
    hint: "Emisiones (alcance 1/2/3), agua, residuos, biodiversidad, condiciones laborales, D&I, comunidades, incidentes/multas.",
  },
  {
    key: "regulatory_context",
    label: "4. Contexto regulatorio y sectorial",
    hint: "Regulaciones por país, requerimientos de clientes/cadenas globales, presión de inversionistas, top 3 tendencias, benchmark de competidores.",
  },
  {
    key: "sustainability_strategy",
    label: "5. Estrategia y madurez en sostenibilidad",
    hint: "Estrategia formal, políticas (ética/DDHH/ambiental/proveedores), KPIs, certificaciones (ISO/GRI/ESR/GPTW), reportes, modelo (pilares/temas), materialidad, temas materiales.",
  },
  {
    key: "stakeholders",
    label: "6. Stakeholders",
    hint: "Grupos clave, nivel de dependencia, canales de relación actual, expectativas y conflictos principales.",
  },
];

export function ClientForm(props: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [form, setForm] = useState<FormState>({
    name: props.initial?.name ?? "",
    sector: props.initial?.sector ?? "",
    countries: props.initial?.countries?.join(", ") ?? "",
    size: props.initial?.size ?? "",
    info_general: props.initial?.info_general ?? "",
    business_model: props.initial?.business_model ?? "",
    impacts: props.initial?.impacts ?? "",
    regulatory_context: props.initial?.regulatory_context ?? "",
    sustainability_strategy: props.initial?.sustainability_strategy ?? "",
    stakeholders: props.initial?.stakeholders ?? "",
  });

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        sector: form.sector.trim() || null,
        countries: form.countries
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        size: form.size || null,
        info_general: form.info_general || null,
        business_model: form.business_model || null,
        impacts: form.impacts || null,
        regulatory_context: form.regulatory_context || null,
        sustainability_strategy: form.sustainability_strategy || null,
        stakeholders: form.stakeholders || null,
      };

      const url =
        props.mode === "create"
          ? "/api/clients"
          : `/api/clients/${props.initial.id}`;
      const method = props.mode === "create" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error al guardar");
        setSaving(false);
        return;
      }
      router.push("/clientes");
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("Error de conexión");
      setSaving(false);
    }
  }

  async function performDelete() {
    if (props.mode !== "edit") return;
    setConfirmDelete(false);
    const res = await fetch(`/api/clients/${props.initial.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      router.push("/clientes");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Error al eliminar");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Campos estructurados */}
      <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">
          Identificación
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nombre *">
            <input
              required
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              className={inputCls}
              placeholder="Ej: Heineken México"
            />
          </Field>
          <Field label="Sector">
            <input
              value={form.sector}
              onChange={(e) => update("sector", e.target.value)}
              className={inputCls}
              placeholder="Ej: Bebidas / Retail / Farmacéutico"
            />
          </Field>
          <Field label="Países (separados por coma)">
            <input
              value={form.countries}
              onChange={(e) => update("countries", e.target.value)}
              className={inputCls}
              placeholder="México, Costa Rica, Colombia"
            />
          </Field>
          <Field label="Tamaño">
            <select
              value={form.size}
              onChange={(e) => update("size", e.target.value)}
              className={inputCls}
            >
              {SIZE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      {/* 6 bloques de contexto */}
      {BLOCKS.map((block) => (
        <div
          key={block.key}
          className="bg-white border border-stone-200 rounded-xl p-6"
        >
          <label className="block text-sm font-semibold text-slate-900 mb-1">
            {block.label}
          </label>
          <p className="text-xs text-slate-500 mb-3">{block.hint}</p>
          <textarea
            value={form[block.key]}
            onChange={(e) => update(block.key, e.target.value)}
            rows={6}
            className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent resize-y"
            placeholder="Escribe lo que tengas. Puedes dejarlo vacío y completarlo después."
          />
        </div>
      ))}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg p-3">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          type="submit"
          disabled={saving || !form.name.trim()}
          className="px-5 py-2.5 bg-teal-700 text-white rounded-lg text-sm font-medium hover:bg-teal-800 disabled:bg-stone-300 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "Guardando..." : props.mode === "create" ? "Crear cliente" : "Guardar cambios"}
        </button>

        {props.mode === "edit" && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="px-3 py-2 text-sm text-red-700 hover:bg-red-50 rounded-lg"
          >
            Eliminar
          </button>
        )}
      </div>

      {props.mode === "edit" && (
        <ConfirmDialog
          open={confirmDelete}
          title={`Eliminar ${props.initial.name}`}
          description={
            "Esta acción no se puede deshacer. El cliente y su contexto quedarán borrados para todo el equipo."
          }
          confirmLabel="Eliminar"
          cancelLabel="Cancelar"
          variant="destructive"
          onConfirm={performDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </form>
  );
}

const inputCls =
  "w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-700 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}
