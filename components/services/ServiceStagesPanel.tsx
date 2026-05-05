"use client";

// Panel de etapas + actividades para un servicio del cliente.
// Fase 1: lista plana editable. Fase 2: Gantt visual.

import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/Toast";
import { ActivityEditorModal } from "./ActivityEditorModal";
import { TemplateActions } from "./TemplateActions";
import type { ActivityStatus, ServiceStage, StageActivity } from "@/lib/stages";

type ApiResp = { data: ServiceStage[] };
const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<ApiResp>;
  });

const STATUS_CHIP: Record<ActivityStatus, { bg: string; text: string; label: string }> = {
  pending: { bg: "bg-slate-100 border-slate-200", text: "text-slate-600", label: "Pendiente" },
  in_progress: { bg: "bg-brand-primary-light border-brand-primary/30", text: "text-brand-primary-dark", label: "En curso" },
  completed: { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", label: "Completada" },
  delayed: { bg: "bg-rose-50 border-rose-200", text: "text-rose-700", label: "Retrasada" },
};

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
  });
}

export function ServiceStagesPanel({
  clientId,
  clientServiceId,
  isAdmin,
  consultorEmails,
}: {
  clientId: string;
  clientServiceId: string;
  isAdmin: boolean;
  consultorEmails: string[];
}) {
  const { data, mutate, isLoading, error } = useSWR(
    `/api/clients/${clientId}/stages`,
    fetcher
  );

  const [newStageName, setNewStageName] = useState("");
  const [creatingStage, setCreatingStage] = useState(false);
  const [editingActivity, setEditingActivity] = useState<{
    stageId: string;
    activity?: StageActivity;
  } | null>(null);
  const [deleteStageId, setDeleteStageId] = useState<string | null>(null);
  const [deleteActivityId, setDeleteActivityId] = useState<string | null>(null);
  const { push } = useToast();

  // Filtrar etapas a las que pertenecen a este servicio
  const stages = (data?.data ?? []).filter((s) => s.client_service_id === clientServiceId);

  async function handleCreateStage() {
    if (!newStageName.trim()) return;
    setCreatingStage(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/stages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_service_id: clientServiceId, name: newStageName.trim() }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        push("error", j.error ?? "No se pudo crear la etapa");
        return;
      }
      setNewStageName("");
      push("success", "Etapa creada");
      mutate();
    } finally {
      setCreatingStage(false);
    }
  }

  async function handleDeleteStage() {
    if (!deleteStageId) return;
    const res = await fetch(`/api/stages/${deleteStageId}`, { method: "DELETE" });
    if (!res.ok) {
      push("error", "No se pudo eliminar");
    } else {
      push("success", "Etapa eliminada");
      mutate();
    }
    setDeleteStageId(null);
  }

  async function renameStage(stageId: string, newName: string) {
    const res = await fetch(`/api/stages/${stageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    });
    if (!res.ok) {
      push("error", "No se pudo renombrar");
    } else {
      mutate();
    }
  }

  async function renameActivity(activityId: string, newName: string) {
    const res = await fetch(`/api/activities/${activityId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    });
    if (!res.ok) {
      push("error", "No se pudo renombrar");
    } else {
      mutate();
    }
  }

  async function moveStage(stageId: string, dir: -1 | 1) {
    const idx = stages.findIndex((s) => s.id === stageId);
    if (idx < 0) return;
    const target = stages[idx + dir];
    if (!target) return;
    // Swap order_index
    const a = stages[idx];
    await Promise.all([
      fetch(`/api/stages/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_index: target.order_index }),
      }),
      fetch(`/api/stages/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_index: a.order_index }),
      }),
    ]);
    mutate();
  }

  async function moveActivity(stageId: string, activityId: string, dir: -1 | 1) {
    const stage = stages.find((s) => s.id === stageId);
    if (!stage) return;
    const idx = stage.activities.findIndex((a) => a.id === activityId);
    if (idx < 0) return;
    const target = stage.activities[idx + dir];
    if (!target) return;
    const a = stage.activities[idx];
    await Promise.all([
      fetch(`/api/activities/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_index: target.order_index }),
      }),
      fetch(`/api/activities/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_index: a.order_index }),
      }),
    ]);
    mutate();
  }

  async function handleDeleteActivity() {
    if (!deleteActivityId) return;
    const res = await fetch(`/api/activities/${deleteActivityId}`, { method: "DELETE" });
    if (!res.ok) {
      push("error", "No se pudo eliminar");
    } else {
      push("success", "Actividad eliminada");
      mutate();
    }
    setDeleteActivityId(null);
  }

  if (isLoading) {
    return (
      <div className="border-t border-slate-100 mt-3 pt-3 space-y-1.5">
        {[1, 2].map((i) => (
          <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="border-t border-slate-100 mt-3 pt-3">
        <p className="text-xs text-rose-700">Error al cargar etapas. Reintenta más tarde.</p>
      </div>
    );
  }

  return (
    <div className="border-t border-slate-100 mt-3 pt-3 space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          Etapas y actividades
        </h4>
        {stages.length === 0 && !isAdmin && (
          <span className="text-[11px] text-slate-500 italic">Sin etapas definidas</span>
        )}
        {isAdmin && (
          <TemplateActions
            clientServiceId={clientServiceId}
            hasStages={stages.length > 0}
            onApplied={() => mutate()}
          />
        )}
      </div>

      {/* Cliente cronograma: estructura read-only.
          Estructura se define en /configuracion/plantillas y se aplica con TemplateActions. */}
      {stages.map((s) => (
        <StageRow
          key={s.id}
          stage={s}
          isAdmin={false}
          canMoveUp={false}
          canMoveDown={false}
          onAddActivity={() => {}}
          onEditActivity={(act) => setEditingActivity({ stageId: s.id, activity: act })}
          onDeleteStage={() => {}}
          onDeleteActivity={() => {}}
          onRenameStage={() => {}}
          onMoveStage={() => {}}
          onRenameActivity={() => {}}
          onMoveActivity={() => {}}
        />
      ))}

      {stages.length === 0 && isAdmin && (
        <div className="bg-slate-50 border border-slate-200 rounded p-3 text-center">
          <p className="text-[11px] text-slate-600 mb-1">
            Sin estructura. Aplica una plantilla desde el botón superior.
          </p>
          <p className="text-[10px] text-slate-500">
            Las plantillas se definen en{" "}
            <a
              href="/configuracion/plantillas"
              className="text-brand-primary-dark underline hover:no-underline"
            >
              Configuración → Plantillas
            </a>
            .
          </p>
        </div>
      )}

      {editingActivity && (
        <ActivityEditorModal
          stageId={editingActivity.stageId}
          activity={editingActivity.activity}
          consultorEmails={consultorEmails}
          isAdmin={isAdmin}
          lockStructure
          onClose={() => setEditingActivity(null)}
          onSaved={() => {
            setEditingActivity(null);
            mutate();
          }}
        />
      )}

      <ConfirmModal
        open={deleteStageId !== null}
        onCancel={() => setDeleteStageId(null)}
        onConfirm={handleDeleteStage}
        title="¿Eliminar etapa?"
        description="Se eliminan también todas sus actividades. Esta acción no se puede deshacer."
        confirmLabel="Sí, eliminar"
        tone="destructive"
      />
      <ConfirmModal
        open={deleteActivityId !== null}
        onCancel={() => setDeleteActivityId(null)}
        onConfirm={handleDeleteActivity}
        title="¿Eliminar actividad?"
        description="Esta acción no se puede deshacer."
        confirmLabel="Sí, eliminar"
        tone="destructive"
      />
    </div>
  );
}

function StageRow({
  stage,
  isAdmin,
  canMoveUp,
  canMoveDown,
  onAddActivity,
  onEditActivity,
  onDeleteStage,
  onDeleteActivity,
  onRenameStage,
  onMoveStage,
  onRenameActivity,
  onMoveActivity,
}: {
  stage: ServiceStage;
  isAdmin: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onAddActivity: () => void;
  onEditActivity: (a: StageActivity) => void;
  onDeleteStage: () => void;
  onDeleteActivity: (id: string) => void;
  onRenameStage: (newName: string) => void;
  onMoveStage: (dir: -1 | 1) => void;
  onRenameActivity: (activityId: string, newName: string) => void;
  onMoveActivity: (activityId: string, dir: -1 | 1) => void;
}) {
  const [renamingStage, setRenamingStage] = useState(false);
  const [renamingActId, setRenamingActId] = useState<string | null>(null);
  const [stageDraft, setStageDraft] = useState(stage.name);
  const [actDraft, setActDraft] = useState("");

  function commitStageRename() {
    const name = stageDraft.trim();
    if (name && name !== stage.name) onRenameStage(name);
    setRenamingStage(false);
  }
  function commitActRename(activityId: string) {
    const name = actDraft.trim();
    if (name) {
      const orig = stage.activities.find((a) => a.id === activityId);
      if (orig && name !== orig.name) onRenameActivity(activityId, name);
    }
    setRenamingActId(null);
  }

  return (
    <div className="bg-slate-50 border border-slate-200 rounded p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {renamingStage ? (
            <input
              autoFocus
              value={stageDraft}
              onChange={(e) => setStageDraft(e.target.value)}
              onBlur={commitStageRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitStageRename();
                }
                if (e.key === "Escape") {
                  setStageDraft(stage.name);
                  setRenamingStage(false);
                }
              }}
              className="font-sans text-xs font-bold text-slate-700 bg-white border border-brand-primary rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 min-w-0 flex-1"
            />
          ) : (
            <button
              onClick={() => isAdmin && (setStageDraft(stage.name), setRenamingStage(true))}
              disabled={!isAdmin}
              className={`text-xs font-bold text-slate-700 truncate text-left ${isAdmin ? "hover:text-brand-primary-dark cursor-text" : "cursor-default"}`}
              title={isAdmin ? "Click para renombrar" : undefined}
            >
              {stage.name}
            </button>
          )}
          <span className="text-[10px] text-slate-500 tabular-nums shrink-0">
            {stage.activities.length}{" "}
            {stage.activities.length === 1 ? "actividad" : "actividades"}
          </span>
        </div>
        {isAdmin && !renamingStage && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => onMoveStage(-1)}
              disabled={!canMoveUp}
              className="text-slate-400 hover:text-brand-primary-dark disabled:opacity-30 disabled:cursor-not-allowed text-xs px-1"
              title="Mover arriba"
            >
              ↑
            </button>
            <button
              onClick={() => onMoveStage(1)}
              disabled={!canMoveDown}
              className="text-slate-400 hover:text-brand-primary-dark disabled:opacity-30 disabled:cursor-not-allowed text-xs px-1"
              title="Mover abajo"
            >
              ↓
            </button>
            <button
              onClick={onAddActivity}
              className="text-[11px] text-brand-primary-dark hover:underline ml-1"
            >
              + Actividad
            </button>
            <button
              onClick={onDeleteStage}
              className="text-[11px] text-rose-700 hover:underline"
              title="Eliminar etapa"
            >
              Eliminar
            </button>
          </div>
        )}
      </div>

      {stage.activities.length === 0 ? (
        <p className="text-[11px] text-slate-500 italic px-1 py-1">Sin actividades aún</p>
      ) : (
        <div className="space-y-1">
          {stage.activities.map((a, i) => {
            const chip = STATUS_CHIP[a.status];
            const isRenaming = renamingActId === a.id;
            const canActUp = i > 0;
            const canActDown = i < stage.activities.length - 1;
            return (
              <div
                key={a.id}
                className="bg-white border border-slate-200 rounded p-2 hover:border-brand-primary transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    {isRenaming ? (
                      <input
                        autoFocus
                        value={actDraft}
                        onChange={(e) => setActDraft(e.target.value)}
                        onBlur={() => commitActRename(a.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitActRename(a.id);
                          }
                          if (e.key === "Escape") setRenamingActId(null);
                        }}
                        className="font-sans text-xs font-semibold text-slate-900 bg-white border border-brand-primary rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 w-full"
                      />
                    ) : (
                      <button
                        onClick={() => onEditActivity(a)}
                        className="text-xs font-semibold text-slate-900 truncate text-left hover:text-brand-primary-dark"
                      >
                        {a.name}
                      </button>
                    )}
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-[10px] text-slate-600 tabular-nums">
                      <span>
                        Plan: {fmt(a.planned_start)} → {fmt(a.planned_end)}
                      </span>
                      <span>
                        Real: {fmt(a.actual_start)} → {fmt(a.actual_end)}
                      </span>
                      {a.assignee_email && (
                        <span className="truncate max-w-[140px]" title={a.assignee_email}>
                          @ {a.assignee_email.split("@")[0]}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span
                      className={`inline-flex items-center text-[10px] font-medium border rounded-sm px-1.5 py-0.5 ${chip.bg} ${chip.text}`}
                    >
                      {chip.label}
                    </span>
                    {isAdmin && !isRenaming && (
                      <>
                        <button
                          onClick={() => onMoveActivity(a.id, -1)}
                          disabled={!canActUp}
                          className="text-slate-400 hover:text-brand-primary-dark disabled:opacity-30 disabled:cursor-not-allowed text-xs px-1"
                          title="Mover arriba"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => onMoveActivity(a.id, 1)}
                          disabled={!canActDown}
                          className="text-slate-400 hover:text-brand-primary-dark disabled:opacity-30 disabled:cursor-not-allowed text-xs px-1"
                          title="Mover abajo"
                        >
                          ↓
                        </button>
                        <button
                          onClick={() => {
                            setActDraft(a.name);
                            setRenamingActId(a.id);
                          }}
                          className="text-[10px] text-slate-500 hover:text-brand-primary-dark px-1"
                          title="Renombrar"
                        >
                          ✎
                        </button>
                        <button
                          onClick={() => onDeleteActivity(a.id)}
                          className="text-[11px] text-rose-700 hover:underline"
                          title="Eliminar"
                        >
                          ✕
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
