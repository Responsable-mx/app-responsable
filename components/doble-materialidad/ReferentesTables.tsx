"use client";

import { useState } from "react";
import type { TopicRaw, TopicGrouped } from "@/lib/dm/referentes-types";

// ── Coverage score ────────────────────────────────────────────────────────────

export function CoverageScore({ score, note }: { score: number; note?: string | null }) {
  const pct = Math.round((score / 10) * 100);
  const color = score >= 8 ? "bg-emerald-500" : score >= 6 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="border-l-4 border-l-brand-primary pl-3 py-1 bg-slate-50 rounded-sm flex items-center gap-4">
      <div className="shrink-0">
        <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Cobertura IA</p>
        <p className="text-2xl font-bold text-slate-900 leading-none tabular-nums">
          {score.toFixed(1)}<span className="text-sm font-normal text-slate-500">/10</span>
        </p>
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

// ── Topics raw table ──────────────────────────────────────────────────────────

export function TopicsRawTable({ topics }: { topics: TopicRaw[] }) {
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
          <p className="text-xs text-slate-400 text-center py-4">Sin resultados para &quot;{filter}&quot;</p>
        )}
      </div>
    </div>
  );
}

// ── Topics grouped table ──────────────────────────────────────────────────────

export function TopicsGroupedTable({ topics }: { topics: TopicGrouped[] }) {
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

// ── CSV export ────────────────────────────────────────────────────────────────

export function exportReferentesCSV(raw: TopicRaw[], grouped: TopicGrouped[], clientName: string) {
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
