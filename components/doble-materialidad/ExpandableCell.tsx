"use client";

import { useLayoutEffect, useRef, useState } from "react";

type ScoreTier = "sólido" | "parcial" | "brecha";

function detectScore(text: string): ScoreTier | null {
  const t = text.toLowerCase();
  if (/ausencia|brecha|carece|sin reporte|sin meta|no publica|no mide|no tiene|no cuenta/.test(t))
    return "brecha";
  if (/parcial|limitad|sólo |básic|en proceso/.test(t))
    return "parcial";
  if (/iso |certif|ecovadis|gri |scope [12]|mide |sólid|verific|reporta/.test(t))
    return "sólido";
  return null;
}

const SCORE_CLASSES: Record<ScoreTier, string> = {
  sólido: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  parcial: "bg-amber-50 text-amber-700 border border-amber-200",
  brecha:  "bg-rose-50 text-rose-600 border border-rose-200",
};

const NO_DATA_CHIP = (
  <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] bg-slate-100 text-slate-400 border border-slate-200">
    sin datos
  </span>
);

export function ExpandableCell({
  text,
  defaultExpanded = false,
  showScore = true,
}: {
  text: string;
  defaultExpanded?: boolean;
  /** Mostrar chip sólido/parcial/brecha — desactivar en contextos donde el texto no es comparativo (ej. descripciones de IROs) */
  showScore?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [isClamped, setIsClamped] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    if (!expanded && textRef.current) {
      setIsClamped(textRef.current.scrollHeight > textRef.current.clientHeight);
    }
  }, [text, expanded]);

  if (!text || text === "—") return NO_DATA_CHIP;
  if (/^sin datos/i.test(text)) return NO_DATA_CHIP;

  const score = showScore ? detectScore(text) : null;

  return (
    <div>
      {score && (
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-medium mb-1 ${SCORE_CLASSES[score]}`}>
          {score}
        </span>
      )}
      <p ref={textRef} className={`text-slate-600 text-xs leading-relaxed${!expanded ? " line-clamp-3" : ""}`}>
        {text}
      </p>
      {(isClamped || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="min-h-[36px] inline-flex items-center text-[10px] text-slate-400 hover:text-slate-700 mt-0.5 focus:outline-none"
        >
          {expanded ? "Ver menos" : "Ver más"}
        </button>
      )}
    </div>
  );
}
