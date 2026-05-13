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
import { EmpresaCard } from "./EmpresaCard";
import { ManualAddEmpresaForm } from "./ManualAddEmpresaForm";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

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

  const rec      = resp?.data ?? null;
  const proposed = useMemo(() => (rec?.proposed_companies ?? []) as BenchmarkEmpresa[], [rec]);
  const enabledDB = useMemo(() => (rec?.enabled_companies ?? []) as string[], [rec]);
  const omitted  = useMemo(() => (rec?.omitted_criteria ?? []) as BenchmarkEmpresaCriterio[], [rec]);
  const status   = rec?.generation_status ?? "idle";

  const [localEnabled, setLocalEnabled] = useState<string[]>(enabledDB);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza estado local cuando enabledDB cambia desde el servidor (SWR refetch)
  useEffect(() => setLocalEnabled(enabledDB), [enabledDB]);

  const isDirty = useMemo(() => {
    const a = [...localEnabled].sort().join(",");
    const b = [...enabledDB].sort().join(",");
    return a !== b;
  }, [localEnabled, enabledDB]);

  const [showManualForm, setShowManualForm] = useState(false);
  const [saving, setSaving]                 = useState(false);
  const [generating, setGenerating]         = useState(false);
  const [searchingUrls, setSearchingUrls]   = useState(false);

  const noUrlCount = useMemo(
    () => proposed.filter((c) => !c.reporte_url).length,
    [proposed]
  );

  const byCriterio = useMemo(() => {
    const map: Partial<Record<BenchmarkEmpresaCriterio, BenchmarkEmpresa[]>> = {};
    for (const c of proposed) {
      if (!map[c.criterio]) map[c.criterio] = [];
      map[c.criterio]!.push(c);
    }
    return map;
  }, [proposed]);

  const handleToggle = (companyId: string) =>
    setLocalEnabled((prev) =>
      prev.includes(companyId)
        ? prev.filter((x) => x !== companyId)
        : [...prev, companyId]
    );

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

  const handleSearchUrls = async () => {
    setSearchingUrls(true);
    try {
      const r = await fetch(key, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "search_urls" }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: "Error desconocido" }));
        throw new Error((err as { error?: string }).error ?? "Error al buscar URLs");
      }
      const result = await r.json() as { data: { updated: number; total: number } };
      await mutate();
      onDataMutate?.();
      const { updated, total } = result.data;
      if (updated === 0) {
        push("info", `Búsqueda completada — no se encontraron URLs verificables para las ${total} empresas. Agrégalas manualmente.`);
      } else {
        push("success", `${updated} de ${total} URL${updated !== 1 ? "s" : ""} encontrada${updated !== 1 ? "s" : ""} y verificada${updated !== 1 ? "s" : ""}.`);
      }
    } catch (e) {
      push("error", e instanceof Error ? e.message : "Error al buscar URLs.");
    } finally {
      setSearchingUrls(false);
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

  if (resp === undefined) {
    return <div className="h-20 bg-slate-50 animate-pulse rounded" aria-label="Cargando" role="status" />;
  }

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
        {noUrlCount > 0 && (
          <button
            type="button"
            onClick={() => void handleSearchUrls()}
            disabled={searchingUrls || generating}
            title={`${noUrlCount} empresa${noUrlCount !== 1 ? "s" : ""} sin URL — buscar con IA`}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {searchingUrls ? (
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden>
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            )}
            {searchingUrls ? "Buscando URLs…" : `Buscar URLs (${noUrlCount})`}
          </button>
        )}
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
        <span className="text-xs text-slate-400 font-medium">
          {proposed.length} empresa{proposed.length !== 1 ? "s" : ""}
        </span>
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

      {showManualForm && (
        <ManualAddEmpresaForm
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
              {isOmitted && companies.length === 0 && (
                <div className="flex items-center gap-2 px-4 py-2.5 border border-slate-100 rounded opacity-50 mb-2">
                  <svg className="w-3.5 h-3.5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                  <span className="text-xs text-slate-400">Criterio identificado como no aplicable al sector/perfil del cliente.</span>
                </div>
              )}
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
