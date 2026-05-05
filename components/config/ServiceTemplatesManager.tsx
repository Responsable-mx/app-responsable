"use client";

// Lista y elimina plantillas de etapas guardadas. Las plantillas se crean
// desde el cronograma del cliente con "Guardar como plantilla".

import { useState } from "react";
import useSWR from "swr";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/Toast";
import { SkeletonList } from "@/components/ui/Skeleton";

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

const catalogFetcher = (url: string) =>
  fetch(url)
    .then((r) => r.json())
    .then((j) => (j.data ?? []) as { value: string; label: string }[]);

export function ServiceTemplatesManager() {
  const { data, isLoading, error, mutate } = useSWR("/api/stage-templates", fetcher);
  const { data: serviceCat = [] } = useSWR<{ value: string; label: string }[]>(
    "/api/catalogs?category=services",
    catalogFetcher,
    { revalidateOnFocus: false, dedupingInterval: 3_600_000 }
  );
  const [confirmDelete, setConfirmDelete] = useState<Template | null>(null);
  const { push } = useToast();

  const serviceLabel = (key: string | null) =>
    key ? (serviceCat.find((c) => c.value === key)?.label ?? key) : null;

  async function handleDelete() {
    if (!confirmDelete) return;
    const res = await fetch(`/api/stage-templates/${confirmDelete.id}`, { method: "DELETE" });
    if (!res.ok) {
      push("error", "No se pudo eliminar la plantilla");
    } else {
      push("success", `Plantilla "${confirmDelete.name}" eliminada`);
      mutate();
    }
    setConfirmDelete(null);
  }

  if (isLoading) return <SkeletonList items={3} />;
  if (error)
    return (
      <div className="border border-rose-200 bg-rose-50 rounded p-4 text-sm text-rose-700">
        No se pudieron cargar las plantillas.
      </div>
    );

  const templates = data?.data ?? [];

  if (templates.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded p-12 text-center">
        <h3 className="text-sm font-semibold text-slate-900 mb-2">Sin plantillas guardadas</h3>
        <p className="text-xs text-slate-600 max-w-sm mx-auto">
          Las plantillas se crean desde el cronograma de un cliente. Abre un cliente,
          ve al tab{" "}
          <span className="font-semibold text-slate-700">Cronograma</span> y usa{" "}
          <span className="font-semibold text-slate-700">Guardar como plantilla</span> en
          cualquier servicio que ya tenga etapas.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {templates.map((t) => {
          const stageCount = t.data.stages.length;
          const actCount = t.data.stages.reduce((s, st) => s + st.activities.length, 0);
          const svcLabel = serviceLabel(t.service);
          return (
            <div
              key={t.id}
              className="bg-white border border-slate-200 rounded shadow-sm p-4 flex items-start justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold text-slate-900">{t.name}</h3>
                  {svcLabel && (
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      {svcLabel}
                    </span>
                  )}
                </div>
                {t.description && (
                  <p className="text-xs text-slate-600 mt-0.5">{t.description}</p>
                )}
                <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
                  {stageCount} {stageCount === 1 ? "etapa" : "etapas"} ·{" "}
                  {actCount} {actCount === 1 ? "actividad" : "actividades"}
                </p>
                {t.data.stages.length > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {t.data.stages.map((s, i) => (
                      <li key={i} className="text-[11px] text-slate-600">
                        • {s.name}{" "}
                        <span className="text-slate-400">
                          ({s.activities.length}{" "}
                          {s.activities.length === 1 ? "actividad" : "actividades"})
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button
                onClick={() => setConfirmDelete(t)}
                className="shrink-0 text-[11px] text-rose-700 hover:underline"
              >
                Eliminar
              </button>
            </div>
          );
        })}
      </div>

      <ConfirmModal
        open={confirmDelete !== null}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        title="¿Eliminar plantilla?"
        description={`Se elimina "${confirmDelete?.name}". Los proyectos donde ya se aplicó no se ven afectados.`}
        confirmLabel="Sí, eliminar"
        tone="destructive"
      />
    </>
  );
}
