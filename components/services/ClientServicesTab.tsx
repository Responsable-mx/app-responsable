"use client";

import { useState } from "react";
import useSWR from "swr";
import { SERVICE_BY_KEY } from "@/lib/services/service-schemas";
import type { ServiceKey } from "@/lib/services/service-schemas";
import { ServiceEditor } from "./ServiceEditor";
import { ConfirmModal } from "@/components/ui/ConfirmModal";

type Row = {
  id: string;
  service: ServiceKey;
  data: Record<string, unknown>;
  updated_at: string;
  updated_by: string | null;
};

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<{ data: Row[] }>;
  });

export function ClientServicesTab({ clientId }: { clientId: string }) {
  const { data, mutate, isLoading } = useSWR(
    `/api/clients/${clientId}/services`,
    fetcher
  );
  const [editorMode, setEditorMode] = useState<
    | null
    | { kind: "create" }
    | { kind: "edit"; row: Row }
  >(null);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const rows = data?.data ?? [];

  async function handleDelete() {
    if (!deleteTarget) return;
    await fetch(`/api/client-services/${deleteTarget.id}`, { method: "DELETE" });
    setDeleteTarget(null);
    mutate();
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <div key={i} className="skeleton h-20 rounded" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">
            Servicios contratados
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            {rows.length === 0
              ? "Aún no hay servicios asignados a este cliente."
              : `${rows.length} ${rows.length === 1 ? "servicio" : "servicios"} · Assets compartidos (stakeholders, KPIs, materialidad) viven en Contexto.`}
          </p>
        </div>
        <button
          onClick={() => setEditorMode({ kind: "create" })}
          className="px-3 py-2 bg-brand-primary-hover text-white text-sm font-medium rounded-lg hover:bg-brand-primary-dark"
        >
          + Nuevo servicio
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded p-12 text-center">
          <div className="text-3xl mb-3">📋</div>
          <p className="text-sm text-slate-600 mb-1">Sin servicios aún</p>
          <p className="text-xs text-slate-600 mb-5 max-w-sm mx-auto">
            Agrega el primer servicio — ayuda a los 4 roles IA a entender qué
            entregable estamos construyendo con este cliente.
          </p>
          <button
            onClick={() => setEditorMode({ kind: "create" })}
            className="px-4 py-2 bg-brand-primary-hover text-white text-sm font-medium rounded-lg hover:bg-brand-primary-dark"
          >
            + Agregar primer servicio
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const schema = SERVICE_BY_KEY[r.service];
            const summary = schema ? schema.summary(r.data) : "";
            return (
              <div
                key={r.id}
                className="bg-white border border-slate-200 rounded p-4 hover:border-brand-primary transition-colors group"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`shrink-0 w-10 h-10 rounded-lg border flex items-center justify-center text-lg ${schema?.color ?? "bg-slate-50 border-slate-200"}`}
                  >
                    {schema?.icon ?? "❓"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-900">
                        {schema?.label ?? r.service}
                      </h3>
                    </div>
                    {summary && (
                      <p className="text-xs text-slate-600 mt-0.5">{summary}</p>
                    )}
                    <p className="text-[10px] text-slate-600 mt-1">
                      Actualizado {new Date(r.updated_at).toLocaleDateString("es-MX")}
                      {r.updated_by && ` · ${r.updated_by}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setEditorMode({ kind: "edit", row: r })}
                      className="text-xs px-2 py-1 text-brand-primary-hover hover:bg-brand-primary-light rounded"
                    >
                      ✎ Editar
                    </button>
                    <button
                      onClick={() => setDeleteTarget(r)}
                      className="text-xs px-2 py-1 text-red-700 hover:bg-red-50 rounded"
                    >
                      ⊗
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editorMode?.kind === "create" && (
        <ServiceEditor
          mode={{ kind: "create", clientId }}
          onClose={() => setEditorMode(null)}
          onSaved={() => {
            setEditorMode(null);
            mutate();
          }}
        />
      )}
      {editorMode?.kind === "edit" && (
        <ServiceEditor
          mode={{
            kind: "edit",
            serviceId: editorMode.row.id,
            initialService: editorMode.row.service,
            initialData: editorMode.row.data,
          }}
          onClose={() => setEditorMode(null)}
          onSaved={() => {
            setEditorMode(null);
            mutate();
          }}
        />
      )}

      <ConfirmModal
        open={deleteTarget !== null}
        title={`Eliminar servicio ${
          deleteTarget ? SERVICE_BY_KEY[deleteTarget.service]?.label : ""
        }`}
        description="Esta acción no se puede deshacer. El histórico del servicio quedará borrado."
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        tone="destructive"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
