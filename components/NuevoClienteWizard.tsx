"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SelectField } from "@/components/ui/SelectField";
import { useToast } from "@/components/ui/Toast";

const catalogFetcher = (url: string) =>
  fetch(url)
    .then((r) => r.json())
    .then((j) => (j.data ?? []) as { value: string; label: string }[]);

function normalizeUrl(url: string): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

type FormState = {
  nombre: string;
  servicio: string;
  alcance: string;
  website_url: string;
};

export function NuevoClienteWizard() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<FormState>({
    nombre: "",
    servicio: "",
    alcance: "",
    website_url: "",
  });
  const [touched, setTouched] = useState<Partial<Record<keyof FormState, boolean>>>({});

  function touch(key: keyof FormState) {
    setTouched((t) => ({ ...t, [key]: true }));
  }

  const nombreError = touched.nombre && form.nombre.trim().length < 3 ? "Mínimo 3 caracteres" : undefined;
  const servicioError = touched.servicio && !form.servicio ? "Selecciona un servicio" : undefined;
  const alcanceError = touched.alcance && !form.alcance.trim() ? "Campo requerido" : undefined;

  const { data: servicios = [], isLoading: loadingServicios } = useSWR<{ value: string; label: string }[]>(
    "/api/catalogs?category=services",
    catalogFetcher,
    { revalidateOnFocus: false, dedupingInterval: 3_600_000 }
  );

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const valid = form.nombre.trim().length > 2 && form.servicio && form.alcance.trim().length > 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.nombre,
          services: [form.servicio],
          countries: [],
          website_url: normalizeUrl(form.website_url),
          // paso 1 del wizard llenado por el consultor
          wizardStep1: {
            nombre_empresa: form.nombre,
            servicio_contratado: form.servicio,
            alcance_geografico: form.alcance,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const newId = json.data?.id;
      if (!newId) throw new Error("Sin ID en respuesta");

      // Crear primer engagement con el servicio + alcance del wizard
      await fetch(`/api/clients/${newId}/engagements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_key: form.servicio,
          year: new Date().getFullYear(),
          alcance: form.alcance.trim() || null,
          status: "active",
        }),
      });

      toast.push("success", "Cliente creado · iniciando IA");
      router.push(`/clientes/${newId}?tab=cuestionario&step=2&autoFill=1`);
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Error al crear");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* Banner regla operativa */}
      <div className="border border-brand-primary/30 bg-brand-primary-light/40 rounded p-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded bg-brand-primary text-white flex items-center justify-center shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div className="text-xs text-slate-700 leading-relaxed">
            <p className="font-bold text-slate-900 mb-1">Captura mínima del paso 1</p>
            <p>
              Este paso (3 campos) lo llena el asesor. Los pasos 2-9 (~80 campos) se llenarán
              automáticamente con datos públicos verificables y citados, siguiendo las reglas operativas
              del cuestionario. Tú validas, ajustas y completas lo no público.
            </p>
          </div>
        </div>
      </div>

      <Section title="Información base" subtitle="Captura del asesor — 3 campos" stepLabel="Paso 1 · Datos del asesor">
        <Input
          label="Nombre de la empresa *"
          value={form.nombre}
          onChange={(e) => set("nombre", e.target.value)}
          onBlur={() => touch("nombre")}
          placeholder="Razón social completa"
          error={nombreError}
        />

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Servicio contratado <span className="text-rose-500">*</span>
          </label>
          <SelectField
            value={form.servicio}
            onChange={(v) => { set("servicio", v); touch("servicio"); }}
            options={servicios.map((s) => ({ value: s.value, label: s.label }))}
            placeholder={loadingServicios ? "Cargando servicios…" : "Seleccionar servicio"}
          />
          {servicioError && (
            <p className="mt-1 text-xs text-rose-600">{servicioError}</p>
          )}
        </div>

        <Input
          label="Alcance geográfico del proyecto *"
          value={form.alcance}
          onChange={(e) => set("alcance", e.target.value)}
          onBlur={() => touch("alcance")}
          helper="País o región del estudio. Ej: México — Bajío y Centro-Norte"
          error={alcanceError}
        />

        <Input
          label="Sitio web corporativo"
          value={form.website_url}
          onChange={(e) => set("website_url", e.target.value)}
          placeholder="responsable.net"
          helper="Dominio que usará la IA como fuente primaria para los pasos 2-9"
        />

      </Section>

      <div className="flex items-center justify-between pt-4 border-t border-slate-200">
        <p className="text-[11px] text-slate-500">
          Después de crear, te llevo al cuestionario en paso 2 con sugerencia de IA.
        </p>
        <Button type="submit" variant="primary" loading={busy} disabled={!valid}>
          Crear cliente y continuar al cuestionario
        </Button>
      </div>
    </form>
  );
}

function Section({
  title,
  subtitle,
  stepLabel,
  children,
}: {
  title: string;
  subtitle: string;
  stepLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-slate-200 rounded bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{stepLabel}</p>
          <h3 className="text-sm font-bold text-slate-900 mt-0.5">{title}</h3>
          <p className="text-xs text-slate-600 mt-0.5">{subtitle}</p>
        </div>
        <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wide bg-slate-100 text-slate-600 rounded-sm px-1.5 py-0.5">
          Solo asesor
        </span>
      </div>
      <div className="p-4 space-y-4">{children}</div>
    </div>
  );
}

