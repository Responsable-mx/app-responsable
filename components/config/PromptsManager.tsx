"use client";

import { useState } from "react";
import useSWR from "swr";
import { PROMPT_KEYS, PROMPT_LABELS, PROMPT_DESCRIPTIONS } from "@/lib/ai/prompts-public";
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

const GROUPS: { label: string; prefix: string }[] = [
  { label: "SISTEMA", prefix: "system." },
  { label: "ROLES IA", prefix: "role." },
  { label: "DIRECT MESSAGES", prefix: "dm." },
];

export function PromptsManager() {
  const [active, setActive] = useState<PromptKey>("role.aurora");
  const [showHistory, setShowHistory] = useState(false);

  const meta = useSWR<{ data: PromptMeta[] }>("/api/prompts", fetcher);

  const activeDescription = PROMPT_DESCRIPTIONS[active];

  return (
    <div className="flex gap-6 items-start">
      {/* Sidebar de navegación */}
      <nav className="w-48 flex-shrink-0 sticky top-4">
        {meta.error && !meta.data && (
          <p className="text-xs text-rose-700 mb-2">
            Error al cargar.{" "}
            <button onClick={() => void meta.mutate()} className="underline">
              Reintentar
            </button>
          </p>
        )}
        <div className="space-y-4">
          {GROUPS.map((group) => {
            const groupKeys = PROMPT_KEYS.filter((k) =>
              k.startsWith(group.prefix),
            );
            return (
              <div key={group.prefix}>
                <p className="uppercase tracking-widest text-[10px] font-bold text-slate-400 px-2 mb-1">
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {groupKeys.map((k) => {
                    const m = meta.data?.data.find((x) => x.key === k);
                    const isActive = active === k;
                    return (
                      <button
                        key={k}
                        onClick={() => {
                          setActive(k);
                          setShowHistory(false);
                        }}
                        className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-sm text-left transition-colors ${
                          isActive
                            ? "bg-white border border-slate-200 text-slate-900 shadow-sm font-medium"
                            : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                        }`}
                      >
                        <span className="truncate">{PROMPT_LABELS[k]}</span>
                        {m?.has_override && (
                          <span className="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-sm flex-shrink-0">
                            Custom
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </nav>

      {/* Editor */}
      <div className="flex-1 min-w-0">
        <PromptEditor
          key={active}
          promptKey={active}
          description={activeDescription}
          showHistory={showHistory}
          onToggleHistory={() => setShowHistory((s) => !s)}
          onSaved={() => {
            void meta.mutate();
          }}
        />
      </div>
    </div>
  );
}
