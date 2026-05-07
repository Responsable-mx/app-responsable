import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";

import { requireConsultorForClient } from "@/lib/auth";
import { getClient } from "@/lib/clients";
import { listClientServices } from "@/lib/client-services";
import { getQuestionnaireBundle } from "@/lib/questionnaires/queries";
import { listMaterialityTopics } from "@/lib/materiality/queries";
import { CATALOG_SEEDS, type CatalogCategory } from "@/lib/catalogs/seeds";
import { ClientReport, type ClientReportProps } from "@/lib/pdf/client-report";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";

// Asegurar runtime Node.js — @react-pdf/renderer no soporta Edge
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// ── Humanización local (igual que roles.ts pero sin importar server-only) ──
const CATALOG_LABELS = (() => {
  const out: Record<string, Record<string, string>> = {};
  for (const item of CATALOG_SEEDS) {
    if (!out[item.category]) out[item.category] = {};
    out[item.category]![item.value] = item.label;
  }
  return out as Record<CatalogCategory, Record<string, string>>;
})();

function h(category: CatalogCategory, value: string): string {
  return CATALOG_LABELS[category]?.[value] ?? value;
}
function hl(category: CatalogCategory, values: string[] | null): string[] {
  return (values ?? []).map((v) => h(category, v));
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  // Rate limit: PDF generation es CPU-heavy — 5 exports/min por usuario
  const limited = await checkRateLimit(
    rateLimitKey("GET", "/api/clients/[id]/export-pdf", user),
    { max: 5, windowMs: 60_000, errorMessage: "Demasiadas exportaciones. Espera 1 minuto antes de generar otro PDF." }
  );
  if (limited) {
    return NextResponse.json({ error: limited.message }, { status: 429 });
  }

  // Fetch paralelo de las 4 fuentes de datos
  const [client, services, questionnaire, materiality] = await Promise.all([
    getClient(id).catch(() => null),
    listClientServices(id).catch(() => []),
    getQuestionnaireBundle(id, "doble-materialidad").catch(() => null),
    listMaterialityTopics(id).catch(() => []),
  ]);

  if (!client) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  }

  const humanized: ClientReportProps["humanized"] = {
    sector:         client.sector      ? h("sectors", client.sector)               : null,
    size:           client.size        ? h("client_sizes", client.size)            : null,
    maturity_level: client.maturity_level ? h("maturity_levels", client.maturity_level) : null,
    countries:      hl("countries",        client.countries),
    frameworks:     hl("frameworks",       client.frameworks),
    certifications: hl("certifications",   client.certifications),
    material_topics: hl("material_topics", client.material_topics),
    services:       hl("services",         client.services),
  };

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const element = React.createElement(ClientReport as any, {
      client,
      services,
      questionnaire,
      materiality,
      generatedAt: new Date().toISOString(),
      humanized,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(element as any);
    // Buffer → Uint8Array para BodyInit (Next.js 15 Edge compat)
    const bytes = new Uint8Array(buffer);

    const safeName = client.name
      .replace(/[^a-zA-Z0-9À-ɏ\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase();

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="responsable-${safeName}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    console.error("[GET /api/clients/:id/export-pdf]", e);
    return NextResponse.json(
      { error: "Error al generar el PDF" },
      { status: 500 }
    );
  }
}
