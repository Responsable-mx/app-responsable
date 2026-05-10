import Link from "next/link";
import { notFound } from "next/navigation";
import { getClient, clientContextCompleteness, listClientsLight } from "@/lib/clients";
import { ClientTabs } from "@/components/ClientTabs";
import { ClientAvatar } from "@/components/ClientAvatar";
import { ClientNavShortcuts } from "@/components/ClientNavShortcuts";
import { ClientHeaderActions } from "@/components/ClientHeaderActions";
import { requireAdmin } from "@/lib/auth";
import { getQuestionnaireBundle } from "@/lib/questionnaires/queries";
import { listCatalog } from "@/lib/catalogs";
import { sectorPillClasses } from "@/lib/sectors";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function EditarClientePage({ params }: Props) {
  const { id } = await params;
  // Prefetch paralelo: cliente + clients list (nav) + questionnaire + catálogos.
  // SWR arranca con datos en memoria y solo revalida en background.
  const [client, allClients, questionnaireBundle, adminEmail, serviceCatalog] =
    await Promise.all([
      getClient(id).catch(() => null),
      listClientsLight().catch(() => []),
      getQuestionnaireBundle(id, "doble-materialidad").catch(() => null),
      requireAdmin(),
      listCatalog("services").catch(() => []),
    ]);
  const serviceLabels = new Map(serviceCatalog.map((i) => [i.value, i.label]));
  const isAdmin = !!adminEmail;
  if (!client) notFound();

  const completeness = clientContextCompleteness(client);
  const metaTooltip = [client.sector, client.subsector, client.size].filter(Boolean).join(" · ");
  // Sector y tamaño separados — sector va como pill con color, tamaño como plain text.
  const sectorPill = client.sector ?? null;
  const sizeLabel = client.size ?? null;

  // Dedupe Tier 1 vs Tier 2: si un servicio (chip Tier 1) ya aparece como
  // certificación en el cuestionario (KPI Certificación en strip Tier 2),
  // suprimir el chip para evitar duplicación visual (ej. chip "ESR" + KPI
  // "ESR 2025" en cert). El KPI Tier 2 gana por aportar más contexto (año).
  const certsTextLower = (() => {
    const r = questionnaireBundle?.response?.responses?.["estrategia-y-madurez"];
    if (!r) return "";
    const raw = (r as Record<string, unknown>)["certificaciones"];
    const extract = (val: unknown): string => {
      if (typeof val === "string") return val;
      if (Array.isArray(val)) return val.map(extract).join(" ");
      if (val && typeof val === "object" && "value" in val) return extract((val as { value: unknown }).value);
      return "";
    };
    return extract(raw).toLowerCase();
  })();
  const visibleServices = (client.services ?? []).filter((s) => {
    const label = (serviceLabels.get(s) ?? s).toLowerCase().trim();
    if (!label) return true;
    // Si la cert KPI contiene la sigla/label del servicio → suprimir chip
    return !certsTextLower.includes(label);
  });

  // Nav prev/next por orden alfabético
  const sorted = [...allClients].sort((a, b) =>
    a.name.localeCompare(b.name, "es-MX", { sensitivity: "base" })
  );
  const idx = sorted.findIndex((c) => c.id === id);
  const prev = idx > 0 ? sorted[idx - 1] : null;
  const next = idx < sorted.length - 1 ? sorted[idx + 1] : null;
  // Nav visual solo si >10 clientes — sub-10 los usuarios usan Alt+←/→ via ClientNavShortcuts
  const showNavVisual = sorted.length > 10;
  const counter = idx >= 0 ? `${idx + 1}/${sorted.length}` : "";

  // Updated label específico: cuestionario vs cliente. Tomar el más reciente y etiquetar.
  const qUpdated = questionnaireBundle?.response?.updated_at;
  const cUpdated = client.updated_at;
  const updatedSource: "cuestionario" | "cliente" =
    qUpdated && new Date(qUpdated) > new Date(cUpdated) ? "cuestionario" : "cliente";
  const updatedAt = updatedSource === "cuestionario" ? qUpdated! : cUpdated;
  const updatedLabel = updatedSource === "cuestionario" ? "Cuestionario actualizado" : "Cliente editado";

  return (
    <>
    <div className="px-6 py-4 pb-0 max-w-6xl mx-auto">
      <ClientNavShortcuts prevId={prev?.id ?? null} nextId={next?.id ?? null} />
      {/* Breadcrumb compacto — back button único (← Clientes ya está en sidebar nav).
          Tooltip revela atajos de teclado. Nav prev/next visual solo si >10 clientes. */}
      <div className="flex items-center justify-between gap-3 mb-4 text-xs">
        <Link
          href="/clientes"
          className="inline-flex items-center gap-1.5 text-slate-600 hover:text-brand-primary-hover transition-colors font-medium min-w-0"
          title="Volver a lista de clientes"
        >
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="truncate">Clientes</span>
        </Link>
        {showNavVisual && counter && (
          <div className="flex items-center gap-2 text-slate-600 shrink-0">
            <span className="tabular-nums" title="Orden alfabético">{counter}</span>
            <Link
              href={prev ? `/clientes/${prev.id}` : "#"}
              aria-disabled={!prev}
              className={`p-1 rounded ${prev ? "hover:bg-slate-100" : "opacity-30 pointer-events-none"}`}
              title={prev ? `${prev.name} · Alt+←` : "Sin anterior"}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <Link
              href={next ? `/clientes/${next.id}` : "#"}
              aria-disabled={!next}
              className={`p-1 rounded ${next ? "hover:bg-slate-100" : "opacity-30 pointer-events-none"}`}
              title={next ? `${next.name} · Alt+→` : "Sin siguiente"}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        )}
      </div>

      {/* Header Tier 1 — identidad compactada a 1 fila wrappeable.
          Antes: 2 filas con pl-11 (avatar + nombre / chips + fecha indented).
          Ahora: avatar + nombre + meta + chips + fecha en flex-wrap único.
          ~30% menos altura sin sacrificar info. */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0 flex items-center gap-x-3 gap-y-1 flex-wrap">
          <ClientAvatar name={client.name} logoUrl={client.logo_url} />
          <h1 className="text-xl font-bold text-slate-900 leading-none">{client.name}</h1>
          {sectorPill && (
            <>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <Link
                href={`/clientes?sector=${encodeURIComponent(sectorPill)}`}
                className={`inline-flex items-center text-[10px] font-medium rounded-sm px-2 py-0.5 transition-colors hover:opacity-80 ${sectorPillClasses(sectorPill)}`}
                title={`Ver otros clientes del sector ${sectorPill} (${metaTooltip})`}
              >
                {sectorPill}
              </Link>
            </>
          )}
          {sizeLabel && (
            <>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <span className="text-xs text-slate-600" title={metaTooltip}>{sizeLabel}</span>
            </>
          )}
          {visibleServices.length > 0 && (
            <>
              <span className="text-slate-300" aria-hidden="true">·</span>
              {visibleServices.slice(0, 2).map((s) => {
                const tabMap: Record<string, string> = {
                  doble_materialidad: "materialidad",
                  doble_materialidad_ia: "doble-materialidad-ia",
                };
                const targetTab = tabMap[s];
                const label = serviceLabels.get(s) ?? s;
                // Chip de servicio: slate neutral (NO brand-primary-light, reservado para
                // estados activos/progreso — evita choque visual con badges de tabs activos).
                const cls = "inline-flex items-center text-[10px] font-medium bg-slate-100 text-slate-700 rounded-sm px-2 py-0.5";
                return targetTab ? (
                  <Link
                    key={s}
                    href={`?tab=${targetTab}`}
                    className={`${cls} hover:bg-slate-200 transition-colors`}
                    title={`Ir a ${label}`}
                  >
                    {label}
                  </Link>
                ) : (
                  <span key={s} className={cls}>{label}</span>
                );
              })}
              {visibleServices.length > 2 && (
                <span className="text-[10px] text-slate-600" title={`${visibleServices.length - 2} servicio(s) adicional(es)`}>
                  +{visibleServices.length - 2} más
                </span>
              )}
            </>
          )}
          <span className="text-slate-300" aria-hidden="true">·</span>
          <span
            className="text-xs text-slate-600"
            title={`${updatedLabel}: ${new Date(updatedAt).toLocaleString("es-MX")}`}
          >
            {updatedLabel} {new Date(updatedAt).toLocaleDateString("es-MX", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
        </div>
        {/* Acciones secundarias (Editar + Exportar PDF) consolidadas en kebab `⋯`.
            Saves ~150px horizontal vs 2 botones inline. Atajos: E (editar) · P (PDF). */}
        <div className="shrink-0 pt-0.5">
          <ClientHeaderActions
            clientId={client.id}
            clientName={client.name}
            isAdmin={isAdmin}
          />
        </div>
      </div>

    </div>
    <div className="px-6 pt-4 pb-6">
      <ClientTabs
        client={client}
        completeness={completeness}
        isAdmin={isAdmin}
        initialQuestionnaire={questionnaireBundle}
      />
    </div>
    </>
  );
}
