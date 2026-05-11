"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { mutate as globalMutate } from "swr";
import useSWR from "swr";
import { useToast } from "@/components/ui/Toast";
import type { Client, ClientEngagement } from "@/lib/clients";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { ClientAvatar } from "@/components/ClientAvatar";
import { MultiSelectCombobox } from "@/components/MultiSelectCombobox";
import { SelectField } from "@/components/ui/SelectField";
import { type NarrativeBlockKey } from "@/lib/clients/narrative-schemas";
import { normalizeUrl } from "@/lib/clients/url-utils";

type Props =
  | { mode: "create"; initial?: undefined; initialEngagements?: undefined }
  | { mode: "edit"; initial: Client; initialEngagements: ClientEngagement[] };

type EngagementRow = {
  _key: string;
  id?: string;
  service_key: string;
  year: string;
  alcance: string;
  status: "active" | "completed";
  _dirty: boolean;
  _deleted: boolean;
};

type BlockValue = Record<string, unknown>;

type FormState = {
  // Identificación
  name: string;
  website_url: string;
  sector: string;
  subsector: string;
  countries: string[];
  size: string;

  // Atributos estructurados
  business_segments: string[];
  frameworks: string[];
  applicable_regulations: string[];
  policies_in_place: string[];
  certifications: string[];
  material_topics: string[];
  maturity_level: string;
  has_double_materiality: boolean | null;
  has_sustainability_report: boolean | null;
  has_sustainability_strategy: boolean | null;

  // Relación con otras empresas
  related_companies: string;

  // Logo
  logo_url: string;

  // URLs de documentos
  // sustainability_report_url: pasivo — preserva dato existente; sin UI (usar Bloque 5 → Reportes publicados)
  sustainability_strategy_url: string;
  sustainability_report_url: string;
  financial_report_url: string;
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
    regulatory_context: (initial?.regulatory_context_json as BlockValue) ?? {},
    sustainability_strategy:
      (initial?.sustainability_strategy_json as BlockValue) ?? {},
    stakeholders: (initial?.stakeholders_json as BlockValue) ?? {},
  };
}

const catalogFetcher = (url: string) =>
  fetch(url).then((r) => r.json()).then((j) => (j.data ?? []) as { value: string; label: string }[]);

function engagementToRow(e: ClientEngagement): EngagementRow {
  return {
    _key: e.id,
    id: e.id,
    service_key: e.service_key,
    year: e.year ? String(e.year) : "",
    alcance: e.alcance ?? "",
    status: e.status,
    _dirty: false,
    _deleted: false,
  };
}

export function ClientForm(props: Props) {
  const router = useRouter();
  const { push } = useToast();
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [fillingProfile, setFillingProfile] = useState(false);

  const [engagements, setEngagements] = useState<EngagementRow[]>(
    () => (props.initialEngagements ?? []).map(engagementToRow)
  );

  const { data: serviceOptions = [] } = useSWR<{ value: string; label: string }[]>(
    "/api/catalogs?category=services",
    catalogFetcher,
    { revalidateOnFocus: false, dedupingInterval: 3_600_000 }
  );

  const [form, setForm] = useState<FormState>({
    name: props.initial?.name ?? "",
    website_url: props.initial?.website_url ?? "",
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
    has_sustainability_report: toBool(props.initial?.has_sustainability_report),
    has_sustainability_strategy: toBool(props.initial?.has_sustainability_strategy),
    related_companies: props.initial?.related_companies ?? "",
    logo_url: props.initial?.logo_url ?? "",
    sustainability_strategy_url: props.initial?.sustainability_strategy_url ?? "",
    sustainability_report_url: props.initial?.sustainability_report_url ?? "",
    financial_report_url: props.initial?.financial_report_url ?? "",
    double_materiality_url: props.initial?.double_materiality_url ?? "",
    blocks: initialBlocks(props.initial),
  });

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleFillProfile() {
    if (!form.website_url.trim()) {
      push("error", "Escribe el sitio web del cliente primero");
      return;
    }
    setFillingProfile(true);
    try {
      const url = form.website_url.trim().startsWith("http")
        ? form.website_url.trim()
        : `https://${form.website_url.trim()}`;
      const res = await fetch("/api/clients/extract-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (!res.ok) { push("error", json.error ?? "Error al analizar el sitio"); return; }
      const d = json.data;
      const filled: string[] = [];
      setForm((prev) => {
        const next = { ...prev };
        if (d.sector)    { next.sector = d.sector;       filled.push("Sector"); }
        if (d.subsector) { next.subsector = d.subsector; filled.push("Subsector"); }
        if (d.size)      { next.size = d.size;           filled.push("Tamaño"); }
        if (d.countries?.length) { next.countries = d.countries; filled.push("Países"); }
        if (d.logo_url)  { next.logo_url = d.logo_url;  filled.push("Logo"); }
        return next;
      });
      push("success", filled.length
        ? `Completados con IA: ${filled.join(", ")}`
        : "El sitio no aportó datos suficientes para completar campos");
    } catch {
      push("error", "Error de conexión");
    } finally {
      setFillingProfile(false);
    }
  }

  function addEngagement() {
    setEngagements((prev) => [
      ...prev,
      {
        _key: crypto.randomUUID(),
        service_key: "",
        year: String(new Date().getFullYear()),
        alcance: "",
        status: "active",
        _dirty: true,
        _deleted: false,
      },
    ]);
  }

  function updateEngagement(key: string, field: keyof Pick<EngagementRow, "service_key" | "year" | "alcance" | "status">, value: string) {
    setEngagements((prev) =>
      prev.map((r) => r._key === key ? { ...r, [field]: value, _dirty: true } : r)
    );
  }

  function removeEngagement(key: string) {
    setEngagements((prev) =>
      prev.map((r) => r._key === key ? { ...r, _deleted: true } : r)
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      // 1. PATCH/POST client (services synced by engagement API)
      const payload = {
        name: form.name.trim(),
        website_url: normalizeUrl(form.website_url.trim()) || null,
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
        logo_url: form.logo_url.trim() || null,
        sustainability_strategy_url: form.sustainability_strategy_url.trim() || null,
        sustainability_report_url: form.sustainability_report_url.trim() || null,
        financial_report_url: form.financial_report_url.trim() || null,
        double_materiality_url: form.double_materiality_url.trim() || null,
        related_companies: form.related_companies.trim() || null,
        info_general_json: form.blocks.info_general,
        business_model_json: form.blocks.business_model,
        impacts_json: form.blocks.impacts,
        regulatory_context_json: form.blocks.regulatory_context,
        sustainability_strategy_json: form.blocks.sustainability_strategy,
        stakeholders_json: form.blocks.stakeholders,
      };

      const clientUrl =
        props.mode === "create"
          ? "/api/clients"
          : `/api/clients/${props.initial.id}`;
      const method = props.mode === "create" ? "POST" : "PATCH";
      const res = await fetch(clientUrl, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        push("error", data.error ?? "Error al guardar");
        setSaving(false);
        return;
      }

      const clientId = props.mode === "edit" ? props.initial.id : data.data?.id;

      // 2. Mutaciones de engagements en paralelo
      if (clientId) {
        const mutations = engagements.map(async (row) => {
          const body = {
            service_key: row.service_key,
            year: row.year ? parseInt(row.year, 10) : null,
            alcance: row.alcance.trim() || null,
            status: row.status,
          };
          if (row._deleted && row.id) {
            await fetch(`/api/clients/${clientId}/engagements/${row.id}`, { method: "DELETE" });
          } else if (!row._deleted && !row.id && row.service_key) {
            await fetch(`/api/clients/${clientId}/engagements`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
          } else if (!row._deleted && row.id && row._dirty) {
            await fetch(`/api/clients/${clientId}/engagements/${row.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
          }
        });
        await Promise.all(mutations);
      }

      router.push("/clientes");
      router.refresh();
    } catch (err) {
      console.error(err);
      push("error", "Error de conexión");
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
      // Invalida cache SWR de la lista para que desaparezca sin reload manual
      await globalMutate((key: unknown) => typeof key === "string" && key.startsWith("/api/clients"), undefined, { revalidate: true });
      router.push("/clientes");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      push("error", data.error ?? "Error al eliminar");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pb-24">
      {/* ═══ Identificación ══════════════════════════════════ */}
      <Section
        title="Identificación"
        action={
          <button
            type="button"
            onClick={handleFillProfile}
            disabled={fillingProfile || !form.website_url.trim()}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded bg-brand-primary-light text-brand-primary-dark border border-brand-primary/20 hover:bg-brand-primary/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title={form.website_url.trim() ? "Completa los campos desde el sitio web" : "Escribe el sitio web primero"}
          >
            {fillingProfile ? (
              <>
                <svg className="w-3 h-3 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                </svg>
                Analizando…
              </>
            ) : (
              <>
                <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
                </svg>
                Completar con IA
              </>
            )}
          </button>
        }
      >
        {/* Fila 1: Nombre + Sitio web */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre *">
            <input
              required
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              className={inputCls}
              placeholder="Ej: Heineken México"
            />
          </Field>
          <Field label="Sitio web corporativo">
            <input
              type="text"
              value={form.website_url}
              onChange={(e) => update("website_url", e.target.value)}
              className={inputCls}
              placeholder="responsable.net"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Fuente primaria para la IA al llenar el cuestionario.
            </p>
          </Field>
        </div>

        {/* Fila 2: Sector + Subsector + Tamaño */}
        <div className="grid grid-cols-[1fr_1fr_148px] gap-3">
          <MultiSelectCombobox
            category="sectors"
            label="Sector"
            mode="single"
            value={form.sector}
            onChange={(v) => update("sector", (v as string) ?? "")}
            hasGroups
            placeholder="Sector…"
          />
          <Field label="Subsector">
            <input
              value={form.subsector}
              onChange={(e) => update("subsector", e.target.value)}
              className={inputCls}
              placeholder="Ej: Cervezas, Retail…"
            />
          </Field>
          <MultiSelectCombobox
            category="client_sizes"
            label="Tamaño"
            mode="single"
            value={form.size}
            onChange={(v) => update("size", (v as string) ?? "")}
            placeholder="Tamaño…"
          />
        </div>

        {/* Fila 3: Países */}
        <MultiSelectCombobox
          category="countries"
          label="Países donde opera"
          value={form.countries}
          onChange={(v) => update("countries", (v as string[]) ?? [])}
          hasGroups
          placeholder="México, Colombia, España…"
        />

        {/* Servicios contratados — engagement por fila */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Servicios contratados
              </label>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Define qué tabs y funciones IA se habilitan para este cliente.
              </p>
            </div>
            <button
              type="button"
              onClick={addEngagement}
              className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Agregar
            </button>
          </div>

          <div className="space-y-2">
            {engagements.filter((r) => !r._deleted).length === 0 && (
              <p className="text-xs text-slate-400 py-2">Sin servicios. Usa "Agregar" para añadir uno.</p>
            )}
            {engagements.filter((r) => !r._deleted).map((row) => (
              <div key={row._key} className="flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded">
                {/* Servicio */}
                <div className="flex-1 min-w-0">
                  <SelectField
                    value={row.service_key}
                    onChange={(v) => updateEngagement(row._key, "service_key", v)}
                    options={serviceOptions}
                    placeholder="Servicio…"
                  />
                </div>
                {/* Año */}
                <div className="w-[92px] shrink-0">
                  <input
                    type="number"
                    min={2010}
                    max={2035}
                    value={row.year}
                    onChange={(e) => updateEngagement(row._key, "year", e.target.value)}
                    className={inputCls + " text-center"}
                    placeholder="Año"
                  />
                </div>
                {/* Alcance */}
                <div className="flex-[2] min-w-0">
                  <input
                    type="text"
                    value={row.alcance}
                    onChange={(e) => updateEngagement(row._key, "alcance", e.target.value)}
                    className={inputCls}
                    placeholder="México — Bajío"
                  />
                </div>
                {/* Status */}
                <div className="w-[110px] shrink-0">
                  <SelectField
                    value={row.status}
                    onChange={(v) => updateEngagement(row._key, "status", v as "active" | "completed")}
                    options={[
                      { value: "active", label: "Activo" },
                      { value: "completed", label: "Completado" },
                    ]}
                  />
                </div>
                {/* Eliminar */}
                <button
                  type="button"
                  onClick={() => removeEngagement(row._key)}
                  className="shrink-0 p-1.5 text-slate-400 hover:text-rose-600 rounded transition-colors"
                  title="Eliminar engagement"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Logo — al final: dato cosmético */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            URL del logo
          </label>
          <div className="flex items-center gap-3">
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
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
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

      {/* ═══ Relaciones organizacionales ═════════════════════ */}
      <Section title="Relaciones organizacionales">
        <Field label="Relación con otras empresas del sistema">
          <input
            value={form.related_companies}
            onChange={(e) => update("related_companies", e.target.value)}
            className={inputCls}
            placeholder="Ej: Filial de Grupo X · Empresa independiente"
          />
          <p className="text-[10px] text-slate-400 mt-1">
            Madre / hija / hermana con otros clientes en ResponSable — si aplica.
          </p>
        </Field>
      </Section>

      {/* ═══ Footer sticky ══════════════════════════════════ */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-white/95 backdrop-blur-sm border-t border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center gap-3">
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
          <button
            type="button"
            onClick={() => router.back()}
            className="px-3 py-2.5 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded transition-colors"
          >
            Descartar
          </button>
          {props.mode === "edit" && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="ml-auto px-3 py-2 text-sm text-rose-700 hover:bg-rose-50 rounded transition-colors"
            >
              Eliminar
            </button>
          )}
        </div>
      </div>

      {props.mode === "edit" && (
        <ConfirmModal
          open={confirmDelete}
          title={`Eliminar ${props.initial.name}`}
          description="Esta acción no se puede deshacer. El cliente y su contexto quedarán borrados para todo el equipo."
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
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">
          {title}
        </h2>
        {action}
      </div>
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

