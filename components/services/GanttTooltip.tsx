"use client";

import type { StageActivity, ActivityStatus } from "@/lib/stages";

// ─── Helpers compartidos ──────────────────────────────────────────────────────

const STATUS_LABEL: Record<ActivityStatus, string> = {
  pending: "Pendiente",
  in_progress: "En curso",
  completed: "Completada",
  delayed: "Retrasada",
};

const STATUS_TEXT: Record<ActivityStatus, string> = {
  pending: "text-slate-500",
  in_progress: "text-brand-primary-dark",
  completed: "text-emerald-700",
  delayed: "text-rose-700",
};

function fmtShort(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
  });
}

// ─── TRow ─────────────────────────────────────────────────────────────────────

function TRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span>{label}</span><span className="font-medium text-slate-700">{value}</span>
    </div>
  );
}

// ─── RichTooltip ─────────────────────────────────────────────────────────────

export function RichTooltip({
  activity: a,
  anchor,
}: {
  activity: StageActivity;
  anchor: { x: number; y: number };
}) {
  const x = Math.min(anchor.x, window.innerWidth - 220);
  const y = Math.min(anchor.y, window.innerHeight - 210);
  return (
    <div
      className="fixed z-50 bg-white border border-slate-200 rounded shadow-md p-3 w-56 pointer-events-none"
      style={{ top: y, left: x }}
    >
      <p className="text-[10px] font-bold text-slate-800 mb-2 truncate">{a.name}</p>
      <div className="space-y-1 text-[10px] text-slate-600">
        {a.baseline_start && (
          <>
            <TRow label="Baseline inicio" value={fmtShort(a.baseline_start)} />
            <TRow label="Baseline fin" value={fmtShort(a.baseline_end)} />
          </>
        )}
        <TRow label="Plan inicio" value={fmtShort(a.planned_start)} />
        <TRow label="Plan fin" value={fmtShort(a.planned_end)} />
        <TRow label="Real inicio" value={fmtShort(a.actual_start)} />
        <TRow label="Real fin" value={fmtShort(a.actual_end)} />
        {a.actual_progress != null && (
          <div className="pt-1">
            <div className="flex justify-between mb-0.5">
              <span>Progreso</span>
              <span className="font-bold text-slate-700">{a.actual_progress}%</span>
            </div>
            <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-primary rounded-full"
                style={{ width: `${a.actual_progress}%` }}
              />
            </div>
          </div>
        )}
      </div>
      <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px]">
        <span className="text-slate-500">Status</span>
        <span className={`font-bold ${STATUS_TEXT[a.status]}`}>
          {STATUS_LABEL[a.status]}
        </span>
      </div>
      {a.assignee_email && (
        <div className="mt-1 pt-1 border-t border-slate-100 text-[10px] text-slate-500 truncate">
          @ {a.assignee_email}
        </div>
      )}
      {a.blocker_note && (
        <div className="mt-1.5 pt-1.5 border-t border-rose-100 text-[10px] text-rose-700 leading-snug">
          <span className="font-bold">🚫 Bloqueo:</span> {a.blocker_note}
        </div>
      )}
    </div>
  );
}
