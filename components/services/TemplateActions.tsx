"use client";

// 2 acciones admin para un servicio del cliente:
// 1) "Guardar como plantilla" — serializa stages+activities con offsets en días
// 2) "Aplicar plantilla" — crea stages+activities desde una plantilla + fecha base

import { useState, useRef, useEffect } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/Toast";

type Template = {
  id: string;
  name: string;
  description: string | null;
  service: string | null;
  data: { stages: { name: string; activities: { name: string }[] }[] };
};

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<{ data: Template[] }>;
  });

export function TemplateActions({
  clientServiceId,
  hasStages,
  onApplied,
}: {
  clientServiceId: string;
  hasStages: boolean;
  onApplied: () => void;
}) {
  const [openSave, setOpenSave] = useState(false);
  const [openApply, setOpenApply] = useState(false);
  const [openMenu, setOpenMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openMenu) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [openMenu]);

  return (
    <div className="relative" ref={menuRef}>
      {/* Sin etapas — CTA directa, sin menú overhead */}
      {!hasStages ? (
        <button
          onClick={() => setOpenApply(true)}
          className="text-[11px] font-semibold text-brand-primary-dark border border-brand-primary/40 rounded px-2 py-1 hover:bg-brand-primary/5 transition-colors"
        >
          Aplicar plantilla
        </button>
      ) : (
        <button
          onClick={() => setOpenMenu((v) => !v)}
          title="Acciones de plantilla"
          aria-label="Acciones de plantilla"
          className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z" />
          </svg>
        </button>
      )}

      {openMenu && hasStages && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-slate-200 rounded shadow-md py-1 min-w-[180px]">
          <button
            onClick={() => { setOpenMenu(false); setOpenApply(true); }}
            className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Aplicar plantilla
          </button>
          <button
            onClick={() => { setOpenMenu(false); setOpenSave(true); }}
            className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Guardar como plantilla
          </button>
        </div>
      )}

      {openSave && (
        <SaveTemplateModal
          clientServiceId={clientServiceId}
          onClose={() => setOpenSave(false)}
        />
      )}
      {openApply && (
        <ApplyTemplateModal
          clientServiceId={clientServiceId}
          onClose={() => setOpenApply(false)}
          onApplied={() => {
            setOpenApply(false);
            onApplied();
          }}
        />
      )}
    </div>
  );
}

function SaveTemplateModal({
  clientServiceId,
  onClose,
}: {
  clientServiceId: string;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { push } = useToast();

  async function handleSave() {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/stage-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          fromClientServiceId: clientServiceId,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error ?? `Error ${res.status}`);
        return;
      }
      push("success", `Plantilla "${name.trim()}" guardada`);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Guardar como plantilla"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || busy} loading={busy}>
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
        <p className="text-xs text-slate-600">
          La plantilla guarda etapas, actividades y offsets en días entre fechas plan.
          Al aplicarla a otro proyecto, las fechas se calculan desde una fecha base que
          tú elijas.
        </p>
        <Input
          label="Nombre de la plantilla"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej: Doble Materialidad estándar"
        />
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Descripción (opcional)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="font-sans w-full text-sm border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
            placeholder="Cuándo usar esta plantilla, scope típico, etc."
          />
        </div>
      </div>
    </Modal>
  );
}

function ApplyTemplateModal({
  clientServiceId,
  onClose,
  onApplied,
}: {
  clientServiceId: string;
  onClose: () => void;
  onApplied: () => void;
}) {
  const { data, isLoading } = useSWR<{ data: Template[] }>(
    "/api/stage-templates",
    fetcher
  );
  const [selectedId, setSelectedId] = useState<string>("");
  const [startDate, setStartDate] = useState<string>(
    () => new Date().toISOString().slice(0, 10)
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Template | null>(null);
  const { push } = useToast();

  const templates = data?.data ?? [];
  const selected = templates.find((t) => t.id === selectedId);

  async function handleApply() {
    if (!selectedId) return;
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/stage-templates/${selectedId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_service_id: clientServiceId,
          start_date: startDate,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error ?? `Error ${res.status}`);
        return;
      }
      const j = await res.json().catch(() => ({}));
      const r = j.data ?? {};
      push(
        "success",
        `Plantilla aplicada: ${r.stagesCreated} etapas, ${r.activitiesCreated} actividades`
      );
      onApplied();
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteTemplate() {
    if (!confirmDelete) return;
    const res = await fetch(`/api/stage-templates/${confirmDelete.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      push("error", "No se pudo eliminar la plantilla");
    } else {
      push("success", "Plantilla eliminada");
      // Forzar re-fetch
      void fetch("/api/stage-templates");
    }
    setConfirmDelete(null);
  }

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title="Aplicar plantilla"
        footer={
          <>
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancelar
            </Button>
            <Button
              onClick={handleApply}
              disabled={!selectedId || !startDate || busy}
              loading={busy}
            >
              Aplicar
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

          {isLoading ? (
            <p className="text-xs text-slate-500 italic">Cargando plantillas…</p>
          ) : templates.length === 0 ? (
            <div className="bg-slate-50 border border-slate-200 rounded p-4 text-center text-xs text-slate-600">
              <p className="mb-1 font-semibold">Sin plantillas guardadas todavía.</p>
              <p>
                Crea la primera plantilla desde otro servicio que ya tenga etapas y
                actividades, usando &quot;Guardar como plantilla&quot;.
              </p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Plantilla
                </label>
                <select
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  className="font-sans w-full text-sm border border-slate-200 rounded px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
                >
                  <option value="">— Selecciona una plantilla —</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.service ? ` · ${t.service}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {selected && (
                <div className="bg-slate-50 border border-slate-200 rounded p-3 text-xs space-y-2">
                  {selected.description && (
                    <p className="text-slate-700">{selected.description}</p>
                  )}
                  <div>
                    <p className="font-bold text-slate-700 mb-1">
                      Contenido ({selected.data.stages.length}{" "}
                      {selected.data.stages.length === 1 ? "etapa" : "etapas"})
                    </p>
                    <ul className="space-y-0.5">
                      {selected.data.stages.map((s, i) => (
                        <li key={i} className="text-slate-600">
                          • {s.name}{" "}
                          <span className="text-slate-400">
                            ({s.activities.length}{" "}
                            {s.activities.length === 1 ? "actividad" : "actividades"})
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <button
                    onClick={() => setConfirmDelete(selected)}
                    className="text-[11px] text-rose-700 hover:underline"
                  >
                    Eliminar plantilla
                  </button>
                </div>
              )}

              <Input
                label="Fecha base (día 0)"
                helper="Las fechas plan se calculan sumando los offsets desde aquí."
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </>
          )}
        </div>
      </Modal>

      <ConfirmModal
        open={confirmDelete !== null}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={handleDeleteTemplate}
        title="¿Eliminar plantilla?"
        description={`Se elimina "${confirmDelete?.name}". Los proyectos donde ya se aplicó no se ven afectados.`}
        confirmLabel="Sí, eliminar"
        tone="destructive"
      />
    </>
  );
}
