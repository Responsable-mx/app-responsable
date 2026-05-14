"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import type { ClientService } from "@/lib/client-services";

type Props = {
  service: ClientService;
  baseCost?: number | null;
  onSaved?: (updated: ClientService) => void;
};

function fmtUSD(n: number | null | undefined) {
  if (n == null) return null;
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function margin(actual: number | null, sale: number | null): string | null {
  if (actual == null || sale == null || actual === 0) return null;
  const pct = ((sale - actual) / actual) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`;
}

export function ProjectCostCard({ service, baseCost, onSaved }: Props) {
  const { push } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    is_pilot: service.is_pilot,
    actual_cost: service.actual_cost !== null ? String(service.actual_cost) : "",
    sale_price: service.sale_price !== null ? String(service.sale_price) : "",
    cost_notes: service.cost_notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [current, setCurrent] = useState<ClientService>(service);

  function startEdit() {
    setDraft({
      is_pilot: current.is_pilot,
      actual_cost: current.actual_cost !== null ? String(current.actual_cost) : "",
      sale_price: current.sale_price !== null ? String(current.sale_price) : "",
      cost_notes: current.cost_notes ?? "",
    });
    setEditing(true);
  }

  async function save() {
    const parseOptNum = (v: string) => (v.trim() === "" ? null : Number(v));
    const actualCost = parseOptNum(draft.actual_cost);
    const salePrice = parseOptNum(draft.sale_price);
    if (draft.actual_cost.trim() !== "" && (isNaN(actualCost!) || actualCost! < 0)) {
      push("error", "Costo real debe ser un número positivo");
      return;
    }
    if (draft.sale_price.trim() !== "" && (isNaN(salePrice!) || salePrice! < 0)) {
      push("error", "Precio de venta debe ser un número positivo");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/client-services/${current.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          is_pilot: draft.is_pilot,
          actual_cost: actualCost,
          sale_price: salePrice,
          cost_notes: draft.cost_notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        push("error", j.error ?? "Error al guardar");
        return;
      }
      const j = await res.json();
      const updated = j.data as ClientService;
      setCurrent(updated);
      setEditing(false);
      onSaved?.(updated);
      push("success", "Costos guardados");
    } finally {
      setSaving(false);
    }
  }

  const marginStr = margin(current.actual_cost, current.sale_price);
  const deviation =
    baseCost && current.actual_cost
      ? ((current.actual_cost - baseCost) / baseCost) * 100
      : null;

  return (
    <div className="border border-slate-200 rounded bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Costos del proyecto
          </p>
          {current.is_pilot && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
              Piloto
            </span>
          )}
        </div>
        {!editing && (
          <Button size="sm" variant="ghost" onClick={startEdit}>
            Editar
          </Button>
        )}
      </div>

      {editing ? (
        <div className="px-4 py-3 space-y-3">
          {/* Piloto toggle */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={draft.is_pilot}
              onChange={(e) => setDraft((d) => ({ ...d, is_pilot: e.target.checked }))}
              className="w-4 h-4 rounded border-slate-300 accent-brand-primary"
            />
            <span className="text-sm text-slate-700">
              Proyecto piloto
              <span className="ml-1.5 text-xs text-slate-400">
                (precio de aprendizaje, no refleja costo maduro)
              </span>
            </span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                Costo real (USD)
              </label>
              <Input
                type="number"
                min={0}
                step={1}
                value={draft.actual_cost}
                onChange={(e) => setDraft((d) => ({ ...d, actual_cost: e.target.value }))}
                placeholder="0.00"
                aria-label="Costo real USD"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                Precio de venta (USD)
              </label>
              <Input
                type="number"
                min={0}
                step={1}
                value={draft.sale_price}
                onChange={(e) => setDraft((d) => ({ ...d, sale_price: e.target.value }))}
                placeholder="0.00"
                aria-label="Precio de venta USD"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
              Notas
            </label>
            <textarea
              className="font-sans w-full text-sm border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 resize-none"
              rows={2}
              maxLength={500}
              value={draft.cost_notes}
              onChange={(e) => setDraft((d) => ({ ...d, cost_notes: e.target.value }))}
              placeholder="Ej: Incluye bugs iniciales, tiempo de onboarding del equipo…"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button size="sm" loading={saving} onClick={save}>
              Guardar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="px-4 py-3">
          {current.actual_cost === null && current.sale_price === null ? (
            <p className="text-xs text-slate-400 italic">Sin datos de costo registrados.</p>
          ) : (
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">
                  Costo real
                </p>
                <p className="tabular-nums text-slate-800 font-medium">
                  {fmtUSD(current.actual_cost) ?? <span className="text-slate-400 italic text-xs">—</span>}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">
                  Precio de venta
                </p>
                <p className="tabular-nums text-slate-800 font-medium">
                  {fmtUSD(current.sale_price) ?? <span className="text-slate-400 italic text-xs">—</span>}
                  {marginStr && (
                    <span
                      className={`ml-2 text-xs font-bold ${
                        parseFloat(marginStr) >= 0 ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {marginStr} margen
                    </span>
                  )}
                </p>
              </div>

              {baseCost != null && current.actual_cost != null && (
                <div className="col-span-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">
                    vs. costo base del servicio
                  </p>
                  <p className="text-xs text-slate-600">
                    <span className="tabular-nums font-medium">{fmtUSD(baseCost)}</span>
                    {deviation !== null && (
                      <span
                        className={`ml-2 font-bold ${
                          deviation <= 0 ? "text-emerald-600" : "text-amber-600"
                        }`}
                      >
                        {deviation >= 0 ? "+" : ""}
                        {deviation.toFixed(0)}% vs. referencia
                      </span>
                    )}
                  </p>
                </div>
              )}

              {current.cost_notes && (
                <div className="col-span-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">
                    Notas
                  </p>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {current.cost_notes}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
