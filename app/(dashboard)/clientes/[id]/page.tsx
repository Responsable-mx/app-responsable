import { notFound } from "next/navigation";
import { getClient, clientContextCompleteness, listClientsLight } from "@/lib/clients";
import { ClientTabs } from "@/components/ClientTabs";
import { ClientNavShortcuts } from "@/components/ClientNavShortcuts";
import { requireAdmin } from "@/lib/auth";
import { getQuestionnaireBundle } from "@/lib/questionnaires/queries";
import { listCatalog } from "@/lib/catalogs";

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
      {/* Tier 1 + Tier 2 fusionados dentro de ClientTabs (Variante D, may-2026).
          page.tsx pasa la data; ClientTabs renderiza el header fusionado +
          tabs + panels. ClientNavShortcuts mantiene los atajos Alt+←/→. */}
      <ClientNavShortcuts prevId={prev?.id ?? null} nextId={next?.id ?? null} />
      <div className="px-6 pt-4 pb-6">
        <ClientTabs
          client={client}
          completeness={completeness}
          isAdmin={isAdmin}
          initialQuestionnaire={questionnaireBundle}
          serviceLabels={serviceLabels}
          visibleServices={visibleServices}
          prev={prev ? { id: prev.id, name: prev.name } : null}
          next={next ? { id: next.id, name: next.name } : null}
          counter={counter}
          showNavVisual={showNavVisual}
          updatedLabel={updatedLabel}
          updatedAt={updatedAt}
          metaTooltip={metaTooltip}
        />
      </div>
    </>
  );
}
