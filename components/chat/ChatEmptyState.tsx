"use client";

import {
  type ClientOption,
  type RoleId,
  type SessionPreview,
  ROLES,
  STARTERS,
} from "@/components/chat/chat-types";

// Evaluado una vez al cargar el módulo — no es una llamada impura en render.
const MODULE_NOW = Date.now();

export type ChatEmptyStateProps = {
  role: RoleId;
  clientId: string;
  clients: ClientOption[];
  recentSessions: SessionPreview[];
  roles: typeof ROLES;
  starters: typeof STARTERS;
  onSend: (prompt: string) => void;
  onLoadSession: (id: string) => void;
};

/**
 * Estado vacío del chat: sugerencias de inicio y lista de sesiones recientes.
 * Solo se renderiza cuando messages.length === 0.
 */
export function ChatEmptyState({
  role,
  clientId,
  clients,
  recentSessions,
  starters,
  onSend,
  onLoadSession,
}: ChatEmptyStateProps) {

  return (
    <div className="py-10 max-w-2xl mx-auto" data-tour="empty-state">
      <p className="text-sm text-slate-600 mb-4 border-b border-slate-200 pb-4">
        {clientId
          ? "Contexto de cliente cargado. Comienza con un objetivo o usa una sugerencia."
          : "Sin cliente seleccionado. Respondo sobre metodología general."}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {starters[role].map((s) => (
          <button
            key={s}
            onClick={() => onSend(s)}
            className="group text-left text-xs px-3 py-2.5 bg-white border border-slate-200 rounded hover:border-brand-primary hover:bg-brand-primary-light transition-colors text-slate-700 flex items-start justify-between gap-2"
          >
            <span className="font-medium">{s}</span>
            <svg className="w-3 h-3 shrink-0 mt-0.5 text-slate-300 group-hover:text-brand-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ))}
      </div>

      {recentSessions.length > 0 && (
        <div className="mt-6 pt-5 border-t border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Recientes
            </p>
          </div>
          <ul className="space-y-0.5">
            {recentSessions.map((s) => {
              const daysAgo = Math.floor(
                (MODULE_NOW - new Date(s.updated_at).getTime()) / 86400000
              );
              const stamp =
                daysAgo === 0 ? "hoy" : daysAgo === 1 ? "ayer" : `hace ${daysAgo} días`;
              const roleData = ROLES.find((r) => r.id === s.role) ?? ROLES[0];
              const clientMatch = clients.find((c) => c.id === s.client_id);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onLoadSession(s.id)}
                    className="w-full text-left flex items-center gap-2.5 px-2 py-2 rounded hover:bg-slate-100 transition-colors"
                  >
                    <span
                      className={`w-5 h-5 rounded-sm flex items-center justify-center text-[9px] font-bold text-white shrink-0 ${roleData.color}`}
                      aria-hidden
                    >
                      {roleData.mono}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="text-xs text-slate-700 line-clamp-1 block">{s.title}</span>
                      {clientMatch && (
                        <span className="text-[10px] text-slate-500 block truncate">
                          {clientMatch.name}
                        </span>
                      )}
                    </span>
                    <span className="text-[10px] text-slate-400 shrink-0 tabular-nums">
                      {stamp}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
