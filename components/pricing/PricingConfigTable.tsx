"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";

type Row = {
  service_key: string;
  label: string;
  base_cost: number | null;
  notes: string | null;
  updated_at: string | null;
  updated_by: string | null;
};

function fmtMXN(n: number | null) {
  if (n === null) return "—";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function PricingConfigTable({ rows }: { rows: Row[] }) {
  const { push } = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ base_cost: string; notes: string }>({
    base_cost: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [localRows, setLocalRows] = useState<Row[]>(rows);

  function startEdit(row: Row) {
    setEditing(row.service_key);
    setDraft({
      base_cost: row.base_cost !== null ? String(row.base_cost) : "",
      notes: row.notes ?? "",
    });
  }

  function cancelEdit() {
    setEditing(null);
  }

  async function saveEdit(serviceKey: string) {
    const costVal = draft.base_cost.trim() === "" ? null : Number(draft.base_cost);
    if (draft.base_cost.trim() !== "" && (isNaN(costVal!) || costVal! < 0)) {
      push("error", "Costo debe ser un número positivo");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/service-pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_key: serviceKey,
          base_cost: costVal,
          notes: draft.notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        push("error", j.error ?? "Error al guardar");
        return;
      }
      const j = await res.json();
      setLocalRows((prev) =>
        prev.map((r) =>
          r.service_key === serviceKey
            ? {
                ...r,
                base_cost: j.data.base_cost,
                notes: j.data.notes,
                updated_at: j.data.updated_at,
                updated_by: j.data.updated_by,
              }
            : r
        )
      );
      setEditing(null);
      push("success", "Guardado");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded shadow-sm overflow-hidden">
      <table className="min-w-full w-max table-auto">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Servicio
            </th>
            <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Costo base (MXN)
            </th>
            <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 hidden md:table-cell">
              Notas
            </th>
            <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 hidden lg:table-cell">
              Última actualización
            </th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {localRows.map((row, i) => {
            const isEditing = editing === row.service_key;
            return (
              <tr
                key={row.service_key}
                className={`border-b border-slate-100 last:border-0 ${
                  i % 2 === 1 ? "bg-slate-50/60" : ""
                } hover:bg-brand-primary-light/20 transition-colors`}
              >
                <td className="px-4 py-3 text-sm font-medium text-slate-800">
                  {row.label}
                </td>

                {isEditing ? (
                  <>
                    <td className="px-4 py-2 text-right">
                      <Input
                        type="number"
                        min={0}
                        step={500}
                        value={draft.base_cost}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, base_cost: e.target.value }))
                        }
                        placeholder="0"
                        className="w-32 text-right tabular-nums"
                        aria-label="Costo base MXN"
                      />
                    </td>
                    <td className="px-4 py-2 hidden md:table-cell">
                      <Input
                        value={draft.notes}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, notes: e.target.value }))
                        }
                        placeholder="Notas opcionales"
                        maxLength={500}
                      />
                    </td>
                    <td className="hidden lg:table-cell" />
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          loading={saving}
                          onClick={() => saveEdit(row.service_key)}
                        >
                          Guardar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={cancelEdit}
                          disabled={saving}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3 text-right tabular-nums text-sm text-slate-700">
                      {row.base_cost !== null ? (
                        <span className="font-medium">{fmtMXN(row.base_cost)}</span>
                      ) : (
                        <span className="text-slate-400 italic text-xs">Sin definir</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 hidden md:table-cell max-w-xs truncate">
                      {row.notes ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 hidden lg:table-cell whitespace-nowrap">
                      {row.updated_at ? (
                        <>
                          {fmtDate(row.updated_at)}
                          {row.updated_by && (
                            <span className="ml-1 text-slate-300">
                              · {row.updated_by.split("@")[0]}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => startEdit(row)}
                        disabled={editing !== null && editing !== row.service_key}
                      >
                        Editar
                      </Button>
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
