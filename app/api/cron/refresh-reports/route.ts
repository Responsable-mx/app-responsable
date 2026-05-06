import { NextRequest, NextResponse } from "next/server";
import { verifyCron } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Cron refresh-reports — corre cada 6 meses (1ro de junio y 1ro de diciembre).
 * Sin re-research automático (costos IA + riesgo de URLs equivocadas) — solo
 * detecta informes con >180 días y los marca para revisión manual del consultor.
 *
 * Output: lista de clientes con informes sustainability_report o financial_report
 * cuyo último doc tiene >180 días. El admin puede usar el botón "Buscar de nuevo"
 * en cada cliente para refrescar manualmente.
 */
export async function GET(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await admin
    .from("client_documents")
    .select("client_id, kind, file_name, created_at, parse_status")
    .in("kind", ["sustainability_report", "financial_report"])
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[cron/refresh-reports]", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Agrupa por cliente para reporte consolidado
  const byClient = new Map<string, { sustainability?: string; financial?: string }>();
  for (const row of data ?? []) {
    const entry = byClient.get(row.client_id) ?? {};
    if (row.kind === "sustainability_report" && !entry.sustainability) {
      entry.sustainability = row.created_at;
    } else if (row.kind === "financial_report" && !entry.financial) {
      entry.financial = row.created_at;
    }
    byClient.set(row.client_id, entry);
  }

  const stale = Array.from(byClient.entries()).map(([clientId, kinds]) => ({
    client_id: clientId,
    sustainability_oldest: kinds.sustainability ?? null,
    financial_oldest: kinds.financial ?? null,
  }));

  console.log(`[cron/refresh-reports] ${stale.length} cliente(s) con informes >180d`);

  return NextResponse.json({
    ok: true,
    cutoff,
    total_stale_clients: stale.length,
    stale,
  });
}
