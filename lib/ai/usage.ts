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
  family: "haiku" | "sonnet" | "opus" | "voyage" | "otro";
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

export type FeedbackByClient = {
  client_id: string;
  client_name: string | null;
  total: number;
  /** top 3 razones del cliente con count */
  top_reasons: Array<{ reason_code: string; count: number }>;
};

export type UsageByRole = {
  role: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cost_usd: number;
  avg_latency_ms: number;
  /** TTFT promedio en ms (solo chat SSE — nulo para batch/cron) */
  avg_ttft_ms: number;
  errors: number;
};

export type UsageByClient = {
  client_id: string;
  client_name: string | null;
  calls: number;
  cost_usd: number;
};

export type UsageByStage = {
  stage: string;
  calls: number;
  cost_usd: number;
  avg_latency_ms: number;
  errors: number;
};

export type ErrorTypeSummary = {
  timeout: number;
  overloaded: number;
  rate_limit: number;
  other: number;
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
  /** Sub-sprint 1: agregado por etapa de workflow (dm_referentes, chat, ai_fill…) */
  by_stage: UsageByStage[];
  by_day_role: UsageRow[];
  top_users: Array<{ user_email: string; calls: number }>;
  top_clients: Array<{ client_id: string; calls: number; client_name: string | null }>;
  /** Wave 4 (D dashboard): top razones de rechazo IA */
  feedback_top_reasons: FeedbackReasonBucket[];
  feedback_total_down: number;
  /** Wave 6: top 5 clientes con más rechazos + top razones por cliente */
  feedback_by_client: FeedbackByClient[];
  /** Desglose de tipos de error para diagnóstico preciso en monitoreo */
  error_type_summary: ErrorTypeSummary;
  /** Top 10 clientes por costo IA en el período */
  by_client: UsageByClient[];
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
    by_stage: [],
    by_day_role: [],
    top_users: [],
    top_clients: [],
    feedback_top_reasons: [],
    feedback_total_down: 0,
    feedback_by_client: [],
    error_type_summary: { timeout: 0, overloaded: 0, rate_limit: 0, other: 0 },
    by_client: [],
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
      "user_email,client_id,role,model,input_tokens,output_tokens,cache_read_tokens,error,latency_ms,ttft_ms,workflow_stage"
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
  const byRoleMap = new Map<string, UsageByRole & { latency_sum: number; latency_count: number; ttft_sum: number; ttft_count: number }>();
  for (const r of calls) {
    const m = (r.model as string | null ?? "").toLowerCase();
    const isHaiku = m.includes("haiku");
    const isOpus  = m.includes("opus");
    const isSonnet = m.includes("sonnet");
    const isVoyage = m.includes("voyage");
    const family: UsageByModel["family"] =
      isVoyage ? "voyage" : isHaiku ? "haiku" : isOpus ? "opus" : isSonnet ? "sonnet" : "otro";
    // Precios may-2026 por 1M tokens:
    //   voyage-2 / voyage-3: $0.10 input, $0 output (no genera output)
    //   voyage-3-lite: $0.02 input
    // Voyage no tiene output ni cache_read distintos del input.
    const voyageRate = m.includes("voyage-3-lite") ? 0.02 : 0.10;
    const iIn  = isVoyage ? voyageRate : isHaiku ? 0.25 : isOpus ? 5  : 3;
    const iOut = isVoyage ? 0 : isHaiku ? 1.25 : isOpus ? 25 : 15;
    const iCache = isVoyage ? 0 : isHaiku ? 0.03 : isOpus ? 0.5 : 0.3;
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
      cost_usd: 0, avg_latency_ms: 0, avg_ttft_ms: 0, errors: 0,
      latency_sum: 0, latency_count: 0, ttft_sum: 0, ttft_count: 0,
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
    const ttft = (r as Record<string, unknown>).ttft_ms;
    if (typeof ttft === "number") {
      rAcc.ttft_sum += ttft;
      rAcc.ttft_count += 1;
    }
    if (r.error) rAcc.errors += 1;
    byRoleMap.set(role, rAcc);
  }
  const costUsd = Number((inputUsd + outputUsd + cacheUsd).toFixed(3));
  const byModel: UsageByModel[] = Array.from(byModelMap.values())
    .map((m) => ({ ...m, cost_usd: Number(m.cost_usd.toFixed(3)) }))
    .sort((a, b) => b.cost_usd - a.cost_usd);

  // Sub-sprint 1: agregado por workflow_stage
  type StageAcc = { calls: number; cost_usd: number; errors: number; latency_sum: number; latency_count: number };
  const byStageMap = new Map<string, StageAcc>();
  for (const r of calls) {
    const stage = (r as Record<string, unknown>).workflow_stage as string | null;
    if (!stage) continue;
    const acc = byStageMap.get(stage) ?? { calls: 0, cost_usd: 0, errors: 0, latency_sum: 0, latency_count: 0 };
    acc.calls += 1;
    if (r.error) acc.errors += 1;
    if (typeof r.latency_ms === "number") { acc.latency_sum += r.latency_ms; acc.latency_count += 1; }
    // approximate cost per call using avg across all models for that call
    const m2 = ((r.model as string | null) ?? "").toLowerCase();
    const iIn2  = m2.includes("voyage") ? 0.10 : m2.includes("haiku") ? 0.25 : m2.includes("opus") ? 5 : 3;
    const iOut2 = m2.includes("voyage") ? 0 : m2.includes("haiku") ? 1.25 : m2.includes("opus") ? 25 : 15;
    const iCr2  = m2.includes("voyage") ? 0 : m2.includes("haiku") ? 0.03 : m2.includes("opus") ? 0.5 : 0.3;
    acc.cost_usd += ((r.input_tokens ?? 0) * iIn2 + (r.output_tokens ?? 0) * iOut2 + (r.cache_read_tokens ?? 0) * iCr2) / 1_000_000;
    byStageMap.set(stage, acc);
  }
  const byStage: UsageByStage[] = Array.from(byStageMap.entries())
    .map(([stage, acc]) => ({
      stage,
      calls: acc.calls,
      cost_usd: Number(acc.cost_usd.toFixed(4)),
      avg_latency_ms: acc.latency_count > 0 ? Math.round(acc.latency_sum / acc.latency_count) : 0,
      errors: acc.errors,
    }))
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
      avg_ttft_ms: r.ttft_count > 0 ? Math.round(r.ttft_sum / r.ttft_count) : 0,
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
    .select("role, reason_code, client_id")
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

  // Wave 6: agrupar feedback por cliente — top 5 clientes con más rechazos
  const clientCountsMap = new Map<string, { total: number; reasons: Map<string, number> }>();
  for (const r of feedbackRows ?? []) {
    if (!r.client_id || !r.reason_code) continue;
    const entry = clientCountsMap.get(r.client_id as string) ?? { total: 0, reasons: new Map() };
    entry.total += 1;
    entry.reasons.set(r.reason_code, (entry.reasons.get(r.reason_code) ?? 0) + 1);
    clientCountsMap.set(r.client_id as string, entry);
  }
  const topFeedbackClientIds = Array.from(clientCountsMap.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 5);
  const { data: fbClientNames } = topFeedbackClientIds.length
    ? await admin.from("clients").select("id,name").in("id", topFeedbackClientIds.map(([id]) => id))
    : { data: [] };
  const fbNameById = new Map((fbClientNames ?? []).map((c) => [c.id as string, c.name as string]));
  const feedbackByClient: FeedbackByClient[] = topFeedbackClientIds.map(([id, entry]) => ({
    client_id: id,
    client_name: fbNameById.get(id) ?? null,
    total: entry.total,
    top_reasons: Array.from(entry.reasons.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([reason_code, count]) => ({ reason_code, count })),
  }));

  // Top 10 clientes por costo IA en el período
  type ClientAcc = { cost_usd: number; calls: number };
  const byClientMap = new Map<string, ClientAcc>();
  for (const r of calls) {
    if (!r.client_id) continue;
    const m2 = ((r.model as string | null) ?? "").toLowerCase();
    const iIn2  = m2.includes("voyage") ? 0.10 : m2.includes("haiku") ? 0.25 : m2.includes("opus") ? 5  : 3;
    const iOut2 = m2.includes("voyage") ? 0    : m2.includes("haiku") ? 1.25 : m2.includes("opus") ? 25 : 15;
    const iCr2  = m2.includes("voyage") ? 0    : m2.includes("haiku") ? 0.03 : m2.includes("opus") ? 0.5: 0.3;
    const cost = ((r.input_tokens ?? 0) * iIn2 + (r.output_tokens ?? 0) * iOut2 + (r.cache_read_tokens ?? 0) * iCr2) / 1_000_000;
    const acc = byClientMap.get(r.client_id as string) ?? { cost_usd: 0, calls: 0 };
    acc.cost_usd += cost;
    acc.calls += 1;
    byClientMap.set(r.client_id as string, acc);
  }
  const topClientIdsByCost = Array.from(byClientMap.entries())
    .sort((a, b) => b[1].cost_usd - a[1].cost_usd)
    .slice(0, 10);
  const { data: clientNameRows } = topClientIdsByCost.length
    ? await admin.from("clients").select("id,name").in("id", topClientIdsByCost.map(([id]) => id))
    : { data: [] };
  const clientNameById = new Map((clientNameRows ?? []).map((c) => [c.id as string, c.name as string]));
  const byClient: UsageByClient[] = topClientIdsByCost.map(([id, acc]) => ({
    client_id: id,
    client_name: clientNameById.get(id) ?? null,
    calls: acc.calls,
    cost_usd: Number(acc.cost_usd.toFixed(4)),
  }));

  // Desglose de tipos de error — classifica errores por patrón en el texto
  const errorTypeSummary: ErrorTypeSummary = { timeout: 0, overloaded: 0, rate_limit: 0, other: 0 };
  for (const r of calls) {
    if (!r.error) continue;
    const e = (r.error as string).toLowerCase();
    if (e.includes("tardó") || e.includes("timeout") || e.includes("timed out") || e.includes("aborterror") || e.includes("esperado")) {
      errorTypeSummary.timeout++;
    } else if (e.includes("saturada") || e.includes("overloaded") || e.includes("529") || e.includes("503")) {
      errorTypeSummary.overloaded++;
    } else if (e.includes("429") || e.includes("rate") || e.includes("limit") || e.includes("velocidad")) {
      errorTypeSummary.rate_limit++;
    } else {
      errorTypeSummary.other++;
    }
  }

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
    by_stage: byStage,
    by_day_role: (byDayRole ?? []) as UsageRow[],
    top_users: topUsers,
    top_clients: topClients,
    feedback_top_reasons: feedbackTopReasons,
    feedback_total_down: totalDown,
    feedback_by_client: feedbackByClient,
    error_type_summary: errorTypeSummary,
    by_client: byClient,
  };
}
