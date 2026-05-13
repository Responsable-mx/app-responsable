"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { RELATION_LABELS } from "@/lib/dm/fields";
import type { CompanyRelation } from "@/lib/dm/fields";

export type CompanyFormData = {
  name: string;
  relation: CompanyRelation;
  country: string | null;
  sector: string | null;
  website: string | null;
  justification: string | null;
};

type Props = {
  onAdd: (data: CompanyFormData) => Promise<void>;
  onCancel: () => void;
};

export function ManualAddCompanyForm({ onAdd, onCancel }: Props) {
  const [form, setForm] = useState({
    name: "",
    relation: "competitor_nacional" as CompanyRelation,
    country: "",
    sector: "",
    website: "",
    justification: "",
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setLoading(true);
    try {
      await onAdd({
        name: form.name.trim(),
        relation: form.relation,
        country: form.country.trim() || null,
        sector: form.sector.trim() || null,
        website: form.website.trim() || null,
        justification: form.justification.trim() || null,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="border border-brand-primary/30 rounded p-3 space-y-2.5 bg-slate-50/60"
    >
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
        Agregar empresa manualmente
      </p>
      {/* Nombre + Relación */}
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">
            Nombre <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Ej: Grupo Bimbo"
            maxLength={200}
            className="font-sans w-full text-sm border border-slate-200 rounded px-2.5 py-1.5 bg-white placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
          />
        </div>
        <div className="w-52 shrink-0">
          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">
            Tipo de relación <span className="text-rose-500">*</span>
          </label>
          <SelectField
            value={form.relation}
            onChange={(v) => setForm((f) => ({ ...f, relation: v as CompanyRelation }))}
            options={[
              { value: "competitor_nacional",      label: RELATION_LABELS.competitor_nacional },
              { value: "competitor_internacional", label: RELATION_LABELS.competitor_internacional },
              { value: "sector",                   label: RELATION_LABELS.sector },
              { value: "cadena_valor",             label: RELATION_LABELS.cadena_valor },
            ]}
          />
        </div>
      </div>
      {/* País + Sector */}
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">País</label>
          <input
            type="text"
            value={form.country}
            onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
            placeholder="Ej: México"
            maxLength={100}
            className="font-sans w-full text-sm border border-slate-200 rounded px-2.5 py-1.5 bg-white placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
          />
        </div>
        <div className="flex-1">
          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Sector</label>
          <input
            type="text"
            value={form.sector}
            onChange={(e) => setForm((f) => ({ ...f, sector: e.target.value }))}
            placeholder="Ej: Alimentos y bebidas"
            maxLength={200}
            className="font-sans w-full text-sm border border-slate-200 rounded px-2.5 py-1.5 bg-white placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
          />
        </div>
      </div>
      {/* Sitio web */}
      <div>
        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">
          Sitio web
        </label>
        <input
          type="url"
          value={form.website}
          onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
          placeholder="https://www.ejemplo.com"
          maxLength={300}
          className="font-sans w-full text-sm border border-slate-200 rounded px-2.5 py-1.5 bg-white placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
        />
      </div>
      {/* Justificación */}
      <div>
        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">
          Justificación
        </label>
        <textarea
          value={form.justification}
          onChange={(e) => setForm((f) => ({ ...f, justification: e.target.value }))}
          placeholder="¿Por qué incluir esta empresa en el benchmark? ¿Qué reporta en sostenibilidad?"
          maxLength={600}
          rows={2}
          className="font-sans w-full text-sm border border-slate-200 rounded px-2.5 py-1.5 bg-white placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 resize-none"
        />
        <p className="text-[10px] text-slate-300 text-right">{form.justification.length}/600</p>
      </div>
      {/* Acciones */}
      <div className="flex items-center gap-2 pt-0.5">
        <Button
          size="sm"
          variant="primary"
          loading={loading}
          disabled={!form.name.trim()}
        >
          Agregar empresa
        </Button>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-slate-500 hover:underline"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
