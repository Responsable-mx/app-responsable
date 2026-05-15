"use client";

import { useState, useRef } from "react";
import type { ReferenteFramework } from "@/lib/dm/referentes-types";

const FRAMEWORK_ESG: Record<string, ("E" | "S" | "G")[]> = {
  GRI:      ["E", "S", "G"],
  SASB:     ["E", "S", "G"],
  CSRD:     ["E", "S", "G"],
  ESRS:     ["E", "S", "G"],
  TCFD:     ["E", "G"],
  CDP:      ["E"],
  SBTI:     ["E"],
  IPIECA:   ["E", "S"],
  GHG:      ["E"],
  PRI:      ["E", "S", "G"],
  GRESB:    ["E", "S", "G"],
  TNFD:     ["E"],
  SDG:      ["E", "S", "G"],
  ISO26000: ["E", "S", "G"],
  GCCA:     ["E", "S", "G"],
  IIRC:     ["E", "S", "G"],
};

const ESG_CHIP: Record<"E" | "S" | "G", string> = {
  E: "bg-emerald-50 text-emerald-700 border-emerald-200",
  S: "bg-violet-50 text-violet-700 border-violet-200",
  G: "bg-slate-100 text-slate-600 border-slate-200",
};

function getFrameworkEsg(name: string): ("E" | "S" | "G")[] {
  const key = Object.keys(FRAMEWORK_ESG).find(
    (k) => name.toUpperCase().includes(k) || k.toLowerCase() === name.toLowerCase().split(" ")[0]
  );
  return key ? FRAMEWORK_ESG[key]! : [];
}

type Props = {
  framework: ReferenteFramework;
  enabled: boolean;
  onToggle: () => void;
  onUrlSave: (id: string, url: string | null) => Promise<void>;
};

export function FrameworkCard({ framework, enabled, onToggle, onUrlSave }: Props) {
  const [editingUrl, setEditingUrl] = useState(false);
  const [urlDraft, setUrlDraft]     = useState(framework.url ?? "");
  const [savingUrl, setSavingUrl]   = useState(false);
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
            {(() => {
              const coverage = getFrameworkEsg(framework.name);
              return coverage.length > 0 ? (
                <div className="flex gap-0.5 mt-0.5">
                  {coverage.map((dim) => (
                    <span key={dim} className={`text-[8px] font-bold px-1 py-0 rounded-sm border ${ESG_CHIP[dim]}`}>
                      {dim}
                    </span>
                  ))}
                </div>
              ) : null;
            })()}
            {framework.sector_note && (
              <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">{framework.sector_note}</p>
            )}
          </div>
        </div>

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
