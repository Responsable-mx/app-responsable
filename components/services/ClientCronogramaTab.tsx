"use client";

// Tab "Cronograma" — etapas + actividades por servicio del cliente.
// 2 vistas: Lista (jerárquica editable) y Gantt (timeline plan vs real).
// Toggle de vista al lado del header.

import { useState } from "react";
import useSWR from "swr";
import { ServiceStagesPanel } from "./ServiceStagesPanel";
import { ServiceGantt } from "./ServiceGantt";
import { ActivityEditorModal } from "./ActivityEditorModal";
import { ServiceEditor } from "./ServiceEditor";
import { useToast } from "@/components/ui/Toast";
import type { ServiceStage, StageActivity } from "@/lib/stages";
import type { QuickPatch } from "./QuickActionPopover";

type ServiceRow = {
  id: string;
  service: string;
  data: Record<string, unknown>;
  updated_at: string;
};

type ConsultorRow = {
  user_email: string;
  full_name: string | null;
};

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

type ViewMode = "list" | "gantt";

export function ClientCronogramaTab({
  clientId,
  isAdmin,
  initialView = "list",
}: {
  clientId: string;
  isAdmin: boolean;
  initialView?: ViewMode;
}) {
  const [view, setView] = useState<ViewMode>(initialView);
  const [filterAssignee, setFilterAssignee] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return sessionStorage.getItem(`gantt-filter-${clientId}`) ?? null;
  });

  function changeFilter(email: string | null) {
    setFilterAssignee(email);
    if (email) sessionStorage.setItem(`gantt-filter-${clientId}`, email);
    else sessionStorage.removeItem(`gantt-filter-${clientId}`);
  }
  const { push: pushToast } = useToast();
  const [editingActivity, setEditingActivity] = useState<{
    stageId: string;
    activity?: StageActivity;
  } | null>(null);
  const [creatingService, setCreatingService] = useState(false);
  const [editingService, setEditingService] = useState<ServiceRow | null>(null);

  const { data: servicesData, isLoading: loadingServices, error: servicesError, mutate: mutateServices } = useSWR<{ data: ServiceRow[] }>(
    `/api/clients/${clientId}/services`,
    fetcher
  );
  const { data: consultorsData } = useSWR<{ data: ConsultorRow[] }>(
    `/api/clients/${clientId}/consultors`,
    fetcher
  );
  const { data: catalogServices } = useSWR<{ data: { value: string; label: string }[] }>(
    "/api/catalogs?category=services",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 3_600_000 }
  );
  const serviceLabel = (key: string) =>
    catalogServices?.data.find((c) => c.value === key)?.label ?? key;

  // En modo Gantt necesitamos las stages aplanadas. Reutiliza el mismo endpoint
  // que ServiceStagesPanel — SWR comparte cache, sin doble fetch.
  const { data: stagesData, mutate: mutateStages } = useSWR<{ data: ServiceStage[] }>(
    view === "gantt" ? `/api/clients/${clientId}/stages` : null,
    fetcher
  );

  const services = servicesData?.data ?? [];
  const consultorEmails = (consultorsData?.data ?? []).map((c) => c.user_email);
  // Mapa email → nombre completo para mostrar en filas de actividades
  const consultorNames = new Map<string, string>(
    (consultorsData?.data ?? [])
      .filter((c) => c.full_name)
      .map((c) => [c.user_email, c.full_name as string])
  );
  const allStages = stagesData?.data ?? [];

  async function handleQuickAction(activityId: string, patch: QuickPatch) {
    const res = await fetch(`/api/activities/${activityId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      pushToast("error", (err as { error?: string }).error ?? "Error al actualizar actividad");
      throw new Error("patch failed");
    }
    await mutateStages();
  }

  async function handleFreezeBaseline() {
    const res = await fetch(`/api/clients/${clientId}/freeze-baseline`, { method: "POST" });
    if (!res.ok) {
      pushToast("error", "Error al congelar baseline");
      return;
    }
    const { frozen } = (await res.json()) as { frozen: number };
    pushToast("success", `Baseline congelado: ${frozen} actividad${frozen !== 1 ? "es" : ""}`);
    await mutateStages();
  }

  if (loadingServices) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <div key={i} className="bg-white border border-slate-200 rounded h-24 animate-pulse" />
        ))}
      </div>
    );
  }

  // D-45: error visible al usuario, no fallo silencioso
  if (servicesError) {
    return (
      <div className="bg-white border border-rose-200 rounded p-6 text-center">
        <p className="text-sm text-rose-700">Error al cargar servicios. Recarga la página.</p>
      </div>
    );
  }

  if (services.length === 0) {
    return (
      <>
        <div className="bg-white border border-slate-200 rounded p-12 text-center">
          <h2 className="text-sm font-semibold text-slate-900 mb-2">
            Sin servicios contratados
          </h2>
          <p className="text-xs text-slate-600 max-w-md mx-auto">
            El cronograma se construye sobre los servicios contratados.
            {isAdmin
              ? " Agrega el primer servicio para comenzar."
              : " El admin debe agregar servicios antes de crear el cronograma."}
          </p>
          {isAdmin && (
            <button
              onClick={() => setCreatingService(true)}
              className="inline-block mt-4 text-xs font-semibold text-brand-primary-dark hover:underline"
            >
              + Nuevo servicio
            </button>
          )}
        </div>
        {creatingService && (
          <ServiceEditor
            mode={{ kind: "create", clientId }}
            onClose={() => setCreatingService(false)}
            onSaved={() => { setCreatingService(false); void mutateServices(); }}
          />
        )}
      </>
    );
  }

  return (
    <div className="space-y-4">
      {/* Acciones + toggle vista — sin h2 redundante (el tab ya indica contexto) */}
      <div className="flex items-center justify-end gap-2 flex-wrap">
          {isAdmin && (
            <button
              onClick={() => setCreatingService(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded border border-slate-200 bg-white text-slate-700 hover:border-brand-primary hover:text-brand-primary-dark transition-colors"
              title="Agregar servicio contratado"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 4v16m8-8H4" />
              </svg>
              + Servicio
            </button>
          )}
          <a
            href={`/api/clients/${clientId}/export-cronograma-pdf`}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded border border-slate-200 bg-white text-slate-700 hover:border-brand-primary hover:text-brand-primary-dark transition-colors"
            title="Descargar cronograma como PDF"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
            </svg>
            Gantt PDF
          </a>
          {/* Separador visual acciones ↔ vistas */}
          <div className="w-px h-5 bg-slate-200 mx-0.5" aria-hidden />
          <ViewToggle value={view} onChange={setView} />
      </div>

      {!isAdmin && (
        <div className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded p-2.5">
          Solo admin crea etapas/actividades o cambia fechas plan. Tú actualizas
          fechas reales de las actividades donde estés asignado.
        </div>
      )}

      {view === "list" &&
        services.map((s) => (
          <div key={s.id} className="bg-white border border-slate-200 rounded p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
                  Servicio
                </span>
                <h3 className="text-sm font-semibold text-slate-900">{serviceLabel(s.service)}</h3>
              </div>
              {isAdmin && (
                <button
                  onClick={() => setEditingService(s)}
                  className="text-[10px] text-slate-400 hover:text-brand-primary-dark transition-colors"
                  title="Editar servicio"
                >
                  Editar
                </button>
              )}
            </div>
            <ServiceStagesPanel
              clientId={clientId}
              clientServiceId={s.id}
              isAdmin={isAdmin}
              consultorEmails={consultorEmails}
              consultorNames={consultorNames}
            />
          </div>
        ))}

      {view === "gantt" && consultorEmails.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Filtrar:</span>
          <button
            onClick={() => changeFilter(null)}
            className={`px-2 py-0.5 rounded-sm text-[10px] font-bold transition-colors ${
              filterAssignee === null
                ? "bg-brand-primary text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Todos
          </button>
          {consultorEmails.map((email) => (
            <button
              key={email}
              onClick={() => changeFilter(filterAssignee === email ? null : email)}
              className={`px-2 py-0.5 rounded-sm text-[10px] font-bold transition-colors ${
                filterAssignee === email
                  ? "bg-brand-primary text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {(consultorsData?.data ?? []).find((c) => c.user_email === email)?.full_name ?? email.split("@")[0]}
            </button>
          ))}
        </div>
      )}

      {view === "gantt" &&
        services.map((s) => {
          const rawStages = allStages.filter((st) => st.client_service_id === s.id);
          const stagesForService = filterAssignee
            ? rawStages
                .map((st) => ({
                  ...st,
                  activities: st.activities.filter((a) => a.assignee_email === filterAssignee),
                }))
                .filter((st) => st.activities.length > 0)
            : rawStages;
          return (
            <div key={s.id} className="space-y-2">
              <div className="flex items-center justify-between gap-2 px-1">
                <h3 className="text-sm font-semibold text-slate-900">{serviceLabel(s.service)}</h3>
                <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
                  Servicio
                </span>
              </div>
              {stagesForService.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded p-6 text-center text-xs text-slate-500">
                  {filterAssignee
                    ? "Sin actividades asignadas a este consultor en este servicio."
                    : "Sin etapas. Cambia a vista Lista para crear la primera."}
                </div>
              ) : (
                <ServiceGantt
                  stages={stagesForService}
                  onEditActivity={(stageId, activity) =>
                    setEditingActivity({ stageId, activity })
                  }
                  onQuickAction={handleQuickAction}
                  onFreezeBaseline={isAdmin ? handleFreezeBaseline : undefined}
                  isAdmin={isAdmin}
                  storageKey={`gantt-collapsed-${clientId}-${s.id}`}
                />
              )}
            </div>
          );
        })}

      {editingActivity && (
        <ActivityEditorModal
          stageId={editingActivity.stageId}
          activity={editingActivity.activity}
          consultorEmails={consultorEmails}
          isAdmin={isAdmin}
          lockStructure
          siblingActivities={allStages.flatMap((st) =>
            st.activities.map((a) => ({ id: a.id, name: a.name, stage_name: st.name }))
          )}
          onClose={() => setEditingActivity(null)}
          onSaved={() => {
            setEditingActivity(null);
            mutateStages();
          }}
        />
      )}

      {creatingService && (
        <ServiceEditor
          mode={{ kind: "create", clientId }}
          onClose={() => setCreatingService(false)}
          onSaved={() => { setCreatingService(false); void mutateServices(); }}
        />
      )}

      {editingService && (
        <ServiceEditor
          mode={{ kind: "edit", serviceId: editingService.id, initialService: editingService.service as import("@/lib/services/service-schemas").ServiceKey, initialData: editingService.data }}
          onClose={() => setEditingService(null)}
          onSaved={() => { setEditingService(null); void mutateServices(); }}
        />
      )}
    </div>
  );
}

function ViewToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  const opts: { v: ViewMode; label: string; icon: React.ReactNode }[] = [
    {
      v: "list",
      label: "Lista",
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M4 6h16M4 12h16M4 18h16"
          />
        </svg>
      ),
    },
    {
      v: "gantt",
      label: "Gantt",
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M4 6h8M8 12h10M6 18h12"
          />
        </svg>
      ),
    },
  ];
  return (
    <div className="inline-flex items-center bg-slate-100 rounded p-0.5">
      {opts.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider rounded transition-colors ${
            value === o.v
              ? "bg-white text-brand-primary-dark shadow-sm"
              : "text-slate-500 hover:text-slate-900"
          }`}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}
