import Link from "next/link";
import { notFound } from "next/navigation";
import { getClient, clientContextCompleteness, listClientsLight } from "@/lib/clients";
import { ClientTabs } from "@/components/ClientTabs";
import { ClientAvatar } from "@/components/ClientAvatar";
import { ClientNavShortcuts } from "@/components/ClientNavShortcuts";
import { ExportPdfButton } from "@/components/ExportPdfButton";
import { requireAdmin } from "@/lib/auth";
import { getQuestionnaireBundle } from "@/lib/questionnaires/queries";
import { listMaterialityTopics } from "@/lib/materiality/queries";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function EditarClientePage({ params }: Props) {
  const { id } = await params;
  // Prefetch paralelo: cliente + clients list (nav) + questionnaire + materiality.
  // Antes ClientTabs hacía 2 fetches client-side en cascada al montar tabs (cuestionario,
  // materialidad), causando spinners visibles. Ahora SWR arranca con datos en memoria
  // y solo revalida en background.
  const [client, allClients, questionnaireBundle, materialityTopics, adminEmail] =
    await Promise.all([
      getClient(id).catch(() => null),
      listClientsLight().catch(() => []),
      getQuestionnaireBundle(id, "doble-materialidad").catch(() => null),
      listMaterialityTopics(id).catch(() => []),
      requireAdmin(),
    ]);
  const isAdmin = !!adminEmail;
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

  return (
    <>
    <div className="px-6 py-4 pb-0 max-w-6xl mx-auto">
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
            <span className="tabular-nums" title="Orden alfabético">{counter}</span>
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

      {/* Header con avatar monogram + nombre. White-label scaffold: cuando exista
          schema clients.logo_url, swappear por <img src={client.logo_url}/>. */}
      <div className="flex items-start justify-between gap-3 mb-5">
      <div className="flex items-center flex-wrap gap-x-3 gap-y-1">
        <ClientAvatar name={client.name} logoUrl={client.logo_url} />
        <h1 className="text-xl font-bold text-slate-900 leading-none">{client.name}</h1>
        {meta && <span className="text-slate-300">·</span>}
        {meta && <span className="text-xs text-slate-600">{meta}</span>}
        {client.services && client.services.length > 0 && (
          <>
            <span className="text-slate-300">·</span>
            {client.services.slice(0, 2).map((s) => (
              <span
                key={s}
                className="inline-flex items-center text-[10px] font-medium bg-brand-primary-light text-brand-primary-dark rounded-sm px-2 py-0.5"
              >
                {s}
              </span>
            ))}
            {client.services.length > 2 && (
              <span className="text-[10px] text-slate-500">
                +{client.services.length - 2} más
              </span>
            )}
          </>
        )}
        <span className="text-slate-300">·</span>
        <span className="text-xs text-slate-500">
          Actualizado {new Date(client.updated_at).toLocaleDateString("es-MX")}
        </span>
      </div>
      <div className="shrink-0 pt-0.5 flex items-center gap-2">
        <ExportPdfButton clientId={client.id} clientName={client.name} />
      </div>
      </div>

    </div>
    <div className="px-6 pt-4 pb-6">
      <ClientTabs
        client={client}
        completeness={completeness}
        isAdmin={isAdmin}
        initialQuestionnaire={questionnaireBundle}
        initialMateriality={materialityTopics}
      />
    </div>
    </>
  );
}
