"use client";

import { useState } from "react";
import type { BenchmarkEmpresa, BenchmarkEmpresaCriterio } from "@/lib/dm/benchmark-empresas-types";
import { CRITERIO_ORDER, CRITERIO_LABELS } from "@/lib/dm/benchmark-empresas-types";
import { SelectField } from "@/components/ui/SelectField";

const METODOLOGIAS = ["GRI", "SASB", "TCFD", "CSRD", "IPIECA", "GBGC", "OTRO"];

type Props = {
  onAdd: (data: Omit<BenchmarkEmpresa, "id" | "justificacion">) => Promise<void>;
  onCancel: () => void;
};

export function ManualAddEmpresaForm({ onAdd, onCancel }: Props) {
  const [nombre, setNombre]       = useState("");
  const [pais, setPais]           = useState("");
  const [url, setUrl]             = useState("");
  const [methods, setMethods]     = useState<string[]>(["GRI"]);
  const [criterio, setCriterio]   = useState<BenchmarkEmpresaCriterio>("competidores_directos");
  const [subsector, setSubsector] = useState("");
  const [saving, setSaving]       = useState(false);

  const valid = nombre.trim().length > 0 && pais.trim().length > 0 && methods.length > 0;

  const toggleMethod = (m: string) =>
    setMethods((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    try {
      await onAdd({
        nombre: nombre.trim(),
        pais: pais.trim(),
        reporte_url: url.trim() || null,
        metodologia: methods,
        criterio,
        subsector: subsector.trim() || null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border border-slate-200 rounded bg-slate-50/60 px-4 py-4 mb-4 space-y-3">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Agregar empresa manualmente</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Nombre *</label>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Empresa S.A."
            className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">País *</label>
          <input
            value={pais}
            onChange={(e) => setPais(e.target.value)}
            placeholder="México"
            className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">URL informe (opcional)</label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            type="url"
            className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Subsector (opcional)</label>
          <input
            value={subsector}
            onChange={(e) => setSubsector(e.target.value)}
            placeholder="Refinación / Downstream"
            className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
          />
        </div>
      </div>
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Criterio</label>
        <SelectField
          value={criterio}
          onChange={(v) => setCriterio(v as BenchmarkEmpresaCriterio)}
          options={CRITERIO_ORDER.map((c) => ({ value: c, label: CRITERIO_LABELS[c] }))}
        />
      </div>
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Metodología(s) *</label>
        <div className="flex flex-wrap gap-1.5">
          {METODOLOGIAS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => toggleMethod(m)}
              className={`px-2 py-0.5 rounded-sm text-[10px] font-bold border transition-colors ${
                methods.includes(m)
                  ? "bg-teal-600 text-white border-teal-600"
                  : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={!valid || saving}
          className="px-3 py-1.5 bg-brand-primary text-white text-xs font-semibold rounded hover:bg-brand-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "Agregando…" : "Agregar empresa"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 border border-slate-200 text-slate-500 text-xs font-medium rounded hover:bg-slate-50 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
