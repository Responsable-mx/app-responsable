"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toast";
import type { AutoUpdateConfigRow } from "@/app/api/auto-update-config/route";

export function AutoUpdateConfigTable({ initial }: { initial: AutoUpdateConfigRow[] }) {
  const [rows, setRows] = useState<AutoUpdateConfigRow[]>(initial);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const toast = useToast();

  async function patch(resourceKey: string, updates: Partial<Pick<AutoUpdateConfigRow, "enabled" | "frequency_days">>) {
    setPending((p) => ({ ...p, [resourceKey]: true }));
    try {
      const res = await fetch("/api/auto-update-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource_key: resourceKey, ...updates }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setRows((rs) => rs.map((r) => (r.resource_key === resourceKey ? (json.data as AutoUpdateConfigRow) : r)));
      toast.push("success", "Guardado");
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setPending((p) => ({ ...p, [resourceKey]: false }));
    }
  }

  function fmtDate(iso: string | null): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("es-MX", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function nextRunEstimate(row: AutoUpdateConfigRow): string {
    if (!row.enabled) return "Desactivado";
    if (!row.last_run_at) return "Próximo cron (00:30 CDMX)";
    const next = new Date(row.last_run_at);
    next.setDate(next.getDate() + row.frequency_days);
    if (next.getTime() < Date.now()) return "Pendiente (próximo cron)";
    return next.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
  }

  function statusBadge(row: AutoUpdateConfigRow): { label: string; cls: string } {
    if (!row.last_run_at) return { label: "Sin correr aún", cls: "bg-slate-100 text-slate-600 border-slate-200" };
    if (row.last_status === "ok") return { label: "OK", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    if (row.last_status === "partial") return { label: "Parcial", cls: "bg-amber-50 text-amber-800 border-amber-200" };
    if (row.last_status === "failed") return { label: "Falló", cls: "bg-rose-50 text-rose-700 border-rose-200" };
    return { label: "—", cls: "bg-slate-100 text-slate-600 border-slate-200" };
  }

  return (
    <div className="bg-white border border-slate-200 rounded overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
            <th className="text-left px-4 py-2.5">Recurso</th>
            <th className="text-center px-3 py-2.5 w-24">Activo</th>
            <th className="text-center px-3 py-2.5 w-32">Frecuencia (días)</th>
            <th className="text-center px-3 py-2.5 w-28">Última corrida</th>
            <th className="text-center px-3 py-2.5 w-24">Estado</th>
            <th className="text-center px-3 py-2.5 w-32">Próxima corrida</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                Sin configuraciones. La migración 0080 las crea automáticamente.
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const isPending = pending[row.resource_key] === true;
              const status = statusBadge(row);
              return (
                <tr key={row.resource_key} className={isPending ? "opacity-50" : ""}>
                  <td className="px-4 py-3 align-top">
                    <p className="font-semibold text-slate-800">{row.label}</p>
                    {row.description && (
                      <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">{row.description}</p>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center align-top">
                    <label className="inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={row.enabled}
                        onChange={(e) => void patch(row.resource_key, { enabled: e.target.checked })}
                        disabled={isPending}
                        className="w-4 h-4 accent-brand-primary cursor-pointer"
                        aria-label={`Activar/desactivar ${row.label}`}
                      />
                    </label>
                  </td>
                  <td className="px-3 py-3 text-center align-top">
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={row.frequency_days}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (!Number.isFinite(v) || v < 1 || v > 365) return;
                        setRows((rs) => rs.map((r) => (r.resource_key === row.resource_key ? { ...r, frequency_days: v } : r)));
                      }}
                      onBlur={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (Number.isFinite(v) && v >= 1 && v <= 365 && v !== initial.find((r) => r.resource_key === row.resource_key)?.frequency_days) {
                          void patch(row.resource_key, { frequency_days: v });
                        }
                      }}
                      disabled={isPending || !row.enabled}
                      className="font-sans w-20 text-sm text-center border border-slate-200 rounded px-2 py-1 disabled:bg-slate-50 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 tabular-nums"
                    />
                  </td>
                  <td className="px-3 py-3 text-center align-top text-[11px] text-slate-600 tabular-nums">
                    {fmtDate(row.last_run_at)}
                  </td>
                  <td className="px-3 py-3 text-center align-top">
                    <span className={`text-[10px] font-bold uppercase tracking-wider border px-1.5 py-0.5 rounded-sm ${status.cls}`} title={row.last_error ?? undefined}>
                      {status.label}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center align-top text-[11px] text-slate-600">
                    {nextRunEstimate(row)}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
