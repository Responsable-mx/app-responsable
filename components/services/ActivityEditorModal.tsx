"use client";

// Modal CRUD compartido entre vista Lista y vista Gantt.
// Si activity → editar; si no → crear.
// Permisos:
//  - admin edita todo (en /configuracion/plantillas o cuando lockStructure=false)
//  - consultor solo actual_start/actual_end
//  - lockStructure=true: incluso admin solo edita actual_*+assignee (cliente cronograma view)
//    porque la estructura se define en /configuracion/plantillas, no en el cliente.

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import type { StageActivity } from "@/lib/stages";

export function ActivityEditorModal({
  stageId,
  activity,
  consultorEmails,
  isAdmin,
  lockStructure = false,
  onClose,
  onSaved,
}: {
  stageId: string;
  activity?: StageActivity;
  consultorEmails: string[];
  isAdmin: boolean;
  lockStructure?: boolean;
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
      if ((isAdmin && !lockStructure) || !isEditing) {
        body.name = name.trim();
        body.description = description.trim() || null;
        body.planned_start = plannedStart || null;
        body.planned_end = plannedEnd || null;
      }
      // assignee_email es decisión de proyecto, no estructura: admin la edita siempre
      if (isAdmin || !isEditing) {
        body.assignee_email = assigneeEmail || null;
      }
      body.actual_start = actualStart || null;
      body.actual_end = actualEnd || null;

      const url = isEditing
        ? `/api/activities/${activity!.id}`
        : `/api/stages/${stageId}/activities`;
      const method = isEditing ? "PATCH" : "POST";

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
          disabled={isEditing && (!isAdmin || lockStructure)}
          placeholder="Ej: Entrevistas a stakeholders"
        />

        {((isAdmin && !lockStructure) || !isEditing) && (
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Descripción
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="font-sans w-full text-sm border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
              placeholder="Detalle opcional"
            />
          </div>
        )}
        {isEditing && lockStructure && description && (
          <div className="bg-slate-50 border border-slate-200 rounded px-3 py-2 text-xs text-slate-600">
            <span className="font-bold text-[10px] uppercase tracking-widest text-slate-400">Descripción</span>
            <p className="mt-0.5">{description}</p>
          </div>
        )}

        <fieldset className="border border-slate-200 rounded p-2.5">
          <legend className="text-[10px] font-bold uppercase tracking-widest text-slate-500 px-1">
            Fechas plan {isAdmin || !isEditing ? "" : "(solo admin)"}
          </legend>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <Input
              label="Inicio plan"
              type="date"
              value={plannedStart}
              onChange={(e) => setPlannedStart(e.target.value)}
              disabled={isEditing && (!isAdmin || lockStructure)}
            />
            <Input
              label="Fin plan"
              type="date"
              value={plannedEnd}
              onChange={(e) => setPlannedEnd(e.target.value)}
              disabled={isEditing && (!isAdmin || lockStructure)}
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

        {(isAdmin || !isEditing) && (
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
