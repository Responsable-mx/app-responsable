"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

const SERVICIOS = [
  "Estudio de Doble Materialidad",
  "Materialidad simple",
  "Reporte GRI",
  "Diagnóstico RSE",
  "Carbono y huella climática",
  "Estrategia de sustentabilidad",
];

type FormState = {
  nombre: string;
  servicio: string;
  alcance: string;
  pagina_web: string;
  propuesta_url: string;
  relacion: string;
};

export function NuevoClienteWizard() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<FormState>({
    nombre: "",
    servicio: SERVICIOS[0],
    alcance: "",
    pagina_web: "",
    propuesta_url: "",
    relacion: "",
  });

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
          // paso 1 del wizard llenado por el consultor
          wizardStep1: {
            nombre_empresa: form.nombre,
            servicio_contratado: form.servicio,
            alcance_geografico: form.alcance,
            pagina_web: form.pagina_web || null,
            propuesta_comercial_url: form.propuesta_url || null,
            relacion_empresas: form.relacion || null,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const newId = json.data?.id;
      if (!newId) throw new Error("Sin ID en respuesta");
      toast.push("success", "Cliente creado · paso 1 guardado");
      router.push(`/clientes/${newId}?tab=cuestionario&step=2`);
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
            <p className="font-bold text-slate-900 mb-1">Captura mínima del paso 1 — la IA hace el resto</p>
            <p>
              Este paso (5 campos) lo llena el asesor. Los pasos 2-9 (~80 campos) se llenarán
              automáticamente con datos públicos verificables y citados, siguiendo las reglas operativas
              del cuestionario. Tú validas, ajustas y completas lo no público.
            </p>
          </div>
        </div>
      </div>

      <Section title="Información base" subtitle="Captura del asesor — 5 campos" stepLabel="1 / 9">
        <Field label="Nombre de la empresa" required>
          <input
            type="text"
            value={form.nombre}
            onChange={(e) => set("nombre", e.target.value)}
            placeholder="Razón social completa"
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
          />
        </Field>

        <Field label="Servicio contratado" required>
          <select
            value={form.servicio}
            onChange={(e) => set("servicio", e.target.value)}
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
          >
            {SERVICIOS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>

        <Field label="Alcance geográfico del proyecto" required helper="País o región del estudio. Ej: México — Bajío y Centro-Norte">
          <input
            type="text"
            value={form.alcance}
            onChange={(e) => set("alcance", e.target.value)}
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
          />
        </Field>

        <Field label="Página web corporativa" helper="URL del sitio oficial — la IA usará este dominio como fuente primaria para llenar pasos 2-9">
          <input
            type="url"
            value={form.pagina_web}
            onChange={(e) => set("pagina_web", e.target.value)}
            placeholder="https://empresa.com.mx"
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
          />
        </Field>

        <Field label="Propuesta comercial" helper="URL Google Drive / OneDrive — para validar alcance">
          <input
            type="url"
            value={form.propuesta_url}
            onChange={(e) => set("propuesta_url", e.target.value)}
            placeholder="https://drive.google.com/file/..."
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
          />
        </Field>

        <Field label="Relación con otras empresas del sistema" helper="Madre / hija / hermana — si aplica">
          <input
            type="text"
            value={form.relacion}
            onChange={(e) => set("relacion", e.target.value)}
            placeholder="Empresa independiente o relación"
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
          />
        </Field>
      </Section>

      <div className="flex items-center justify-between pt-4 border-t border-slate-200">
        <p className="text-[11px] text-slate-500">
          Después de crear, te llevo al cuestionario en paso 2 con sugerencia de IA.
        </p>
        <Button type="submit" variant="primary" loading={busy} disabled={!valid}>
          Crear cliente y continuar al wizard →
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
          ● solo asesor
        </span>
      </div>
      <div className="p-4 space-y-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  required,
  helper,
  children,
}: {
  label: string;
  required?: boolean;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-700 mb-1">
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
      </label>
      {children}
      {helper && <p className="text-[11px] text-slate-500 italic mt-1">{helper}</p>}
    </div>
  );
}
