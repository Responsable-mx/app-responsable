"use client";

// Biblioteca de plantillas de etapas/actividades. Admin-only.
// CRUD: list, edit metadata, delete. La estructura solo se crea desde un servicio.

import { useState } from "react";
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
  data: { stages: { name: string; activities: { name: string; offset_start_days: number | null; offset_end_days: number | null }[] }[] };
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<{ data: Template[] }>;
  });

const catalogFetcher = (url: string) =>
  fetch(url)
    .then((r) => r.json())
    .then((j) => (j.data ?? []) as { value: string; label: string }[]);

export function TemplatesManager() {
  const { data, error, isLoading, mutate } = useSWR("/api/stage-templates", fetcher);
  const { data: serviceCat = [] } = useSWR<{ value: string; label: string }[]>(
    "/api/catalogs?category=services",
    catalogFetcher,
    { revalidateOnFocus: false }
  );

  const [editing, setEditing] = useState<Template | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);
  const [previewing, setPreviewing] = useState<Template | null>(null);
  const { push } = useToast();

  const serviceLabel = (key: string | null) =>
    key ? serviceCat.find((c) => c.value === key)?.label ?? key : null;

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white border border-slate-200 rounded h-24 animate-pulse" />
        ))}
      </div>
    );
  }

  if (error)
    return (
      <div className="border border-rose-200 bg-rose-50 rounded p-4 text-sm text-rose-700">
        No se pudo cargar la biblioteca.
      </div>
    );

  const templates = data?.data ?? [];

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/stage-templates/${deleteTarget.id}`, { method: "DELETE" });
    if (!res.ok) push("error", "No se pudo eliminar");
    else {
      push("success", "Plantilla eliminada");
      mutate();
    }
    setDeleteTarget(null);
  }

  return (
    <div className="bg-white border border-slate-200 rounded shadow-sm">
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-4">
        <span className="text-sm font-semibold text-slate-900">
          {templates.length}{" "}
          {templates.length === 1 ? "plantilla" : "plantillas"} guardadas
        </span>
      </div>

      {templates.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <h3 className="text-sm font-semibold text-slate-900 mb-1">Sin plantillas todavía</h3>
          <p className="text-xs text-slate-600 max-w-md mx-auto">
            Para crear la primera plantilla, ve a la ficha de un cliente con etapas y
            actividades, abre el tab Cronograma y usa &quot;Guardar como plantilla&quot;.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {templates.map((t) => {
            const totalActivities = t.data.stages.reduce(
              (s, st) => s + st.activities.length,
              0
            );
            // Calcular duración total estimada (max offset_end_days)
            let maxOffset = 0;
            for (const st of t.data.stages) {
              for (const a of st.activities) {
                if (a.offset_end_days !== null && a.offset_end_days > maxOffset) {
                  maxOffset = a.offset_end_days;
                }
              }
            }
            return (
              <li key={t.id} className="px-5 py-3 hover:bg-slate-50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-slate-900 truncate">
                        {t.name}
                      </h3>
                      {t.service && (
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-brand-primary-light text-brand-primary-dark border border-brand-primary/20 rounded-sm px-1.5 py-0.5">
                          {serviceLabel(t.service)}
                        </span>
                      )}
                    </div>
                    {t.description && (
                      <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">
                        {t.description}
                      </p>
                    )}
                    <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
                      {t.data.stages.length}{" "}
                      {t.data.stages.length === 1 ? "etapa" : "etapas"} ·{" "}
                      {totalActivities}{" "}
                      {totalActivities === 1 ? "actividad" : "actividades"}
                      {maxOffset > 0 && ` · ${maxOffset}d duración total`}
                      {t.created_by && ` · por ${t.created_by.split("@")[0]}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setPreviewing(t)}
                      className="text-[11px] text-slate-600 hover:text-brand-primary-dark hover:underline"
                    >
                      Ver
                    </button>
                    <button
                      onClick={() => setEditing(t)}
                      className="text-[11px] text-brand-primary-dark hover:underline"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => setDeleteTarget(t)}
                      className="text-[11px] text-rose-700 hover:underline"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <EditTemplateModal
          template={editing}
          serviceCat={serviceCat}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            mutate();
          }}
        />
      )}

      {previewing && (
        <PreviewTemplateModal
          template={previewing}
          onClose={() => setPreviewing(null)}
        />
      )}

      <ConfirmModal
        open={deleteTarget !== null}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="¿Eliminar plantilla?"
        description={`Se elimina "${deleteTarget?.name}". Los proyectos donde ya se aplicó no se ven afectados.`}
        confirmLabel="Sí, eliminar"
        tone="destructive"
      />
    </div>
  );
}

function EditTemplateModal({
  template,
  serviceCat,
  onClose,
  onSaved,
}: {
  template: Template;
  serviceCat: { value: string; label: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description ?? "");
  const [service, setService] = useState(template.service ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { push } = useToast();

  async function handleSave() {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/stage-templates/${template.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          service: service || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error ?? `Error ${res.status}`);
        return;
      }
      push("success", "Plantilla actualizada");
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Editar plantilla"
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
        <Input
          label="Nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Descripción
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="font-sans w-full text-sm border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Servicio asociado
          </label>
          <select
            value={service}
            onChange={(e) => setService(e.target.value)}
            className="font-sans w-full text-sm border border-slate-200 rounded px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
          >
            <option value="">Sin servicio (genérica)</option>
            {serviceCat.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <p className="text-[10px] text-slate-500 mt-1">
            Si se asocia a un servicio, las plantillas pueden filtrarse al aplicarlas.
          </p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded p-2.5 text-xs text-slate-600">
          La estructura (etapas + actividades + offsets) no se edita acá. Para cambiarla,
          aplica esta plantilla a un servicio nuevo, edita las actividades, y guárdala
          como plantilla nueva.
        </div>
      </div>
    </Modal>
  );
}

function PreviewTemplateModal({
  template,
  onClose,
}: {
  template: Template;
  onClose: () => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title={`Plantilla: ${template.name}`}
      footer={
        <Button variant="ghost" onClick={onClose}>
          Cerrar
        </Button>
      }
    >
      <div className="space-y-3 text-xs">
        {template.description && (
          <p className="text-slate-700">{template.description}</p>
        )}
        <div className="space-y-2">
          {template.data.stages.map((s, i) => (
            <div key={i} className="bg-slate-50 border border-slate-200 rounded p-3">
              <p className="font-bold text-slate-900 mb-1.5">
                {i + 1}. {s.name}
                <span className="ml-2 text-[10px] font-normal text-slate-500">
                  {s.activities.length}{" "}
                  {s.activities.length === 1 ? "actividad" : "actividades"}
                </span>
              </p>
              {s.activities.length === 0 ? (
                <p className="text-[11px] text-slate-500 italic">Sin actividades</p>
              ) : (
                <ul className="space-y-1">
                  {s.activities.map((a, j) => (
                    <li
                      key={j}
                      className="bg-white border border-slate-200 rounded p-2 flex items-start justify-between gap-2"
                    >
                      <span className="text-xs text-slate-700">{a.name}</span>
                      <span className="text-[10px] text-slate-500 tabular-nums shrink-0">
                        {a.offset_start_days !== null && a.offset_end_days !== null
                          ? `día ${a.offset_start_days}–${a.offset_end_days}`
                          : "sin fechas"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
