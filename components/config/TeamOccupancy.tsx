"use client";

import Link from "next/link";
import useSWR from "swr";
import type { TeamMember } from "@/app/api/team/occupancy/route";
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

function loadBadge(count: number) {
  if (count === 0) return "bg-slate-100 text-slate-500";
  if (count <= 2) return "bg-emerald-100 text-emerald-700";
  if (count <= 4) return "bg-amber-100 text-amber-700";
  return "bg-rose-100 text-rose-700";
}

function initials(name: string | null, email: string) {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

const MAX_CHIPS = 3;

export function TeamOccupancy() {
  const { data, error, isLoading } = useSWR("/api/team/occupancy", fetcher);
  const { data: seniorityItems = [] } = useSWR<{ value: string; label: string }[]>(
    "/api/catalogs?category=seniority_levels",
    seniorityFetcher,
    { revalidateOnFocus: false }
  );

  const humanizeSeniority = (val: string | null) => {
    if (!val) return "—";
    return seniorityItems.find((s) => s.value === val)?.label ?? val;
  };

  if (isLoading) return <SkeletonTable rows={5} cols={4} />;
  if (error)
    return (
      <div className="border border-rose-200 bg-rose-50 rounded p-4 text-sm text-rose-700">
        No se pudo cargar la ocupación del equipo.
      </div>
    );

  const members = data?.data ?? [];
  const totalProjects = members.reduce((s, m) => s + m.projects.length, 0);

  return (
    <div className="bg-white border border-slate-200 rounded shadow-sm">
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-4">
        <div>
          <span className="text-sm font-semibold text-slate-900">
            {members.length} {members.length === 1 ? "consultor activo" : "consultores activos"}
          </span>
          <span className="text-xs text-slate-500 ml-3">{totalProjects} asignaciones en total</span>
        </div>
      </div>

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
                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest w-36">
                  Seniority
                </th>
                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Proyectos asignados
                </th>
                <th className="px-4 py-2.5 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest w-20">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {members.map((m) => {
                const visible = m.projects.slice(0, MAX_CHIPS);
                const overflow = m.projects.length - MAX_CHIPS;
                return (
                  <tr key={m.email} className="hover:bg-slate-50 transition-colors">
                    {/* Consultor */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-8 h-8 rounded-full bg-brand-primary-light border border-brand-primary/30 text-brand-primary-dark text-[11px] font-bold flex items-center justify-center shrink-0">
                          {initials(m.full_name, m.email)}
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 truncate leading-tight">
                            {m.full_name ?? m.email}
                          </p>
                          {m.full_name && (
                            <p className="text-[11px] text-slate-500 truncate">{m.email}</p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Seniority global */}
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                        {humanizeSeniority(m.seniority_level)}
                      </span>
                    </td>

                    {/* Proyectos */}
                    <td className="px-4 py-3">
                      {m.projects.length === 0 ? (
                        <span className="text-[11px] text-slate-400 italic">Sin proyectos asignados</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {visible.map((p) => {
                            const hasOverride =
                              p.seniority_override && p.seniority_override !== m.seniority_level;
                            return (
                              <Link
                                key={p.client_id}
                                href={`/clientes/${p.client_id}`}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-sm border border-slate-200 bg-white text-[11px] text-slate-700 hover:border-brand-primary hover:text-brand-primary-dark transition-colors"
                              >
                                {p.client_name}
                                {hasOverride && (
                                  <em className="not-italic text-slate-400">
                                    ({humanizeSeniority(p.seniority_override)})
                                  </em>
                                )}
                              </Link>
                            );
                          })}
                          {overflow > 0 && (
                            <span className="inline-flex items-center px-2 py-1 rounded-sm bg-slate-100 text-[11px] text-slate-500 font-medium">
                              +{overflow} más
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Total badge */}
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold tabular-nums ${loadBadge(m.projects.length)}`}
                      >
                        {m.projects.length}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
