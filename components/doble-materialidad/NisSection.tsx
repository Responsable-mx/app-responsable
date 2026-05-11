"use client";

import { useCallback, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import type { IroInventoryItem } from "@/lib/dm/iro-generation";

export type NisItem = {
  id: string;
  client_id: string;
  ibso_key: string;
  ibso_label: string;
  categoria: "ambiental" | "social" | "gobernanza";
  estado: "no_identificado" | "parcial" | "disponible";
  calidad_dato: "baja" | "media" | "alta";
  accion: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

const ESTADO_LABEL: Record<NisItem["estado"], string> = {
  no_identificado: "No identificado",
  parcial:         "Parcial",
  disponible:      "Disponible",
};

const ESTADO_COLOR: Record<NisItem["estado"], string> = {
  no_identificado: "bg-slate-100 text-slate-500",
  parcial:         "bg-amber-50 text-amber-700",
  disponible:      "bg-emerald-50 text-emerald-700",
};

const CALIDAD_LABEL: Record<NisItem["calidad_dato"], string> = {
  baja:  "Baja",
  media: "Media",
  alta:  "Alta",
};

const CATEGORIA_LABEL: Record<NisItem["categoria"], string> = {
  ambiental:  "Ambiental",
  social:     "Social",
  gobernanza: "Gobernanza",
};

const CATEGORIA_COLOR: Record<NisItem["categoria"], string> = {
  ambiental:  "bg-teal-50 text-teal-700",
  social:     "bg-violet-50 text-violet-700",
  gobernanza: "bg-slate-100 text-slate-600",
};

export function NisSection({
  clientId,
  nisRows,
  iros,
  hasBenchmark,
  onMutate,
}: {
  clientId: string;
  nisRows: NisItem[];
  iros: IroInventoryItem[];
  hasBenchmark: boolean;
  onMutate: () => void;
}) {
  const { push } = useToast();
  const [generating, setGenerating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const handleAutoGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/dm-nis`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al generar NIS");
      onMutate();
      push("success", "Indicadores NIS/IBSO generados desde el cuestionario.");
    } catch (e) {
      push("error", e instanceof Error ? e.message : "Error al generar NIS");
    } finally {
      setGenerating(false);
    }
  }, [clientId, push, onMutate]);

  const patchNis = useCallback(async (id: string, patch: Partial<Pick<NisItem, "estado" | "calidad_dato" | "accion">>) => {
    setSavingId(id);
    try {
      const res = await fetch(`/api/clients/${clientId}/dm-nis`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error ?? "Error al actualizar NIS");
      }
      onMutate();
    } catch (e) {
      push("error", e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSavingId(null);
    }
  }, [clientId, push, onMutate]);

  const disponiblesCount = nisRows.filter((r) => r.estado === "disponible").length;
  const parcialesCount   = nisRows.filter((r) => r.estado === "parcial").length;

  // IROs de alta/media prioridad que requieren seguimiento de datos
  const priorityIros = iros.filter(
    (i) => i.incluido && ((i.score_impacto ?? 0) + (i.score_financiero ?? 0)) >= 4
  );

  return (
    <div className="space-y-3">
      {/* Banner: IROs priorizados que generan necesidad de datos ── */}
      {priorityIros.length > 0 && (
        <div className="border-l-4 border-l-brand-primary pl-3 py-2 bg-brand-primary-light/20 rounded-r">
          <p className="text-[10px] font-bold uppercase tracking-widest text-brand-primary-dark mb-1.5">
            IROs priorizados que requieren datos ({priorityIros.length})
          </p>
          <div className="flex flex-wrap gap-1">
            {priorityIros.map((iro) => {
              const total = (iro.score_impacto ?? 0) + (iro.score_financiero ?? 0);
              const isAlta = total >= 5;
              return (
                <span
                  key={iro.id}
                  className={`text-[10px] px-2 py-0.5 rounded-sm font-medium ${
                    isAlta
                      ? "bg-rose-50 text-rose-700 border border-rose-200"
                      : "bg-amber-50 text-amber-700 border border-amber-200"
                  }`}
                  title={`${iro.descripcion} — Dim1: ${iro.score_impacto ?? "—"} · Dim2: ${iro.score_financiero ?? "—"}`}
                >
                  {isAlta ? "●" : "◆"} {iro.tema_esg}
                </span>
              );
            })}
          </div>
          <p className="text-[10px] text-slate-500 mt-1.5">
            ● Alta prioridad (Dim1+Dim2 ≥ 5) · ◆ Media (≥ 4) — verifica que tienes datos disponibles para estos temas
          </p>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-slate-600">
          Mapa de brechas de información para los indicadores NIS/IBSO más relevantes del sector.
          {nisRows.length > 0 && (
            <span className="ml-1 text-slate-400">
              {disponiblesCount} disponibles · {parcialesCount} parciales · {nisRows.length - disponiblesCount - parcialesCount} por identificar.
            </span>
          )}
        </p>
        <Button
          size="sm"
          variant={nisRows.length > 0 ? "secondary" : "primary"}
          loading={generating}
          onClick={handleAutoGenerate}
          disabled={!hasBenchmark}
          title={!hasBenchmark ? "Completa el benchmark primero para generar el mapa NIS/IBSO" : undefined}
        >
          {nisRows.length > 0 ? "Actualizar desde cuestionario" : "Auto-completar desde cuestionario"}
        </Button>
      </div>

      {nisRows.length === 0 ? (
        <div className="border-l-4 border-l-slate-300 pl-4 py-2">
          <p className="text-xs text-slate-500">
            Haz clic en &ldquo;Auto-completar&rdquo; para pre-llenar el mapa de brechas basado en el cuestionario del cliente.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded">
          <table className="min-w-full w-max text-xs">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200">
                <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500">Indicador IBSO</th>
                <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 w-24">Categoría</th>
                <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 w-32">Estado del dato</th>
                <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 w-24">Calidad</th>
                <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 w-48">Acción recomendada</th>
              </tr>
            </thead>
            <tbody>
              {nisRows.map((row, idx) => {
                const isSaving = savingId === row.id;
                return (
                  <tr
                    key={row.id}
                    className={`border-b border-slate-100 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"}`}
                  >
                    <td className="px-2 py-2 text-slate-700 font-medium">{row.ibso_label}</td>
                    <td className="px-2 py-2">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-sm ${CATEGORIA_COLOR[row.categoria]}`}>
                        {CATEGORIA_LABEL[row.categoria]}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <select
                        disabled={isSaving}
                        value={row.estado}
                        onChange={(e) => void patchNis(row.id, { estado: e.target.value as NisItem["estado"] })}
                        className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-sm border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-primary/40 ${ESTADO_COLOR[row.estado]}`}
                      >
                        {(["no_identificado", "parcial", "disponible"] as NisItem["estado"][]).map((v) => (
                          <option key={v} value={v}>{ESTADO_LABEL[v]}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <select
                        disabled={isSaving}
                        value={row.calidad_dato}
                        onChange={(e) => void patchNis(row.id, { calidad_dato: e.target.value as NisItem["calidad_dato"] })}
                        className="text-[11px] text-slate-600 border border-slate-200 rounded px-1 py-0.5 bg-white cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-primary/40"
                      >
                        {(["baja", "media", "alta"] as NisItem["calidad_dato"][]).map((v) => (
                          <option key={v} value={v}>{CALIDAD_LABEL[v]}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="text"
                        disabled={isSaving}
                        defaultValue={row.accion ?? ""}
                        placeholder="Ej: Solicitar datos a operaciones..."
                        onBlur={(e) => {
                          const val = e.target.value.trim() || null;
                          if (val !== row.accion) void patchNis(row.id, { accion: val });
                        }}
                        className="w-full text-[11px] text-slate-600 border border-slate-200 rounded px-1.5 py-0.5 bg-white placeholder:text-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-primary/40 font-sans"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
