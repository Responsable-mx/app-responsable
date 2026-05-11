"use client";

import { useCallback, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { classifyEsg, ESG_BADGE, extractEsrsCode } from "@/lib/dm/esg-classify";
import type { IroInventoryItem } from "@/lib/dm/iro-generation";
import { ExpandableCell } from "@/components/doble-materialidad/ExpandableCell";

export type IroBatchStatus = "idle" | "pending" | "done" | "failed";

const SCORE_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: "1", color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  2: { label: "2", color: "bg-amber-100 text-amber-700 border-amber-300" },
  3: { label: "3", color: "bg-rose-100 text-rose-700 border-rose-300" },
};

const SCORE_DIM1_LABEL: Record<string, string> = {
  impacto_negativo: "Severidad",
  impacto_positivo: "Escala/Alcance",
  riesgo:           "Prob.",
  oportunidad:      "Prob.",
};

const SCORE_DIM2_LABEL: Record<string, string> = {
  impacto_negativo: "Materialidad",
  impacto_positivo: "Materialidad",
  riesgo:           "Magnitud",
  oportunidad:      "Potencial",
};

const SCORE_DIM1_TOOLTIP: Record<string, string> = {
  impacto_negativo: "Severidad: Escala (extensión del daño) × Alcance (nº afectados) × Remediabilidad (dificultad de reparar). 1=bajo · 2=medio · 3=alto",
  impacto_positivo: "Escala × Alcance (sin Remediabilidad para impactos positivos). 1=bajo · 2=medio · 3=alto",
  riesgo:           "Probabilidad de que el riesgo se materialice. 1=baja · 2=media · 3=alta",
  oportunidad:      "Probabilidad de capturar la oportunidad. 1=baja · 2=media · 3=alta",
};

const TIPO_SHORT: Record<string, string> = {
  impacto_positivo: "Imp+",
  impacto_negativo: "Imp−",
  riesgo:           "Riesgo",
  oportunidad:      "Opor.",
};

const TIPO_BADGE: Record<string, string> = {
  impacto_positivo: "bg-emerald-50 text-emerald-700",
  impacto_negativo: "bg-rose-50 text-rose-700",
  riesgo:           "bg-amber-50 text-amber-700",
  oportunidad:      "bg-teal-50 text-teal-700",
};

const CADENA_LABEL: Record<string, string> = {
  upstream:   "Upstream",
  ops_propia: "Operación",
  downstream: "Downstream",
};

function ScorePicker({
  value,
  onChange,
  disabled,
  dimLabel,
  dimTooltip,
}: {
  value: number | null;
  onChange: (v: number) => void;
  disabled?: boolean;
  dimLabel?: string;
  dimTooltip?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      {dimLabel && (
        <span
          className="text-[9px] text-slate-400 uppercase tracking-wide whitespace-nowrap cursor-default"
          title={dimTooltip}
        >
          {dimLabel}
        </span>
      )}
      <div className="flex gap-0.5">
        {[1, 2, 3].map((n) => {
          const active = value === n;
          const { label, color } = SCORE_LABELS[n]!;
          return (
            <button
              key={n}
              type="button"
              disabled={disabled}
              onClick={() => onChange(n)}
              className={`w-6 h-6 text-[10px] font-bold border rounded-sm flex items-center justify-center transition-colors
                ${active ? color : "bg-white text-slate-400 border-slate-200 hover:bg-slate-50"}
                ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
              aria-label={`${dimLabel ?? "Score"} ${n}`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function prioridad(impacto: number | null, financiero: number | null): { label: string; color: string } {
  if (!impacto || !financiero) return { label: "—", color: "text-slate-400" };
  const sum = impacto + financiero;
  if (sum >= 5) return { label: "Alta",  color: "text-rose-600 font-semibold" };
  if (sum >= 3) return { label: "Media", color: "text-amber-600 font-semibold" };
  return { label: "Baja", color: "text-emerald-600 font-semibold" };
}

export function IroSection({
  clientId,
  iros,
  status,
  isPolling,
  hasBenchmark,
  onMutate,
  onStartPolling,
}: {
  clientId: string;
  iros: IroInventoryItem[];
  status: IroBatchStatus;
  isPolling: boolean;
  hasBenchmark: boolean;
  onMutate: () => void;
  onStartPolling: () => void;
}) {
  const { push } = useToast();
  const [generating, setGenerating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/dm-iros`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al iniciar generación de IROs");
      onStartPolling();
      onMutate();
    } catch (e) {
      push("error", e instanceof Error ? e.message : "Error al generar IROs");
    } finally {
      setGenerating(false);
    }
  }, [clientId, push, onMutate, onStartPolling]);

  const patchIro = useCallback(async (id: string, patch: Partial<Pick<IroInventoryItem, "score_impacto" | "score_financiero" | "incluido">>) => {
    setSavingId(id);
    try {
      const res = await fetch(`/api/clients/${clientId}/dm-iros`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error ?? "Error al actualizar IRO");
      }
      onMutate();
    } catch (e) {
      push("error", e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSavingId(null);
    }
  }, [clientId, push, onMutate]);

  const includedCount = iros.filter((i) => i.incluido).length;

  // Umbral de materialidad (pattern mockup-v7) — filtra IROs visibles por
  // consolidado = max(score_impacto, score_financiero). 0 = ver todo.
  // Escala 1-3 ESRS: 0=todos, 1=todos los puntuados, 2=medio o más, 3=solo alto.
  // IROs `incluido=true` siempre permanecen visibles (no perderlos al subir slider).
  const [threshold, setThreshold] = useState<number>(0);

  // Agrupar por tema_esg preservando orden de aparición + aplicar filtro umbral
  const groupsAll: Array<{ tema: string; items: IroInventoryItem[] }> = [];
  for (const iro of iros) {
    const existing = groupsAll.find((g) => g.tema === iro.tema_esg);
    if (existing) existing.items.push(iro);
    else groupsAll.push({ tema: iro.tema_esg, items: [iro] });
  }
  const groups = threshold === 0
    ? groupsAll
    : groupsAll
        .map((g) => ({
          tema: g.tema,
          items: g.items.filter((i) => {
            if (i.incluido) return true;
            const consolidado = Math.max(i.score_impacto ?? 0, i.score_financiero ?? 0);
            return consolidado >= threshold;
          }),
        }))
        .filter((g) => g.items.length > 0);
  const visibleCount = groups.reduce((acc, g) => acc + g.items.length, 0);
  const filteredOut = iros.length - visibleCount;

  if (!hasBenchmark && status === "idle") {
    return (
      <div className="border-l-4 border-l-slate-300 pl-4 py-2">
        <p className="text-xs text-slate-500">
          Completa el benchmark primero — los IROs se generan usando las señales del benchmark + el cuestionario del cliente.
        </p>
      </div>
    );
  }

  if (status === "idle") {
    return (
      <div className="border-l-4 border-l-amber-400 pl-4 py-2 space-y-3">
        <p className="text-xs text-slate-600">
          La IA generará un inventario preliminar de 15–25 IROs usando el cuestionario del cliente y las señales del benchmark. Tarda 1-3 minutos.
        </p>
        <Button size="md" variant="primary" loading={generating} onClick={handleGenerate}>
          <svg className="w-3.5 h-3.5 mr-1.5 shrink-0" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 1v7M6 8l-2.5-2.5M6 8l2.5-2.5" />
            <path d="M1 11h10" />
          </svg>
          Generar IROs con IA
        </Button>
      </div>
    );
  }

  if (status === "pending" && isPolling) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500 py-2 border-l-4 border-l-amber-400 pl-4">
        <svg className="w-4 h-4 animate-spin text-brand-primary shrink-0" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Generando IROs — puede tardar 1-3 minutos. No cierres esta página.
      </div>
    );
  }

  if (status === "pending" && !isPolling) {
    return (
      <div className="border-l-4 border-l-amber-400 pl-4 py-2 space-y-2">
        <p className="text-xs text-slate-500">Generación en proceso. Verifica el estado.</p>
        <Button size="sm" variant="secondary" onClick={onMutate}>Verificar estado</Button>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="border-l-4 border-l-rose-500 pl-4 py-2 bg-rose-50 rounded-r space-y-2">
        <p className="text-xs text-rose-700">La generación de IROs falló. Intenta de nuevo.</p>
        <Button size="sm" variant="primary" loading={generating} onClick={handleGenerate}>Reintentar</Button>
      </div>
    );
  }

  // status === "done"
  return (
    <div className="space-y-3">
      {/* Slider umbral materialidad — filtra tabla en vivo (mockup-v7 pattern) */}
      <div className="flex items-center gap-3 flex-wrap p-3 bg-slate-50 border border-slate-200 rounded">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 whitespace-nowrap">
          Umbral de materialidad
        </span>
        <input
          type="range"
          min={0}
          max={3}
          step={1}
          value={threshold}
          onChange={(e) => setThreshold(parseInt(e.target.value, 10))}
          className="flex-1 min-w-[120px] accent-brand-primary cursor-pointer"
          aria-label="Umbral de consolidado para mostrar IROs"
        />
        <span className="text-xs font-bold tabular-nums text-brand-primary min-w-[1.5rem] text-right">
          {threshold}
        </span>
        <span className="text-[10px] text-slate-400">/ 3</span>
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-sm whitespace-nowrap ${
            threshold === 0
              ? "bg-slate-100 text-slate-600"
              : "bg-brand-primary-light text-brand-primary-dark"
          }`}
        >
          {visibleCount} visibles
        </span>
        {filteredOut > 0 && (
          <span className="text-[10px] text-slate-400 italic whitespace-nowrap">
            {filteredOut} ocultos (consolidado &lt; {threshold})
          </span>
        )}
      </div>
      {/* Header resumen */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">
            <span className="font-bold text-slate-700">{groupsAll.length}</span> bloques ·{" "}
            <span className="font-bold text-slate-700">{includedCount}</span>/{iros.length} IROs incluidos
          </span>
          <span
            className="text-[10px] uppercase tracking-widest text-slate-400 font-bold cursor-default"
            title="Dim 1: Severidad (impactos negativos) · Escala/Alcance (impactos positivos) · Probabilidad (riesgos/oportunidades) — Dim 2: Materialidad financiera para la empresa en todos los tipos"
          >
            Dim 1 (Severidad/Prob.) × Dim 2 (Materialidad) · 1=bajo · 2=medio · 3=alto ⓘ
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/clients/${clientId}/dm-export-iros`}
            download
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded hover:bg-slate-50 transition-colors"
          >
            <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 12h12M8 2v8m0 0-3-3m3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Exportar Excel
          </a>
          <Button size="sm" variant="secondary" loading={generating} onClick={handleGenerate}>
            <svg className="w-3 h-3 mr-1.5 shrink-0" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 4a4 4 0 11-7.9 1" />
              <path d="M2 2v3h3" />
            </svg>
            Regenerar IROs
          </Button>
        </div>
      </div>

      {/* Tabla IROs */}
      <div className="overflow-x-auto border border-slate-200 rounded">
        <table className="min-w-full w-max text-xs">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-200">
              <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 w-8">#</th>
              <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 w-32">Tema ESG</th>
              <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500">Descripción</th>
              <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 w-20">Tipo</th>
              <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 w-22">Cadena</th>
              <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 w-20">Horizonte</th>
              <th className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500 w-20" title="Severidad (impactos) · Probabilidad (riesgos/oport.)">Dim. 1 ⓘ</th>
              <th className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500 w-20" title="Materialidad financiera para la empresa (todos los tipos)">Dim. 2 ⓘ</th>
              <th className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500 w-16">Prioridad</th>
              <th className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500 w-16">Incluir</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <>
                {/* ── Cabecera de bloque temático ── */}
                <tr key={`group-${group.tema}`} className="bg-teal-50 border-b border-teal-200">
                  <td colSpan={10} className="px-2 py-1.5 border-l-2 border-l-brand-primary">
                    <span className="mr-1.5 text-[10px] font-mono font-bold text-teal-900 bg-teal-100 px-1.5 py-0.5 rounded-sm">
                      {extractEsrsCode(group.tema)}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-teal-700">
                      {group.tema}
                    </span>
                    <span className="ml-2 text-[10px] text-teal-500">
                      · {group.items.filter((i) => i.incluido).length}/{group.items.length}
                    </span>
                    {(() => {
                      const cat = classifyEsg(group.tema);
                      return (
                        <span className={`ml-2 text-[9px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-widest ${ESG_BADGE[cat]}`}>
                          {cat}
                        </span>
                      );
                    })()}
                    {(() => {
                      const consolidado = Math.max(
                        ...group.items.filter(i => i.score_impacto || i.score_financiero)
                          .map(i => Math.max(i.score_impacto ?? 0, i.score_financiero ?? 0))
                      );
                      if (!isFinite(consolidado) || consolidado === 0) return null;
                      const color = consolidado === 3 ? "text-rose-600" : consolidado === 2 ? "text-amber-600" : "text-emerald-600";
                      return (
                        <span className={`ml-3 text-[9px] tabular-nums ${color}`} title="Score consolidado del tema (max de impacto y financiero)">
                          Score max: {consolidado}
                        </span>
                      );
                    })()}
                  </td>
                </tr>
                {/* ── IROs del bloque ── */}
                {group.items.map((iro, idx) => {
                  const isSaving = savingId === iro.id;
                  const pri = prioridad(iro.score_impacto, iro.score_financiero);
                  return (
                    <tr
                      key={iro.id}
                      className={`border-b border-slate-100 transition-colors ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"} ${!iro.incluido ? "opacity-50" : ""}`}
                    >
                      <td className="px-2 py-2 text-slate-400 tabular-nums">{iro.n_iro}</td>
                      <td className="px-2 py-2 text-slate-700 font-medium max-w-[128px]">
                        <span className="line-clamp-2 text-xs">{iro.tema_esg}</span>
                      </td>
                      <td className="px-2 py-2 text-slate-600 max-w-[300px]">
                        <ExpandableCell text={iro.descripcion} />
                        {iro.evidencia && (
                          <p className="text-[10px] text-slate-400 mt-0.5 italic line-clamp-1">
                            Fuente: {iro.evidencia}
                          </p>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-sm ${TIPO_BADGE[iro.tipo] ?? "bg-slate-100 text-slate-600"}`}>
                          {TIPO_SHORT[iro.tipo] ?? iro.tipo}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-xs text-slate-600">{CADENA_LABEL[iro.cadena] ?? iro.cadena}</td>
                      <td className="px-2 py-2 text-xs text-slate-600 capitalize">{iro.horizonte}</td>
                      <td className="px-2 py-2">
                        <div className="flex justify-center">
                          <ScorePicker
                            value={iro.score_impacto}
                            disabled={isSaving}
                            dimLabel={SCORE_DIM1_LABEL[iro.tipo]}
                            dimTooltip={SCORE_DIM1_TOOLTIP[iro.tipo]}
                            onChange={(v) => void patchIro(iro.id, { score_impacto: v })}
                          />
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex justify-center">
                          <ScorePicker
                            value={iro.score_financiero}
                            disabled={isSaving}
                            dimLabel={SCORE_DIM2_LABEL[iro.tipo]}
                            onChange={(v) => void patchIro(iro.id, { score_financiero: v })}
                          />
                        </div>
                      </td>
                      <td className={`px-2 py-2 text-center text-[11px] tabular-nums ${pri.color}`}>
                        {pri.label}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => void patchIro(iro.id, { incluido: !iro.incluido })}
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center mx-auto transition-colors
                            ${iro.incluido ? "bg-brand-primary border-brand-primary" : "bg-white border-slate-300 hover:border-slate-400"}
                            ${isSaving ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
                          aria-label={iro.incluido ? "Excluir IRO" : "Incluir IRO"}
                        >
                          {iro.incluido && (
                            <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M2 6l3 3 5-5" />
                            </svg>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-slate-400">
        Confianza IA: {iros.filter((i) => i.confianza === "alto").length} alta · {iros.filter((i) => i.confianza === "medio").length} media · {iros.filter((i) => i.confianza === "bajo").length} baja.
        Los scores son editables — ajusta según criterio del consultor.
      </p>
    </div>
  );
}
