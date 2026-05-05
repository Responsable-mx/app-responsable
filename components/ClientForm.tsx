"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Client } from "@/lib/clients";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { ClientAvatar } from "@/components/ClientAvatar";
import { MultiSelectCombobox } from "@/components/MultiSelectCombobox";
import { StructuredBlockEditor } from "@/components/StructuredBlockEditor";
import { BoolTriField } from "@/components/fields/BoolTriField";
import { ExtractSectorModal } from "@/components/extract/ExtractSectorModal";
import {
  NARRATIVE_SCHEMAS,
  type NarrativeBlockKey,
} from "@/lib/clients/narrative-schemas";

type Props =
  | { mode: "create"; initial?: undefined }
  | { mode: "edit"; initial: Client };

type BlockValue = Record<string, unknown>;

type FormState = {
  // Identificación
  name: string;
  sector: string;
  subsector: string;
  countries: string[];
  size: string;

  // Atributos estructurados
  business_segments: string[];
  services: string[];
  frameworks: string[];
  applicable_regulations: string[];
  policies_in_place: string[];
  certifications: string[];
  material_topics: string[];
  maturity_level: string;
  has_double_materiality: boolean | null;
  has_sustainability_report: boolean | null;
  has_sustainability_strategy: boolean | null;

  // Logo
  logo_url: string;

  // URLs de documentos
  sustainability_strategy_url: string;
  sustainability_report_url: string;
  double_materiality_url: string;

  // Narrativa JSONB (6 bloques)
  blocks: Record<NarrativeBlockKey, BlockValue>;
};

function toBool(v: boolean | null | undefined): boolean | null {
  return v === undefined ? null : v;
}

function initialBlocks(
  initial?: Client
): Record<NarrativeBlockKey, BlockValue> {
  return {
    info_general: (initial?.info_general_json as BlockValue) ?? {},
    business_model: (initial?.business_model_json as BlockValue) ?? {},
    impacts: (initial?.impacts_json as BlockValue) ?? {},
    regulatory_context:
      (initial?.regulatory_context_json as BlockValue) ?? {},
    sustainability_strategy:
      (initial?.sustainability_strategy_json as BlockValue) ?? {},
    stakeholders: (initial?.stakeholders_json as BlockValue) ?? {},
  };
}

export function ClientForm(props: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sectorAiOpen, setSectorAiOpen] = useState(false);

  const [form, setForm] = useState<FormState>({
    name: props.initial?.name ?? "",
    sector: props.initial?.sector ?? "",
    subsector: props.initial?.subsector ?? "",
    countries: props.initial?.countries ?? [],
    size: props.initial?.size ?? "",
    business_segments: props.initial?.business_segments ?? [],
    services: props.initial?.services ?? [],
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
    logo_url: props.initial?.logo_url ?? "",
    sustainability_strategy_url:
      props.initial?.sustainability_strategy_url ?? "",
    sustainability_report_url:
      props.initial?.sustainability_report_url ?? "",
    double_materiality_url: props.initial?.double_materiality_url ?? "",
    blocks: initialBlocks(props.initial),
  });

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateBlock(block: NarrativeBlockKey, next: BlockValue) {
    setForm((prev) => ({
      ...prev,
      blocks: { ...prev.blocks, [block]: next },
    }));
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
        services: form.services,
        frameworks: form.frameworks,
        applicable_regulations: form.applicable_regulations,
        policies_in_place: form.policies_in_place,
        certifications: form.certifications,
        material_topics: form.material_topics,
        maturity_level: form.maturity_level || null,
        has_double_materiality: form.has_double_materiality,
        has_sustainability_report: form.has_sustainability_report,
        has_sustainability_strategy: form.has_sustainability_strategy,
        logo_url: form.logo_url.trim() || null,
        sustainability_strategy_url:
          form.sustainability_strategy_url.trim() || null,
        sustainability_report_url:
          form.sustainability_report_url.trim() || null,
        double_materiality_url: form.double_materiality_url.trim() || null,
        info_general_json: form.blocks.info_general,
        business_model_json: form.blocks.business_model,
        impacts_json: form.blocks.impacts,
        regulatory_context_json: form.blocks.regulatory_context,
        sustainability_strategy_json: form.blocks.sustainability_strategy,
        stakeholders_json: form.blocks.stakeholders,
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
      {/* ═══ Identificación ══════════════════════════════════ */}
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
          <MultiSelectCombobox
            category="client_sizes"
            label="Tamaño"
            mode="single"
            value={form.size}
            onChange={(v) => update("size", (v as string) ?? "")}
            placeholder="Elige tamaño…"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="flex items-end justify-between gap-2 mb-1">
              <label className="block text-xs font-medium text-slate-700">
                Sector
              </label>
              <button
                type="button"
                onClick={() => setSectorAiOpen(true)}
                className="text-[10px] px-2 py-0.5 rounded-full bg-brand-primary-light text-brand-primary-dark border border-brand-primary-light hover:bg-brand-primary-light"
                title="POC: rellenar con IA desde URL o transcripción"
              >
                🤖 Rellenar con IA
              </button>
            </div>
            <MultiSelectCombobox
              category="sectors"
              label=""
              mode="single"
              value={form.sector}
              onChange={(v) => update("sector", (v as string) ?? "")}
              hasGroups
              placeholder="Elige o busca un sector…"
            />
          </div>
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

        {/* Logo URL */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            URL del logo
          </label>
          <div className="flex items-center gap-3">
            {/* Preview avatar */}
            <ClientAvatar
              name={form.name || "?"}
              logoUrl={form.logo_url.trim() || null}
              size="sm"
            />
            <div className="flex-1 relative">
              <input
                type="url"
                value={form.logo_url}
                onChange={(e) => update("logo_url", e.target.value)}
                className={inputCls + " pr-8"}
                placeholder="https://example.com/logo.png"
              />
              {form.logo_url && (
                <button
                  type="button"
                  onClick={() => update("logo_url", "")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  title="Limpiar logo"
                  aria-label="Limpiar logo"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">
            URL pública de la imagen (PNG, SVG, JPG). Si no se carga, se muestra el monograma.
          </p>
        </div>
      </Section>

      {/* ═══ Atributos estructurados ═════════════════════════ */}
      <Section title="Atributos de sostenibilidad">
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
            label="Madurez en sostenibilidad"
            mode="single"
            value={form.maturity_level}
            onChange={(v) => update("maturity_level", (v as string) ?? "")}
          />
        </div>

        <MultiSelectCombobox
          category="frameworks"
          label="Marcos de sostenibilidad reportados"
          hint="Marcos que el cliente ya usa para reportar (GRI, ISSB, CSRD…)."
          value={form.frameworks}
          onChange={(v) => update("frameworks", (v as string[]) ?? [])}
          hasGroups
        />

        <MultiSelectCombobox
          category="applicable_regulations"
          label="Regulaciones aplicables"
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
          onChange={(v) =>
            update("policies_in_place", (v as string[]) ?? [])
          }
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
          <BoolFieldInline
            label="Tiene estrategia de sostenibilidad"
            value={form.has_sustainability_strategy}
            onChange={(v) => update("has_sustainability_strategy", v)}
            urlLabel="URL de la estrategia"
            urlValue={form.sustainability_strategy_url}
            onUrlChange={(v) => update("sustainability_strategy_url", v)}
          />
          <BoolFieldInline
            label="Publica reporte de sostenibilidad"
            value={form.has_sustainability_report}
            onChange={(v) => update("has_sustainability_report", v)}
            urlLabel="URL del último reporte"
            urlValue={form.sustainability_report_url}
            onUrlChange={(v) => update("sustainability_report_url", v)}
          />
          <BoolFieldInline
            label="Tiene estudio de doble materialidad"
            value={form.has_double_materiality}
            onChange={(v) => update("has_double_materiality", v)}
            urlLabel="URL del estudio"
            urlValue={form.double_materiality_url}
            onUrlChange={(v) => update("double_materiality_url", v)}
          />
        </div>
      </Section>

      {/* ═══ Narrativa (6 bloques con sub-campos) ═══════════ */}
      <div className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">
            Narrativa detallada
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            6 bloques con preguntas específicas. Cada respuesta se guarda
            por separado para que los roles IA la usen directamente.
          </p>
        </div>
        {NARRATIVE_SCHEMAS.map((schema) => (
          <StructuredBlockEditor
            key={schema.block}
            schema={schema}
            value={form.blocks[schema.block]}
            onChange={(v) => updateBlock(schema.block, v)}
          />
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded p-3">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          type="submit"
          disabled={saving || !form.name.trim()}
          className="px-5 py-2.5 bg-brand-primary-hover text-white rounded text-sm font-medium hover:bg-brand-primary-dark disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
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
            className="px-3 py-2 text-sm text-red-700 hover:bg-red-50 rounded"
          >
            Eliminar
          </button>
        )}
      </div>

      <ExtractSectorModal
        open={sectorAiOpen}
        onClose={() => setSectorAiOpen(false)}
        onApply={(v) => update("sector", v)}
      />

      {props.mode === "edit" && (
        <ConfirmModal
          open={confirmDelete}
          title={`Eliminar ${props.initial.name}`}
          description={
            "Esta acción no se puede deshacer. El cliente y su contexto quedarán borrados para todo el equipo."
          }
          confirmLabel="Eliminar"
          cancelLabel="Cancelar"
          tone="destructive"
          onConfirm={performDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </form>
  );
}

const inputCls =
  "w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-transparent";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded p-6 space-y-4">
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

function BoolFieldInline({
  label,
  value,
  onChange,
  urlLabel,
  urlValue,
  onUrlChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean | null) => void;
  urlLabel?: string;
  urlValue?: string;
  onUrlChange?: (v: string) => void;
}) {
  return (
    <div>
      <div className="block text-xs font-medium text-slate-700 mb-1">
        {label}
      </div>
      <BoolTriField value={value} onChange={onChange} />
      {value === true && urlLabel && onUrlChange && (
        <div className="mt-2">
          <label className="block text-[10px] font-medium text-slate-600 mb-0.5">
            {urlLabel}
          </label>
          <input
            type="url"
            value={urlValue ?? ""}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder="https:// …  o liga al PDF"
            className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-brand-primary"
          />
        </div>
      )}
    </div>
  );
}
