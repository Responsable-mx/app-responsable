import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

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
  { params }: { params: { id: string } }
) {
  const user = await requireUser();
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
    .eq("client_id", params.id)
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
    const m = ((r.model as string | null) ?? "").toLowerCase();
    const isVoyage = m.includes("voyage");
    const isHaiku  = m.includes("haiku");
    const isOpus   = m.includes("opus");
    const iIn  = isVoyage ? 0.10 : isHaiku ? 0.25  : isOpus ? 15   : 3;
    const iOut = isVoyage ? 0    : isHaiku ? 1.25   : isOpus ? 75   : 15;
    const iCr  = isVoyage ? 0    : isHaiku ? 0.03   : isOpus ? 1.5  : 0.3;
    const iCw  = isVoyage ? 0    : isHaiku ? 0.03125: isOpus ? 18.75: 3.75;

    const cost =
      ((r.input_tokens            ?? 0) * iIn  +
       (r.output_tokens           ?? 0) * iOut +
       (r.cache_read_tokens       ?? 0) * iCr  +
       (r.cache_creation_tokens   ?? 0) * iCw) / 1_000_000;

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
