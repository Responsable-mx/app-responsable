import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Cron orchestrator único — evalúa auto_update_config y dispara handlers.
//
// Por cada recurso enabled=true: si last_run_at IS NULL OR
// last_run_at < now() - frequency_days, ejecuta el handler correspondiente.
// Actualiza last_run_at + last_status + last_run_summary.
//
// Idempotente: si handler falla, próximo ciclo retoma con mismo recurso.
//
// Handlers están sandboxeados en try/catch — un recurso fallando NO bloquea
// los demás.

type HandlerResult = {
  status: "ok" | "partial" | "failed";
  summary?: Record<string, unknown>;
  error?: string;
  /** Costo estimado de esta ejecución (USD) */
  cost_usd?: number;
  /** Ahorro estimado: trabajo manual o llamadas IA evitadas (USD) */
  savings_usd?: number;
};

async function handleCompetitorReports(staleAfterDays: number): Promise<HandlerResult> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - staleAfterDays * 86400000).toISOString();

  // Marca para refresh: competitor_report con created_at < cutoff y parse_status=ok
  const { data: stale, error } = await admin
    .from("client_documents")
    .select("id, file_name, benchmark_company_id, source_url, created_at")
    .eq("kind", "competitor_report")
    .eq("parse_status", "ok")
    .lt("created_at", cutoff)
    .limit(20);

  if (error) return { status: "failed", error: error.message };
  if (!stale || stale.length === 0) return { status: "ok", summary: { found_stale: 0 } };

  // Re-descargar + re-procesar
  const { persistCompetitorReport } = await import("@/lib/documents/competitor");
  let refreshed = 0;
  let failed = 0;
  for (const doc of stale) {
    if (!doc.source_url || !doc.benchmark_company_id) continue;
    // Borrar el viejo para que persistCompetitorReport no devuelva cached:true
    await admin.from("client_documents").delete().eq("id", doc.id as string);

    // Buscar el client_id propietario para atribución
    const { data: company } = await admin
      .from("dm_benchmark_companies")
      .select("client_id")
      .eq("id", doc.benchmark_company_id as string)
      .maybeSingle();
    if (!company) {
      failed++;
      continue;
    }

    const res = await persistCompetitorReport({
      benchmarkCompanyId: doc.benchmark_company_id as string,
      clientId: company.client_id as string,
      uploadedBy: "cron@auto-update",
      sourceUrl: doc.source_url as string,
    });
    if (res.ok) refreshed++;
    else failed++;
  }

  // Costo: ~$0.02/doc (LlamaParse parse + embed). Ahorro: ~15 min trabajo manual
  // del consultor para encontrar, descargar y verificar frescura del PDF.
  // Valor consultor: ~$0.30/min (18USD/h), así que 15min ≈ $4.50/doc.
  const cost_usd = Number((refreshed * 0.02).toFixed(4));
  const savings_usd = Number((refreshed * 4.5).toFixed(2));

  return {
    status: failed === 0 ? "ok" : refreshed > 0 ? "partial" : "failed",
    summary: { stale_found: stale.length, refreshed, failed },
    cost_usd,
    savings_usd,
  };
}

async function handleDmBenchmarkRefresh(staleAfterDays: number): Promise<HandlerResult> {
  // Solo MARCA benchmarks viejos como "needs_refresh"; no regenera (eso es costoso
  // y el consultor decide cuándo).
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - staleAfterDays * 86400000).toISOString();
  const { data, error } = await admin
    .from("dm_benchmark_results")
    .select("id, client_id, created_at")
    .eq("status", "done")
    .lt("created_at", cutoff)
    .limit(50);
  if (error) return { status: "failed", error: error.message };
  return {
    status: "ok",
    summary: { stale_benchmarks: data?.length ?? 0, note: "Solo conteo informativo — no regenera automático" },
  };
}

async function handleEmbeddingsRecompute(staleAfterDays: number): Promise<HandlerResult> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - staleAfterDays * 86400000).toISOString();
  // Marca chunks con embedded_at viejo para que el cron embed-chunks los recalcule
  const { data, error } = await admin
    .from("document_chunks")
    .update({ embedding: null, embedded_at: null })
    .lt("embedded_at", cutoff)
    .not("embedded_at", "is", null)
    .select("id")
    .limit(50);
  if (error) return { status: "failed", error: error.message };
  const resetCount = data?.length ?? 0;
  // Costo: $0.001/chunk en Voyage. Ahorro: respuestas IA con contexto desactualizado
  // evitado — estimado $0.10/chunk en llamadas de retrieval que habrían fallado.
  const cost_usd   = Number((resetCount * 0.001).toFixed(4));
  const savings_usd = Number((resetCount * 0.10).toFixed(4));
  return { status: "ok", summary: { reset_for_reembed: resetCount }, cost_usd, savings_usd };
}

async function handleClientDocumentsReparse(_staleAfterDays: number): Promise<HandlerResult> {
  // Stub — re-parse de docs cliente es costoso y requiere lógica más fina
  // (preservar service_ids, audit, etc). Por ahora retorna ok sin acción.
  return { status: "ok", summary: { note: "Handler pendiente de implementar" } };
}

async function handleClientProfileExtract(_staleAfterDays: number): Promise<HandlerResult> {
  // Stub — re-extract de perfil cliente desde web. Requiere iterar clientes
  // con website_url y llamar extract-profile. Implementar cuando se priorice.
  return { status: "ok", summary: { note: "Handler pendiente de implementar" } };
}

const HANDLERS: Record<string, (days: number) => Promise<HandlerResult>> = {
  competitor_reports: handleCompetitorReports,
  client_documents: handleClientDocumentsReparse,
  dm_benchmark_refresh: handleDmBenchmarkRefresh,
  embeddings_recompute: handleEmbeddingsRecompute,
  client_profile_extract: handleClientProfileExtract,
};

export async function GET(req: Request) {
  // Fail-closed: si CRON_SECRET queda vacío el endpoint NO se abre.
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: configs, error } = await admin
    .from("auto_update_config")
    .select("*")
    .eq("enabled", true);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const now = Date.now();
  const results: Array<{ resource_key: string; ran: boolean; status?: string; summary?: unknown; error?: string }> = [];

  for (const cfg of configs ?? []) {
    const resourceKey = cfg.resource_key as string;
    const freqDays = cfg.frequency_days as number;
    const lastRunAt = cfg.last_run_at ? new Date(cfg.last_run_at as string).getTime() : 0;
    const shouldRun = lastRunAt === 0 || now - lastRunAt >= freqDays * 86400000;

    if (!shouldRun) {
      results.push({ resource_key: resourceKey, ran: false });
      continue;
    }

    const handler = HANDLERS[resourceKey];
    if (!handler) {
      results.push({ resource_key: resourceKey, ran: false, error: "Handler no implementado" });
      continue;
    }

    try {
      const handlerResult = await handler(freqDays);
      const runCost    = handlerResult.cost_usd    ?? 0;
      const runSavings = handlerResult.savings_usd ?? 0;
      // Fetch current totals to increment (Supabase no soporta UPDATE … SET col = col + N)
      const { data: cur } = await admin
        .from("auto_update_config")
        .select("total_cost_usd,total_savings_usd")
        .eq("resource_key", resourceKey)
        .maybeSingle();
      const newTotalCost    = Number(((cur?.total_cost_usd    as number | null) ?? 0) + runCost).toFixed(4);
      const newTotalSavings = Number(((cur?.total_savings_usd as number | null) ?? 0) + runSavings).toFixed(4);
      await admin
        .from("auto_update_config")
        .update({
          last_run_at:       new Date().toISOString(),
          last_status:       handlerResult.status,
          last_error:        handlerResult.error ?? null,
          last_run_summary:  handlerResult.summary ?? null,
          last_run_cost_usd:    runCost > 0    ? runCost    : null,
          last_run_savings_usd: runSavings > 0 ? runSavings : null,
          total_cost_usd:    newTotalCost,
          total_savings_usd: newTotalSavings,
        })
        .eq("resource_key", resourceKey);
      results.push({ resource_key: resourceKey, ran: true, status: handlerResult.status, summary: handlerResult.summary });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Handler exception";
      await admin
        .from("auto_update_config")
        .update({
          last_run_at: new Date().toISOString(),
          last_status: "failed",
          last_error: msg,
        })
        .eq("resource_key", resourceKey);
      results.push({ resource_key: resourceKey, ran: true, status: "failed", error: msg });
    }
  }

  return NextResponse.json({
    ok: true,
    evaluated: configs?.length ?? 0,
    ran: results.filter((r) => r.ran).length,
    results,
  });
}
