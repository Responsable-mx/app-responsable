"use client";

// Panel de etapas + actividades para un servicio del cliente.
// Fase 1: lista plana editable. Fase 2: Gantt visual.

import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/Toast";
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
  const { data, mutate, isLoading } = useSWR(
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
    return <div className="text-xs text-slate-500 italic px-2 py-3">Cargando etapas…</div>;
  }

  return (
    <div className="border-t border-slate-100 mt-3 pt-3 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          Etapas y actividades
        </h4>
        {stages.length === 0 && !isAdmin && (
          <span className="text-[11px] text-slate-500 italic">Sin etapas definidas</span>
        )}
      </div>

      {stages.length === 0 && !isAdmin && null}

      {stages.map((s) => (
        <StageRow
          key={s.id}
          stage={s}
          isAdmin={isAdmin}
          consultorEmails={consultorEmails}
          onAddActivity={() => setEditingActivity({ stageId: s.id })}
          onEditActivity={(act) => setEditingActivity({ stageId: s.id, activity: act })}
          onDeleteStage={() => setDeleteStageId(s.id)}
          onDeleteActivity={(actId) => setDeleteActivityId(actId)}
        />
      ))}

      {isAdmin && (
        <div className="flex items-center gap-2 pt-1">
          <Input
            value={newStageName}
            onChange={(e) => setNewStageName(e.target.value)}
            placeholder="Nueva etapa (ej: Diagnóstico)"
            className="text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleCreateStage();
              }
            }}
          />
          <Button
            size="sm"
            onClick={handleCreateStage}
            disabled={!newStageName.trim() || creatingStage}
            loading={creatingStage}
          >
            + Etapa
          </Button>
        </div>
      )}

      {editingActivity && (
        <ActivityEditorModal
          stageId={editingActivity.stageId}
          activity={editingActivity.activity}
          consultorEmails={consultorEmails}
          isAdmin={isAdmin}
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
  onAddActivity,
  onEditActivity,
  onDeleteStage,
  onDeleteActivity,
}: {
  stage: ServiceStage;
  isAdmin: boolean;
  consultorEmails: string[];
  onAddActivity: () => void;
  onEditActivity: (a: StageActivity) => void;
  onDeleteStage: () => void;
  onDeleteActivity: (id: string) => void;
}) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-bold text-slate-700 truncate">{stage.name}</span>
          <span className="text-[10px] text-slate-500 tabular-nums">
            {stage.activities.length}{" "}
            {stage.activities.length === 1 ? "actividad" : "actividades"}
          </span>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-1">
            <button
              onClick={onAddActivity}
              className="text-[11px] text-brand-primary-dark hover:underline"
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
          {stage.activities.map((a) => {
            const chip = STATUS_CHIP[a.status];
            return (
              <button
                key={a.id}
                onClick={() => onEditActivity(a)}
                className="w-full text-left bg-white border border-slate-200 rounded p-2 hover:border-brand-primary transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-900 truncate">{a.name}</p>
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
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={`inline-flex items-center text-[10px] font-medium border rounded-sm px-1.5 py-0.5 ${chip.bg} ${chip.text}`}
                    >
                      {chip.label}
                    </span>
                    {isAdmin && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteActivity(a.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.stopPropagation();
                            onDeleteActivity(a.id);
                          }
                        }}
                        className="text-[11px] text-rose-700 hover:underline cursor-pointer"
                        title="Eliminar"
                      >
                        ✕
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ActivityEditorModal({
  stageId,
  activity,
  consultorEmails,
  isAdmin,
  onClose,
  onSaved,
}: {
  stageId: string;
  activity?: StageActivity;
  consultorEmails: string[];
  isAdmin: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEditing = !!activity;
  const [name, setName] = useState(activity?.name ?? "");
  const [description, setDescription] = useState(activity?.description ?? "");
  const [plannedStart, setPlannedStart] = useState(activity?.planned_start ?? "");
  const [plannedEnd, setPlannedEnd] = useState(activity?.planned_end ?? "");
  const [actualStart, setActualStart] = useState(activity?.actual_start ?? "");
  const [actualEnd, setActualEnd] = useState(activity?.actual_end ?? "");
  const [assigneeEmail, setAssigneeEmail] = useState(activity?.assignee_email ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { push } = useToast();

  async function handleSave() {
    setError(null);
    setBusy(true);
    try {
      const body: Record<string, unknown> = {};
      // Si admin: todos los campos. Si no: solo actual_*.
      if (isAdmin) {
        body.name = name.trim();
        body.description = description.trim() || null;
        body.planned_start = plannedStart || null;
        body.planned_end = plannedEnd || null;
        body.assignee_email = assigneeEmail || null;
      }
      body.actual_start = actualStart || null;
      body.actual_end = actualEnd || null;

      const url = isEditing
        ? `/api/activities/${activity!.id}`
        : `/api/stages/${stageId}/activities`;
      const method = isEditing ? "PATCH" : "POST";

      // En POST, name es obligatorio (admin only via la UI: ya bloqueado arriba)
      if (!isEditing) {
        body.name = name.trim();
        body.description = description.trim() || null;
        body.planned_start = plannedStart || null;
        body.planned_end = plannedEnd || null;
        body.assignee_email = assigneeEmail || null;
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? `Error ${res.status}`);
        return;
      }
      push("success", isEditing ? "Actividad actualizada" : "Actividad creada");
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = isEditing ? true : name.trim().length > 0;

  return (
    <Modal
      open
      onClose={onClose}
      title={isEditing ? "Editar actividad" : "Nueva actividad"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!canSubmit || busy} loading={busy}>
            {isEditing ? "Guardar" : "Crear"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && (
          <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">
            {error}
          </div>
        )}

        <Input
          label="Nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isEditing && !isAdmin}
          placeholder="Ej: Entrevistas a stakeholders"
        />

        {isAdmin && (
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Descripción</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="font-sans w-full text-sm border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
              placeholder="Detalle opcional"
            />
          </div>
        )}

        <fieldset className="border border-slate-200 rounded p-2.5">
          <legend className="text-[10px] font-bold uppercase tracking-widest text-slate-500 px-1">
            Fechas plan {isAdmin ? "" : "(solo admin)"}
          </legend>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <Input
              label="Inicio plan"
              type="date"
              value={plannedStart}
              onChange={(e) => setPlannedStart(e.target.value)}
              disabled={!isAdmin}
            />
            <Input
              label="Fin plan"
              type="date"
              value={plannedEnd}
              onChange={(e) => setPlannedEnd(e.target.value)}
              disabled={!isAdmin}
            />
          </div>
        </fieldset>

        <fieldset className="border border-slate-200 rounded p-2.5">
          <legend className="text-[10px] font-bold uppercase tracking-widest text-slate-500 px-1">
            Fechas reales (lo que pasó)
          </legend>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <Input
              label="Inicio real"
              type="date"
              value={actualStart}
              onChange={(e) => setActualStart(e.target.value)}
            />
            <Input
              label="Fin real"
              type="date"
              value={actualEnd}
              onChange={(e) => setActualEnd(e.target.value)}
            />
          </div>
        </fieldset>

        {isAdmin && (
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Asignado a
            </label>
            <select
              value={assigneeEmail}
              onChange={(e) => setAssigneeEmail(e.target.value)}
              className="font-sans w-full text-sm border border-slate-200 rounded px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
            >
              <option value="">Sin asignar</option>
              {consultorEmails.map((email) => (
                <option key={email} value={email}>
                  {email}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </Modal>
  );
}
