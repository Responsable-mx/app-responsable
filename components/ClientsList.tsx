"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Client } from "@/lib/clients";

type Row = Pick<
  Client,
  | "id"
  | "name"
  | "sector"
  | "countries"
  | "size"
  | "updated_at"
  | "frameworks"
  | "certifications"
>;

export function ClientsList({ clients }: { clients: Row[] }) {
  const [query, setQuery] = useState("");
  const [sectorFilter, setSectorFilter] = useState("");

  const sectors = useMemo(() => {
    const s = new Set<string>();
    for (const c of clients) if (c.sector) s.add(c.sector);
    return Array.from(s).sort();
  }, [clients]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients.filter((c) => {
      if (sectorFilter && c.sector !== sectorFilter) return false;
      if (!q) return true;
      const hay =
        c.name.toLowerCase().includes(q) ||
        (c.sector ?? "").toLowerCase().includes(q) ||
        (c.countries ?? []).some((p) => p.toLowerCase().includes(q)) ||
        (c.frameworks ?? []).some((f) => f.toLowerCase().includes(q)) ||
        (c.certifications ?? []).some((c2) => c2.toLowerCase().includes(q));
      return hay;
    });
  }, [clients, query, sectorFilter]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[260px]">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, sector, país, marco, certificación…"
            className="w-full pl-10 pr-3 py-2 border border-stone-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-primary"
          />
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-600"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
        {sectors.length > 1 && (
          <select
            value={sectorFilter}
            onChange={(e) => setSectorFilter(e.target.value)}
            className="px-3 py-2 border border-stone-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-primary"
          >
            <option value="">Todos los sectores</option>
            {sectors.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
        <div className="text-xs text-slate-600 whitespace-nowrap">
          {filtered.length} de {clients.length}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded p-10 text-center shadow-sm">
          <p className="text-sm text-slate-600">
            {clients.length === 0
              ? "Aún no hay clientes registrados."
              : "Sin resultados para ese filtro."}
          </p>
          {clients.length === 0 && (
            <Link
              href="/clientes/nuevo"
              className="inline-block mt-3 px-4 py-2 bg-brand-primary-hover text-white text-sm font-medium rounded hover:bg-brand-primary-dark"
            >
              Agregar el primero
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest">Nombre</th>
                <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest">Sector</th>
                <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest">Países</th>
                <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest">Tamaño</th>
                <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-right">
                  Actualizado
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  className="border-t border-slate-100 hover:bg-slate-50/60"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/clientes/${c.id}`}
                      className="font-medium text-slate-900 hover:text-brand-primary-hover"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {c.sector ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {c.countries?.join(", ") ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c.size ?? "—"}</td>
                  <td className="px-4 py-3 text-right text-slate-600 text-xs">
                    {new Date(c.updated_at).toLocaleDateString("es-MX")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
