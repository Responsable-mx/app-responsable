"use client";

import { useState, useEffect, useMemo } from "react";
import useSWR from "swr";
import { useToast } from "@/components/ui/Toast";
import type {
  BenchmarkEmpresasData,
  BenchmarkEmpresa,
  BenchmarkEmpresaCriterio,
} from "@/lib/dm/benchmark-empresas-types";
import { CRITERIO_LABELS, CRITERIO_ORDER } from "@/lib/dm/benchmark-empresas-types";

// ── Fetcher ───────────────────────────────────────────────────────────────────

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

// ── Metodología badge colors ──────────────────────────────────────────────────

const METHOD_COLORS: Record<string, string> = {
  GRI:   "bg-emerald-50 text-emerald-700 border border-emerald-200",
  SASB:  "bg-blue-50 text-blue-700 border border-blue-200",
  TCFD:  "bg-violet-50 text-violet-700 border border-violet-200",
  CSRD:  "bg-orange-50 text-orange-700 border border-orange-200",
  IPIECA:"bg-amber-50 text-amber-700 border border-amber-200",
};

function MethodBadge({ methods }: { methods: string[] }) {
  if (methods.length === 1) {
    const m = methods[0]!;
    const cls = METHOD_COLORS[m] ?? "bg-slate-50 text-slate-600 border border-slate-200";
    return (
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[9px] font-bold ${cls}`}>
        {m}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[9px] font-bold bg-violet-50 text-violet-700 border border-violet-200">
      {methods.join(" + ")}
    </span>
  );
}

// ── Company card ──────────────────────────────────────────────────────────────

function EmpresaCard({
  empresa,
  selected,
  onToggle,
  onUpdate,
}: {
  empresa: BenchmarkEmpresa;
  selected: boolean;
  onToggle: () => void;
  onUpdate: (id: string, reporte_url: string | null) => Promise<void>;
}) {
  const [expanded, setExpanded]     = useState(false);
  const [editingUrl, setEditingUrl] = useState(false);
  const [urlDraft, setUrlDraft]     = useState(empresa.reporte_url ?? "");
  const [saving, setSaving]         = useState(false);

  const hasJustification = !!empresa.justificacion;
  const longJust = hasJustification && empresa.justificacion!.length > 180;

  const handleSaveUrl = async () => {
    setSaving(true);
    try {
      await onUpdate(empresa.id, urlDraft.trim() || null);
      setEditingUrl(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={`bg-white border border-slate-200 rounded shadow-sm mb-2 px-4 py-3 transition-all ${
        selected ? "border-l-4 border-l-teal-600" : "border-l-4 border-l-transparent"
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Seleccionar ${empresa.nombre}`}
          className="mt-1 h-3.5 w-3.5 rounded-sm accent-teal-600 cursor-pointer shrink-0"
        />
        <div className="flex-1 min-w-0">
          {/* Row 1: nombre + país + link + metodología + edit */}
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <span className="font-semibold text-slate-800 text-sm">{empresa.nombre}</span>
              <span className="text-xs text-slate-400 font-medium">{empresa.pais}</span>
              {empresa.reporte_url && !editingUrl && (
                <a
                  href={empresa.reporte_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Ver informe de sostenibilidad"
                  className="shrink-0"
                >
                  <svg className="w-3 h-3 text-slate-400 hover:text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              )}
              <MethodBadge methods={empresa.metodologia} />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {empresa.reporte_url && !editingUrl && (
                <a
                  href={empresa.reporte_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[11px] text-teal-600 hover:text-teal-800 font-medium"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Informe
                </a>
              )}
              {/* Edit URL button */}
              {!editingUrl && (
                <button
                  type="button"
                  onClick={() => { setUrlDraft(empresa.reporte_url ?? ""); setEditingUrl(true); }}
                  title="Editar URL del informe"
                  className="p-0.5 text-slate-300 hover:text-slate-500 transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Inline URL editor */}
          {editingUrl && (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="url"
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                placeholder="https://... (dejar vacío para quitar)"
                className="flex-1 min-w-0 px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSaveUrl();
                  if (e.key === "Escape") setEditingUrl(false);
                }}
              />
              <button
                type="button"
                onClick={() => void handleSaveUrl()}
                disabled={saving}
                className="px-2 py-1 bg-teal-600 text-white text-[10px] font-bold rounded hover:bg-teal-700 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {saving ? "…" : "Guardar"}
              </button>
              <button
                type="button"
                onClick={() => setEditingUrl(false)}
                className="px-2 py-1 border border-slate-200 text-slate-400 text-[10px] rounded hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
            </div>
          )}

          {/* Row 2: subsector */}
          {empresa.subsector && (
            <div className="text-[11px] text-slate-400 mt-0.5">{empresa.subsector}</div>
          )}
          {/* Row 3: justificación */}
          {hasJustification && (
            <div className="mt-2">
              <p className={`text-xs text-slate-500 leading-relaxed ${longJust && !expanded ? "line-clamp-2" : ""}`}>
                {empresa.justificacion}
              </p>
              {longJust && (
                <button
                  type="button"
                  onClick={() => setExpanded((x) => !x)}
                  className="text-[11px] text-teal-600 hover:text-teal-800 font-medium mt-1"
                >
                  {expanded ? "Ver menos" : "Ver más"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Manual add form ───────────────────────────────────────────────────────────

const METODOLOGIAS = ["GRI","SASB","TCFD","CSRD","IPIECA","GBGC","OTRO"];

function ManualAddForm({
  onAdd,
  onCancel,
}: {
  onAdd: (data: Omit<BenchmarkEmpresa, "id" | "justificacion">) => Promise<void>;
  onCancel: () => void;
}) {
  const [nombre, setNombre]     = useState("");
  const [pais, setPais]         = useState("");
  const [url, setUrl]           = useState("");
  const [methods, setMethods]   = useState<string[]>(["GRI"]);
  const [criterio, setCriterio] = useState<BenchmarkEmpresaCriterio>("competidores_directos");
  const [subsector, setSubsector] = useState("");
  const [saving, setSaving]     = useState(false);

  const valid = nombre.trim().length > 0 && pais.trim().length > 0 && methods.length > 0;

  const toggleMethod = (m: string) =>
    setMethods((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    try {
      await onAdd({
        nombre: nombre.trim(),
        pais: pais.trim(),
        reporte_url: url.trim() || null,
        metodologia: methods,
        criterio,
        subsector: subsector.trim() || null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border border-slate-200 rounded bg-slate-50/60 px-4 py-4 mb-4 space-y-3">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Agregar empresa manualmente</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Nombre *</label>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Empresa S.A."
            className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">País *</label>
          <input
            value={pais}
            onChange={(e) => setPais(e.target.value)}
            placeholder="México"
            className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">URL informe (opcional)</label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            type="url"
            className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Subsector (opcional)</label>
          <input
            value={subsector}
            onChange={(e) => setSubsector(e.target.value)}
            placeholder="Refinación / Downstream"
            className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
          />
        </div>
      </div>
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Criterio</label>
        <select
          value={criterio}
          onChange={(e) => setCriterio(e.target.value as BenchmarkEmpresaCriterio)}
          className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
        >
          {CRITERIO_ORDER.map((c) => (
            <option key={c} value={c}>{CRITERIO_LABELS[c]}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Metodología(s) *</label>
        <div className="flex flex-wrap gap-1.5">
          {METODOLOGIAS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => toggleMethod(m)}
              className={`px-2 py-0.5 rounded-sm text-[10px] font-bold border transition-colors ${
                methods.includes(m)
                  ? "bg-teal-600 text-white border-teal-600"
                  : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={!valid || saving}
          className="px-3 py-1.5 bg-brand-primary text-white text-xs font-semibold rounded hover:bg-brand-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "Agregando…" : "Agregar empresa"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 border border-slate-200 text-slate-500 text-xs font-medium rounded hover:bg-slate-50 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type Props = {
  clientId: string;
  onDataMutate?: () => void;
};

export function BenchmarkEmpresasSection({ clientId, onDataMutate }: Props) {
  const key = `/api/clients/${clientId}/dm-benchmark-empresas`;
  const { data: resp, mutate } = useSWR<{ data: BenchmarkEmpresasData | null }>(
    key, fetcher, { revalidateOnFocus: false }
  );
  const { push } = useToast();

  const rec         = resp?.data ?? null;
  const proposed    = useMemo(() => (rec?.proposed_companies ?? []) as BenchmarkEmpresa[], [rec]);
  const enabledDB   = useMemo(() => (rec?.enabled_companies ?? []) as string[], [rec]);
  const omitted     = useMemo(() => (rec?.omitted_criteria ?? []) as BenchmarkEmpresaCriterio[], [rec]);
  const status      = rec?.generation_status ?? "idle";

  const [localEnabled, setLocalEnabled] = useState<string[]>(enabledDB);
  useEffect(() => setLocalEnabled(enabledDB), [enabledDB]);

  const isDirty = useMemo(() => {
    const a = [...localEnabled].sort().join(",");
    const b = [...enabledDB].sort().join(",");
    return a !== b;
  }, [localEnabled, enabledDB]);

  const [showManualForm, setShowManualForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Group by criterion
  const byCriterio = useMemo(() => {
    const map: Partial<Record<BenchmarkEmpresaCriterio, BenchmarkEmpresa[]>> = {};
    for (const c of proposed) {
      if (!map[c.criterio]) map[c.criterio] = [];
      map[c.criterio]!.push(c);
    }
    return map;
  }, [proposed]);

  const handleToggle = (companyId: string) => {
    setLocalEnabled((prev) =>
      prev.includes(companyId)
        ? prev.filter((x) => x !== companyId)
        : [...prev, companyId]
    );
  };

  const handleSaveEnabled = async () => {
    setSaving(true);
    try {
      const r = await fetch(key, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled_companies: localEnabled }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await mutate();
      onDataMutate?.();
      push("success", `${localEnabled.length} empresa${localEnabled.length !== 1 ? "s" : ""} guardada${localEnabled.length !== 1 ? "s" : ""}.`);
    } catch {
      push("error", "Error al guardar. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const r = await fetch(key, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate" }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: "Error desconocido" }));
        throw new Error((err as { error?: string }).error ?? "Error IA");
      }
      await mutate();
      onDataMutate?.();
      push("success", "Lista de empresas generada. Valida las que usarás en el benchmark.");
    } catch (e) {
      push("error", e instanceof Error ? e.message : "Error al generar.");
    } finally {
      setGenerating(false);
    }
  };

  const handleAddManual = async (data: Omit<BenchmarkEmpresa, "id" | "justificacion">) => {
    const r = await fetch(key, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add_company", ...data }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: "Error desconocido" }));
      throw new Error((err as { error?: string }).error ?? "Error al agregar");
    }
    await mutate();
    onDataMutate?.();
    setShowManualForm(false);
    push("success", `"${data.nombre}" agregada y seleccionada.`);
  };

  const handleUpdateUrl = async (companyId: string, reporte_url: string | null) => {
    const r = await fetch(key, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_company", id: companyId, reporte_url }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: "Error desconocido" }));
      throw new Error((err as { error?: string }).error ?? "Error al actualizar");
    }
    await mutate();
    onDataMutate?.();
  };

  const selectAll = () => setLocalEnabled(proposed.map((c) => c.id));
  const clearAll  = () => setLocalEnabled([]);

  const isLoading = resp === undefined;

  if (isLoading) {
    return <div className="h-20 bg-slate-50 animate-pulse rounded" aria-label="Cargando" role="status" />;
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  if (status === "idle" || status === "failed") {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
        <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
        <p className="text-sm text-slate-500 max-w-xs">
          La IA propondrá empresas de referencia según el sector y contexto del cliente. El consultor valida cuáles entrarán al benchmark.
        </p>
        {status === "failed" && (
          <p className="text-xs text-rose-600 font-medium">La generación anterior falló. Intenta de nuevo.</p>
        )}
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-white text-sm font-semibold rounded hover:bg-brand-primary-dark disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {generating ? (
            <>
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden>
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Generando empresas…
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Generar lista con IA
            </>
          )}
        </button>
      </div>
    );
  }

  // ── Generating spinner ─────────────────────────────────────────────────────
  if (status === "generating") {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3">
        <svg className="w-6 h-6 animate-spin text-teal-600" fill="none" viewBox="0 0 24 24" aria-hidden>
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        <p className="text-sm text-slate-500">Identificando empresas de referencia…</p>
        <p className="text-xs text-slate-400">Puede tomar hasta 90 segundos</p>
      </div>
    );
  }

  // ── Done: company list ─────────────────────────────────────────────────────
  return (
    <div>
      {/* Controls bar */}
      <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-100 flex-wrap">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <svg className={`w-3.5 h-3.5 ${generating ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {generating ? "Regenerando…" : "Regenerar lista IA"}
        </button>
        <button
          type="button"
          onClick={() => setShowManualForm((x) => !x)}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 hover:border-slate-300 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Agregar manualmente
        </button>
        <span className="text-xs text-slate-400 font-medium">{proposed.length} empresa{proposed.length !== 1 ? "s" : ""}</span>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={selectAll} className="text-xs text-teal-600 hover:text-teal-800 font-medium">
            Seleccionar todas
          </button>
          <span className="text-slate-300 text-xs">/</span>
          <button type="button" onClick={clearAll} className="text-xs text-slate-400 hover:text-slate-600">
            Limpiar
          </button>
          <span className="text-xs text-slate-600 font-semibold tabular-nums">
            {localEnabled.length} seleccionada{localEnabled.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Manual add form */}
      {showManualForm && (
        <ManualAddForm
          onAdd={handleAddManual}
          onCancel={() => setShowManualForm(false)}
        />
      )}

      {/* Company list grouped by criterion */}
      <div className="space-y-1">
        {CRITERIO_ORDER.map((criterio) => {
          const isOmitted = omitted.includes(criterio);
          const companies = byCriterio[criterio] ?? [];

          if (companies.length === 0 && !isOmitted) return null;

          return (
            <div key={criterio}>
              {/* Criterion header */}
              <div className={`text-[10px] font-bold uppercase tracking-widest py-3 ${
                isOmitted ? "text-slate-300" : "text-slate-400"
              }`}>
                {CRITERIO_LABELS[criterio]}
                {isOmitted && (
                  <span className="ml-2 text-[9px] normal-case tracking-normal font-medium text-slate-300">
                    — no aplica para este cliente
                  </span>
                )}
              </div>

              {/* Omitted state */}
              {isOmitted && companies.length === 0 && (
                <div className="flex items-center gap-2 px-4 py-2.5 border border-slate-100 rounded opacity-50 mb-2">
                  <svg className="w-3.5 h-3.5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                  <span className="text-xs text-slate-400">Criterio identificado como no aplicable al sector/perfil del cliente.</span>
                </div>
              )}

              {/* Company cards */}
              {companies.map((empresa) => (
                <EmpresaCard
                  key={empresa.id}
                  empresa={empresa}
                  selected={localEnabled.includes(empresa.id)}
                  onToggle={() => handleToggle(empresa.id)}
                  onUpdate={handleUpdateUrl}
                />
              ))}
            </div>
          );
        })}
      </div>

      {/* Save button */}
      {isDirty && (
        <div className="sticky bottom-0 flex justify-end pt-4 pb-1 bg-white/80 backdrop-blur-sm border-t border-slate-100 mt-4">
          <button
            type="button"
            onClick={handleSaveEnabled}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-white text-sm font-semibold rounded hover:bg-brand-primary-dark disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden>
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Guardando…
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Guardar selección ({localEnabled.length})
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
