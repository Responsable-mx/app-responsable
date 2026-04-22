import { NextRequest, NextResponse } from "next/server";
import { verifyCron } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 120;

/**
 * Cron audit-health — corre quincenal (ver vercel.json).
 * Revisa salud del proyecto: uso de IA, costos estimados, errores, deuda.
 * Reporta siempre (no solo fallos), con métricas clave.
 */
export async function GET(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  // ── Uso de IA últimos 14 días
  const { data: aiRows, error: aiErr } = await admin
    .from("ai_calls")
    .select("model,input_tokens,output_tokens,cache_read_tokens,cache_creation_tokens,error,latency_ms")
    .gte("created_at", since)
    .limit(10000);

  const stats = {
    ai_calls_total: aiRows?.length ?? 0,
    ai_calls_errors: aiRows?.filter((r) => r.error).length ?? 0,
    ai_input_tokens: (aiRows ?? []).reduce(
      (a, r) => a + (r.input_tokens ?? 0),
      0
    ),
    ai_output_tokens: (aiRows ?? []).reduce(
      (a, r) => a + (r.output_tokens ?? 0),
      0
    ),
    ai_cache_read_tokens: (aiRows ?? []).reduce(
      (a, r) => a + (r.cache_read_tokens ?? 0),
      0
    ),
    ai_avg_latency_ms: aiRows?.length
      ? Math.round(
          aiRows.reduce((a, r) => a + (r.latency_ms ?? 0), 0) / aiRows.length
        )
      : 0,
  };

  // Estimación grosera de costo (Sonnet $3/$15 por 1M, Haiku $1/$5 por 1M).
  // Usamos rate Sonnet como peor caso porque los 4 roles lo usan mayoritariamente.
  const costEstimate = {
    input_usd: (stats.ai_input_tokens * 3) / 1_000_000,
    output_usd: (stats.ai_output_tokens * 15) / 1_000_000,
    cache_read_usd: (stats.ai_cache_read_tokens * 0.3) / 1_000_000,
  };
  const totalUsd =
    costEstimate.input_usd +
    costEstimate.output_usd +
    costEstimate.cache_read_usd;

  // ── Conteo de clientes
  const { count: clientsCount } = await admin
    .from("clients")
    .select("id", { head: true, count: "exact" });

  const report = {
    window_days: 14,
    ai: stats,
    cost_usd_estimate_max: Number(totalUsd.toFixed(3)),
    clients_total: clientsCount ?? 0,
    ai_query_error: aiErr?.message ?? null,
    generated_at: new Date().toISOString(),
  };

  console.log("[cron/audit-health]", JSON.stringify(report));
  return NextResponse.json(report);
}
