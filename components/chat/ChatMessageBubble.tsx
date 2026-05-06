"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  type ChatMessage,
  type RoleId,
  ROLES,
} from "@/components/chat/chat-types";

export type ChatMessageBubbleProps = {
  message: ChatMessage;
  index: number;
  isLastAssistant: boolean;
  streaming: boolean;
  currentRole: (typeof ROLES)[number];
  roles: typeof ROLES;
  copiedIdx: number | null;
  onRate: (idx: number, rating: "up" | "down") => void;
  onCopy: (idx: number, text: string) => void;
  onRetry: () => void;
};

/**
 * Burbuja de un solo mensaje del chat (usuario o asistente IA).
 * Incluye acciones de rating, copia y reintento para mensajes del asistente.
 */
export function ChatMessageBubble({
  message: m,
  index: i,
  isLastAssistant,
  streaming,
  currentRole,
  roles,
  copiedIdx,
  onRate,
  onCopy,
  onRetry,
}: ChatMessageBubbleProps) {
  const isUser = m.role === "user";
  const showActions = !isUser && !!m.content && !streaming;
  const tsLabel = m.ts
    ? new Date(m.ts).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
    : null;
  // Atribución por mensaje. roleId se persiste al enviar; si falta (mensajes
  // legacy o demo precargada) cae al rol activo actual.
  const msgRole = !isUser
    ? roles.find((r) => r.id === m.roleId) ?? currentRole
    : null;

  if (isUser) {
    return (
      <div className="animate-fade-in flex justify-end">
        <div className="max-w-[75%]">
          <div className="flex items-baseline gap-2 mb-1 justify-end">
            <span className="text-xs font-semibold text-slate-700 leading-none">Consultor</span>
            {tsLabel && <span className="text-[10px] text-slate-400 tabular-nums">{tsLabel}</span>}
          </div>
          <div className="bg-slate-100 rounded px-4 py-2.5 text-sm text-slate-800 whitespace-pre-wrap">
            {m.content}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in flex items-start gap-3">
      <div
        aria-hidden
        className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold text-white mt-1 ${msgRole?.color ?? currentRole.color}`}
      >
        {msgRole?.mono ?? currentRole.mono}
      </div>
      <div className="min-w-0 max-w-[85%]">
        <div className="flex items-baseline gap-2 mb-1">
          <p className="text-xs font-semibold text-slate-900 leading-none">
            {msgRole?.name ?? currentRole.name}
          </p>
          <span
            className="text-[10px] uppercase tracking-widest font-semibold text-slate-400"
            title={`Rol: ${msgRole?.fn ?? currentRole.fn}`}
          >
            {msgRole?.fn ?? currentRole.fn}
          </span>
          {tsLabel && <span className="text-[10px] text-slate-400 tabular-nums">{tsLabel}</span>}
        </div>
        <div className={`bg-white border border-slate-200 rounded border-l-4 px-4 py-3 ${msgRole?.borderColor ?? currentRole.borderColor}`}>
          <div className="prose prose-sm max-w-none prose-headings:mt-2 prose-headings:mb-1 prose-h1:text-sm prose-h1:font-semibold prose-h2:text-sm prose-h2:font-semibold prose-h3:text-xs prose-h3:font-semibold text-slate-800">
            {m.content ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {m.content}
              </ReactMarkdown>
            ) : (
              <span className="inline-block w-2 h-4 bg-slate-400 animate-pulse" />
            )}
          </div>
          {showActions && (
            <div className="flex items-center mt-2 -mx-1">
              <button
                onClick={() => onRate(i, "up")}
                className={`min-w-[40px] min-h-[40px] flex items-center justify-center rounded transition-colors ${m.rating === "up" ? "text-emerald-600" : "text-slate-300 hover:text-slate-500"}`}
                title="Útil"
              >
                <svg className="w-3.5 h-3.5" fill={m.rating === "up" ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                </svg>
              </button>
              <button
                onClick={() => onRate(i, "down")}
                className={`min-w-[40px] min-h-[40px] flex items-center justify-center rounded transition-colors ${m.rating === "down" ? "text-rose-500" : "text-slate-300 hover:text-slate-500"}`}
                title="No útil"
              >
                <svg className="w-3.5 h-3.5" fill={m.rating === "down" ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018c.163 0 .326.02.485.06L17 4m-7 10v2a2 2 0 002 2h.095c.5 0 .905-.405.905-.905 0-.714.211-1.412.608-2.006L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
                </svg>
              </button>
              <button
                onClick={() => onCopy(i, m.content)}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded text-slate-300 hover:text-slate-500 transition-colors"
                title="Copiar"
              >
                {copiedIdx === i ? (
                  <span className="text-[10px] text-emerald-600 font-medium">✓</span>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
              {isLastAssistant && (
                <button
                  onClick={onRetry}
                  className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded text-slate-300 hover:text-brand-primary transition-colors"
                  title="Regenerar respuesta"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
