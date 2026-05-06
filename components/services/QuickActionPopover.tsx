"use client";

import { useState } from "react";
import type { StageActivity } from "@/lib/stages";

export type QuickPatch = {
  actual_start?: string;
  actual_end?: string;
  planned_start?: string;
  planned_end?: string;
  status?: "pending" | "in_progress" | "completed" | "delayed";
};

type Props = {
  activity: StageActivity;
  anchor: { x: number; y: number };
  onClose: () => void;
  onEditFull: () => void;
  onQuickAction?: (activityId: string, patch: QuickPatch) => Promise<void>;
  isAdmin?: boolean;
};

export function QuickActionPopover({
  activity,
  anchor,
  onClose,
  onEditFull,
  onQuickAction,
  isAdmin = false,
}: Props) {
  const [loading, setLoading] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  // Inline date form state
  const [realStart, setRealStart] = useState(activity.actual_start ?? "");
  const [realEnd, setRealEnd] = useState(activity.actual_end ?? "");
  const [planStart, setPlanStart] = useState(activity.planned_start ?? "");
  const [planEnd, setPlanEnd] = useState(activity.planned_end ?? "");
  const [savingDates, setSavingDates] = useState(false);

  const x = Math.min(anchor.x, window.innerWidth - 256);
  const y = Math.min(anchor.y, window.innerHeight - 160);

  async function fire(key: string, patch: QuickPatch) {
    if (!onQuickAction) return;
    setLoading(key);
    try {
      await onQuickAction(activity.id, patch);
      onClose();
    } finally {
      setLoading(null);
    }
  }

  async function saveDates() {
    if (!onQuickAction) return;
    const patch: QuickPatch = {};
    if (realStart !== (activity.actual_start ?? "")) patch.actual_start = realStart || undefined;
    if (realEnd !== (activity.actual_end ?? "")) patch.actual_end = realEnd || undefined;
    if (isAdmin && planStart !== (activity.planned_start ?? "")) patch.planned_start = planStart || undefined;
    if (isAdmin && planEnd !== (activity.planned_end ?? "")) patch.planned_end = planEnd || undefined;
    if (Object.keys(patch).length === 0) { onClose(); return; }
    setSavingDates(true);
    try {
      await onQuickAction(activity.id, patch);
      onClose();
    } finally {
      setSavingDates(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 bg-white border border-slate-200 rounded shadow-md w-64"
        style={{ top: y, left: x }}
      >
        <p className="px-3 pt-2 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 border-b border-slate-100 truncate">
          {activity.name}
        </p>
        {/* ─── Inline date form ─── */}
        {onQuickAction && (
          <div className="px-3 py-2 border-b border-slate-100 space-y-2">
            <div className="space-y-1">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Fechas reales</p>
              <div className="flex items-center gap-1.5">
                <label className="text-[10px] text-slate-500 w-10 shrink-0">Inicio</label>
                <input
                  type="date"
                  value={realStart}
                  onChange={(e) => setRealStart(e.target.value)}
                  className="flex-1 text-[10px] border border-slate-200 rounded px-1.5 py-0.5 font-sans text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-primary/50 focus:border-brand-primary"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-[10px] text-slate-500 w-10 shrink-0">Fin</label>
                <input
                  type="date"
                  value={realEnd}
                  onChange={(e) => setRealEnd(e.target.value)}
                  className="flex-1 text-[10px] border border-slate-200 rounded px-1.5 py-0.5 font-sans text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-primary/50 focus:border-brand-primary"
                />
              </div>
            </div>
            {isAdmin && (
              <div className="space-y-1">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Fechas plan</p>
                <div className="flex items-center gap-1.5">
                  <label className="text-[10px] text-slate-500 w-10 shrink-0">Inicio</label>
                  <input
                    type="date"
                    value={planStart}
                    onChange={(e) => setPlanStart(e.target.value)}
                    className="flex-1 text-[10px] border border-slate-200 rounded px-1.5 py-0.5 font-sans text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-primary/50 focus:border-brand-primary"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="text-[10px] text-slate-500 w-10 shrink-0">Fin</label>
                  <input
                    type="date"
                    value={planEnd}
                    onChange={(e) => setPlanEnd(e.target.value)}
                    className="flex-1 text-[10px] border border-slate-200 rounded px-1.5 py-0.5 font-sans text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-primary/50 focus:border-brand-primary"
                  />
                </div>
              </div>
            )}
            <button
              onClick={saveDates}
              disabled={savingDates || loading !== null}
              className="w-full py-1 text-[10px] font-bold uppercase tracking-widest bg-brand-primary text-white rounded hover:bg-brand-primary-dark transition-colors disabled:opacity-50"
            >
              {savingDates ? "Guardando..." : "Guardar fechas"}
            </button>
          </div>
        )}

        <div className="py-1">
          {onQuickAction && !activity.actual_start && (
            <ActionBtn
              label="Empezar hoy"
              loadingKey="start"
              activeKey={loading}
              onClick={() =>
                fire("start", { actual_start: today, status: "in_progress" })
              }
              icon={
                <svg
                  className="w-3.5 h-3.5 text-brand-primary"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M6.3 2.84A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.27l9.344-5.891a1.5 1.5 0 000-2.538L6.3 2.84z" />
                </svg>
              }
            />
          )}
          {onQuickAction && !activity.actual_end && (
            <ActionBtn
              label="Completar hoy"
              loadingKey="complete"
              activeKey={loading}
              onClick={() =>
                fire("complete", { actual_end: today, status: "completed" })
              }
              icon={
                <svg
                  className="w-3.5 h-3.5 text-emerald-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              }
            />
          )}
          <ActionBtn
            label="Editar completo"
            loadingKey="edit"
            activeKey={null}
            onClick={() => {
              onClose();
              onEditFull();
            }}
            icon={
              <svg
                className="w-3.5 h-3.5 text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.75}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
            }
          />
        </div>
      </div>
    </>
  );
}

function ActionBtn({
  label,
  loadingKey,
  activeKey,
  onClick,
  icon,
}: {
  label: string;
  loadingKey: string;
  activeKey: string | null;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  const isLoading = activeKey === loadingKey;
  const isDisabled = activeKey !== null;
  return (
    <button
      className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 disabled:opacity-50"
      disabled={isDisabled}
      onClick={onClick}
    >
      {isLoading ? (
        <svg
          className="w-3.5 h-3.5 animate-spin text-slate-400"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      ) : (
        icon
      )}
      {label}
    </button>
  );
}
