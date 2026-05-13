"use client";

import { useState } from "react";
import useSWR from "swr";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";

export type DmHorizons = {
  corto_year:   number;
  mediano_year: number;
  largo_year:   number;
};

export const DM_HORIZON_DEFAULTS: DmHorizons = { corto_year: 2027, mediano_year: 2030, largo_year: 2040 };

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

export function HorizontesConfig({
  clientId,
}: {
  clientId: string;
}) {
  const { push } = useToast();
  const { data, mutate } = useSWR<{ data: DmHorizons }>(
    `/api/clients/${clientId}/dm-config`,
    fetcher,
    { revalidateOnFocus: false }
  );

  const horizons = data?.data ?? DM_HORIZON_DEFAULTS;
  const [draft, setDraft] = useState<DmHorizons | null>(null);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false); // colapsado por default

  const current = draft ?? horizons;
  const isDirty = draft !== null && (
    draft.corto_year !== horizons.corto_year ||
    draft.mediano_year !== horizons.mediano_year ||
    draft.largo_year !== horizons.largo_year
  );

  const handleSave = async () => {
    if (!draft) return;
    if (draft.corto_year >= draft.mediano_year || draft.mediano_year >= draft.largo_year) {
      push("error", "Corto plazo < Mediano plazo < Largo plazo — verifica los años");
      return;
    }
    if (draft.corto_year < 2025 || draft.largo_year > 2100) {
      push("error", "Los años deben estar entre 2025 y 2100");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/dm-config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al guardar");
      push("success", "Horizontes actualizados.");
      setDraft(null);
      setOpen(false);
      mutate();
    } catch (e) {
      push("error", e instanceof Error ? e.message : "Error al guardar horizontes");
    } finally {
      setSaving(false);
    }
  };

  const HORIZON_LABELS = ["Corto plazo", "Mediano plazo", "Largo plazo"] as const;
  const HORIZON_KEYS:   Array<keyof DmHorizons> = ["corto_year", "mediano_year", "largo_year"];

  // Vista colapsada: línea compacta con valores actuales
  if (!open) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Horizontes temporales del estudio
        </span>
        <span className="text-xs text-slate-500 tabular-nums">
          Corto ≤{horizons.corto_year} · Mediano {horizons.mediano_year} · Largo {horizons.largo_year}
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-[10px] text-brand-primary hover:underline font-medium"
        >
          Editar
        </button>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
        Horizontes temporales del estudio
      </p>
      <div className="flex items-end gap-3 flex-wrap">
        {HORIZON_KEYS.map((key, i) => (
          <div key={key} className="flex flex-col gap-0.5">
            <label className="text-[10px] text-slate-500 uppercase tracking-wider">
              {HORIZON_LABELS[i]}
            </label>
            <input
              type="number"
              min={2024}
              max={2060}
              value={current[key]}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val)) setDraft((d) => ({ ...(d ?? horizons), [key]: val }));
              }}
              className="font-sans w-20 text-sm border border-slate-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-brand-primary/30 tabular-nums"
            />
          </div>
        ))}
        {isDirty && (
          <Button size="sm" variant="primary" loading={saving} onClick={() => void handleSave()}>
            Guardar
          </Button>
        )}
        <button
          type="button"
          className="text-xs text-slate-400 hover:underline self-end pb-1"
          onClick={() => { setDraft(null); setOpen(false); }}
        >
          {isDirty ? "Cancelar" : "Cerrar"}
        </button>
      </div>
      <p className="text-[10px] text-slate-400 mt-1.5">
        Usados por la IA para clasificar horizontes de cada IRO · Defaults: ≤{DM_HORIZON_DEFAULTS.corto_year} / {DM_HORIZON_DEFAULTS.mediano_year} / {DM_HORIZON_DEFAULTS.largo_year}
      </p>
    </div>
  );
}
