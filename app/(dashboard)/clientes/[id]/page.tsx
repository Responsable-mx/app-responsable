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
    <div className="px-6 py-4 pb-0 max-w-7xl mx-auto">
      <ClientNavShortcuts prevId={prev?.id ?? null} nextId={next?.id ?? null} />
      {/* Header Tier 1 — fusiona breadcrumb + identidad en 1 fila wrappeable.
          Saves ~28px vertical vs breadcrumb row separado. Atajos Alt+←/→ activos
          via ClientNavShortcuts; nav visual solo si >10 clientes. */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0 flex items-center gap-x-2 gap-y-1 flex-wrap">
          {/* Back link inline — antes era breadcrumb separado */}
          <Link
            href="/clientes"
            className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-brand-primary-hover transition-colors font-medium mr-1"
            title="Volver a lista de clientes"
          >
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span>Clientes</span>
          </Link>
          <span className="text-slate-300 mr-1" aria-hidden="true">/</span>
          <ClientAvatar name={client.name} logoUrl={client.logo_url} />
          <h1 className="text-xl font-bold text-slate-900 leading-none mr-1">{client.name}</h1>
          {/* Sector + tamaño combinados en un solo pill con color del sector.
              Antes: pill + "·" + plain text size = 3 elementos. Ahora: 1 chip cohesivo. */}
          {(sectorPill || sizeLabel) && (
            <Link
              href={sectorPill ? `/clientes?sector=${encodeURIComponent(sectorPill)}` : "/clientes"}
              className={`inline-flex items-center text-[10px] font-medium rounded-sm px-2 py-0.5 transition-colors hover:opacity-80 ${sectorPillClasses(sectorPill)}`}
              title={metaTooltip || `Ver clientes del sector ${sectorPill ?? ""}`}
            >
              {[sectorPill, sizeLabel].filter(Boolean).join(" · ")}
            </Link>
          )}
          {/* Chips de servicios — hasta 3 visibles (antes 2 + "+1 más" ocultaba el 3ro).
              Si hay >3, muestra "+N más" con tooltip. */}
          {visibleServices.length > 0 && visibleServices.slice(0, 3).map((s) => {
            const tabMap: Record<string, string> = {
              doble_materialidad: "materialidad",
              doble_materialidad_ia: "doble-materialidad-ia",
            };
            const targetTab = tabMap[s];
            const label = serviceLabels.get(s) ?? s;
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
          {visibleServices.length > 3 && (
            <span
              className="text-[10px] text-slate-600"
              title={visibleServices.slice(3).map((s) => serviceLabels.get(s) ?? s).join(" · ")}
            >
              +{visibleServices.length - 3} más
            </span>
          )}
          {/* Fecha abreviada — icono ↻ + fecha. Tooltip muestra etiqueta completa.
              Antes: "Cuestionario actualizado 10 may 2026" ~240px. Ahora: ~80px. */}
          <span
            className="inline-flex items-center gap-1 text-xs text-slate-600 ml-1"
            title={`${updatedLabel}: ${new Date(updatedAt).toLocaleString("es-MX")}`}
          >
            <svg className="w-3 h-3 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span className="tabular-nums">
              {new Date(updatedAt).toLocaleDateString("es-MX", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
          </span>
        </div>
        {/* Acciones derechas: nav prev/next (si >10 clientes) + Editar.
            Nav inline aquí ahora que removimos el breadcrumb row. */}
        <div className="shrink-0 pt-0.5 flex items-center gap-2">
          {showNavVisual && counter && (
            <div className="flex items-center gap-1 text-slate-600">
              <span className="text-[11px] tabular-nums mr-1" title="Orden alfabético">{counter}</span>
              <Link
                href={prev ? `/clientes/${prev.id}` : "#"}
                aria-disabled={!prev}
                className={`p-1.5 rounded ${prev ? "hover:bg-slate-100" : "opacity-30 pointer-events-none"}`}
                title={prev ? `${prev.name} · Alt+←` : "Sin anterior"}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <Link
                href={next ? `/clientes/${next.id}` : "#"}
                aria-disabled={!next}
                className={`p-1.5 rounded ${next ? "hover:bg-slate-100" : "opacity-30 pointer-events-none"}`}
                title={next ? `${next.name} · Alt+→` : "Sin siguiente"}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          )}
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
