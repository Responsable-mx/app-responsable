"use client";

import { useState } from "react";

/** Celda con texto truncado (3 líneas) + toggle "Ver más / Ver menos" para >140 chars. */
export function ExpandableCell({ text }: { text: string }) {
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
          className="min-h-[24px] inline-flex items-center text-[10px] text-brand-primary hover:underline mt-0.5 focus:outline-none"
        >
          {expanded ? "Ver menos" : "Ver más"}
        </button>
      )}
    </div>
  );
}
