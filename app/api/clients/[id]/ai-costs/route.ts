import { NextResponse } from "next/server";
import { requireConsultorForClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { priceForModel } from "@/lib/ai/pricing";

export const dynamic = "force-dynamic";

export type AiCostByStage = {
  stage: string;
  calls: number;
  cost_usd: number;
  avg_latency_ms: number;
  errors: number;
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const url = new URL(req.url);
  const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get("days") ?? "90")));
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const sb = createAdminClient();
  const { data: rows, error } = await sb
    .from("ai_calls")
    .select(
      "workflow_stage,model,input_tokens,output_tokens,cache_read_tokens,cache_creation_tokens,latency_ms,error"
    )
    .eq("client_id", id)
    .gte("created_at", since)
    .not("workflow_stage", "is", null)
    .limit(10000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Acc = {
    calls: number;
    cost: number;
    errors: number;
    latency_sum: number;
    latency_count: number;
  };
  const byStage = new Map<string, Acc>();

  for (const r of rows ?? []) {
    // Precios canónicos (lib/ai/pricing) — una sola fuente para todos los paneles.
    const p = priceForModel(r.model as string | null);
    const cost =
      ((r.input_tokens            ?? 0) * p.input      +
       (r.output_tokens           ?? 0) * p.output     +
       (r.cache_read_tokens       ?? 0) * p.cacheRead  +
       (r.cache_creation_tokens   ?? 0) * p.cacheWrite) / 1_000_000;

    const stage = r.workflow_stage as string;
    const acc = byStage.get(stage) ?? {
      calls: 0, cost: 0, errors: 0, latency_sum: 0, latency_count: 0,
    };
    acc.calls++;
    acc.cost += cost;
    if (r.error) acc.errors++;
    if (typeof r.latency_ms === "number") {
      acc.latency_sum += r.latency_ms;
      acc.latency_count++;
    }
    byStage.set(stage, acc);
  }

  const data: AiCostByStage[] = Array.from(byStage.entries())
    .map(([stage, acc]) => ({
      stage,
      calls: acc.calls,
      cost_usd: Number(acc.cost.toFixed(4)),
      avg_latency_ms:
        acc.latency_count > 0
          ? Math.round(acc.latency_sum / acc.latency_count)
          : 0,
      errors: acc.errors,
    }))
    .sort((a, b) => b.cost_usd - a.cost_usd);

  return NextResponse.json({ data, window_days: days });
}
