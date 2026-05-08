"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import useSWR from "swr";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { SkeletonList } from "@/components/ui/Skeleton";
import { RELATION_LABELS, type CompanyRelation } from "@/lib/dm/fields";
import type { DmIroConfig } from "@/lib/dm/iros";
import type { IroInventoryItem } from "@/lib/dm/iro-generation";

// ── Tipos ────────────────────────────────────────────────────

type BenchmarkCompany = {
  id: string;
  client_id: string;
  name: string;
  country: string | null;
  sector: string | null;
  relation: CompanyRelation;
  proposed_by: "ia" | "consultor";
  validated: boolean;
  created_at: string;
};

type BenchmarkResult = {
  id: string;
  companies_snapshot: Array<{ name: string; relation: string }>;
  fields_snapshot: Array<{ key: string; label: string }>;
  comparison: Record<string, Record<string, string>>;
  narrative: string;
  status: "pending" | "done" | "failed";
  created_at: string;
};

type BenchmarkData = {
  companies: BenchmarkCompany[];
  latest_result: BenchmarkResult | null;
};

type NisItem = {
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

type IroBatchStatus = "idle" | "pending" | "done" | "failed";

type LatestReport = {
  id: string;
  file_name: string;
  created_at: string;
  parse_status: "pending" | "ok" | "failed";
  markdown_content?: string;
} | null;

type Props = {
  clientId: string;
  clientName: string;
  questionnaireProgress: { filled: number; total: number } | null;
  onGoToCuestionario: () => void;
};

// ── Fetcher ──────────────────────────────────────────────────

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

// ── Stage indicator ──────────────────────────────────────────

type StageStatus = "done" | "active" | "pending";

function StageIndicator({
  number,
  label,
  status,
}: {
  number: number;
  label: string;
  status: StageStatus;
}) {
  const ringColor =
    status === "done"
      ? "bg-brand-primary text-white border-brand-primary"
      : status === "active"
      ? "bg-white text-brand-primary border-brand-primary"
      : "bg-white text-slate-400 border-slate-300";

  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] font-bold shrink-0 ${ringColor}`}
      >
        {status === "done" ? (
          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
            <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          number
        )}
      </div>
      <span
        className={`text-xs font-bold uppercase tracking-widest ${
          status === "active" ? "text-brand-primary" : status === "done" ? "text-slate-500" : "text-slate-400"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

// ── Celda expandible ─────────────────────────────────────────

function ExpandableCell({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  if (!text || text === "—") return <span className="text-slate-400">—</span>;
  const isLong = text.length > 140;
  return (
    <div>
      <p className={`text-slate-600 text-xs leading-relaxed${!expanded && isLong ? " line-clamp-3" : ""}`}>
        {text}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-[10px] text-brand-primary hover:underline mt-0.5 focus:outline-none"
        >
          {expanded ? "Ver menos" : "Ver más"}
        </button>
      )}
    </div>
  );
}

// ── Lookup fuzzy en comparison ────────────────────────────────

function lookupComparisonValue(
  comparison: Record<string, Record<string, string>>,
  fieldKey: string,
  companyName: string,
): string {
  const fieldMap = comparison[fieldKey] ?? {};
  return (
    fieldMap[companyName] ??
    Object.entries(fieldMap).find(
      ([k]) => companyName.startsWith(k) || k.startsWith(companyName.split(" ")[0]!)
    )?.[1] ??
    "—"
  );
}

// ── Etapa 1: Contexto ────────────────────────────────────────

function ContextoSection({
  progress,
  onGoToCuestionario,
}: {
  progress: Props["questionnaireProgress"];
  onGoToCuestionario: () => void;
}) {
  const isComplete = progress && progress.filled >= progress.total && progress.total > 0;
  const borderColor = isComplete
    ? "border-l-emerald-600"
    : progress && progress.filled > 0
    ? "border-l-amber-500"
    : "border-l-slate-300";

  return (
    <div className={`border-l-4 ${borderColor} pl-4 py-2`}>
      <p className="text-xs text-slate-600 mb-3">
        El cuestionario de contexto es la base para que la IA entienda a tu cliente antes de ejecutar el benchmark.
      </p>
      <div className="flex items-center gap-3">
        {progress ? (
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded ${
              isComplete
                ? "bg-emerald-50 text-emerald-700"
                : progress.filled > 0
                ? "bg-amber-50 text-amber-700"
                : "bg-slate-100 text-slate-500"
            }`}
          >
            {isComplete ? "Completo" : `${progress.filled} / ${progress.total} preguntas`}
          </span>
        ) : (
          <button
            onClick={onGoToCuestionario}
            className="text-xs text-brand-primary hover:underline"
          >
            El cuestionario está vacío. Complétalo primero →
          </button>
        )}
        <Button size="sm" variant="secondary" onClick={onGoToCuestionario}>
          {isComplete ? "Ver cuestionario" : "Completar cuestionario"}
        </Button>
      </div>
    </div>
  );
}

// ── Etapa 2: Benchmark ───────────────────────────────────────

function BenchmarkSection({
  clientId,
  clientName,
  companies,
  latestResult,
  onDataMutate,
  isPolling,
  onStartPolling,
}: {
  clientId: string;
  clientName: string;
  companies: BenchmarkCompany[];
  latestResult: BenchmarkResult | null;
  onDataMutate: () => void;
  isPolling: boolean;
  onStartPolling: () => void;
}) {
  const { push } = useToast();
  const { data: irosData } = useSWR<{ data: DmIroConfig[] }>("/api/iros", fetcher);
  const iros = irosData?.data ?? [];

  const [proposing, setProposing] = useState(false);
  const [confirmRepropose, setConfirmRepropose] = useState(false);
  const [fieldsExpanded, setFieldsExpanded] = useState(false);
  const hasDone = latestResult?.status === "done";
  // Colapsar configuración por default cuando ya existe un resultado
  const [configExpanded, setConfigExpanded] = useState(() => latestResult?.status !== "done");
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(companies.filter((c) => c.validated).map((c) => c.id))
  );

  const handlePropose = useCallback(async () => {
    setProposing(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/dm-benchmark`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "propose" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al proponer empresas");
      push("success", "Empresas propuestas. Revisa y selecciona las que incluirás en el benchmark.");
      setSelected(new Set());
      onDataMutate();
    } catch (e) {
      push("error", e instanceof Error ? e.message : "Error al proponer empresas");
    } finally {
      setProposing(false);
    }
  }, [clientId, push, onDataMutate]);

  const handleToggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleCompare = useCallback(async () => {
    if (selected.size < 2) {
      push("error", "Selecciona al menos 2 empresas para el benchmark");
      return;
    }
    try {
      const res = await fetch(`/api/clients/${clientId}/dm-benchmark`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "compare", company_ids: Array.from(selected) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al ejecutar benchmark");
      onStartPolling();
    } catch (e) {
      push("error", e instanceof Error ? e.message : "Error al ejecutar benchmark");
    }
  }, [clientId, selected, push, onStartPolling]);

  const groupedByRelation = companies.reduce<Record<string, BenchmarkCompany[]>>((acc, c) => {
    if (!acc[c.relation]) acc[c.relation] = [];
    acc[c.relation]!.push(c);
    return acc;
  }, {});

  const hasComparisonData =
    hasDone &&
    latestResult!.companies_snapshot?.length > 0 &&
    latestResult!.fields_snapshot?.length > 0 &&
    Object.keys(latestResult!.comparison ?? {}).length > 0;

  return (
    <div className="space-y-4">
      {/* ── Configuración: colapsada cuando hay resultado ── */}
      {hasDone && !configExpanded ? (
        // Fila resumen colapsada
        <div className="flex items-center justify-between border border-slate-200 rounded px-3 py-2 bg-slate-50/60">
          <div className="flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-emerald-600 shrink-0" viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" d="M8 15A7 7 0 108 1a7 7 0 000 14zm3.354-9.354a.5.5 0 00-.708 0L7 9.293 5.354 7.646a.5.5 0 00-.708.708l2 2a.5.5 0 00.708 0l4-4a.5.5 0 000-.708z" clipRule="evenodd" />
            </svg>
            <span className="text-xs text-slate-600">
              Benchmark ejecutado el{" "}
              {new Date(latestResult!.created_at).toLocaleDateString("es-MX", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}{" "}
              con {latestResult!.companies_snapshot.length} empresa
              {latestResult!.companies_snapshot.length !== 1 ? "s" : ""}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setConfigExpanded(true)}
            className="text-xs text-brand-primary hover:underline flex items-center gap-0.5"
          >
            Editar
            <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" d="M3 4.5l3 3 3-3" />
            </svg>
          </button>
        </div>
      ) : (
        // Configuración expandida
        <div className="space-y-4">
          {/* Campos del benchmark — colapsable */}
          <div className="bg-slate-50 rounded p-3">
            <button
              type="button"
              onClick={() => setFieldsExpanded((v) => !v)}
              className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 w-full text-left"
            >
              Estándares ESRS ({iros.length > 0 ? iros.length : 10} · 2 dimensiones c/u)
              <svg
                className={`w-3 h-3 transition-transform ${fieldsExpanded ? "rotate-180" : ""}`}
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path strokeLinecap="round" d="M3 4.5l3 3 3-3" />
              </svg>
            </button>
            {fieldsExpanded && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {(iros.length > 0 ? iros : []).map((iro) => (
                  <span
                    key={iro.id}
                    className="text-xs bg-white border border-slate-200 text-slate-600 px-2 py-0.5 rounded-sm"
                    title={`Impacto: ${iro.impact_desc}\nRiesgo: ${iro.risk_desc}`}
                  >
                    {iro.esrs_standard} · {iro.label}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Botón proponer */}
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant={companies.length > 0 ? "secondary" : "primary"}
              loading={proposing}
              onClick={companies.length > 0 ? () => setConfirmRepropose(true) : handlePropose}
            >
              {companies.length > 0 ? "Regenerar lista IA" : "Proponer empresas con IA"}
            </Button>
            {companies.length > 0 && (
              <span className="text-xs text-slate-500">{companies.length} empresas propuestas</span>
            )}
          </div>

          {/* Selección masiva — links inline, no botones */}
          {companies.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelected(new Set(companies.map((c) => c.id)))}
                className="text-[11px] text-brand-primary hover:underline"
              >
                Seleccionar todas
              </button>
              <span className="text-slate-300 text-[11px]">·</span>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-[11px] text-slate-500 hover:underline"
              >
                Limpiar
              </button>
              <span className="text-[11px] text-slate-400">{selected.size} seleccionadas</span>
            </div>
          )}

          {/* Lista de empresas por categoría */}
          {Object.entries(groupedByRelation).map(([relation, group]) => (
            <div key={relation}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
                {RELATION_LABELS[relation as CompanyRelation] ?? relation}
              </p>
              <div className="space-y-1">
                {group.map((company) => (
                  <label
                    key={company.id}
                    className="flex items-start gap-2.5 p-2.5 border border-slate-200 rounded cursor-pointer hover:bg-slate-50 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(company.id)}
                      onChange={() => handleToggle(company.id)}
                      className="mt-0.5 accent-brand-primary"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-slate-800">{company.name}</span>
                      {company.country && (
                        <span className="text-xs text-slate-500 ml-1.5">{company.country}</span>
                      )}
                      {company.sector && (
                        <p className="text-xs text-slate-500 truncate">{company.sector}</p>
                      )}
                    </div>
                    {company.proposed_by === "ia" && (
                      <span className="text-[9px] font-bold text-brand-primary bg-brand-primary/10 px-1.5 py-0.5 rounded-sm shrink-0">
                        IA
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          ))}

          {/* Botón ejecutar benchmark — sin paréntesis */}
          {companies.length > 0 && (
            <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
              <Button
                size="md"
                variant="primary"
                loading={isPolling}
                onClick={handleCompare}
                disabled={isPolling || selected.size < 2}
                title={selected.size < 2 ? "Selecciona al menos 2 empresas para ejecutar" : undefined}
              >
                Ejecutar benchmark
              </Button>
              {selected.size > 0 && !isPolling && (
                <span className="text-xs text-slate-500">
                  {selected.size} empresa{selected.size !== 1 ? "s" : ""} + {clientName}
                </span>
              )}
              {hasDone && !isPolling && (
                <span className="text-xs text-emerald-600 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                    <path fillRule="evenodd" d="M8 15A7 7 0 108 1a7 7 0 000 14zm3.354-9.354a.5.5 0 00-.708 0L7 9.293 5.354 7.646a.5.5 0 00-.708.708l2 2a.5.5 0 00.708 0l4-4a.5.5 0 000-.708z" clipRule="evenodd" />
                  </svg>
                  Benchmark anterior disponible
                </span>
              )}
            </div>
          )}

          {/* Colapsar cuando hay resultado */}
          {hasDone && (
            <button
              type="button"
              onClick={() => setConfigExpanded(false)}
              className="text-[11px] text-slate-400 hover:text-slate-600 hover:underline"
            >
              ↑ Colapsar configuración
            </button>
          )}
        </div>
      )}

      {/* ── Progreso durante ejecución async ── */}
      {isPolling && (
        <div className="flex items-center gap-2 text-xs text-slate-500 py-2 border-l-4 border-l-amber-400 pl-4">
          <svg className="w-4 h-4 animate-spin text-brand-primary shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Procesando con IA (Sonnet) — tarda 1-3 minutos. No cierres esta página.
        </div>
      )}

      {/* ── Resultado narrativo del último benchmark ── */}
      {hasDone && latestResult!.narrative && (
        <div className="border-l-4 border-l-brand-primary pl-4 py-2 bg-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
            Síntesis del benchmark
          </p>
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
            {latestResult!.narrative}
          </p>
          <p className="text-[10px] text-slate-400 mt-2">
            {new Date(latestResult!.created_at).toLocaleDateString("es-MX", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
      )}

      {/* ── Tabla comparativa — con columna cliente highlight ── */}
      {hasComparisonData && (
        <div className="mt-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
            {clientName} vs {latestResult!.companies_snapshot.length} empresa
            {latestResult!.companies_snapshot.length !== 1 ? "s" : ""} — posición por dimensión ESG
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full w-max text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 pb-2 pr-6 whitespace-nowrap">
                    Dimensión
                  </th>
                  {/* Columna cliente — highlight */}
                  <th className="text-left text-[10px] font-bold uppercase tracking-widest pb-2 pr-6 whitespace-nowrap bg-brand-primary-light/30 px-3 rounded-t text-brand-primary-dark">
                    {clientName}
                    <span className="ml-1 font-normal normal-case text-brand-primary/60">· Cliente</span>
                  </th>
                  {/* Columnas competidores */}
                  {latestResult!.companies_snapshot.map((company) => (
                    <th
                      key={company.name}
                      className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 pb-2 pr-6 whitespace-nowrap"
                    >
                      {company.name}
                      {company.relation && (
                        <span className="ml-1 font-normal normal-case text-slate-400">
                          · {RELATION_LABELS[company.relation as CompanyRelation] ?? company.relation}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {latestResult!.fields_snapshot.map((field) => (
                  <tr
                    key={field.key}
                    className="even:bg-slate-50/60 hover:bg-brand-primary-light/20 transition-colors"
                  >
                    <td className="py-3 pr-6 font-medium text-slate-700 whitespace-nowrap align-top">
                      {field.label}
                    </td>
                    {/* Celda cliente — highlight */}
                    <td className="py-3 pr-6 max-w-[220px] align-top bg-brand-primary-light/20 px-3">
                      <ExpandableCell
                        text={lookupComparisonValue(latestResult!.comparison, field.key, clientName)}
                      />
                    </td>
                    {/* Celdas competidores */}
                    {latestResult!.companies_snapshot.map((company) => (
                      <td key={company.name} className="py-3 pr-6 max-w-[220px] align-top">
                        <ExpandableCell
                          text={lookupComparisonValue(latestResult!.comparison, field.key, company.name)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {latestResult?.status === "failed" && (
        <div className="border-l-4 border-l-rose-500 pl-4 py-2 bg-rose-50 rounded-r">
          <p className="text-xs text-rose-700">El benchmark anterior falló. Intenta de nuevo.</p>
        </div>
      )}

      <ConfirmModal
        open={confirmRepropose}
        title="¿Regenerar lista de empresas?"
        description="Se eliminarán las empresas actuales y la IA generará una nueva lista. El benchmark anterior se conserva hasta que ejecutes uno nuevo."
        confirmLabel="Regenerar lista"
        cancelLabel="Cancelar"
        tone="destructive"
        onConfirm={() => {
          setConfirmRepropose(false);
          handlePropose();
        }}
        onCancel={() => setConfirmRepropose(false)}
      />
    </div>
  );
}

// ── Score picker (1 / 2 / 3) ─────────────────────────────────

const SCORE_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: "1", color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  2: { label: "2", color: "bg-amber-100 text-amber-700 border-amber-300" },
  3: { label: "3", color: "bg-rose-100 text-rose-700 border-rose-300" },
};

function ScorePicker({
  value,
  onChange,
  disabled,
}: {
  value: number | null;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
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
            aria-label={`Score ${n}`}
          >
            {label}
          </button>
        );
      })}
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

// ── Etapa 3: IROs del cliente ────────────────────────────────

function IroSection({
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
      {/* Header resumen */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">
            <span className="font-bold text-slate-700">{includedCount}</span> de {iros.length} IROs incluidos
          </span>
          <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
            Score: Impacto × Financiero (1=bajo · 2=medio · 3=alto)
          </span>
        </div>
        <Button size="sm" variant="secondary" loading={generating} onClick={handleGenerate}>
          Regenerar IROs
        </Button>
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
              <th className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500 w-20">Impacto</th>
              <th className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500 w-20">Financiero</th>
              <th className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500 w-16">Prioridad</th>
              <th className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500 w-16">Incluir</th>
            </tr>
          </thead>
          <tbody>
            {iros.map((iro, idx) => {
              const isSaving = savingId === iro.id;
              const pri = prioridad(iro.score_impacto, iro.score_financiero);
              return (
                <tr
                  key={iro.id}
                  className={`border-b border-slate-100 transition-colors ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"} ${!iro.incluido ? "opacity-50" : ""}`}
                >
                  <td className="px-2 py-2 text-slate-400 tabular-nums">{iro.n_iro}</td>
                  <td className="px-2 py-2 text-slate-700 font-medium max-w-[128px]">
                    <span className="line-clamp-2">{iro.tema_esg}</span>
                  </td>
                  <td className="px-2 py-2 text-slate-600 max-w-[320px]">
                    <ExpandableCell text={iro.descripcion} />
                  </td>
                  <td className="px-2 py-2">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-sm ${TIPO_BADGE[iro.tipo] ?? "bg-slate-100 text-slate-600"}`}>
                      {TIPO_SHORT[iro.tipo] ?? iro.tipo}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-slate-600">{CADENA_LABEL[iro.cadena] ?? iro.cadena}</td>
                  <td className="px-2 py-2 text-slate-600 capitalize">{iro.horizonte}</td>
                  <td className="px-2 py-2">
                    <div className="flex justify-center">
                      <ScorePicker
                        value={iro.score_impacto}
                        disabled={isSaving}
                        onChange={(v) => void patchIro(iro.id, { score_impacto: v })}
                      />
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex justify-center">
                      <ScorePicker
                        value={iro.score_financiero}
                        disabled={isSaving}
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

// ── Etapa 4: NIS / IBSO ──────────────────────────────────────

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

function NisSection({
  clientId,
  nisRows,
  onMutate,
}: {
  clientId: string;
  nisRows: NisItem[];
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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-slate-600">
          Mapa de brechas de información para los indicadores NIS/IBSO más relevantes del sector.
          {nisRows.length > 0 && (
            <span className="ml-1 text-slate-400">
              {disponiblesCount} disponibles · {parcialesCount} parciales · {nisRows.length - disponiblesCount - parcialesCount} por identificar.
            </span>
          )}
        </p>
        <Button size="sm" variant={nisRows.length > 0 ? "secondary" : "primary"} loading={generating} onClick={handleAutoGenerate}>
          {nisRows.length > 0 ? "Actualizar desde cuestionario" : "Auto-completar desde cuestionario"}
        </Button>
      </div>

      {nisRows.length === 0 ? (
        <div className="border-l-4 border-l-slate-300 pl-4 py-2">
          <p className="text-xs text-slate-500">
            Haz clic en "Auto-completar" para pre-llenar el mapa de brechas basado en el cuestionario del cliente.
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

// ── Etapa 5: Reporte ─────────────────────────────────────────

function ReporteSection({
  clientId,
  clientName,
  latestResult,
  latestReport,
  onReportMutate,
  isReportPolling,
  onStartReportPolling,
}: {
  clientId: string;
  clientName: string;
  latestResult: BenchmarkResult | null;
  latestReport: LatestReport;
  onReportMutate: () => void;
  isReportPolling: boolean;
  onStartReportPolling: () => void;
}) {
  const { push } = useToast();
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);

  const canGenerate = latestResult?.status === "done";

  const handleGenerate = useCallback(async () => {
    if (!latestResult) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/dm-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result_id: latestResult.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al generar reporte");
      // POST retorna pending — inicia polling del GET cada 5s
      onStartReportPolling();
      onReportMutate();
    } catch (e) {
      push("error", e instanceof Error ? e.message : "Error al generar reporte");
    } finally {
      setGenerating(false);
    }
  }, [clientId, latestResult, push, onReportMutate, onStartReportPolling]);

  const handleDownloadPdf = useCallback(async () => {
    if (!latestResult) return;
    setDownloading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/export-dm-pdf?result_id=${latestResult.id}`);
      if (!res.ok) throw new Error("Error al exportar PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reporte-dm-${clientName.toLowerCase().replace(/\s+/g, "-")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      push("error", e instanceof Error ? e.message : "Error al descargar PDF");
    } finally {
      setDownloading(false);
    }
  }, [clientId, clientName, latestResult, push]);

  // Nombre de display legible (slug → título humano)
  const reportDisplayName = latestReport
    ? `Reporte DM — ${clientName} — ${new Date(latestReport.created_at).toLocaleDateString("es-MX", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })}`
    : "";

  return (
    <div className="space-y-4">
      {!canGenerate && (
        <div className="border-l-4 border-l-slate-300 pl-4 py-2">
          <p className="text-xs text-slate-500">
            Completa el benchmark primero para poder generar el reporte.
          </p>
        </div>
      )}

      {/* Sin reporte todavía — mostrar botón generar */}
      {canGenerate && !latestReport && (
        <div className="border-l-4 border-l-amber-400 pl-4 py-2">
          <p className="text-xs text-slate-600 mb-3">
            El reporte incluirá resumen ejecutivo, posicionamiento vs benchmark, riesgos identificados, fortalezas, áreas de mejora y recomendaciones priorizadas.
          </p>
          <Button
            size="md"
            variant="primary"
            loading={generating || isReportPolling}
            disabled={isReportPolling}
            onClick={handleGenerate}
          >
            Generar reporte con IA
          </Button>
        </div>
      )}

      {/* Batch en proceso — spinner activo */}
      {canGenerate && latestReport?.parse_status === "pending" && isReportPolling && (
        <div className="flex items-center gap-2 text-xs text-slate-500 py-2 border-l-4 border-l-amber-400 pl-4">
          <svg className="w-4 h-4 animate-spin text-brand-primary shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Generando reporte con Opus — puede tardar 2-5 minutos. No cierres esta página.
        </div>
      )}

      {/* Batch pendiente pero polling inactivo (posible stale) */}
      {canGenerate && latestReport?.parse_status === "pending" && !isReportPolling && (
        <div className="border-l-4 border-l-amber-400 pl-4 py-2 space-y-2">
          <p className="text-xs text-slate-500">Reporte en proceso. Verifica el estado actual.</p>
          <Button size="sm" variant="secondary" onClick={onReportMutate}>
            Verificar estado
          </Button>
        </div>
      )}

      {/* Batch fallido */}
      {canGenerate && latestReport?.parse_status === "failed" && (
        <div className="border-l-4 border-l-rose-500 pl-4 py-2 bg-rose-50 rounded-r space-y-2">
          <p className="text-xs text-rose-700">El último reporte falló. Intenta de nuevo.</p>
          <Button size="sm" variant="primary" loading={generating} onClick={handleGenerate}>
            Reintentar
          </Button>
        </div>
      )}

      {/* Reporte listo */}
      {canGenerate && latestReport?.parse_status === "ok" && (
        <div className="border-l-4 border-l-emerald-600 pl-4 py-2">
          <p className="text-sm font-medium text-slate-800 mb-0.5">{reportDisplayName}</p>
          <p className="text-xs text-slate-500 mb-3">
            {new Date(latestReport.created_at).toLocaleDateString("es-MX", {
              day: "numeric",
              month: "long",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="primary" loading={downloading} onClick={handleDownloadPdf}>
              <svg
                className="w-3.5 h-3.5 mr-1.5"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 2v8m0 0l-3-3m3 3l3-3M3 13h10" />
              </svg>
              Descargar PDF
            </Button>
            {/* Regenerar — destructivo, requiere confirmación */}
            <Button
              size="sm"
              variant="secondary"
              loading={generating}
              onClick={() => setConfirmRegenerate(true)}
            >
              Regenerar reporte
            </Button>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirmRegenerate}
        title="¿Regenerar reporte?"
        description="Se generará un nuevo reporte con el benchmark actual. El reporte anterior quedará reemplazado y no podrá recuperarse. Esta operación puede tardar 2-5 minutos."
        confirmLabel="Regenerar"
        cancelLabel="Cancelar"
        tone="destructive"
        onConfirm={() => {
          setConfirmRegenerate(false);
          handleGenerate();
        }}
        onCancel={() => setConfirmRegenerate(false)}
      />
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────

export function DoubleMaterialidadTab({
  clientId,
  clientName,
  questionnaireProgress,
  onGoToCuestionario,
}: Props) {
  const benchmarkKey = `/api/clients/${clientId}/dm-benchmark`;
  const irosKey     = `/api/clients/${clientId}/dm-iros`;
  const nisKey      = `/api/clients/${clientId}/dm-nis`;
  const reportKey   = `/api/clients/${clientId}/dm-report`;

  const [isPolling, setIsPolling] = useState(false);
  const { push } = useToast();
  const pollingNotified = useRef(false);
  const pollingStartId = useRef<string | null>(null);

  const [isIroPolling, setIsIroPolling] = useState(false);
  const pollingNotifiedIro = useRef(false);

  const [isReportPolling, setIsReportPolling] = useState(false);
  const pollingNotifiedReport = useRef(false);
  const pollingStartReportId = useRef<string | null>(null);

  const { data: benchmarkResp, isLoading: loadingBenchmark, mutate: mutateBenchmark } = useSWR<{
    data: BenchmarkData;
  }>(benchmarkKey, fetcher, {
    revalidateOnFocus: false,
    refreshInterval: isPolling ? 5_000 : 0,
  });

  const { data: irosResp, mutate: mutateIros } = useSWR<{
    data: { status: IroBatchStatus; iros: IroInventoryItem[] };
  }>(irosKey, fetcher, {
    revalidateOnFocus: false,
    refreshInterval: isIroPolling ? 5_000 : 0,
  });

  const { data: nisResp, mutate: mutateNis } = useSWR<{
    data: NisItem[];
  }>(nisKey, fetcher, { revalidateOnFocus: false });

  const { data: reportResp, mutate: mutateReport } = useSWR<{
    data: LatestReport;
  }>(reportKey, fetcher, {
    revalidateOnFocus: false,
    refreshInterval: isReportPolling ? 5_000 : 0,
  });

  const companies   = benchmarkResp?.data.companies ?? [];
  const latestResult = benchmarkResp?.data.latest_result ?? null;
  const irosStatus  = irosResp?.data.status ?? "idle";
  const iros        = irosResp?.data.iros ?? [];
  const nisRows     = nisResp?.data ?? [];
  const latestReport = reportResp?.data ?? null;

  // Detectar cuando el batch del benchmark termina
  useEffect(() => {
    if (!isPolling) {
      pollingNotified.current = false;
      return;
    }
    const isStale = latestResult?.id === pollingStartId.current;
    if (isStale) return;
    if (latestResult?.status === "done" && !pollingNotified.current) {
      pollingNotified.current = true;
      setIsPolling(false);
      push("success", "Benchmark completado. Revisa el análisis comparativo.");
    }
    if (latestResult?.status === "failed" && !pollingNotified.current) {
      pollingNotified.current = true;
      setIsPolling(false);
      push("error", "El benchmark falló. Intenta de nuevo.");
    }
  }, [latestResult?.id, latestResult?.status, isPolling, push]);

  // Detectar cuando el batch de IROs termina
  useEffect(() => {
    if (!isIroPolling) {
      pollingNotifiedIro.current = false;
      return;
    }
    if (irosStatus === "done" && !pollingNotifiedIro.current) {
      pollingNotifiedIro.current = true;
      setIsIroPolling(false);
      push("success", `${iros.length} IROs generados. Revisa y ajusta los scores.`);
    }
    if (irosStatus === "failed" && !pollingNotifiedIro.current) {
      pollingNotifiedIro.current = true;
      setIsIroPolling(false);
      push("error", "La generación de IROs falló. Intenta de nuevo.");
    }
  }, [irosStatus, isIroPolling, iros.length, push]);

  // Detectar cuando el batch del reporte termina
  useEffect(() => {
    if (!isReportPolling) {
      pollingNotifiedReport.current = false;
      return;
    }
    const isStale = latestReport?.id === pollingStartReportId.current;
    if (isStale) return;
    if (latestReport?.parse_status === "ok" && !pollingNotifiedReport.current) {
      pollingNotifiedReport.current = true;
      setIsReportPolling(false);
      push("success", "Reporte generado. Puedes descargarlo en PDF.");
    }
    if (latestReport?.parse_status === "failed" && !pollingNotifiedReport.current) {
      pollingNotifiedReport.current = true;
      setIsReportPolling(false);
      push("error", "El reporte falló. Intenta de nuevo.");
    }
  }, [latestReport?.id, latestReport?.parse_status, isReportPolling, push]);

  const stage1Status: StageStatus =
    questionnaireProgress &&
    questionnaireProgress.filled >= questionnaireProgress.total &&
    questionnaireProgress.total > 0
      ? "done"
      : "active";

  const hasBenchmark = latestResult?.status === "done";
  const hasIros      = irosStatus === "done" && iros.length > 0;
  const hasNis       = nisRows.length > 0;
  const hasReport    = latestReport?.parse_status === "ok";

  const stage2Status: StageStatus = hasBenchmark
    ? "done"
    : stage1Status === "done"
    ? "active"
    : "pending";

  const stage3Status: StageStatus = hasIros
    ? "done"
    : hasBenchmark
    ? "active"
    : "pending";

  const stage4Status: StageStatus = hasNis
    ? "done"
    : hasIros
    ? "active"
    : "pending";

  const stage5Status: StageStatus = hasReport
    ? "done"
    : hasIros
    ? "active"
    : "pending";

  if (loadingBenchmark) {
    return (
      <div className="py-6">
        <SkeletonList />
      </div>
    );
  }

  return (
    <div className="space-y-6 py-4">
      {/* ── Stepper header ── */}
      <div className="flex items-center gap-2 pb-4 border-b border-slate-100 flex-wrap">
        <StageIndicator number={1} label="Contexto"  status={stage1Status} />
        <div className="w-6 h-px bg-slate-200 shrink-0" aria-hidden />
        <StageIndicator number={2} label="Benchmark" status={stage2Status} />
        <div className="w-6 h-px bg-slate-200 shrink-0" aria-hidden />
        <StageIndicator number={3} label="IROs"      status={stage3Status} />
        <div className="w-6 h-px bg-slate-200 shrink-0" aria-hidden />
        <StageIndicator number={4} label="NIS/IBSO"  status={stage4Status} />
        <div className="w-6 h-px bg-slate-200 shrink-0" aria-hidden />
        <StageIndicator number={5} label="Reporte"   status={stage5Status} />
      </div>

      {/* ── Etapa 1 ── */}
      <section aria-labelledby="stage-contexto">
        <h2 id="stage-contexto" className="sr-only">Contexto del cliente</h2>
        <ContextoSection
          progress={questionnaireProgress}
          onGoToCuestionario={onGoToCuestionario}
        />
      </section>

      {/* ── Etapa 2 ── */}
      <section aria-labelledby="stage-benchmark">
        <h2 id="stage-benchmark" className="sr-only">Benchmark competitivo</h2>
        <BenchmarkSection
          clientId={clientId}
          clientName={clientName}
          companies={companies}
          latestResult={latestResult}
          onDataMutate={() => mutateBenchmark()}
          isPolling={isPolling}
          onStartPolling={() => {
            pollingStartId.current = latestResult?.id ?? null;
            setIsPolling(true);
            void mutateBenchmark();
          }}
        />
      </section>

      {/* ── Etapa 3 — IROs del cliente ── */}
      <section aria-labelledby="stage-iros">
        <h2 id="stage-iros" className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">
          Inventario de IROs
        </h2>
        <IroSection
          clientId={clientId}
          iros={iros}
          status={irosStatus}
          isPolling={isIroPolling}
          hasBenchmark={hasBenchmark}
          onMutate={() => void mutateIros()}
          onStartPolling={() => {
            pollingNotifiedIro.current = false;
            setIsIroPolling(true);
            void mutateIros();
          }}
        />
      </section>

      {/* ── Etapa 4 — NIS / IBSO ── */}
      <section aria-labelledby="stage-nis">
        <h2 id="stage-nis" className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">
          NIS / IBSO — Brechas de información
        </h2>
        <NisSection
          clientId={clientId}
          nisRows={nisRows}
          onMutate={() => void mutateNis()}
        />
      </section>

      {/* ── Etapa 5 — Reporte ── */}
      <section aria-labelledby="stage-reporte">
        <h2 id="stage-reporte" className="sr-only">Reporte de Doble Materialidad</h2>
        <ReporteSection
          clientId={clientId}
          clientName={clientName}
          latestResult={latestResult}
          latestReport={latestReport}
          onReportMutate={() => mutateReport()}
          isReportPolling={isReportPolling}
          onStartReportPolling={() => {
            pollingStartReportId.current = latestReport?.id ?? null;
            setIsReportPolling(true);
            void mutateReport();
          }}
        />
      </section>
    </div>
  );
}
