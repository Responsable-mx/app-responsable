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

type ViewMode = "cards" | "table";

export function ClientsList({ clients }: { clients: Row[] }) {
  const [query, setQuery] = useState("");
  const [sectorFilter, setSectorFilter] = useState("");
  const [view, setView] = useState<ViewMode>("cards");

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
            className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
          />
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
        {sectors.length > 1 && (
          <select
            value={sectorFilter}
            onChange={(e) => setSectorFilter(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
          >
            <option value="">Todos los sectores</option>
            {sectors.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
        <div className="text-xs text-slate-600 whitespace-nowrap tabular-nums">
          {filtered.length} de {clients.length}
        </div>
        <div className="ml-auto inline-flex items-center bg-slate-100 rounded p-0.5">
          <button
            type="button"
            onClick={() => setView("cards")}
            className={`px-2.5 py-1 text-xs rounded transition-colors ${view === "cards" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            title="Vista cards"
            aria-pressed={view === "cards"}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setView("table")}
            className={`px-2.5 py-1 text-xs rounded transition-colors ${view === "table" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            title="Vista tabla"
            aria-pressed={view === "table"}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 10h18M3 14h18M3 6h18M3 18h18" />
            </svg>
          </button>
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
      ) : view === "cards" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((c) => (
            <ClientCard key={c.id} client={c} />
          ))}
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
                  <td className="px-4 py-3 text-slate-600">{c.sector ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {c.countries?.join(", ") ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c.size ?? "—"}</td>
                  <td className="px-4 py-3 text-right text-slate-600 text-xs tabular-nums">
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

function ClientCard({ client }: { client: Row }) {
  const initials = client.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  const updated = new Date(client.updated_at);
  const daysAgo = Math.floor((Date.now() - updated.getTime()) / 86400000);
  const updatedLabel =
    daysAgo === 0 ? "hoy" : daysAgo === 1 ? "ayer" : `hace ${daysAgo} días`;

  return (
    <Link
      href={`/clientes/${client.id}`}
      className="group block bg-white border border-slate-200 rounded shadow-sm hover:shadow-md hover:border-brand-primary/40 transition-all p-4"
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded bg-gradient-to-br from-brand-primary to-brand-primary-dark text-white font-bold flex items-center justify-center text-sm shrink-0 ring-1 ring-brand-primary-dark/10">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-900 leading-tight truncate group-hover:text-brand-primary-hover transition-colors">
            {client.name}
          </h3>
          <p className="text-[11px] text-slate-500 truncate mt-0.5">
            {client.sector ?? "Sin sector"}
            {client.size ? ` · ${client.size}` : ""}
          </p>
        </div>
      </div>

      {(client.countries?.length || client.frameworks?.length || client.certifications?.length) ? (
        <div className="flex flex-wrap gap-1 mb-3">
          {client.countries?.slice(0, 3).map((p) => (
            <span key={p} className="text-[10px] bg-slate-100 text-slate-600 rounded-sm px-1.5 py-0.5 font-medium">
              {p}
            </span>
          ))}
          {client.frameworks?.slice(0, 2).map((f) => (
            <span key={f} className="text-[10px] bg-brand-primary-light text-brand-primary-dark rounded-sm px-1.5 py-0.5 font-medium">
              {f}
            </span>
          ))}
          {client.certifications?.slice(0, 2).map((c) => (
            <span key={c} className="text-[10px] bg-amber-50 text-amber-700 rounded-sm px-1.5 py-0.5 font-medium">
              {c}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-slate-400 italic mb-3">Sin marcos ni certificaciones registrados.</p>
      )}

      <div className="flex items-center justify-between text-[10px] text-slate-400 pt-2 border-t border-slate-100">
        <span className="uppercase tracking-widest font-bold">Actualizado</span>
        <span className="tabular-nums text-slate-600">{updatedLabel}</span>
      </div>
    </Link>
  );
}
