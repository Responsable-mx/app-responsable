"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Client } from "@/lib/clients";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { MultiSelectCombobox } from "@/components/MultiSelectCombobox";

type Props =
  | { mode: "create"; initial?: undefined }
  | { mode: "edit"; initial: Client };

type FormState = {
  // Identificación
  name: string;
  sector: string;       // single-select value
  subsector: string;
  countries: string[];  // multi
  size: string;

  // Atributos estructurados
  business_segments: string[];
  frameworks: string[];
  applicable_regulations: string[];
  policies_in_place: string[];
  certifications: string[];
  material_topics: string[];
  maturity_level: string; // single
  has_double_materiality: boolean | null;
  has_sustainability_report: boolean | null;
  has_sustainability_strategy: boolean | null;

  // Narrativa
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
    label: "1. Operaciones y productos",
    hint: "Unidades de negocio, % ingresos por línea, productos/servicios principales, volúmenes relevantes. (Nombre/sector/países/tamaño ya están arriba.)",
  },
  {
    key: "business_model",
    label: "2. Modelo de negocio",
    hint: "Cómo genera ingresos, propuesta de valor, costos operativos, CAPEX, dependencias críticas. (Segmentos ya están en chips.)",
  },
  {
    key: "impacts",
    label: "3. Impactos ESG actuales",
    hint: "Emisiones 1/2/3 con valores medidos, agua, residuos, biodiversidad, condiciones laborales, comunidades, incidentes/multas.",
  },
  {
    key: "regulatory_context",
    label: "4. Contexto sectorial",
    hint: "Requerimientos de cadena global, presión de inversionistas, top 3 tendencias del sector, benchmark competidores. (Regulaciones ya están en chips.)",
  },
  {
    key: "sustainability_strategy",
    label: "5. Estrategia y materialidad",
    hint: "Pilares/objetivos, KPIs con targets y base year, modelo de sostenibilidad, resultados del estudio de materialidad. (Políticas/certificaciones/temas ya están en chips.)",
  },
  {
    key: "stakeholders",
    label: "6. Stakeholders",
    hint: "Grupos clave, nivel de dependencia, canales de relación, expectativas y conflictos.",
  },
];

function toBool(v: boolean | null | undefined): boolean | null {
  return v === undefined ? null : v;
}

export function ClientForm(props: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [form, setForm] = useState<FormState>({
    name: props.initial?.name ?? "",
    sector: props.initial?.sector ?? "",
    subsector: props.initial?.subsector ?? "",
    countries: props.initial?.countries ?? [],
    size: props.initial?.size ?? "",
    business_segments: props.initial?.business_segments ?? [],
    frameworks: props.initial?.frameworks ?? [],
    applicable_regulations: props.initial?.applicable_regulations ?? [],
    policies_in_place: props.initial?.policies_in_place ?? [],
    certifications: props.initial?.certifications ?? [],
    material_topics: props.initial?.material_topics ?? [],
    maturity_level: props.initial?.maturity_level ?? "",
    has_double_materiality: toBool(props.initial?.has_double_materiality),
    has_sustainability_report: toBool(
      props.initial?.has_sustainability_report
    ),
    has_sustainability_strategy: toBool(
      props.initial?.has_sustainability_strategy
    ),
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
        sector: form.sector || null,
        subsector: form.subsector.trim() || null,
        countries: form.countries,
        size: form.size || null,
        business_segments: form.business_segments,
        frameworks: form.frameworks,
        applicable_regulations: form.applicable_regulations,
        policies_in_place: form.policies_in_place,
        certifications: form.certifications,
        material_topics: form.material_topics,
        maturity_level: form.maturity_level || null,
        has_double_materiality: form.has_double_materiality,
        has_sustainability_report: form.has_sustainability_report,
        has_sustainability_strategy: form.has_sustainability_strategy,
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
      {/* ═══ Nivel 1 — Identificación ═══════════════════════ */}
      <Section title="Identificación">
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

        <div className="grid grid-cols-2 gap-4">
          <MultiSelectCombobox
            category="sectors"
            label="Sector"
            mode="single"
            value={form.sector}
            onChange={(v) => update("sector", (v as string) ?? "")}
            hasGroups
            placeholder="Elige o busca un sector…"
          />
          <Field label="Subsector">
            <input
              value={form.subsector}
              onChange={(e) => update("subsector", e.target.value)}
              className={inputCls}
              placeholder="Ej: Cervezas, Retail deportivo, etc."
            />
          </Field>
        </div>

        <MultiSelectCombobox
          category="countries"
          label="Países donde opera"
          value={form.countries}
          onChange={(v) => update("countries", (v as string[]) ?? [])}
          hasGroups
          placeholder="México, Colombia, España…"
        />
      </Section>

      {/* ═══ Nivel 2 — Atributos estructurados ═══════════════ */}
      <Section title="Atributos ESG">
        <div className="grid grid-cols-2 gap-4">
          <MultiSelectCombobox
            category="business_segments"
            label="Segmentos de negocio"
            value={form.business_segments}
            onChange={(v) =>
              update("business_segments", (v as string[]) ?? [])
            }
          />
          <MultiSelectCombobox
            category="maturity_levels"
            label="Madurez ESG"
            mode="single"
            value={form.maturity_level}
            onChange={(v) => update("maturity_level", (v as string) ?? "")}
          />
        </div>

        <MultiSelectCombobox
          category="frameworks"
          label="Marcos ESG reportados"
          hint="Marcos que el cliente ya usa para reportar (GRI, ISSB, CSRD…)."
          value={form.frameworks}
          onChange={(v) => update("frameworks", (v as string[]) ?? [])}
          hasGroups
        />

        <MultiSelectCombobox
          category="applicable_regulations"
          label="Regulaciones aplicables"
          hint="Regulaciones ESG que le aplican por jurisdicción."
          value={form.applicable_regulations}
          onChange={(v) =>
            update("applicable_regulations", (v as string[]) ?? [])
          }
          hasGroups
        />

        <MultiSelectCombobox
          category="policies"
          label="Políticas formalizadas"
          value={form.policies_in_place}
          onChange={(v) => update("policies_in_place", (v as string[]) ?? [])}
        />

        <MultiSelectCombobox
          category="certifications"
          label="Certificaciones vigentes"
          value={form.certifications}
          onChange={(v) => update("certifications", (v as string[]) ?? [])}
          hasGroups
        />

        <MultiSelectCombobox
          category="material_topics"
          label="Temas materiales priorizados"
          hint="Si ya hay estudio de materialidad, marca los temas resultantes."
          value={form.material_topics}
          onChange={(v) => update("material_topics", (v as string[]) ?? [])}
          hasGroups
        />

        <div className="grid grid-cols-3 gap-4 pt-1">
          <BoolField
            label="Tiene estrategia de sostenibilidad"
            value={form.has_sustainability_strategy}
            onChange={(v) => update("has_sustainability_strategy", v)}
          />
          <BoolField
            label="Publica reporte de sostenibilidad"
            value={form.has_sustainability_report}
            onChange={(v) => update("has_sustainability_report", v)}
          />
          <BoolField
            label="Tiene estudio de doble materialidad"
            value={form.has_double_materiality}
            onChange={(v) => update("has_double_materiality", v)}
          />
        </div>
      </Section>

      {/* ═══ Nivel 3 — Narrativa (6 bloques delgados) ═══════ */}
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
            rows={5}
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
          {saving
            ? "Guardando..."
            : props.mode === "create"
            ? "Crear cliente"
            : "Guardar cambios"}
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

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
      <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">
        {title}
      </h2>
      {children}
    </div>
  );
}

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

function BoolField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean | null) => void;
}) {
  return (
    <div>
      <div className="block text-xs font-medium text-slate-700 mb-1">
        {label}
      </div>
      <div className="flex gap-1 bg-stone-100 rounded-lg p-0.5 text-xs">
        <button
          type="button"
          onClick={() => onChange(null)}
          className={`flex-1 py-1 rounded ${
            value === null ? "bg-white shadow-sm" : "text-slate-500"
          }`}
        >
          —
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`flex-1 py-1 rounded ${
            value === false ? "bg-white text-red-700 shadow-sm" : "text-slate-500"
          }`}
        >
          No
        </button>
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`flex-1 py-1 rounded ${
            value === true
              ? "bg-white text-green-800 shadow-sm"
              : "text-slate-500"
          }`}
        >
          Sí
        </button>
      </div>
    </div>
  );
}
