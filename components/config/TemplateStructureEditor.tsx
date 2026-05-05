"use client";

// Editor de estructura completo de una plantilla (stages + activities + offsets).
// Estado local; solo persiste al "Guardar". Backend recibe el data JSONB completo.

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

type TplActivity = {
  name: string;
  description: string | null;
  order_index: number;
  offset_start_days: number | null;
  offset_end_days: number | null;
  depends_on_path?: string | null;
};

type TplStage = {
  name: string;
  order_index: number;
  activities: TplActivity[];
};

export type TemplateStructure = { stages: TplStage[] };

export function TemplateStructureEditor({
  templateId,
  templateName,
  initial,
  onClose,
  onSaved,
}: {
  templateId: string;
  templateName: string;
  initial: TemplateStructure;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [stages, setStages] = useState<TplStage[]>(() => initial.stages.map((s) => ({ ...s, activities: [...s.activities] })));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { push } = useToast();

  // Drag state — track type + indices. Native HTML5 DnD para zero-deps.
  const [dragStage, setDragStage] = useState<number | null>(null);
  const [dragActivity, setDragActivity] = useState<{ stageIdx: number; actIdx: number } | null>(null);
  const [dragOverStage, setDragOverStage] = useState<number | null>(null);
  const [dragOverActivity, setDragOverActivity] = useState<{ stageIdx: number; actIdx: number } | null>(null);

  function reindexStages(arr: TplStage[]): TplStage[] {
    return arr.map((s, i) => ({ ...s, order_index: i }));
  }
  function reindexActivities(arr: TplActivity[]): TplActivity[] {
    return arr.map((a, i) => ({ ...a, order_index: i }));
  }

  function addStage() {
    setStages((prev) => reindexStages([...prev, { name: "Nueva etapa", order_index: prev.length, activities: [] }]));
  }
  function deleteStage(i: number) {
    setStages((prev) => reindexStages(prev.filter((_, idx) => idx !== i)));
  }
  function renameStage(i: number, name: string) {
    setStages((prev) => prev.map((s, idx) => (idx === i ? { ...s, name } : s)));
  }
  function moveStage(i: number, dir: -1 | 1) {
    setStages((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return reindexStages(next);
    });
  }

  // Drag-and-drop: mover stage `from` antes de `to`. Splice + reindex.
  function dropStageOn(from: number, to: number) {
    if (from === to) return;
    setStages((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return reindexStages(next);
    });
  }
  function dropActivityOn(stageIdx: number, from: number, to: number) {
    if (from === to) return;
    setStages((prev) =>
      prev.map((s, idx) => {
        if (idx !== stageIdx) return s;
        const next = [...s.activities];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        return { ...s, activities: reindexActivities(next) };
      })
    );
  }

  function addActivity(stageIdx: number) {
    setStages((prev) =>
      prev.map((s, idx) =>
        idx === stageIdx
          ? {
              ...s,
              activities: reindexActivities([
                ...s.activities,
                {
                  name: "Nueva actividad",
                  description: null,
                  order_index: s.activities.length,
                  offset_start_days: null,
                  offset_end_days: null,
                },
              ]),
            }
          : s
      )
    );
  }
  function deleteActivity(stageIdx: number, actIdx: number) {
    setStages((prev) =>
      prev.map((s, idx) =>
        idx === stageIdx ? { ...s, activities: reindexActivities(s.activities.filter((_, j) => j !== actIdx)) } : s
      )
    );
  }
  function updateActivity(stageIdx: number, actIdx: number, patch: Partial<TplActivity>) {
    setStages((prev) =>
      prev.map((s, idx) =>
        idx === stageIdx
          ? { ...s, activities: s.activities.map((a, j) => (j === actIdx ? { ...a, ...patch } : a)) }
          : s
      )
    );
  }
  function moveActivity(stageIdx: number, actIdx: number, dir: -1 | 1) {
    setStages((prev) =>
      prev.map((s, idx) => {
        if (idx !== stageIdx) return s;
        const j = actIdx + dir;
        if (j < 0 || j >= s.activities.length) return s;
        const next = [...s.activities];
        [next[actIdx], next[j]] = [next[j], next[actIdx]];
        return { ...s, activities: reindexActivities(next) };
      })
    );
  }

  async function handleSave() {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/stage-templates/${templateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: { stages } }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error ?? `Error ${res.status}`);
        return;
      }
      push("success", "Estructura guardada");
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Editar estructura · ${templateName}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={busy} loading={busy}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {err && (
          <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">
            {err}
          </div>
        )}
        <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded p-2.5">
          <strong>Días desde inicio</strong> = posición relativa a la fecha base elegida al aplicar
          la plantilla. Ej: &quot;Diagnóstico&quot; con días <strong>0 → 5</strong> arranca el día
          que inicias el proyecto y dura 5 días. Vacío = sin fecha plan. Arrastra ⋮⋮ para
          reordenar etapas o actividades.
        </p>

        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
          {stages.map((s, sIdx) => (
            <div
              key={sIdx}
              draggable
              onDragStart={(e) => {
                setDragStage(sIdx);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (dragStage !== null) {
                  e.preventDefault();
                  setDragOverStage(sIdx);
                }
              }}
              onDragLeave={() => setDragOverStage(null)}
              onDrop={(e) => {
                e.preventDefault();
                if (dragStage !== null) dropStageOn(dragStage, sIdx);
                setDragStage(null);
                setDragOverStage(null);
              }}
              onDragEnd={() => {
                setDragStage(null);
                setDragOverStage(null);
              }}
              className={`bg-slate-50 border rounded p-3 space-y-2 transition-all ${
                dragStage === sIdx ? "opacity-40" : ""
              } ${dragOverStage === sIdx && dragStage !== sIdx ? "border-brand-primary border-2" : "border-slate-200"}`}
            >
              <div className="flex items-center gap-2">
                <span
                  className="text-slate-400 hover:text-slate-700 cursor-grab active:cursor-grabbing text-sm leading-none select-none px-1"
                  title="Arrastra para reordenar etapa"
                >
                  ⋮⋮
                </span>
                <input
                  value={s.name}
                  onChange={(e) => renameStage(sIdx, e.target.value)}
                  className="font-sans text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded px-2 py-1 flex-1 focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
                  placeholder="Nombre de la etapa"
                />
                <button
                  onClick={() => moveStage(sIdx, -1)}
                  disabled={sIdx === 0}
                  className="text-slate-400 hover:text-brand-primary-dark disabled:opacity-30 text-xs px-1"
                  title="Mover arriba"
                >
                  ↑
                </button>
                <button
                  onClick={() => moveStage(sIdx, 1)}
                  disabled={sIdx === stages.length - 1}
                  className="text-slate-400 hover:text-brand-primary-dark disabled:opacity-30 text-xs px-1"
                  title="Mover abajo"
                >
                  ↓
                </button>
                <button
                  onClick={() => deleteStage(sIdx)}
                  className="text-[11px] text-rose-700 hover:underline"
                >
                  Eliminar
                </button>
              </div>

              <div className="space-y-1">
                {s.activities.map((a, aIdx) => {
                  const isDragging = dragActivity?.stageIdx === sIdx && dragActivity?.actIdx === aIdx;
                  const isDragOver = dragOverActivity?.stageIdx === sIdx && dragOverActivity?.actIdx === aIdx;
                  return (
                  <div
                    key={aIdx}
                    draggable
                    onDragStart={(e) => {
                      e.stopPropagation();
                      setDragActivity({ stageIdx: sIdx, actIdx: aIdx });
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => {
                      if (dragActivity?.stageIdx === sIdx) {
                        e.preventDefault();
                        e.stopPropagation();
                        setDragOverActivity({ stageIdx: sIdx, actIdx: aIdx });
                      }
                    }}
                    onDragLeave={() => setDragOverActivity(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (dragActivity?.stageIdx === sIdx) {
                        dropActivityOn(sIdx, dragActivity.actIdx, aIdx);
                      }
                      setDragActivity(null);
                      setDragOverActivity(null);
                    }}
                    onDragEnd={() => {
                      setDragActivity(null);
                      setDragOverActivity(null);
                    }}
                    className={`bg-white border rounded p-2 space-y-1.5 transition-all ${
                      isDragging ? "opacity-40" : ""
                    } ${isDragOver && !isDragging ? "border-brand-primary border-2" : "border-slate-200"}`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="text-slate-300 hover:text-slate-600 cursor-grab active:cursor-grabbing text-xs leading-none select-none"
                        title="Arrastra para reordenar"
                      >
                        ⋮⋮
                      </span>
                      <input
                        value={a.name}
                        onChange={(e) => updateActivity(sIdx, aIdx, { name: e.target.value })}
                        className="font-sans text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded px-2 py-0.5 flex-1 focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
                        placeholder="Nombre de la actividad"
                      />
                      <button
                        onClick={() => moveActivity(sIdx, aIdx, -1)}
                        disabled={aIdx === 0}
                        className="text-slate-400 hover:text-brand-primary-dark disabled:opacity-30 text-xs px-1"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => moveActivity(sIdx, aIdx, 1)}
                        disabled={aIdx === s.activities.length - 1}
                        className="text-slate-400 hover:text-brand-primary-dark disabled:opacity-30 text-xs px-1"
                      >
                        ↓
                      </button>
                      <button
                        onClick={() => deleteActivity(sIdx, aIdx)}
                        className="text-[11px] text-rose-700 hover:underline"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[10px] font-bold uppercase tracking-widest text-slate-400 shrink-0"
                        title="Días desde la fecha base del proyecto"
                      >
                        Día
                      </span>
                      <input
                        type="number"
                        value={a.offset_start_days ?? ""}
                        onChange={(e) =>
                          updateActivity(sIdx, aIdx, {
                            offset_start_days: e.target.value === "" ? null : parseInt(e.target.value, 10),
                          })
                        }
                        placeholder="inicio"
                        className="font-sans text-xs text-slate-700 bg-white border border-slate-200 rounded px-2 py-0.5 w-20 focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
                      />
                      <span className="text-xs text-slate-400">→</span>
                      <input
                        type="number"
                        value={a.offset_end_days ?? ""}
                        onChange={(e) =>
                          updateActivity(sIdx, aIdx, {
                            offset_end_days: e.target.value === "" ? null : parseInt(e.target.value, 10),
                          })
                        }
                        placeholder="fin"
                        className="font-sans text-xs text-slate-700 bg-white border border-slate-200 rounded px-2 py-0.5 w-20 focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
                      />
                      <span className="text-[10px] text-slate-500">días</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[10px] font-bold uppercase tracking-widest text-slate-400 shrink-0"
                        title="Esta actividad no debe iniciar antes de que la dependencia termine"
                      >
                        Depende de
                      </span>
                      <select
                        value={a.depends_on_path ?? ""}
                        onChange={(e) =>
                          updateActivity(sIdx, aIdx, {
                            depends_on_path: e.target.value || null,
                          })
                        }
                        className="font-sans text-xs text-slate-700 bg-white border border-slate-200 rounded px-2 py-0.5 flex-1 focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
                      >
                        <option value="">— Sin dependencia —</option>
                        {stages.flatMap((depStage, dsIdx) =>
                          depStage.activities.map((depAct, daIdx) => {
                            // No permitir auto-referencia
                            if (dsIdx === sIdx && daIdx === aIdx) return null;
                            const path = `${dsIdx}.${daIdx}`;
                            return (
                              <option key={path} value={path}>
                                {depStage.name} → {depAct.name}
                              </option>
                            );
                          })
                        )}
                      </select>
                    </div>
                  </div>
                  );
                })}
                <button
                  onClick={() => addActivity(sIdx)}
                  className="text-[11px] text-brand-primary-dark hover:underline mt-1"
                >
                  + Actividad
                </button>
              </div>
            </div>
          ))}

          {stages.length === 0 && (
            <p className="text-[11px] text-slate-500 italic text-center py-4">
              Sin etapas. Agrega la primera abajo.
            </p>
          )}
        </div>

        <Button onClick={addStage} variant="secondary" size="sm">
          + Etapa
        </Button>
      </div>
    </Modal>
  );
}
