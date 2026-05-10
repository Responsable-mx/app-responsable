"use client";

import useSWR from "swr";
import { SkeletonList } from "@/components/ui/Skeleton";
import type { AuditLogEntry } from "@/app/api/clients/[id]/dm-log/route";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type Props = {
  clientId: string;
};

// ── Fetcher ───────────────────────────────────────────────────────────────────

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

// ── Utilidades ────────────────────────────────────────────────────────────────

function formatFecha(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Humaniza claves internas del catálogo para mostrar al usuario */
const FIELD_LABELS: Record<string, string> = {
  name: "Nombre",
  sector: "Sector",
  size: "Tamaño",
  services: "Servicios",
  frameworks: "Marcos de referencia",
  certifications: "Certificaciones",
  material_topics: "Temas materiales",
  stakeholders: "Grupos de interés",
  business_model: "Modelo de negocio",
  impacts: "Impactos",
  regulatory_context: "Contexto regulatorio",
  sustainability_strategy: "Estrategia de sustentabilidad",
  logo_url: "Logo",
  website: "Sitio web",
  sustainability_report_url: "Informe de sustentabilidad",
  financial_report_url: "Informe financiero",
  description: "Descripción",
  country: "País",
  city: "Ciudad",
  seniority_level: "Nivel de seniority",
  short_horizon: "Horizonte corto",
  medium_horizon: "Horizonte mediano",
  long_horizon: "Horizonte largo",
};

function diffFields(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): string {
  if (!before || !after) return "—";
  const changed = Object.keys(after).filter((k) => after[k] !== before[k]);
  if (changed.length === 0) return "—";
  const labels = changed.map((k) => FIELD_LABELS[k] ?? k);
  const joined = labels.join(", ");
  return joined.length > 60 ? joined.slice(0, 57) + "…" : joined;
}

// ── Badge de acción ───────────────────────────────────────────────────────────

const ACTION_STYLES: Record<AuditLogEntry["action"], string> = {
  UPDATE: "bg-amber-50 text-amber-700",
  INSERT: "bg-teal-50 text-teal-700",
  DELETE: "bg-rose-50 text-rose-700",
};

function AccionBadge({ action }: { action: AuditLogEntry["action"] }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-sm text-[11px] font-semibold tabular-nums ${
        ACTION_STYLES[action] ?? "bg-slate-100 text-slate-600"
      }`}
    >
      {action}
    </span>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function LogDecisionesSection({ clientId }: Props) {
  const { data, isLoading, error } = useSWR<{ entries: AuditLogEntry[] }>(
    `/api/clients/${clientId}/dm-log`,
    fetcher,
    { revalidateOnFocus: false }
  );

  const entries = data?.entries ?? [];

  return (
    <section className="border border-slate-200 rounded bg-white shadow-sm">
      {/* Encabezado */}
      <div className="px-5 py-4 border-b border-slate-100">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-0.5">
          Audit trail
        </p>
        <h3 className="text-sm font-semibold text-slate-800">
          Log de decisiones
        </h3>
      </div>

      {/* Cuerpo */}
      <div className="px-5 py-4">
        {isLoading ? (
          <SkeletonList items={4} itemHeight="h-10" />
        ) : error ? (
          <p className="text-xs text-rose-500 italic">
            No se pudo cargar el log de cambios.
          </p>
        ) : entries.length === 0 ? (
          <p className="text-xs text-slate-400 italic">
            Sin cambios registrados aún.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full w-max text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left pr-4 pb-2 uppercase tracking-widest text-[10px] font-bold text-slate-400 whitespace-nowrap">
                      Fecha
                    </th>
                    <th className="text-left pr-4 pb-2 uppercase tracking-widest text-[10px] font-bold text-slate-400 whitespace-nowrap">
                      Quién
                    </th>
                    <th className="text-left pr-4 pb-2 uppercase tracking-widest text-[10px] font-bold text-slate-400 whitespace-nowrap">
                      Entidad
                    </th>
                    <th className="text-left pr-4 pb-2 uppercase tracking-widest text-[10px] font-bold text-slate-400 whitespace-nowrap">
                      Acción
                    </th>
                    <th className="text-left pb-2 uppercase tracking-widest text-[10px] font-bold text-slate-400 whitespace-nowrap">
                      Cambio
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {entries.map((e, i) => (
                    <tr
                      key={e.id}
                      className={i % 2 === 0 ? "bg-white" : "bg-slate-50/60"}
                    >
                      <td className="pr-4 py-2 text-xs text-slate-600 tabular-nums whitespace-nowrap">
                        {formatFecha(e.created_at)}
                      </td>
                      <td className="pr-4 py-2 text-xs text-slate-700 whitespace-nowrap max-w-[160px] truncate">
                        {e.actor_email}
                      </td>
                      <td className="pr-4 py-2 text-xs text-slate-500 whitespace-nowrap">
                        {e.entity_type}
                      </td>
                      <td className="pr-4 py-2 whitespace-nowrap">
                        <AccionBadge action={e.action} />
                      </td>
                      <td className="py-2 text-xs text-slate-500 max-w-[200px] truncate">
                        {diffFields(e.before, e.after)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-400 mt-3 text-right">
              Últimas 50 entradas
            </p>
          </>
        )}
      </div>
    </section>
  );
}
