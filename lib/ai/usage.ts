import "server-only";
import { isDevMode } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export type UsageRow = {
  day: string;
  role: string;
  calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_hits: number;
  total_cache_writes: number;
  avg_latency_ms: number;
  errors: number;
};

export type UsageByModel = {
  family: "haiku" | "sonnet" | "opus" | "otro";
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cost_usd: number;
};

export type FeedbackReasonBucket = {
  role: string;
  reason_code: string;
  count: number;
};

export type UsageByRole = {
  role: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cost_usd: number;
  avg_latency_ms: number;
  errors: number;
};

export type UsageSummary = {
  window_days: number;
  total_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_read_tokens: number;
  total_errors: number;
  avg_latency_ms: number;
  cost_usd_estimate_max: number;
  by_model: UsageByModel[];
  /** Wave 5a: agregado por rol (Aurora/Rebeca/Elena/Valeria) en la ventana */
  by_role: UsageByRole[];
  by_day_role: UsageRow[];
  top_users: Array<{ user_email: string; calls: number }>;
  top_clients: Array<{ client_id: string; calls: number; client_name: string | null }>;
  /** Wave 4 (D dashboard): top razones de rechazo IA */
  feedback_top_reasons: FeedbackReasonBucket[];
  feedback_total_down: number;
};

export async function getUsageSummary(
  windowDays = 30
): Promise<UsageSummary> {
  const empty: UsageSummary = {
    window_days: windowDays,
    total_calls: 0,
    total_input_tokens: 0,
    total_output_tokens: 0,
    total_cache_read_tokens: 0,
    total_errors: 0,
    avg_latency_ms: 0,
    cost_usd_estimate_max: 0,
    by_model: [],
    by_role: [],
    by_day_role: [],
    top_users: [],
    top_clients: [],
    feedback_top_reasons: [],
    feedback_total_down: 0,
  };
  if (isDevMode()) return empty;

  const admin = createAdminClient();
  const since = new Date(
    Date.now() - windowDays * 24 * 60 * 60 * 1000
  ).toISOString();

  // Uso diario por rol (vista pre-agregada)
  const { data: byDayRole } = await admin
    .from("ai_calls_daily_by_role")
    .select("*")
    .gte("day", since)
    .order("day", { ascending: false })
    .limit(400);

  // Totales del período
  const { data: rows } = await admin
    .from("ai_calls")
    .select(
      "user_email,client_id,role,model,input_tokens,output_tokens,cache_read_tokens,error,latency_ms"
    )
    .gte("created_at", since)
    .limit(20000);

  const calls = rows ?? [];
  const totalCalls = calls.length;
  const totalInput = calls.reduce((a, r) => a + (r.input_tokens ?? 0), 0);
  const totalOutput = calls.reduce((a, r) => a + (r.output_tokens ?? 0), 0);
  const totalCacheRead = calls.reduce(
    (a, r) => a + (r.cache_read_tokens ?? 0),
    0
  );
  const totalErrors = calls.filter((r) => r.error).length;
  const avgLatency = totalCalls
    ? Math.round(
        calls.reduce((a, r) => a + (r.latency_ms ?? 0), 0) / totalCalls
      )
    : 0;

  // D-64 + D-124: Costo estimado por modelo. Precios abr-2026 por 1M tokens:
  //   Haiku:  $0.25 input / $1.25 output / $0.03 cache read
  //   Sonnet: $3    input / $15   output / $0.30 cache read
  //   Opus:   $5    input / $25   output / $0.50 cache read
  let inputUsd = 0;
  let outputUsd = 0;
  let cacheUsd = 0;
  const byModelMap = new Map<UsageByModel["family"], UsageByModel>();
  const byRoleMap = new Map<string, UsageByRole & { latency_sum: number; latency_count: number }>();
  for (const r of calls) {
    const m = (r.model as string | null ?? "").toLowerCase();
    const isHaiku = m.includes("haiku");
    const isOpus  = m.includes("opus");
    const isSonnet = m.includes("sonnet");
    const family: UsageByModel["family"] = isHaiku ? "haiku" : isOpus ? "opus" : isSonnet ? "sonnet" : "otro";
    const iIn  = isHaiku ? 0.25 : isOpus ? 5  : 3;
    const iOut = isHaiku ? 1.25 : isOpus ? 25 : 15;
    const iCache = isHaiku ? 0.03 : isOpus ? 0.5 : 0.3;
    const rIn  = ((r.input_tokens  ?? 0) * iIn)    / 1_000_000;
    const rOut = ((r.output_tokens ?? 0) * iOut)   / 1_000_000;
    const rCache = ((r.cache_read_tokens ?? 0) * iCache) / 1_000_000;
    inputUsd  += rIn;
    outputUsd += rOut;
    cacheUsd  += rCache;
    // Breakdown por modelo
    const acc = byModelMap.get(family) ?? { family, calls: 0, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cost_usd: 0 };
    acc.calls += 1;
    acc.input_tokens += r.input_tokens ?? 0;
    acc.output_tokens += r.output_tokens ?? 0;
    acc.cache_read_tokens += r.cache_read_tokens ?? 0;
    acc.cost_usd += rIn + rOut + rCache;
    byModelMap.set(family, acc);
    // Wave 5a: Breakdown por rol (Aurora/Rebeca/Elena/Valeria)
    const role = (r.role as string | null) ?? "otro";
    const rAcc = byRoleMap.get(role) ?? {
      role, calls: 0, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0,
      cost_usd: 0, avg_latency_ms: 0, errors: 0, latency_sum: 0, latency_count: 0,
    };
    rAcc.calls += 1;
    rAcc.input_tokens += r.input_tokens ?? 0;
    rAcc.output_tokens += r.output_tokens ?? 0;
    rAcc.cache_read_tokens += r.cache_read_tokens ?? 0;
    rAcc.cost_usd += rIn + rOut + rCache;
    if (typeof r.latency_ms === "number") {
      rAcc.latency_sum += r.latency_ms;
      rAcc.latency_count += 1;
    }
    if (r.error) rAcc.errors += 1;
    byRoleMap.set(role, rAcc);
  }
  const costUsd = Number((inputUsd + outputUsd + cacheUsd).toFixed(3));
  const byModel: UsageByModel[] = Array.from(byModelMap.values())
    .map((m) => ({ ...m, cost_usd: Number(m.cost_usd.toFixed(3)) }))
    .sort((a, b) => b.cost_usd - a.cost_usd);

  const byRole: UsageByRole[] = Array.from(byRoleMap.values())
    .map((r) => ({
      role: r.role,
      calls: r.calls,
      input_tokens: r.input_tokens,
      output_tokens: r.output_tokens,
      cache_read_tokens: r.cache_read_tokens,
      cost_usd: Number(r.cost_usd.toFixed(3)),
      avg_latency_ms: r.latency_count > 0 ? Math.round(r.latency_sum / r.latency_count) : 0,
      errors: r.errors,
    }))
    .sort((a, b) => b.cost_usd - a.cost_usd);

  // Top 5 usuarios
  const userCounts = new Map<string, number>();
  for (const r of calls) {
    userCounts.set(r.user_email, (userCounts.get(r.user_email) ?? 0) + 1);
  }
  const topUsers = Array.from(userCounts.entries())
    .map(([user_email, cnt]) => ({ user_email, calls: cnt }))
    .sort((a, b) => b.calls - a.calls)
    .slice(0, 5);

  // Top 5 clientes con nombre
  const clientCounts = new Map<string, number>();
  for (const r of calls) {
    if (r.client_id)
      clientCounts.set(r.client_id, (clientCounts.get(r.client_id) ?? 0) + 1);
  }
  const topClientIds = Array.from(clientCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const { data: clientNames } = topClientIds.length
    ? await admin
        .from("clients")
        .select("id,name")
        .in(
          "id",
          topClientIds.map(([id]) => id)
        )
    : { data: [] };
  const nameById = new Map(
    (clientNames ?? []).map((c) => [c.id as string, c.name as string])
  );
  const topClients = topClientIds.map(([id, cnt]) => ({
    client_id: id,
    calls: cnt,
    client_name: nameById.get(id) ?? null,
  }));

  // Wave 4 (D dashboard): top razones de rechazo IA en ventana
  const { data: feedbackRows } = await admin
    .from("ia_feedback")
    .select("role, reason_code")
    .eq("rating", "down")
    .gte("created_at", since)
    .not("reason_code", "is", null)
    .limit(5000);

  const feedbackBuckets = new Map<string, FeedbackReasonBucket>();
  let totalDown = 0;
  for (const r of feedbackRows ?? []) {
    if (!r.reason_code) continue;
    totalDown++;
    const key = `${r.role}|${r.reason_code}`;
    const bucket = feedbackBuckets.get(key) ?? {
      role: r.role as string,
      reason_code: r.reason_code as string,
      count: 0,
    };
    bucket.count++;
    feedbackBuckets.set(key, bucket);
  }
  const feedbackTopReasons = Array.from(feedbackBuckets.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    window_days: windowDays,
    total_calls: totalCalls,
    total_input_tokens: totalInput,
    total_output_tokens: totalOutput,
    total_cache_read_tokens: totalCacheRead,
    total_errors: totalErrors,
    avg_latency_ms: avgLatency,
    cost_usd_estimate_max: costUsd,
    by_model: byModel,
    by_role: byRole,
    by_day_role: (byDayRole ?? []) as UsageRow[],
    top_users: topUsers,
    top_clients: topClients,
    feedback_top_reasons: feedbackTopReasons,
    feedback_total_down: totalDown,
  };
}
