"use client";

import { useState, Fragment } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import type { AiCostByStage } from "@/app/api/clients/[id]/ai-costs/route";

// Tipos que espeja la forma JSON de lib/pricing/stats.ts
type ProjectDetail = {
  id: string;
  client_id: string;
  client_name: string;
  is_pilot: boolean;
  actual_cost: number | null;
  sale_price: number | null;
  cost_notes: string | null;
  created_at: string;
};

type ServicePricingStats = {
  service_key: string;
  count: number;
  pilot_count: number;
  avg_actual_cost: number | null;
  only_pilots: boolean;
  projects: ProjectDetail[];
};

type PricingRow = {
  service_key: string;
  label: string;
  base_cost: number | null;
  notes: string | null;
  updated_at: string | null;
  updated_by: string | null;
};

type SavedConfig = {
  service_key: string;
  base_cost: number | null;
  notes: string | null;
  updated_at: string;
  updated_by: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtUSD(n: number | null | undefined): string | null {
  if (n == null) return null;
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PricingConfigTable({
  rows,
  stats = [],
}: {
  rows: PricingRow[];
  stats?: ServicePricingStats[];
}) {
  const { push } = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ base_cost: string; notes: string }>({
    base_cost: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [localRows, setLocalRows] = useState<PricingRow[]>(rows);

  const statsMap = new Map<string, ServicePricingStats>(
    stats.map((s) => [s.service_key, s])
  );

  // DM-IA empieza expandida si ya tiene proyectos registrados
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    const dmStats = stats.find((s) => s.service_key === "doble_materialidad_ia");
    if (dmStats && dmStats.count > 0) initial.add("doble_materialidad_ia");
    return initial;
  });

  // Desglose IA por etapa (solo DM-IA, por cliente)
  const [aiCache, setAiCache] = useState<Map<string, AiCostByStage[] | "loading" | "error">>(new Map());
  const [aiExpanded, setAiExpanded] = useState<Set<string>>(new Set());

  async function toggleAiCosts(clientId: string) {
    setAiExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) { next.delete(clientId); return next; }
      next.add(clientId);
      return next;
    });
    if (aiCache.has(clientId)) return;
    setAiCache((prev) => new Map(prev).set(clientId, "loading"));
    try {
      const res = await fetch(`/api/clients/${clientId}/ai-costs?days=90`);
      const j = (await res.json()) as { data: AiCostByStage[] };
      setAiCache((prev) => new Map(prev).set(clientId, j.data ?? []));
    } catch {
      setAiCache((prev) => new Map(prev).set(clientId, "error"));
    }
  }

  function toggleExpand(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function startEdit(row: PricingRow) {
    setDraft({
      base_cost: row.base_cost !== null ? String(row.base_cost) : "",
      notes: row.notes ?? "",
    });
    setEditing(row.service_key);
  }

  function cancelEdit() {
    setEditing(null);
  }

  async function saveEdit(serviceKey: string) {
    const parseNum = (v: string) => (v.trim() === "" ? null : Number(v));
    const baseCost = parseNum(draft.base_cost);
    if (
      draft.base_cost.trim() !== "" &&
      (isNaN(baseCost!) || baseCost! < 0)
    ) {
      push("error", "Costo base debe ser un número positivo");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/service-pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_key: serviceKey,
          base_cost: baseCost,
          notes: draft.notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        push("error", (j as { error?: string }).error ?? "Error al guardar");
        return;
      }
      const j = await res.json();
      const updated = j.data as SavedConfig;
      setLocalRows((prev) =>
        prev.map((r) =>
          r.service_key === serviceKey
            ? {
                ...r,
                base_cost: updated.base_cost,
                notes: updated.notes,
                updated_at: updated.updated_at,
                updated_by: updated.updated_by,
              }
            : r
        )
      );
      setEditing(null);
      push("success", "Costo base guardado");
    } finally {
      setSaving(false);
    }
  }

  const allUnupdated = localRows.every(r => r.updated_at === null);
  const COLS = allUnupdated ? 6 : 7;

  return (
    <div className="border border-slate-200 rounded overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full w-max text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-slate-400 font-bold border-b border-slate-100 bg-white">
              <th className="px-4 py-2.5 text-left">Servicio</th>
              <th className="px-4 py-2.5 text-right">Proyectos</th>
              <th className="px-4 py-2.5 text-right">Promedio real</th>
              <th className="px-4 py-2.5 text-right">Costo base</th>
              <th className="px-4 py-2.5 text-right">Brecha</th>
              {!allUnupdated && <th className="px-4 py-2.5 text-right">Actualizado</th>}
              <th className="px-4 py-2.5" />
            </tr>
          </thead>

          {localRows.map((row, idx) => {
            const svc = statsMap.get(row.service_key);
            const isExpanded = expandedKeys.has(row.service_key);
            const hasProjects = !!svc && svc.count > 0;
            const isEven = idx % 2 === 1;
            const rowBg = isEven ? "bg-slate-50" : "bg-white";
            const brecha = svc?.avg_actual_cost != null && row.base_cost != null
              ? ((svc.avg_actual_cost - row.base_cost) / row.base_cost) * 100
              : null;

            return (
              <tbody key={row.service_key}>
                {/* ── Fila config ─────────────────────────────── */}
                {editing === row.service_key ? (
                  <tr className={rowBg}>
                    <td className="px-4 py-2.5 font-semibold text-slate-800 whitespace-nowrap">
                      {row.label}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-300">—</td>
                    <td className="px-4 py-2.5 text-right text-slate-300">—</td>
                    <td className="px-4 py-2.5">
                      <Input
                        type="number"
                        min={0}
                        step={500}
                        value={draft.base_cost}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, base_cost: e.target.value }))
                        }
                        placeholder="0"
                        aria-label="Costo base USD"
                        className="max-w-[140px]"
                      />
                      <textarea
                        className="font-sans mt-1.5 w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 resize-none max-w-[220px]"
                        rows={2}
                        maxLength={500}
                        value={draft.notes}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, notes: e.target.value }))
                        }
                        placeholder="Notas opcionales..."
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-300">—</td>
                    {!allUnupdated && <td className="px-4 py-2.5 text-right text-slate-300">—</td>}
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1.5 justify-end">
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
                  </tr>
                ) : (
                  <tr className={`${rowBg} hover:bg-brand-primary-light/20 transition-colors`}>
                    {/* Servicio */}
                    <td className="px-4 py-2.5 font-semibold text-slate-800 whitespace-nowrap">
                      {row.label}
                    </td>

                    {/* Proyectos */}
                    <td className="px-4 py-2.5 text-right">
                      {hasProjects ? (
                        <button
                          onClick={() => toggleExpand(row.service_key)}
                          className="inline-flex flex-col items-end gap-0.5 hover:text-brand-primary-dark transition-colors"
                        >
                          <span className="tabular-nums font-semibold text-slate-700">
                            {svc.count === 1
                              ? "1 proyecto"
                              : `${svc.count} proyectos`}
                          </span>
                          {svc.pilot_count > 0 && (
                            <span className="text-[10px] text-amber-600 font-medium">
                              {svc.pilot_count === svc.count
                                ? svc.pilot_count === 1
                                  ? "piloto"
                                  : `${svc.pilot_count} pilotos`
                                : `${svc.pilot_count} piloto${svc.pilot_count > 1 ? "s" : ""} · ${svc.count - svc.pilot_count} real${svc.count - svc.pilot_count > 1 ? "es" : ""}`}
                            </span>
                          )}
                          <span className="text-[10px] text-brand-primary">
                            {isExpanded ? "▲ ocultar" : "▼ ver"}
                          </span>
                        </button>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>

                    {/* Promedio real */}
                    <td className="px-4 py-2.5 text-right">
                      {svc?.avg_actual_cost != null ? (
                        <div className="inline-flex flex-col items-end gap-0.5">
                          <span className="tabular-nums font-semibold text-slate-800">
                            {fmtUSD(svc.avg_actual_cost)}
                          </span>
                          {svc.only_pilots && (
                            <span className="text-[10px] text-amber-600">
                              solo pilotos
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>

                    {/* Costo base */}
                    <td className="px-4 py-2.5 text-right">
                      {row.base_cost != null ? (
                        <span className="tabular-nums font-medium text-slate-600">
                          {fmtUSD(row.base_cost)}
                        </span>
                      ) : (
                        <button
                          onClick={() => startEdit(row)}
                          className="text-[11px] text-brand-primary hover:underline underline-offset-2 italic"
                        >
                          Definir costo →
                        </button>
                      )}
                    </td>

                    {/* Brecha real vs objetivo */}
                    <td className="px-4 py-2.5 text-right">
                      {brecha === null ? (
                        <span className="text-slate-300">—</span>
                      ) : brecha <= 0 ? (
                        <span className="text-emerald-700 font-medium text-[11px]">En objetivo ✓</span>
                      ) : (
                        <span className={`font-medium text-[11px] ${brecha > 30 ? "text-rose-600" : "text-amber-600"}`}>
                          +{Math.round(brecha)}% sobre objetivo
                        </span>
                      )}
                    </td>

                    {/* Actualizado — solo si alguna fila tiene valor */}
                    {!allUnupdated && (
                      <td className="px-4 py-2.5 text-right text-slate-400 whitespace-nowrap">
                        {row.updated_at ? (
                          <div className="inline-flex flex-col items-end gap-0.5">
                            <span>{fmtDate(row.updated_at)}</span>
                            {row.updated_by && (
                              <span className="text-[10px] text-slate-300">
                                {row.updated_by.split("@")[0]}
                              </span>
                            )}
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                    )}

                    {/* Acción */}
                    <td className="px-4 py-2.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => startEdit(row)}
                      >
                        Editar
                      </Button>
                    </td>
                  </tr>
                )}

                {/* ── Detalle proyectos (expandible) ───────────── */}
                {isExpanded && svc && svc.projects.length > 0 && (() => {
                  const isDmIa = row.service_key === "doble_materialidad_ia";
                  const DM_STAGE_LABELS: Record<string, string> = {
                    dm_referentes:             "Referentes ESG",
                    dm_benchmark_empresas:     "Propuesta de empresas",
                    dm_benchmark:              "Comparativa benchmark",
                    dm_benchmark_company_iros: "IROs por empresa",
                    dm_iros:                   "IROs del cliente",
                    dm_resumen:                "Resumen ejecutivo",
                    dm_report:                 "Reporte PDF",
                    chat:                      "Chat con roles IA",
                  };
                  return (
                    <tr>
                      <td
                        colSpan={COLS}
                        className="px-4 pb-4 pt-0 bg-slate-50 border-t border-slate-100"
                      >
                        <div className="mt-2 ml-2">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                            Proyectos — {row.label}
                          </p>
                          <div className="border border-slate-200 rounded overflow-hidden">
                            <table className="min-w-full text-xs">
                              <thead>
                                <tr className="bg-white text-[9px] uppercase tracking-widest font-bold text-slate-400 border-b border-slate-100">
                                  <th className="px-3 py-1.5 text-left">Cliente</th>
                                  <th className="px-3 py-1.5 text-left">Tipo</th>
                                  <th className="px-3 py-1.5 text-right">Costo real</th>
                                  <th className="px-3 py-1.5 text-left min-w-[160px]">Notas</th>
                                  {isDmIa && <th className="px-3 py-1.5 text-center">Etapas IA</th>}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                {svc.projects.map((p) => {
                                  const isAiOpen = aiExpanded.has(p.client_id);
                                  const aiData = aiCache.get(p.client_id);
                                  return (
                                    <Fragment key={p.id}>
                                      <tr className="hover:bg-slate-50 transition-colors">
                                        <td className="px-3 py-2 font-medium text-slate-700 whitespace-nowrap">
                                          {p.client_name}
                                        </td>
                                        <td className="px-3 py-2">
                                          {p.is_pilot ? (
                                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-sm">
                                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                                              Piloto
                                            </span>
                                          ) : (
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">
                                              Real
                                            </span>
                                          )}
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-800">
                                          {fmtUSD(p.actual_cost) ?? (
                                            <span className="text-slate-300">—</span>
                                          )}
                                        </td>
                                        <td className="px-3 py-2 text-slate-500 max-w-[200px]">
                                          {p.cost_notes ? (
                                            <span className="line-clamp-2 leading-relaxed">{p.cost_notes}</span>
                                          ) : (
                                            <span className="text-slate-300">—</span>
                                          )}
                                        </td>
                                        {isDmIa && (
                                          <td className="px-3 py-2 text-center">
                                            <button
                                              onClick={() => toggleAiCosts(p.client_id)}
                                              className="text-[10px] font-semibold text-brand-primary hover:text-brand-primary-dark transition-colors"
                                            >
                                              {isAiOpen ? "▲ ocultar" : "▼ ver etapas"}
                                            </button>
                                          </td>
                                        )}
                                      </tr>
                                      {/* Expansión etapas IA */}
                                      {isDmIa && isAiOpen && (
                                        <tr key={`${p.id}-ai`}>
                                          <td colSpan={5} className="px-4 py-3 bg-slate-100 border-t border-slate-200">
                                            {aiData === "loading" && (
                                              <p className="text-xs text-slate-400 italic">Cargando desglose IA…</p>
                                            )}
                                            {aiData === "error" && (
                                              <p className="text-xs text-rose-500">Error al cargar datos de IA.</p>
                                            )}
                                            {Array.isArray(aiData) && aiData.length === 0 && (
                                              <p className="text-xs text-slate-400 italic">
                                                Sin llamadas etiquetadas aún — los datos aparecerán conforme se use DM-IA (últimos 90 días).
                                              </p>
                                            )}
                                            {Array.isArray(aiData) && aiData.length > 0 && (() => {
                                              const dmStages = aiData.filter(s => s.stage.startsWith("dm_"));
                                              const otherStages = aiData.filter(s => !s.stage.startsWith("dm_"));
                                              const dmTotal = dmStages.reduce((a, s) => a + s.cost_usd, 0);
                                              return (
                                                <div className="space-y-2">
                                                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                                                    Costo por etapa — últimos 90 días · {p.client_name}
                                                  </p>
                                                  <table className="min-w-full text-[11px] bg-white border border-slate-200 rounded overflow-hidden">
                                                    <thead>
                                                      <tr className="text-[9px] uppercase tracking-widest font-bold text-slate-400 border-b border-slate-100">
                                                        <th className="px-3 py-1.5 text-left">Etapa</th>
                                                        <th className="px-3 py-1.5 text-right">Llamadas</th>
                                                        <th className="px-3 py-1.5 text-right">Costo</th>
                                                        <th className="px-3 py-1.5 text-right">% total DM</th>
                                                        <th className="px-3 py-1.5 text-right">Latencia</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-50">
                                                      {[...dmStages, ...otherStages].map((s) => (
                                                        <tr key={s.stage} className={s.stage.startsWith("dm_") ? "" : "bg-slate-50"}>
                                                          <td className="px-3 py-1.5 text-slate-700">
                                                            {DM_STAGE_LABELS[s.stage] ?? s.stage}
                                                            {!s.stage.startsWith("dm_") && (
                                                              <span className="ml-1 text-slate-400 text-[9px]">(chat/otro)</span>
                                                            )}
                                                          </td>
                                                          <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{s.calls}</td>
                                                          <td className="px-3 py-1.5 text-right tabular-nums font-medium text-slate-800">
                                                            {fmtUSD(s.cost_usd)}
                                                          </td>
                                                          <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
                                                            {dmTotal > 0 && s.stage.startsWith("dm_")
                                                              ? `${Math.round((s.cost_usd / dmTotal) * 100)}%`
                                                              : "—"}
                                                          </td>
                                                          <td className="px-3 py-1.5 text-right text-slate-400">
                                                            {s.avg_latency_ms > 0 ? `${(s.avg_latency_ms / 1000).toFixed(1)} s` : "—"}
                                                          </td>
                                                        </tr>
                                                      ))}
                                                    </tbody>
                                                    {dmStages.length > 1 && (
                                                      <tfoot>
                                                        <tr className="bg-slate-100 border-t border-slate-200 font-semibold">
                                                          <td className="px-3 py-1.5 text-[9px] uppercase tracking-widest text-slate-500">Total DM-IA</td>
                                                          <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">
                                                            {dmStages.reduce((a, s) => a + s.calls, 0)}
                                                          </td>
                                                          <td className="px-3 py-1.5 text-right tabular-nums text-slate-800">
                                                            {fmtUSD(dmTotal)}
                                                          </td>
                                                          <td colSpan={2} />
                                                        </tr>
                                                      </tfoot>
                                                    )}
                                                  </table>
                                                </div>
                                              );
                                            })()}
                                          </td>
                                        </tr>
                                      )}
                                    </Fragment>
                                  );
                                })}
                              </tbody>
                              {svc.avg_actual_cost != null && (
                                <tfoot>
                                  <tr className="bg-slate-100 border-t border-slate-200">
                                    <td className="px-3 py-1.5">
                                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                        Promedio{" "}
                                        <span className="text-slate-400 normal-case font-normal">
                                          ({svc.count}{" "}
                                          {svc.count === 1 ? "proyecto" : "proyectos"})
                                        </span>
                                        {svc.only_pilots && (
                                          <span className="ml-1 text-amber-600">· solo pilotos</span>
                                        )}
                                      </span>
                                    </td>
                                    <td />
                                    <td className="px-3 py-1.5 text-right tabular-nums font-bold text-slate-800">
                                      {fmtUSD(svc.avg_actual_cost)}
                                    </td>
                                    <td colSpan={isDmIa ? 2 : 1} />
                                  </tr>
                                </tfoot>
                              )}
                            </table>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })()}
              </tbody>
            );
          })}
        </table>
      </div>
    </div>
  );
}
