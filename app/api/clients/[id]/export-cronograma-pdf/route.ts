import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";

import { requireConsultorForClient } from "@/lib/auth";
import { getClient } from "@/lib/clients";
import { listClientServices } from "@/lib/client-services";
import { listStagesByService } from "@/lib/stages";
import { CATALOG_SEEDS } from "@/lib/catalogs/seeds";
import { CronogramaReport, type CronogramaService } from "@/lib/pdf/cronograma-report";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const SERVICE_LABELS = (() => {
  const out: Record<string, string> = {};
  for (const item of CATALOG_SEEDS) {
    if (item.category === "services") out[item.value] = item.label;
  }
  return out;
})();

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  // Rate limit: PDF generation es CPU-heavy — 5 exports/min por usuario
  const limited = await checkRateLimit(
    rateLimitKey("GET", "/api/clients/[id]/export-cronograma-pdf", user),
    { max: 5, windowMs: 60_000, errorMessage: "Demasiadas exportaciones. Espera 1 minuto antes de generar otro PDF." }
  );
  if (limited) {
    return NextResponse.json({ error: limited.message }, { status: 429 });
  }

  const [client, services] = await Promise.all([
    getClient(id).catch(() => null),
    listClientServices(id).catch(() => []),
  ]);

  if (!client) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  }

  // Pull stages para cada servicio en paralelo
  const cronogramaServices: CronogramaService[] = await Promise.all(
    services.map(async (sv) => ({
      client_service_id: sv.id,
      service_label: SERVICE_LABELS[sv.service] ?? sv.service,
      stages: await listStagesByService(sv.id).catch(() => []),
    }))
  );

  const element = React.createElement(CronogramaReport, {
    client,
    services: cronogramaServices,
    generatedAt: new Date().toISOString(),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(element as any);

  const safeName = (client.name || "cliente").replace(/[^a-zA-Z0-9-_]+/g, "-").toLowerCase();
  const filename = `cronograma-${safeName}-${new Date().toISOString().slice(0, 10)}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
