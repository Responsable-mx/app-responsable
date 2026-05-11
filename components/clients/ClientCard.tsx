"use client";

import Link from "next/link";
import type { Client } from "@/lib/clients";
import { ClientAvatar } from "@/components/ClientAvatar";

export type ClientRow = Pick<
  Client,
  | "id"
  | "name"
  | "sector"
  | "countries"
  | "size"
  | "updated_at"
  | "frameworks"
  | "certifications"
  | "logo_url"
  | "website_url"
>;

function parseDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "");
  } catch { return null; }
}

export function ClientCard({ client }: { client: ClientRow }) {
  const updated = new Date(client.updated_at);
  const daysAgo = Math.floor((Date.now() - updated.getTime()) / 86400000);
  const updatedLabel =
    daysAgo === 0 ? "hoy" : daysAgo === 1 ? "ayer" : `hace ${daysAgo} días`;
  const domain = parseDomain(client.website_url);

  return (
    <div className="group relative bg-white border border-slate-200 rounded shadow-sm hover:border-brand-primary/30 transition-all">
      <Link
        href={`/clientes/${client.id}`}
        className="block p-4"
      >
        <div className="flex items-start gap-3 mb-3">
          <ClientAvatar name={client.name} logoUrl={client.logo_url} size="md" />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-slate-900 leading-tight group-hover:text-brand-primary-hover transition-colors flex items-center gap-1.5">
              <span className="truncate">{client.name}</span>
              {client.name.startsWith("DEMO_") && (
                <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-amber-100 text-amber-700 border border-amber-200">
                  TEST
                </span>
              )}
            </h3>
            <p className="text-[11px] text-slate-500 truncate mt-0.5">
              {client.sector ?? <span className="italic text-slate-400">Sin sector</span>}
              {domain && <span className="text-slate-400"> · {domain}</span>}
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
          <div className="mb-3" />
        )}

        <div className="flex items-center justify-end text-[10px] pt-2 border-t border-slate-100">
          <span className="tabular-nums text-slate-400">{updatedLabel}</span>
        </div>
      </Link>

      {/* Acceso rápido a Chat IA — aparece en hover, no interrumpe el link principal */}
      <Link
        href={`/clientes/${client.id}?tab=chat`}
        title="Abrir Chat IA para este cliente"
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity inline-flex items-center gap-1 text-[10px] font-semibold text-brand-primary-dark bg-brand-primary-light border border-brand-primary/20 rounded px-2 py-1 hover:bg-brand-primary/20"
        onClick={(e) => e.stopPropagation()}
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
        Chat
      </Link>
    </div>
  );
}
