"use client";

import { useState, useCallback, useMemo } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { extractEsrsCode } from "@/lib/dm/esg-classify";
import type { IroInventoryItem } from "@/lib/dm/iro-generation";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type Decision = "aceptar" | "ajustar" | "excluir";

type IroDecision = {
  decision: Decision | null;
  notas?: string;
};

type Asistente = {
  nombre: string;
  cargo: string;
};

type ValidacionRecord = {
  id: string;
  fecha_junta: string | null;
  modalidad: "presencial" | "virtual";
  asistentes: Asistente[];
  iro_decisions: Record<string, IroDecision>;
  notas: string | null;
  updated_at: string;
};

type Props = {
  clientId: string;
  /** IROs incluidos en el inventario — se filtran a los que tienen include=true */
  iros: IroInventoryItem[];
};

// ── Fetcher ───────────────────────────────────────────────────────────────────

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

// ── Colores por decisión ──────────────────────────────────────────────────────

const DECISION_META: Record<Decision, { label: string; chip: string }> = {
  aceptar: { label: "Aceptar",  chip: "bg-emerald-50 border-emerald-200 text-emerald-700" },
  ajustar: { label: "Ajustar",  chip: "bg-amber-50 border-amber-200 text-amber-700" },
  excluir: { label: "Excluir",  chip: "bg-rose-50 border-rose-200 text-rose-700" },
};

// ── Componente principal ──────────────────────────────────────────────────────

export function ValidacionSection({ clientId, iros }: Props) {
  const { push } = useToast();
  const [saving, setSaving] = useState(false);

  // Estado local del formulario de nuevo asistente
  const [showAsistenteForm, setShowAsistenteForm] = useState(false);
  const [asistenteInput, setAsistenteInput] = useState("");

  const { data, mutate } = useSWR<{ data: ValidacionRecord | null }>(
    `/api/clients/${clientId}/dm-validacion`,
    fetcher,
    { revalidateOnFocus: false }
  );

  const rec = data?.data ?? null;

  // IROs incluidos que participan en la validación
  const includedIros = iros.filter((i) => i.incluido);
  const decisions = useMemo(() => rec?.iro_decisions ?? {}, [rec?.iro_decisions]);
  const pendingCount = includedIros.filter((i) => !decisions[i.id]?.decision).length;
  const allDecided = pendingCount === 0 && includedIros.length > 0;

  // ── Helpers de patch ──────────────────────────────────────────────────────

  const patch = useCallback(
    async (payload: Record<string, unknown>) => {
      setSaving(true);
      try {
        const res = await fetch(`/api/clients/${clientId}/dm-validacion`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Error al guardar");
        await mutate();
      } catch (e) {
        push("error", e instanceof Error ? e.message : "Error al guardar");
      } finally {
        setSaving(false);
      }
    },
    [clientId, mutate, push]
  );

  // ── Manejadores ───────────────────────────────────────────────────────────

  const handleFechaChange = useCallback(
    (val: string) => void patch({ fecha_junta: val || null }),
    [patch]
  );

  const handleModalidadChange = useCallback(
    (val: "presencial" | "virtual") => void patch({ modalidad: val }),
    [patch]
  );

  const handleAddAsistente = useCallback(() => {
    const trimmed = asistenteInput.trim();
    if (!trimmed) return;
    // Formato esperado: "Nombre · Cargo" o "Nombre, Cargo" o solo "Nombre"
    const parts = trimmed.split(/[·,]/).map((s) => s.trim());
    const nuevo: Asistente = {
      nombre: parts[0] ?? trimmed,
      cargo: parts[1] ?? "",
    };
    const updated = [...(rec?.asistentes ?? []), nuevo];
    void patch({ asistentes: updated });
    setAsistenteInput("");
    setShowAsistenteForm(false);
  }, [asistenteInput, rec, patch]);

  const handleRemoveAsistente = useCallback(
    (idx: number) => {
      const updated = (rec?.asistentes ?? []).filter((_, i) => i !== idx);
      void patch({ asistentes: updated });
    },
    [rec, patch]
  );

  const handleDecision = useCallback(
    (iroId: string, decision: Decision | null) => {
      const prev = decisions[iroId] ?? {};
      void patch({
        iro_decisions: { [iroId]: { ...prev, decision } },
      });
    },
    [decisions, patch]
  );

  const handleNotasIro = useCallback(
    (iroId: string, notas: string) => {
      const prev = decisions[iroId] ?? {};
      void patch({
        iro_decisions: { [iroId]: { ...prev, notas: notas || undefined } },
      });
    },
    [decisions, patch]
  );

  const handleNotas = useCallback(
    (val: string) => void patch({ notas: val || null }),
    [patch]
  );

  // ── P8 — Stats de decisiones ──────────────────────────────────────────────
  const decisionStats = useMemo(() => {
    const counts = { aceptar: 0, ajustar: 0, excluir: 0 };
    for (const iro of includedIros) {
      const d = decisions[iro.id]?.decision;
      if (d) counts[d]++;
    }
    return counts;
  }, [includedIros, decisions]);

  const totalDecided = decisionStats.aceptar + decisionStats.ajustar + decisionStats.excluir;
  // Estimación: ~5 min por IRO para preparar la junta de validación
  const minEstimate = Math.round(includedIros.length * 5);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* P8 — Barra de estadísticas de validación */}
      {includedIros.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap px-5 py-3 bg-slate-50 border-b border-slate-200">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 shrink-0">Decisiones</span>
          <div className="flex items-center gap-2 flex-wrap">
            {(["aceptar", "ajustar", "excluir"] as Decision[]).map((d) => {
              const meta = DECISION_META[d];
              const count = decisionStats[d];
              return (
                <span key={d} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-bold border ${meta.chip}`}>
                  {meta.label} <span className="tabular-nums">{count}</span>
                </span>
              );
            })}
            {pendingCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-bold border bg-slate-50 border-slate-200 text-slate-500">
                Pendiente <span className="tabular-nums">{pendingCount}</span>
              </span>
            )}
          </div>
          {/* Progress bar */}
          {includedIros.length > 0 && (
            <div className="flex items-center gap-2 flex-1 min-w-[100px]">
              <div className="flex-1 h-1 bg-slate-200 overflow-hidden">
                <div
                  className={`h-full transition-all ${allDecided ? "bg-emerald-500" : "bg-brand-primary"}`}
                  style={{ width: `${Math.round((totalDecided / includedIros.length) * 100)}%` }}
                />
              </div>
              <span className="text-[10px] tabular-nums text-slate-500 shrink-0">
                {Math.round((totalDecided / includedIros.length) * 100)}%
              </span>
            </div>
          )}
          <span className="text-[10px] text-slate-400 ml-auto shrink-0">
            ~{minEstimate} min estimados para junta
          </span>
        </div>
      )}

      <div className="space-y-6">

        {/* ── Sección 1: Junta de presentación ── */}
        <div>
          <p className="uppercase tracking-widest text-[10px] font-bold text-slate-400 mb-3">
            Junta de presentación
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {/* Fecha */}
            <div>
              <label className="block uppercase tracking-widest text-[10px] font-bold text-slate-400 mb-1.5">
                Fecha <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                defaultValue={rec?.fecha_junta ?? ""}
                onChange={(e) => handleFechaChange(e.target.value)}
                className="w-full border border-slate-200 rounded px-3 py-2 text-xs text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary font-sans"
              />
            </div>
            {/* Modalidad */}
            <div>
              <p className="uppercase tracking-widest text-[10px] font-bold text-slate-400 mb-1.5">
                Modalidad
              </p>
              <div className="flex items-center gap-4 mt-2">
                {(["presencial", "virtual"] as const).map((m) => (
                  <label
                    key={m}
                    className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none"
                  >
                    <input
                      type="radio"
                      name={`val-mode-${clientId}`}
                      value={m}
                      defaultChecked={(rec?.modalidad ?? "presencial") === m}
                      onChange={() => handleModalidadChange(m)}
                      className="accent-brand-primary"
                    />
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Asistentes */}
          <div>
            <p className="uppercase tracking-widest text-[10px] font-bold text-slate-400 mb-2">
              Asistentes del cliente{" "}
              <span className="text-slate-400 font-normal normal-case tracking-normal">
                (opcional · GRI 3 §4.28)
              </span>
            </p>
            <div className="space-y-1 mb-2">
              {(rec?.asistentes ?? []).map((a, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-100 px-2.5 py-1.5 rounded-sm"
                >
                  <svg
                    className="w-3 h-3 text-slate-400 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  <span className="flex-1 min-w-0 truncate">
                    {a.nombre}{a.cargo ? ` · ${a.cargo}` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveAsistente(idx)}
                    className="text-slate-300 hover:text-rose-500 transition-colors text-xs leading-none"
                    aria-label={`Eliminar ${a.nombre}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            {showAsistenteForm ? (
              <div className="flex gap-2 items-center mt-1">
                <input
                  type="text"
                  value={asistenteInput}
                  onChange={(e) => setAsistenteInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddAsistente()}
                  placeholder="Nombre · Cargo"
                  autoFocus
                  className="flex-1 border border-slate-200 rounded-sm px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-primary/30 focus:border-brand-primary font-sans"
                />
                <button
                  type="button"
                  onClick={handleAddAsistente}
                  className="text-[11px] text-white bg-brand-primary font-semibold px-2.5 py-1.5 rounded-sm hover:bg-brand-primary-dark transition-colors whitespace-nowrap"
                >
                  Agregar
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAsistenteForm(false); setAsistenteInput(""); }}
                  className="text-[11px] text-slate-400 hover:text-slate-600 px-1.5 py-1.5 transition-colors"
                  aria-label="Cancelar"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowAsistenteForm(true)}
                className="flex items-center gap-1.5 text-[11px] text-brand-primary font-semibold hover:underline focus:outline-none"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Agregar asistente
              </button>
            )}
          </div>
        </div>

        {/* ── Sección 2: Revisión de IROs ── */}
        <div>
          <p className="uppercase tracking-widest text-[10px] font-bold text-slate-400 mb-3">
            Revisión de hallazgos
          </p>

          {includedIros.length === 0 ? (
            <p className="text-xs text-slate-400 py-2">
              No hay IROs incluidos para revisar. Agrega y califica IROs en la etapa anterior.
            </p>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left py-2 px-3 uppercase tracking-widest text-[10px] font-bold text-slate-500 w-12">
                      IRO
                    </th>
                    <th className="text-left py-2 px-3 uppercase tracking-widest text-[10px] font-bold text-slate-500">
                      Descripción
                    </th>
                    <th className="text-left py-2 px-3 uppercase tracking-widest text-[10px] font-bold text-slate-500 w-32">
                      Propuesta IA
                    </th>
                    <th className="text-left py-2 px-3 uppercase tracking-widest text-[10px] font-bold text-slate-500 w-36">
                      Decisión cliente
                    </th>
                    <th className="text-center py-2 px-3 uppercase tracking-widest text-[10px] font-bold text-slate-500 w-24">
                      Estatus
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {includedIros.map((iro) => {
                    const dec = decisions[iro.id];
                    const scoreImpacto   = iro.score_impacto ?? 0;
                    const scoreFinanciero = iro.score_financiero ?? 0;
                    const cuadrante =
                      scoreImpacto >= 2 && scoreFinanciero >= 2
                        ? "Doble material"
                        : scoreImpacto >= 2
                        ? "Mat. impacto"
                        : scoreFinanciero >= 2
                        ? "Mat. financiero"
                        : "En seguimiento";
                    const cuadranteChip =
                      scoreImpacto >= 2 && scoreFinanciero >= 2
                        ? "text-rose-700 bg-rose-50"
                        : scoreImpacto >= 2
                        ? "text-amber-700 bg-amber-50"
                        : scoreFinanciero >= 2
                        ? "text-teal-700 bg-teal-50"
                        : "text-slate-500 bg-slate-100";

                    return (
                      <tr key={iro.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-medium text-slate-600">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] font-mono font-bold text-slate-500 bg-slate-100 px-1 py-0.5 rounded-sm tabular-nums">
                              {extractEsrsCode(iro.tema_esg)}
                            </span>
                            <span className="text-[10px] text-slate-400 tabular-nums">#{iro.n_iro}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-slate-700 max-w-xs">
                          <p className="line-clamp-2 leading-relaxed">
                            {iro.descripcion ?? iro.tema_esg}
                          </p>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-sm ${cuadranteChip}`}>
                            {cuadrante}
                          </span>
                          <p className="text-[10px] text-slate-400 mt-0.5 tabular-nums">
                            I:{scoreImpacto}/5 · F:{scoreFinanciero}/5
                          </p>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1 flex-wrap">
                            {(Object.entries(DECISION_META) as Array<[Decision, typeof DECISION_META[Decision]]>).map(([val, meta]) => (
                              <button
                                key={val}
                                type="button"
                                onClick={() => handleDecision(iro.id, dec?.decision === val ? null : val)}
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-sm border transition-colors ${
                                  dec?.decision === val ? meta.chip : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                                }`}
                              >
                                {meta.label}
                              </button>
                            ))}
                          </div>
                          {dec?.decision === "ajustar" && (
                            <input
                              type="text"
                              placeholder="Notas de ajuste..."
                              defaultValue={dec?.notas ?? ""}
                              onBlur={(e) => handleNotasIro(iro.id, e.target.value)}
                              className="mt-1 w-full text-[11px] border border-slate-200 rounded px-1.5 py-1 bg-white placeholder:text-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-primary/40 font-sans"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {dec?.decision ? (
                            <span className={`inline-block text-[10px] font-semibold border px-1.5 py-0.5 rounded-sm ${DECISION_META[dec.decision].chip}`}>
                              {DECISION_META[dec.decision].label}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Sección 3: Acuerdos y compromisos ── */}
        <div>
          <label
            htmlFor={`val-notas-${clientId}`}
            className="block uppercase tracking-widest text-[10px] font-bold text-slate-400 mb-2"
          >
            Acuerdos y compromisos{" "}
            <span className="text-slate-400 font-normal normal-case tracking-normal">
              (opcional · incluido en el reporte)
            </span>
          </label>
          <textarea
            id={`val-notas-${clientId}`}
            rows={3}
            maxLength={500}
            defaultValue={rec?.notas ?? ""}
            onBlur={(e) => handleNotas(e.target.value)}
            placeholder="Ej: El cliente solicitó incluir cadena de suministro en S1 para el siguiente ciclo. Pendiente revisión en estudio 2027."
            className="font-sans w-full border border-slate-200 rounded px-3 py-2 text-xs text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary leading-relaxed"
          />
          <p className="text-[10px] text-slate-400 text-right mt-0.5">
            {(rec?.notas ?? "").length} / 500
          </p>
        </div>

      </div>

      {/* ── Footer: CTA ── */}
      <div className="border-t border-slate-100 bg-slate-50 px-5 py-3">
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-slate-500">
            {allDecided
              ? "Todas las decisiones registradas — puedes proceder al reporte."
              : `${pendingCount} IRO${pendingCount !== 1 ? "s" : ""} sin decisión del cliente.`}
          </p>
          <div className="flex flex-col items-end gap-1">
            <Button
              variant={allDecided ? "primary" : "secondary"}
              size="sm"
              disabled={!allDecided || saving}
              aria-describedby={!allDecided ? "val-proceed-hint" : undefined}
              onClick={() => {
                // Cambia panel del wizard Ruta B vía hashchange — el padre
                // (DoubleMaterialidadTab) escucha y monta el panel Reporte.
                if (typeof window !== "undefined") {
                  window.location.hash = "#dm-sec-reporte";
                  // Scroll a top del stepper tras render del nuevo panel
                  requestAnimationFrame(() => {
                    const main = document.querySelector("main");
                    if (main) main.scrollTo({ top: 0, behavior: "smooth" });
                    else window.scrollTo({ top: 0, behavior: "smooth" });
                  });
                }
              }}
            >
              Proceder a reporte
              <svg className="w-3.5 h-3.5 ml-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </Button>
            {!allDecided && (
              <p id="val-proceed-hint" className="text-[10px] text-amber-600" aria-live="polite">
                {pendingCount} IRO{pendingCount !== 1 ? "s" : ""} sin decisión
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
