"use client";

import { useState, useCallback, useRef } from "react";
import useSWR from "swr";
import { useToast } from "@/components/ui/Toast";
import type {
  ReferentesData,
  ReferenteFramework,
  TopicRaw,
  TopicGrouped,
} from "@/lib/dm/referentes-types";

// ── Fetcher ───────────────────────────────────────────────────────────────────

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

// ── Sub-step pill bar ─────────────────────────────────────────────────────────

const SUBSTEPS = [
  { id: 1, label: "Referentes propuestos" },
  { id: 2, label: "Tabla de temas"        },
  { id: 3, label: "Temas agrupados"       },
] as const;

type SubStep = (typeof SUBSTEPS)[number]["id"];

function SubStepBar({
  current,
  onChange,
  canStep2,
  canStep3,
}: {
  current: SubStep;
  onChange: (s: SubStep) => void;
  canStep2: boolean;
  canStep3: boolean;
}) {
  return (
    <div className="flex items-center gap-1 mb-5 border-b border-slate-100 pb-3">
      {SUBSTEPS.map((s) => {
        const enabled =
          s.id === 1 || (s.id === 2 && canStep2) || (s.id === 3 && canStep3);
        const active = s.id === current;
        return (
          <button
            key={s.id}
            type="button"
            disabled={!enabled}
            onClick={() => enabled && onChange(s.id)}
            className={`
              text-xs font-semibold px-3 py-1.5 rounded-sm border transition-all
              ${active
                ? "bg-brand-primary text-white border-brand-primary"
                : enabled
                  ? "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  : "bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed"}
            `}
          >
            {s.id}. {s.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Framework card ────────────────────────────────────────────────────────────

function FrameworkCard({
  framework,
  enabled,
  onToggle,
  onUrlSave,
}: {
  framework: ReferenteFramework;
  enabled: boolean;
  onToggle: () => void;
  onUrlSave: (id: string, url: string | null) => Promise<void>;
}) {
  const [editingUrl, setEditingUrl]   = useState(false);
  const [urlDraft, setUrlDraft]       = useState(framework.url ?? "");
  const [savingUrl, setSavingUrl]     = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const openEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setUrlDraft(framework.url ?? "");
    setEditingUrl(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleSaveUrl = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setSavingUrl(true);
    try {
      await onUrlSave(framework.id, urlDraft.trim() || null);
      setEditingUrl(false);
    } finally {
      setSavingUrl(false);
    }
  };

  const cancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingUrl(false);
  };

  return (
    <div
      className={`
        border rounded p-3 transition-all cursor-pointer select-none
        ${enabled
          ? "border-brand-primary bg-brand-primary/5"
          : "border-slate-200 bg-white hover:bg-slate-50"}
      `}
      onClick={onToggle}
      role="checkbox"
      aria-checked={enabled}
      tabIndex={0}
      onKeyDown={(e) => (e.key === " " || e.key === "Enter") && onToggle()}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`
              w-4 h-4 rounded-sm border-2 flex items-center justify-center shrink-0 mt-0.5
              ${enabled ? "bg-brand-primary border-brand-primary" : "border-slate-300"}
            `}
          >
            {enabled && (
              <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </div>
          <div className="min-w-0">
            <p className={`text-xs font-bold ${enabled ? "text-brand-primary" : "text-slate-700"}`}>
              {framework.name}
            </p>
            {framework.sector_note && (
              <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">{framework.sector_note}</p>
            )}
          </div>
        </div>

        {/* URL area — view or edit */}
        {editingUrl ? (
          <div
            className="flex items-center gap-1 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              type="url"
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSaveUrl(e as unknown as React.MouseEvent);
                if (e.key === "Escape") setEditingUrl(false);
              }}
              placeholder="https://..."
              className="font-sans text-[10px] border border-slate-300 rounded px-2 py-1 w-48 focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
            />
            <button
              type="button"
              onClick={(e) => void handleSaveUrl(e)}
              disabled={savingUrl}
              className="text-[10px] font-semibold text-brand-primary hover:text-brand-primary-dark disabled:opacity-50 px-1"
            >
              {savingUrl ? "…" : "OK"}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              className="text-[10px] text-slate-400 hover:text-slate-600 px-1"
            >
              ✕
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1 shrink-0">
            {framework.url ? (
              <a
                href={framework.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-[10px] text-brand-primary underline hover:text-brand-primary-dark"
              >
                Ver →
              </a>
            ) : (
              <span
                title="La IA no pudo verificar la URL oficial de este referente."
                className="inline-flex items-center gap-1 text-[10px] text-slate-400 italic"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                Sin URL
              </span>
            )}
            <button
              type="button"
              onClick={openEdit}
              title="Editar URL"
              className="p-0.5 rounded text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors"
              aria-label="Editar URL del referente"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          </div>
        )}
      </div>
      <p className="text-xs text-slate-600 mt-2 leading-snug">{framework.description}</p>
    </div>
  );
}

// ── Coverage score bar ────────────────────────────────────────────────────────

function CoverageScore({ score, note }: { score: number; note?: string | null }) {
  const pct = Math.round((score / 10) * 100);
  const color = score >= 8 ? "bg-emerald-500" : score >= 6 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="border-l-4 border-l-brand-primary pl-3 py-1 bg-slate-50 rounded-sm flex items-center gap-4">
      <div className="shrink-0">
        <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Cobertura IA</p>
        <p className="text-2xl font-bold text-slate-900 leading-none tabular-nums">{score.toFixed(1)}<span className="text-sm font-normal text-slate-500">/10</span></p>
      </div>
      <div className="flex-1 min-w-0">
        <div className="h-1 bg-slate-200 overflow-hidden mb-1.5">
          <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
        </div>
        {note && <p className="text-xs text-slate-600 leading-snug">{note}</p>}
      </div>
    </div>
  );
}

// ── Topics table ──────────────────────────────────────────────────────────────

function TopicsRawTable({ topics }: { topics: TopicRaw[] }) {
  const [filter, setFilter] = useState("");
  const filtered = filter
    ? topics.filter(
        (t) =>
          t.tema.toLowerCase().includes(filter.toLowerCase()) ||
          t.referente.toLowerCase().includes(filter.toLowerCase()) ||
          t.descripcion.toLowerCase().includes(filter.toLowerCase())
      )
    : topics;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">
          {topics.length} temas identificados
        </p>
        <input
          type="text"
          placeholder="Filtrar..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="text-xs border border-slate-200 rounded-sm px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 w-40"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-max min-w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {["Tema", "Subtema", "Descripción", "Referente"].map((h) => (
                <th
                  key={h}
                  className="text-left px-3 py-2 text-[10px] uppercase tracking-widest font-bold text-slate-400 whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((t, i) => (
              <tr
                key={i}
                className={`border-b border-slate-100 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/50"} hover:bg-brand-primary/5`}
              >
                <td className="px-3 py-2 font-medium text-slate-800 whitespace-nowrap max-w-[180px] truncate">{t.tema}</td>
                <td className="px-3 py-2 text-slate-600 whitespace-nowrap max-w-[160px] truncate">{t.subtema ?? "—"}</td>
                <td className="px-3 py-2 text-slate-700 max-w-[400px]">{t.descripcion}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm bg-slate-100 text-[10px] font-semibold text-slate-600">
                    {t.referente}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-4">Sin resultados para "{filter}"</p>
        )}
      </div>
    </div>
  );
}

function TopicsGroupedTable({ topics }: { topics: TopicGrouped[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-max min-w-full text-xs border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            {["Tema consolidado", "Descripción consolidada", "Referentes"].map((h) => (
              <th
                key={h}
                className="text-left px-3 py-2 text-[10px] uppercase tracking-widest font-bold text-slate-400 whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {topics.map((t, i) => (
            <tr
              key={i}
              className={`border-b border-slate-100 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/50"} hover:bg-brand-primary/5`}
            >
              <td className="px-3 py-2 font-medium text-slate-800 w-[220px] min-w-[180px] align-top break-words">{t.tema_consolidado}</td>
              <td className="px-3 py-2 text-slate-700 max-w-[480px] align-top">{t.descripcion_consolidada}</td>
              <td className="px-3 py-2 align-top">
                <div className="flex flex-wrap gap-1">
                  {t.referentes.map((r) => (
                    <span key={r} className="inline-flex items-center px-1.5 py-0.5 rounded-sm bg-brand-primary/10 text-[10px] font-semibold text-brand-primary">
                      {r}
                    </span>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Excel export ──────────────────────────────────────────────────────────────

function exportToExcel(raw: TopicRaw[], grouped: TopicGrouped[], clientName: string) {
  // CSV doble hoja simulado como un solo archivo con separador de sección.
  // Para Excel real se necesitaría SheetJS (no instalado) — exportar como CSV por ahora.
  const rawRows = [
    ["Tema", "Subtema", "Descripción", "Referente"],
    ...raw.map((t) => [t.tema, t.subtema ?? "", t.descripcion, t.referente]),
  ];
  const groupedRows = [
    ["Tema consolidado", "Descripción consolidada", "Referentes"],
    ...grouped.map((t) => [t.tema_consolidado, t.descripcion_consolidada, t.referentes.join(", ")]),
  ];

  const toCSV = (rows: string[][]) =>
    rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");

  const content = `TABLA DE TEMAS (fuentes originales)\n${toCSV(rawRows)}\n\nTEMAS AGRUPADOS (consolidado)\n${toCSV(groupedRows)}`;
  const blob    = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8;" });
  const url     = URL.createObjectURL(blob);
  const a       = document.createElement("a");
  a.href        = url;
  a.download    = `referentes-sostenibilidad-${clientName.replace(/\s+/g, "-").toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Componente principal ──────────────────────────────────────────────────────

export function ReferentesSection({
  clientId,
  clientName,
  onDataMutate,
}: {
  clientId: string;
  clientName: string;
  onDataMutate?: () => void;
}) {
  const key = `/api/clients/${clientId}/dm-referentes`;
  const { data: resp, mutate } = useSWR<{ data: ReferentesData | null }>(key, fetcher, {
    revalidateOnFocus: false,
  });

  const rec = resp?.data;
  const { push } = useToast();

  const [subStep, setSubStep]             = useState<SubStep>(1);
  const [loadingFW, setLoadingFW]         = useState(false);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [loadingSearchUrls, setLoadingSearchUrls] = useState(false);
  // Local toggle state — sincroniza con DB en blur/confirm
  const [localEnabled, setLocalEnabled] = useState<string[] | null>(null);

  const enabledFW = localEnabled ?? rec?.enabled_frameworks ?? [];

  const handleToggle = useCallback(
    (id: string) => {
      const current = localEnabled ?? rec?.enabled_frameworks ?? [];
      setLocalEnabled(
        current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
      );
    },
    [localEnabled, rec?.enabled_frameworks]
  );

  const handleSaveEnabled = useCallback(async () => {
    if (!localEnabled) return;
    const res = await fetch(key, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled_frameworks: localEnabled }),
    });
    if (!res.ok) {
      push("error", "Error al guardar la selección");
      return;
    }
    setLocalEnabled(null);
    await mutate();
    onDataMutate?.();
  }, [localEnabled, key, mutate, onDataMutate, push]);

  const handleGenerateFrameworks = useCallback(async () => {
    setLoadingFW(true);
    try {
      const res = await fetch(key, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate_frameworks" }),
      });
      if (!res.ok) {
        push("error", "Error al generar referentes");
        return;
      }
      await mutate();
      onDataMutate?.();
    } finally {
      setLoadingFW(false);
    }
  }, [key, mutate, onDataMutate, push]);

  const handleSearchUrls = useCallback(async () => {
    setLoadingSearchUrls(true);
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
        push("info", `Búsqueda completada — no se encontraron URLs verificables para los ${total} referentes.`);
      } else {
        push("success", `${updated} de ${total} URL${updated !== 1 ? "s" : ""} encontrada${updated !== 1 ? "s" : ""} y verificada${updated !== 1 ? "s" : ""}.`);
      }
    } catch (e) {
      push("error", e instanceof Error ? e.message : "Error al buscar URLs.");
    } finally {
      setLoadingSearchUrls(false);
    }
  }, [key, mutate, onDataMutate, push]);

  const handleUrlSave = useCallback(async (frameworkId: string, url: string | null) => {
    const res = await fetch(key, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_framework", id: frameworkId, url }),
    });
    if (!res.ok) {
      push("error", "Error al actualizar la URL");
      return;
    }
    await mutate();
    onDataMutate?.();
  }, [key, mutate, onDataMutate, push]);

  const handleGenerateTopics = useCallback(async () => {
    if (localEnabled) await handleSaveEnabled();
    setLoadingTopics(true);
    try {
      const res = await fetch(key, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate_topics" }),
      });
      if (!res.ok) {
        push("error", "Error al generar tabla de temas");
        return;
      }
      push("success", "Tabla de temas generada.");
      setSubStep(2);
      await mutate();
      onDataMutate?.();
    } finally {
      setLoadingTopics(false);
    }
  }, [handleSaveEnabled, localEnabled, key, mutate, onDataMutate, push]);

  const proposed    = rec?.proposed_frameworks ?? [];
  const noUrlCount  = proposed.filter((fw) => !fw.url).length;
  const hasTopics   = (rec?.topics_raw ?? []).length > 0;
  const hasGrouped  = (rec?.topics_grouped ?? []).length > 0;

  const selectAll = () => setLocalEnabled(proposed.map((fw) => fw.id));
  const clearAll  = () => setLocalEnabled([]);

  return (
    <div>
      <SubStepBar
        current={subStep}
        onChange={setSubStep}
        canStep2={hasTopics}
        canStep3={hasGrouped}
      />

      {/* ── Sub-step 1: Referentes propuestos ── */}
      {subStep === 1 && (
        <div>
          {/* Banner IA */}
          <div className="flex items-start gap-3 px-4 py-3 bg-slate-50 border border-slate-200 rounded mb-4">
            <svg className="w-4 h-4 mt-0.5 text-brand-primary shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
            </svg>
            <p className="text-xs text-slate-700">
              La IA analiza el sector del cliente y propone los marcos de sostenibilidad aplicables. Activa o desactiva cada uno antes de generar la tabla de temas.
            </p>
          </div>

          {/* Estado: sin datos todavía */}
          {proposed.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <svg className="w-10 h-10 text-slate-200 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
              </svg>
              <p className="text-sm text-slate-500 mb-4">
                La IA aún no ha propuesto referentes para este cliente.
              </p>
              <button
                type="button"
                onClick={handleGenerateFrameworks}
                disabled={loadingFW}
                className="inline-flex items-center gap-2 bg-brand-primary text-white text-xs font-semibold py-2 px-4 rounded hover:bg-brand-primary-dark transition-colors disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
              >
                {loadingFW ? (
                  <>
                    <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" /></svg>
                    Analizando sector...
                  </>
                ) : (
                  <>
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
                    Proponer referentes con IA
                  </>
                )}
              </button>
            </div>
          )}

          {/* Lista de frameworks propuestos */}
          {proposed.length > 0 && (
            <>
              {/* Controls bar */}
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                {noUrlCount > 0 && (
                  <button
                    type="button"
                    onClick={() => void handleSearchUrls()}
                    disabled={loadingSearchUrls}
                    title={`${noUrlCount} referente${noUrlCount !== 1 ? "s" : ""} sin URL — buscar con IA`}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {loadingSearchUrls ? (
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden>
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    )}
                    {loadingSearchUrls ? "Buscando URLs…" : `Buscar URLs (${noUrlCount})`}
                  </button>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <button type="button" onClick={selectAll} className="text-xs text-teal-600 hover:text-teal-800 font-medium">
                    Seleccionar todas
                  </button>
                  <span className="text-slate-300 text-xs">/</span>
                  <button type="button" onClick={clearAll} className="text-xs text-slate-400 hover:text-slate-600">
                    Limpiar
                  </button>
                  <span className="text-xs text-slate-600 font-semibold tabular-nums">
                    {enabledFW.length} seleccionado{enabledFW.length !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                {proposed.map((fw) => (
                  <FrameworkCard
                    key={fw.id}
                    framework={fw}
                    enabled={enabledFW.includes(fw.id)}
                    onToggle={() => handleToggle(fw.id)}
                    onUrlSave={handleUrlSave}
                  />
                ))}
              </div>

              {/* Acciones */}
              <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleGenerateFrameworks}
                    disabled={loadingFW}
                    className="text-xs text-slate-500 hover:text-slate-700 underline disabled:opacity-50"
                  >
                    {loadingFW ? "Regenerando..." : "Regenerar propuesta IA"}
                  </button>
                  {localEnabled && localEnabled.length > 0 && (
                    <button
                      type="button"
                      onClick={handleSaveEnabled}
                      className="text-xs text-brand-primary hover:text-brand-primary-dark underline"
                    >
                      Guardar selección
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleGenerateTopics}
                  disabled={loadingTopics || enabledFW.length === 0}
                  className="inline-flex items-center gap-2 bg-brand-primary text-white text-xs font-semibold py-2 px-4 rounded hover:bg-brand-primary-dark transition-colors disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
                >
                  {loadingTopics ? (
                    <>
                      <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" /></svg>
                      Generando tabla...
                    </>
                  ) : (
                    <>
                      Generar tabla de temas ({enabledFW.length} referentes)
                      <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Sub-step 2: Tabla de temas (raw) ── */}
      {subStep === 2 && (
        <div>
          {/* Status row */}
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500" aria-hidden="true" />
              <span className="text-xs text-slate-700 font-medium">
                {(rec?.topics_raw ?? []).length} temas identificados · {enabledFW.length} referentes
              </span>
            </div>
            <button
              type="button"
              onClick={handleGenerateTopics}
              disabled={loadingTopics}
              className="text-xs text-slate-500 hover:text-slate-700 underline disabled:opacity-50"
            >
              {loadingTopics ? "Regenerando..." : "Regenerar"}
            </button>
          </div>

          {/* Coverage score */}
          {rec?.coverage_score != null && (
            <div className="mb-4">
              <CoverageScore score={rec.coverage_score} note={rec.coverage_note} />
            </div>
          )}

          {/* Tabla raw */}
          {(rec?.topics_raw ?? []).length > 0 && (
            <TopicsRawTable topics={rec!.topics_raw} />
          )}

          {/* CTA → temas agrupados */}
          {hasTopics && (
            <div className="flex justify-end mt-4 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSubStep(3)}
                className="inline-flex items-center gap-2 bg-brand-primary text-white text-xs font-semibold py-2 px-4 rounded hover:bg-brand-primary-dark transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
              >
                Ver temas agrupados
                <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Sub-step 3: Temas agrupados ── */}
      {subStep === 3 && (
        <div>
          {/* Status row */}
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500" aria-hidden="true" />
              <span className="text-xs text-slate-700 font-medium">
                {(rec?.topics_grouped ?? []).length} grupos temáticos consolidados
              </span>
            </div>
            <button
              type="button"
              onClick={() => exportToExcel(rec?.topics_raw ?? [], rec?.topics_grouped ?? [], clientName)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-primary border border-brand-primary/30 hover:bg-brand-primary/5 px-3 py-1.5 rounded-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Descargar CSV (ambas tablas)
            </button>
          </div>

          {/* Nota IA */}
          {rec?.coverage_note && (
            <div className="border-l-4 border-l-brand-primary pl-3 bg-slate-50 py-2 rounded-sm mb-4">
              <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-0.5">Nota de cobertura IA</p>
              <p className="text-xs text-slate-700">{rec.coverage_note}</p>
            </div>
          )}

          {/* Tabla agrupada */}
          {(rec?.topics_grouped ?? []).length > 0 && (
            <TopicsGroupedTable topics={rec!.topics_grouped} />
          )}
        </div>
      )}
    </div>
  );
}
