"use client";

import { useCallback, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import type { IroInventoryItem } from "@/lib/dm/iro-generation";

export type NisItem = {
  id: string;
  client_id: string;
  ibso_key: string;
  ibso_label: string;
  categoria: "ambiental" | "social" | "gobernanza";
  estado: "no_identificado" | "parcial" | "disponible" | "no_aplica";
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
  no_aplica:       "No aplica",
};

const ESTADO_COLOR: Record<NisItem["estado"], string> = {
  no_identificado: "bg-slate-100 text-slate-500",
  parcial:         "bg-amber-50 text-amber-700",
  disponible:      "bg-emerald-50 text-emerald-700",
  no_aplica:       "bg-slate-50 text-slate-400",
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

  // Agrupar por tema_esg — evita renderizar chips duplicados del mismo tema.
  // Cada tema = 1 chip con badge "×N" si > 1 IRO; severidad = max(scores) del grupo.
  type IroGroup = { tema: string; count: number; isAlta: boolean; tooltip: string };
  const priorityGroups: IroGroup[] = (() => {
    const map = new Map<string, IroInventoryItem[]>();
    for (const iro of priorityIros) {
      const arr = map.get(iro.tema_esg) ?? [];
      arr.push(iro);
      map.set(iro.tema_esg, arr);
    }
    return Array.from(map.entries()).map(([tema, items]) => {
      const maxTotal = Math.max(
        ...items.map((i) => (i.score_impacto ?? 0) + (i.score_financiero ?? 0)),
      );
      return {
        tema,
        count: items.length,
        isAlta: maxTotal >= 5,
        tooltip: items
          .map((i) => `IRO #${i.n_iro}: ${i.descripcion} — Dim1:${i.score_impacto ?? "—"} · Dim2:${i.score_financiero ?? "—"}`)
          .join("\n"),
      };
    });
  })();

  return (
    <div className="space-y-3">
      {/* Banner: IROs priorizados que generan necesidad de datos ── */}
      {priorityGroups.length > 0 && (
        <div className="border-l-4 border-l-brand-primary pl-3 py-2 bg-brand-primary-light/20 rounded-r">
          <p className="text-[10px] font-bold uppercase tracking-widest text-brand-primary-dark mb-1.5">
            Temas priorizados que requieren datos ({priorityGroups.length})
          </p>
          <div className="flex flex-wrap gap-1">
            {priorityGroups.map((g) => (
              <span
                key={g.tema}
                className={`text-[10px] px-2 py-0.5 rounded-sm font-medium ${
                  g.isAlta
                    ? "bg-rose-50 text-rose-700 border border-rose-200"
                    : "bg-amber-50 text-amber-700 border border-amber-200"
                }`}
                title={g.tooltip}
              >
                {g.isAlta ? "●" : "◆"} {g.tema}
                {g.count > 1 && (
                  <span className="ml-1 text-[9px] opacity-70 tabular-nums">×{g.count}</span>
                )}
              </span>
            ))}
          </div>
          <p className="text-[10px] text-slate-500 mt-1.5">
            ● Alta prioridad (Dim1+Dim2 ≥ 5) · ◆ Media (≥ 4) · ×N = IROs en el tema — verifica que tienes datos disponibles para estos temas
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
                      <SelectField
                        disabled={isSaving}
                        value={row.estado}
                        onChange={(v) => void patchNis(row.id, { estado: v as NisItem["estado"] })}
                        options={(["no_identificado", "parcial", "disponible", "no_aplica"] as NisItem["estado"][]).map((v) => ({ value: v, label: ESTADO_LABEL[v] }))}
                        className={`text-[11px] font-semibold ${ESTADO_COLOR[row.estado]}`}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <SelectField
                        disabled={isSaving}
                        value={row.calidad_dato}
                        onChange={(v) => void patchNis(row.id, { calidad_dato: v as NisItem["calidad_dato"] })}
                        options={(["baja", "media", "alta"] as NisItem["calidad_dato"][]).map((v) => ({ value: v, label: CALIDAD_LABEL[v] }))}
                      />
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
