"use client";

// Sesión 10: ConfirmModal para archive destructivo, backdrop visible,
// aria-label en dialog, close button ≥40px, SkeletonList en loading,
// lápiz visible en mobile (no solo hover).

import { useRef, useState } from "react";
import useSWR from "swr";
import { useToast } from "@/components/ui/Toast";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { SkeletonList } from "@/components/ui/Skeleton";

type SessionItem = {
  id: string;
  client_id: string | null;
  role: "aurora" | "rebeca" | "elena" | "valeria";
  title: string;
  message_count: number;
  updated_at: string;
};

const ROLE_LABELS: Record<SessionItem["role"], string> = {
  aurora: "Aurora",
  rebeca: "Rebeca",
  elena: "Elena",
  valeria: "Valeria",
};

const fetcher = (url: string) =>
  fetch(url).then((r) => r.json() as Promise<{ data: SessionItem[] }>);

// Sidebar overlay con historial de conversaciones. Pattern ChatGPT/Claude.
// Filtra por clientId si se pasa (para mostrar solo conversaciones del cliente
// actual cuando el panel se abre desde la pestaña Chat dentro de un cliente).
export function ChatSessionsPanel({
  open,
  onClose,
  onSelect,
  onArchive,
  filterClientId,
  currentSessionId,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onArchive: (id: string) => void;
  filterClientId?: string | null;
  currentSessionId: string | null;
}) {
  const url = filterClientId
    ? `/api/chat-sessions?clientId=${filterClientId}`
    : "/api/chat-sessions";
  const { data, isLoading, error, mutate } = useSWR(open ? url : null, fetcher, {
    revalidateOnFocus: false,
  });
  const sessions = data?.data ?? [];

  const toast = useToast();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  // Confirmación de archive — guarda el id hasta que el usuario confirme
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);

  if (!open) return null;

  function startRename(s: SessionItem) {
    setRenamingId(s.id);
    setRenameValue(s.title);
    setTimeout(() => renameInputRef.current?.select(), 0);
  }

  async function commitRename(id: string) {
    const title = renameValue.trim();
    if (!title) { setRenamingId(null); return; }
    const res = await fetch(`/api/chat-sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    setRenamingId(null);
    if (!res.ok) {
      toast.push("error", "No se pudo renombrar la conversación.");
    }
    void mutate();
  }

  async function doArchive(id: string) {
    const res = await fetch(`/api/chat-sessions/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.push("error", "No se pudo archivar la conversación. Inténtalo de nuevo.");
      void mutate();
      return;
    }
    onArchive(id);
    void mutate();
  }

  return (
    <>
      {/* Backdrop semitransparente — delimita visualmente el overlay */}
      <div
        className="fixed inset-0 z-40 flex bg-slate-900/20 backdrop-blur-[1px]"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label="Historial de conversaciones"
      >
        <div
          className="ml-auto bg-white shadow-2xl border-l border-slate-200 w-full max-w-sm flex flex-col h-full"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">
              {filterClientId ? "Conversaciones del cliente" : "Conversaciones guardadas"}
            </h2>
            {/* Botón cerrar ≥40px touch target */}
            <button
              onClick={onClose}
              aria-label="Cerrar"
              className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              // Skeleton en lugar de texto "Cargando…" (CLAUDE.md: datos=Skeleton)
              <div className="px-4 py-3">
                <SkeletonList />
              </div>
            ) : error && !data ? (
              <div className="px-4 py-6 text-center">
                <p className="text-xs text-rose-700 mb-2">Error al cargar conversaciones.</p>
                <button
                  onClick={() => void mutate()}
                  className="text-xs text-brand-primary hover:underline"
                >
                  Reintentar
                </button>
              </div>
            ) : sessions.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-slate-500">
                Aún sin conversaciones guardadas. Las nuevas aparecen aquí automáticamente.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {sessions.map((s) => {
                  const active = s.id === currentSessionId;
                  const updated = new Date(s.updated_at);
                  // eslint-disable-next-line react-hooks/purity -- timestamp relativo de lista, aceptable en render
                  const daysAgo = Math.floor((Date.now() - updated.getTime()) / 86400000);
                  const stamp =
                    daysAgo === 0
                      ? "hoy"
                      : daysAgo === 1
                        ? "ayer"
                        : daysAgo < 7
                          ? `hace ${daysAgo} días`
                          : updated.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
                  return (
                    <li
                      key={s.id}
                      className={`group relative ${active ? "bg-brand-primary-light" : "hover:bg-slate-50"}`}
                    >
                      {renamingId === s.id ? (
                        <div className="px-4 py-2.5 pr-10">
                          <input
                            ref={renameInputRef}
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={() => void commitRename(s.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { e.preventDefault(); void commitRename(s.id); }
                              if (e.key === "Escape") setRenamingId(null);
                            }}
                            maxLength={120}
                            className="w-full text-sm font-medium text-slate-900 bg-white border border-brand-primary rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
                            aria-label="Renombrar conversación"
                          />
                          <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-2 px-1">
                            <span>Enter guardar</span>
                            <span className="text-slate-300">·</span>
                            <span>Esc cancelar</span>
                          </p>
                        </div>
                      ) : (
                        <button
                          onClick={() => onSelect(s.id)}
                          onDoubleClick={() => startRename(s)}
                          className="w-full text-left px-4 py-3 pr-20"
                          title="Click para abrir · Doble click para renombrar"
                        >
                          <p className="text-sm font-medium text-slate-900 line-clamp-2 leading-snug">
                            {s.title}
                          </p>
                          <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-2">
                            <span>{ROLE_LABELS[s.role]}</span>
                            <span className="text-slate-300">·</span>
                            <span>{s.message_count} msg</span>
                            <span className="text-slate-300">·</span>
                            <span>{stamp}</span>
                          </p>
                        </button>
                      )}
                      {renamingId !== s.id && (
                        <>
                          {/* Lápiz: visible en hover desktop, siempre visible en mobile */}
                          <button
                            onClick={() => startRename(s)}
                            title="Renombrar"
                            aria-label="Renombrar"
                            className="absolute right-8 top-1/2 -translate-y-1/2 min-w-[32px] min-h-[32px] flex items-center justify-center rounded text-slate-400 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:text-brand-primary hover:bg-brand-primary-light transition-opacity"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          {/* Papelera: abre ConfirmModal antes de archivar */}
                          <button
                            onClick={() => setConfirmArchiveId(s.id)}
                            title="Archivar conversación"
                            aria-label="Archivar"
                            className="absolute right-2 top-1/2 -translate-y-1/2 min-w-[32px] min-h-[32px] flex items-center justify-center rounded text-slate-400 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:text-rose-600 hover:bg-rose-50 transition-opacity"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                            </svg>
                          </button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* ConfirmModal fuera del overlay para evitar z-index conflict */}
      <ConfirmModal
        open={confirmArchiveId !== null}
        title="Archivar conversación"
        description="Esta conversación se archivará y no aparecerá en la lista. Esta acción no se puede deshacer."
        confirmLabel="Archivar"
        cancelLabel="Cancelar"
        tone="destructive"
        onConfirm={async () => {
          if (confirmArchiveId) await doArchive(confirmArchiveId);
          setConfirmArchiveId(null);
        }}
        onCancel={() => setConfirmArchiveId(null)}
      />
    </>
  );
}
