"use client";

import { useState } from "react";
import useSWR from "swr";
import { SERVICE_BY_KEY } from "@/lib/services/service-schemas";
import type { ServiceKey } from "@/lib/services/service-schemas";
import { ServiceEditor } from "./ServiceEditor";
import { ServiceStagesPanel } from "./ServiceStagesPanel";
import { ConfirmModal } from "@/components/ui/ConfirmModal";

type Row = {
  id: string;
  service: ServiceKey;
  data: Record<string, unknown>;
  updated_at: string;
  updated_by: string | null;
};

type ConsultorRow = { user_email: string };

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<{ data: Row[] }>;
  });

const consultorsFetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<{ data: ConsultorRow[] }>;
  });

export function ClientServicesTab({
  clientId,
  isAdmin = false,
}: {
  clientId: string;
  isAdmin?: boolean;
}) {
  const { data, mutate, isLoading } = useSWR(
    `/api/clients/${clientId}/services`,
    fetcher
  );
  const { data: consultorsData } = useSWR(
    `/api/clients/${clientId}/consultors`,
    consultorsFetcher,
    { revalidateOnFocus: false }
  );
  const [editorMode, setEditorMode] = useState<
    | null
    | { kind: "create" }
    | { kind: "edit"; row: Row }
  >(null);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  // Conjunto de IDs de servicios con etapas expandidas
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());

  const rows = data?.data ?? [];
  const consultorEmails = (consultorsData?.data ?? []).map((c) => c.user_email);

  function toggleStages(serviceId: string) {
    setExpandedStages((prev) => {
      const next = new Set(prev);
      if (next.has(serviceId)) next.delete(serviceId);
      else next.add(serviceId);
      return next;
    });
  }

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
        {isAdmin && (
          <button
            onClick={() => setEditorMode({ kind: "create" })}
            className="px-3 py-2 bg-brand-primary-hover text-white text-sm font-medium rounded hover:bg-brand-primary-dark"
          >
            + Nuevo servicio
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded p-12 text-center">
          <svg
            className="w-10 h-10 mx-auto mb-3 text-slate-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-sm text-slate-700 mb-1">Sin servicios aún</p>
          <p className="text-xs text-slate-600 mb-5 max-w-sm mx-auto">
            Agrega el primer servicio — ayuda a los 4 roles IA a entender qué
            entregable estamos construyendo con este cliente.
          </p>
          {isAdmin && (
            <button
              onClick={() => setEditorMode({ kind: "create" })}
              className="px-4 py-2 bg-brand-primary-hover text-white text-sm font-medium rounded hover:bg-brand-primary-dark"
            >
              + Agregar primer servicio
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const schema = SERVICE_BY_KEY[r.service];
            const summary = schema ? schema.summary(r.data) : "";
            const stagesOpen = expandedStages.has(r.id);
            return (
              <div
                key={r.id}
                className="bg-white border border-slate-200 rounded shadow-sm"
              >
                {/* Cabecera del servicio */}
                <div className="flex items-start gap-3 p-4 group hover:bg-slate-50 transition-colors">
                  <div
                    className={`shrink-0 w-10 h-10 rounded border flex items-center justify-center text-lg ${schema?.color ?? "bg-slate-50 border-slate-200"}`}
                  >
                    {schema?.icon ?? "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900">
                      {schema?.label ?? r.service}
                    </h3>
                    {summary && (
                      <p className="text-xs text-slate-600 mt-0.5">{summary}</p>
                    )}
                    <p className="text-[10px] text-slate-600 mt-1">
                      Actualizado {new Date(r.updated_at).toLocaleDateString("es-MX")}
                      {r.updated_by && ` · ${r.updated_by}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {/* Botón etapas — siempre visible */}
                    <button
                      onClick={() => toggleStages(r.id)}
                      className={`text-xs px-2 py-1 rounded transition-colors ${
                        stagesOpen
                          ? "bg-brand-primary-light text-brand-primary-dark"
                          : "text-slate-500 hover:bg-slate-100"
                      }`}
                    >
                      <span className="flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                        Etapas
                      </span>
                    </button>
                    {/* Editar / Eliminar — solo admin, al hover */}
                    {isAdmin && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setEditorMode({ kind: "edit", row: r })}
                          className="text-xs px-2 py-1 text-brand-primary-hover hover:bg-brand-primary-light rounded"
                          title="Editar servicio"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setDeleteTarget(r)}
                          className="text-xs px-2 py-1 text-rose-700 hover:bg-rose-50 rounded"
                          title="Eliminar servicio"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Panel de etapas expandible */}
                {stagesOpen && (
                  <div className="px-4 pb-4">
                    <ServiceStagesPanel
                      clientId={clientId}
                      clientServiceId={r.id}
                      isAdmin={isAdmin}
                      consultorEmails={consultorEmails}
                    />
                  </div>
                )}
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
