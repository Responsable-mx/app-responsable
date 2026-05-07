"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import type { TeamMember, ConsultantActivity } from "@/app/api/team/occupancy/route";
import { activityInDateRange, type EquipoFilters } from "./EquipoFilters";
import { SkeletonTable } from "@/components/ui/Skeleton";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<{ data: TeamMember[] }>;
  });

const seniorityFetcher = (url: string): Promise<{ value: string; label: string }[]> =>
  fetch(url)
    .then((r) => r.json())
    .then((j) => (j.data ?? []).map((i: { value: string; label: string }) => ({ value: i.value, label: i.label })));

type LoadLevel = { css: string; label: string; icon: string };

// Carga = actividades activas (in_progress + delayed). Más útil que conteo de proyectos.
function loadLevel(activeCount: number, delayedCount: number): LoadLevel {
  if (delayedCount > 0)
    return { css: "bg-rose-100 text-rose-700", label: "Tiene actividades retrasadas", icon: "⚠" };
  if (activeCount === 0)
    return { css: "bg-slate-100 text-slate-500", label: "Sin actividades activas", icon: "—" };
  if (activeCount <= 2)
    return { css: "bg-emerald-100 text-emerald-700", label: "Carga ligera", icon: "↓" };
  if (activeCount <= 4)
    return { css: "bg-amber-100 text-amber-700", label: "Carga alta", icon: "↑" };
  return { css: "bg-rose-100 text-rose-700", label: "Sobrecargado", icon: "⚠" };
}

function initials(name: string | null, email: string) {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
  });
}

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-slate-100 text-slate-600 border-slate-200",
  in_progress: "bg-brand-primary-light text-brand-primary-dark border-brand-primary/20",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  delayed: "bg-rose-50 text-rose-700 border-rose-200",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  in_progress: "En curso",
  completed: "Completada",
  delayed: "Retrasada",
};

export function TeamOccupancy({ filters }: { filters?: EquipoFilters } = {}) {
  const { data, error, isLoading } = useSWR("/api/team/occupancy", fetcher);
  const { data: seniorityItems = [] } = useSWR<{ value: string; label: string }[]>(
    "/api/catalogs?category=seniority_levels",
    seniorityFetcher,
    { revalidateOnFocus: false }
  );

  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);
  const [showLegend, setShowLegend] = useState(false);
  const [now] = useState(() => Date.now());

  const humanizeSeniority = (val: string | null) => {
    if (!val) return "—";
    return seniorityItems.find((s) => s.value === val)?.label ?? val;
  };

  if (isLoading) return <SkeletonTable rows={5} cols={6} />;
  if (error)
    return (
      <div className="border border-rose-200 bg-rose-50 rounded p-4 text-sm text-rose-700">
        No se pudo cargar la ocupación del equipo.
      </div>
    );

  const rawMembers = data?.data ?? [];
  // Columna Seniority: solo mostrar si al menos un consultor tiene nivel definido.
  const hasSeniority = rawMembers.some((m) => m.seniority_level !== null);
  const members = rawMembers
    .filter((m) => !filters?.consultorEmail || m.email === filters.consultorEmail)
    .map((m) => {
      let acts = m.activities;
      if (filters?.statuses && filters.statuses.size > 0) {
        acts = acts.filter((a) => filters.statuses.has(a.status));
      }
      if (filters?.clientId) {
        acts = acts.filter((a) => a.client_id === filters.clientId);
      }
      if (filters?.dateRange && filters.dateRange !== "all") {
        if (filters.dateRange === "overdue") {
          acts = acts.filter((a) => a.status === "delayed");
        } else {
          acts = acts.filter((a) => activityInDateRange(filters.dateRange, a.planned_start, a.planned_end));
        }
      }
      const today = now;
      const horizon = today + 30 * 86_400_000;
      let active = 0, delayed = 0, upcoming = 0;
      for (const a of acts) {
        if (a.status === "in_progress" || a.status === "delayed") active++;
        if (a.status === "delayed") delayed++;
        if (a.status === "pending" && a.planned_start) {
          const ts = new Date(a.planned_start + "T00:00:00").getTime();
          if (ts >= today && ts <= horizon) upcoming++;
        }
      }
      let projects = m.projects;
      if (filters?.clientId) {
        projects = projects.filter((p) => p.client_id === filters.clientId);
      }
      return { ...m, activities: acts, active_count: active, delayed_count: delayed, upcoming_count: upcoming, projects };
    });
  const totalActive = members.reduce((s, m) => s + m.active_count, 0);
  const totalDelayed = members.reduce((s, m) => s + m.delayed_count, 0);

  return (
    <div className="bg-white border border-slate-200 rounded shadow-sm">
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold text-slate-900">
            {members.length} {members.length === 1 ? "consultor activo" : "consultores activos"}
          </span>
          <span className="text-xs text-slate-500">{totalActive} actividades en curso</span>
          {totalDelayed > 0 && (
            <span className="text-xs text-rose-700 font-semibold">
              ⚠ {totalDelayed} retrasada{totalDelayed === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowLegend((v) => !v)}
          className={`inline-flex items-center gap-1.5 text-[11px] font-medium transition-colors ${showLegend ? "text-brand-primary-dark" : "text-slate-400 hover:text-slate-700"}`}
          aria-expanded={showLegend}
          title="Cómo interpretar esta tabla"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          ¿Cómo leer esta tabla?
        </button>
      </div>

      {showLegend && (
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-100">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Guía de interpretación</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white border border-slate-200 rounded p-3 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Carga</p>
              <p className="text-xs text-slate-700">Actividades que el consultor tiene <strong>en curso o retrasadas ahora</strong>.</p>
              <div className="space-y-1 pt-1">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-bold bg-emerald-100 text-emerald-700">↓ 1–2</span>
                  <span className="text-[10px] text-slate-500">Carga ligera</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-bold bg-amber-100 text-amber-700">↑ 3–4</span>
                  <span className="text-[10px] text-slate-500">Carga alta</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-bold bg-rose-100 text-rose-700">⚠ 5+</span>
                  <span className="text-[10px] text-slate-500">Sobrecargado</span>
                </div>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded p-3 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Atrasadas</p>
              <p className="text-xs text-slate-700">Actividades cuya <strong>fecha plan ya venció</strong> y aún no tienen fecha real de fin.</p>
              <p className="text-[10px] text-slate-500 pt-1">Si es &gt; 0 el consultor tiene compromisos vencidos. Requiere atención inmediata.</p>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-bold bg-rose-100 text-rose-700">2</span>
            </div>
            <div className="bg-white border border-slate-200 rounded p-3 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Próximas 30d</p>
              <p className="text-xs text-slate-700">Actividades <strong>pendientes que arrancan en los próximos 30 días</strong>.</p>
              <p className="text-[10px] text-slate-500 pt-1">Permite anticipar picos de trabajo antes de que se conviertan en retrasos.</p>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">3</span>
            </div>
            <div className="bg-white border border-slate-200 rounded p-3 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Proyectos</p>
              <p className="text-xs text-slate-700">Clientes activos asignados al consultor. Clic en un chip → ficha del cliente.</p>
              <p className="text-[10px] text-slate-500 pt-1">Clic en la fila del consultor para ver el detalle de todas sus actividades.</p>
            </div>
          </div>
        </div>
      )}

      {members.length === 0 ? (
        <div className="px-6 py-12 text-center text-sm text-slate-500">
          Sin consultores activos.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full w-max text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest w-60">
                  Consultor
                </th>
                {hasSeniority && (
                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest w-32">
                  Seniority
                </th>
                )}
                <th
                  className="px-4 py-2.5 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest w-24"
                  title="Actividades en curso o retrasadas (assignee = consultor)"
                >
                  Carga
                </th>
                <th
                  className="px-4 py-2.5 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest w-20"
                  title="Actividades retrasadas (planeadas a terminar antes de hoy, sin fecha real de fin)"
                >
                  Atrasadas
                </th>
                <th
                  className="px-4 py-2.5 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest w-24"
                  title="Actividades pendientes que arrancan en los próximos 30 días"
                >
                  Próximas 30d
                </th>
                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Proyectos
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {members.map((m) => {
                const lvl = loadLevel(m.active_count, m.delayed_count);
                const isExpanded = expandedEmail === m.email;
                return (
                  <Fragment key={m.email}>
                    <tr
                      onClick={() => setExpandedEmail(isExpanded ? null : m.email)}
                      className="even:bg-slate-50/40 hover:bg-brand-primary-light/20 transition-colors cursor-pointer"
                    >
                      {/* Consultor */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-8 h-8 rounded-full bg-brand-primary-light border border-brand-primary/30 text-brand-primary-dark text-[11px] font-bold flex items-center justify-center shrink-0">
                            {initials(m.full_name, m.email)}
                          </span>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 truncate leading-tight flex items-center gap-1">
                              {m.full_name ?? m.email}
                              <span
                                className="text-slate-400 text-[10px]"
                                aria-hidden
                              >
                                {isExpanded ? "▾" : "▸"}
                              </span>
                            </p>
                            {m.full_name && (
                              <p className="text-[11px] text-slate-500 truncate">{m.email}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Seniority — columna condicional */}
                      {hasSeniority && (
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                          {humanizeSeniority(m.seniority_level)}
                        </span>
                      </td>
                      )}

                      {/* Carga */}
                      <td className="px-4 py-3 text-center">
                        {m.active_count === 0 && m.delayed_count === 0 ? (
                          <span className="text-[11px] text-slate-400 tabular-nums">0</span>
                        ) : (
                          <span
                            title={lvl.label}
                            className={`inline-flex items-center justify-center gap-1 px-2 py-0.5 rounded-sm text-xs font-bold tabular-nums ${lvl.css}`}
                          >
                            <span aria-hidden>{lvl.icon}</span>
                            {m.active_count}
                          </span>
                        )}
                      </td>

                      {/* Atrasadas */}
                      <td className="px-4 py-3 text-center">
                        {m.delayed_count > 0 ? (
                          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-sm text-xs font-bold tabular-nums bg-rose-100 text-rose-700">
                            {m.delayed_count}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400 tabular-nums">0</span>
                        )}
                      </td>

                      {/* Próximas 30d */}
                      <td className="px-4 py-3 text-center">
                        {m.upcoming_count > 0 ? (
                          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-sm text-xs font-bold tabular-nums bg-amber-50 text-amber-700 border border-amber-200">
                            {m.upcoming_count}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400 tabular-nums">0</span>
                        )}
                      </td>

                      {/* Proyectos */}
                      <td className="px-4 py-3">
                        {m.projects.length === 0 ? (
                          <span className="text-[11px] text-slate-400 italic">Sin proyectos</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {m.projects.slice(0, 3).map((p) => (
                              <Link
                                key={p.client_id}
                                href={`/clientes/${p.client_id}`}
                                onClick={(e) => e.stopPropagation()}
                                title={p.client_name}
                                className="inline-flex items-center max-w-[18ch] px-2 py-0.5 rounded-sm border border-slate-200 bg-white text-[11px] text-slate-700 hover:border-brand-primary hover:text-brand-primary-dark transition-colors truncate"
                              >
                                {p.client_name}
                              </Link>
                            ))}
                            {m.projects.length > 3 && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-sm bg-slate-100 text-[11px] text-slate-500 font-medium">
                                +{m.projects.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-slate-50/50">
                        <td colSpan={6} className="px-4 py-3">
                          <ActivitiesList activities={m.activities} email={m.email} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ActivitiesList({
  activities,
  email,
}: {
  activities: ConsultantActivity[];
  email: string;
}) {
  if (activities.length === 0) {
    return (
      <p className="text-[11px] text-slate-500 italic px-2">
        {email.split("@")[0]} no tiene actividades asignadas.
      </p>
    );
  }

  // Ordenar: delayed primero, luego in_progress, pending por fecha plan, completed al final
  const order: Record<string, number> = { delayed: 0, in_progress: 1, pending: 2, completed: 3 };
  const sorted = [...activities].sort((a, b) => {
    const oa = order[a.status] ?? 99;
    const ob = order[b.status] ?? 99;
    if (oa !== ob) return oa - ob;
    return (a.planned_start ?? "").localeCompare(b.planned_start ?? "");
  });

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
        Actividades de {email.split("@")[0]} ({activities.length})
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
        {sorted.map((a) => (
          <Link
            key={a.activity_id}
            href={`/clientes/${a.client_id}?tab=cronograma`}
            className="bg-white border border-slate-200 rounded p-2 hover:border-brand-primary transition-colors block"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-900 truncate">{a.activity_name}</p>
                <p className="text-[10px] text-slate-500 truncate">
                  {a.client_name} · {a.stage_name}
                </p>
                <p className="text-[10px] text-slate-500 tabular-nums mt-0.5">
                  Plan: {fmtDate(a.planned_start)} → {fmtDate(a.planned_end)}
                </p>
              </div>
              <span
                className={`shrink-0 text-[10px] font-medium border rounded-sm px-1.5 py-0.5 ${STATUS_COLOR[a.status] ?? STATUS_COLOR.pending}`}
              >
                {STATUS_LABEL[a.status] ?? a.status}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
