"use client";

// Tab "Cronograma" — etapas + actividades por servicio del cliente.
// Fase 1: lista jerárquica editable. Fase 2 portará un Gantt visual.

import useSWR from "swr";
import Link from "next/link";
import { ServiceStagesPanel } from "./ServiceStagesPanel";

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

export function ClientCronogramaTab({
  clientId,
  isAdmin,
}: {
  clientId: string;
  isAdmin: boolean;
}) {
  const { data: servicesData, isLoading: loadingServices } = useSWR<{ data: ServiceRow[] }>(
    `/api/clients/${clientId}/services`,
    fetcher
  );
  const { data: consultorsData } = useSWR<{ data: ConsultorRow[] }>(
    `/api/clients/${clientId}/consultors`,
    fetcher
  );

  const services = servicesData?.data ?? [];
  const consultorEmails = (consultorsData?.data ?? []).map((c) => c.user_email);

  if (loadingServices) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <div key={i} className="bg-white border border-slate-200 rounded h-24 animate-pulse" />
        ))}
      </div>
    );
  }

  if (services.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded p-12 text-center">
        <h2 className="text-sm font-semibold text-slate-900 mb-2">Sin servicios contratados</h2>
        <p className="text-xs text-slate-600 max-w-md mx-auto">
          El cronograma se construye sobre los servicios contratados del cliente.
          Primero agrega servicios desde la edición del cliente.
        </p>
        <Link
          href={`/clientes/${clientId}/editar`}
          className="inline-block mt-4 text-xs text-brand-primary-dark hover:underline"
        >
          Ir a editar cliente →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">
            Cronograma del cliente
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Etapas y actividades por servicio. Fechas plan vs reales — el status se calcula automáticamente.
          </p>
        </div>
      </div>

      {!isAdmin && (
        <div className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded p-2.5">
          Solo admin puede crear etapas/actividades o cambiar fechas plan. Tú puedes
          actualizar fechas reales de las actividades donde estés asignado.
        </div>
      )}

      {services.map((s) => (
        <div key={s.id} className="bg-white border border-slate-200 rounded p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">{s.service}</h3>
            <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
              Servicio
            </span>
          </div>
          <ServiceStagesPanel
            clientId={clientId}
            clientServiceId={s.id}
            isAdmin={isAdmin}
            consultorEmails={consultorEmails}
          />
        </div>
      ))}
    </div>
  );
}
