"use client";

import { useState } from "react";
import useSWR from "swr";
import { PROMPT_KEYS, PROMPT_LABELS } from "@/lib/ai/prompts-public";
import type { PromptKey } from "@/lib/ai/prompts-public";
import { PromptEditor } from "./prompts/PromptEditor";

type PromptMeta = {
  key: PromptKey;
  label: string;
  description: string;
  has_override: boolean;
  updated_by: string | null;
  updated_at: string | null;
};

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

export function PromptsManager() {
  const [active, setActive] = useState<PromptKey>("role.aurora");
  const [showHistory, setShowHistory] = useState(false);

  const meta = useSWR<{ data: PromptMeta[] }>("/api/prompts", fetcher);

  return (
    <div>
      {/* D-73: error state SWR — meta.error silenciado anteriormente */}
      {meta.error && !meta.data && (
        <p className="text-xs text-rose-700 mb-2">
          Error al cargar estado de prompts. Los badges "Custom" no son visibles.{" "}
          <button onClick={() => void meta.mutate()} className="underline">Reintentar</button>
        </p>
      )}
      <div className="flex flex-wrap gap-1 bg-slate-100 p-1 rounded-lg mb-4">
        {PROMPT_KEYS.map((k) => {
          const m = meta.data?.data.find((x) => x.key === k);
          const isActive = active === k;
          return (
            <button
              key={k}
              onClick={() => {
                setActive(k);
                setShowHistory(false);
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                isActive
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span>{PROMPT_LABELS[k]}</span>
              {m?.has_override && (
                <span className="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">
                  Custom
                </span>
              )}
            </button>
          );
        })}
      </div>

      <PromptEditor
        key={active}
        promptKey={active}
        showHistory={showHistory}
        onToggleHistory={() => setShowHistory((s) => !s)}
        onSaved={() => {
          meta.mutate();
        }}
      />
    </div>
  );
}
