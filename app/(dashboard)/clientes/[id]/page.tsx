import Link from "next/link";
import { notFound } from "next/navigation";
import { getClient, clientContextCompleteness, listClients } from "@/lib/clients";
import { ClientTabs } from "@/components/ClientTabs";
import { ClientNavShortcuts } from "@/components/ClientNavShortcuts";
import { isSystemAccount } from "@/lib/users";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function EditarClientePage({ params }: Props) {
  const { id } = await params;
  const [client, allClients] = await Promise.all([
    getClient(id).catch(() => null),
    listClients().catch(() => []),
  ]);
  if (!client) notFound();

  const completeness = clientContextCompleteness(client);
  const meta = [client.sector, client.subsector, client.size]
    .filter(Boolean)
    .join(" · ");

  // Nav prev/next por orden alfabético
  const sorted = [...allClients].sort((a, b) =>
    a.name.localeCompare(b.name, "es-MX", { sensitivity: "base" })
  );
  const idx = sorted.findIndex((c) => c.id === id);
  const prev = idx > 0 ? sorted[idx - 1] : null;
  const next = idx < sorted.length - 1 ? sorted[idx + 1] : null;
  const counter = idx >= 0 ? `${idx + 1}/${sorted.length}` : "";

  const status =
    completeness.filled === completeness.total
      ? { label: "COMPLETADO", tone: "success" }
      : completeness.filled === 0
        ? { label: "SIN INICIAR", tone: "neutral" }
        : { label: "EN PROGRESO", tone: "primary" };
  const statusClasses =
    status.tone === "success"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : status.tone === "primary"
        ? "bg-brand-primary-light text-brand-primary-dark border-brand-primary/30"
        : "bg-slate-100 text-slate-600 border-slate-200";

  return (
    <div className="px-6 py-4 max-w-6xl mx-auto">
      <ClientNavShortcuts prevId={prev?.id ?? null} nextId={next?.id ?? null} />
      {/* Breadcrumb compacto */}
      <div className="flex items-center justify-between gap-3 mb-4 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href="/clientes"
            className="inline-flex items-center gap-1 text-slate-500 hover:text-brand-primary-hover transition-colors font-medium"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Clientes
          </Link>
          <span className="text-slate-300">/</span>
          <span className="font-bold text-slate-900 truncate">{client.name}</span>
        </div>
        {counter && (
          <div className="flex items-center gap-2 text-slate-500 shrink-0">
            <span className="tabular-nums">{counter}</span>
            <Link
              href={prev ? `/clientes/${prev.id}` : "#"}
              aria-disabled={!prev}
              className={`p-1 rounded ${prev ? "hover:bg-slate-100" : "opacity-30 pointer-events-none"}`}
              title={prev ? `${prev.name} · Alt+←` : "Sin anterior"}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <Link
              href={next ? `/clientes/${next.id}` : "#"}
              aria-disabled={!next}
              className={`p-1 rounded ${next ? "hover:bg-slate-100" : "opacity-30 pointer-events-none"}`}
              title={next ? `${next.name} · Alt+→` : "Sin siguiente"}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        )}
      </div>

      {/* Header en una línea estilo mockup */}
      <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mb-5">
        <h1 className="text-xl font-bold text-slate-900">{client.name}</h1>
        <span className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wide rounded-sm border px-2 py-0.5 ${statusClasses}`}>
          {status.label}
        </span>
        {meta && <span className="text-slate-300">|</span>}
        {meta && <span className="text-xs text-slate-600">{meta}</span>}
        {client.services && client.services.length > 0 && (
          <>
            <span className="text-slate-300">|</span>
            <span className="text-xs font-semibold text-brand-primary-dark">
              {client.services.join(", ")}
            </span>
          </>
        )}
        {client.created_by && !isSystemAccount(client.created_by) && (
          <>
            <span className="text-slate-300">|</span>
            <span className="text-xs text-slate-600">{client.created_by.split("@")[0]}</span>
          </>
        )}
        <span className="text-slate-300">|</span>
        <span className="text-xs text-slate-500">
          Actualizado {new Date(client.updated_at).toLocaleDateString("es-MX")}
        </span>
      </div>

      <ClientTabs client={client} completeness={completeness} />
    </div>
  );
}
