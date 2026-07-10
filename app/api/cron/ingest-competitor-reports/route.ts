import { NextResponse } from "next/server";
import { Client } from "@upstash/qstash";
import { createAdminClient } from "@/lib/supabase/admin";
import { persistCompetitorReport } from "@/lib/documents/competitor";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Cron Wave 7 C: cada 24h, ingiere reportes pendientes de empresas competidoras.
//
// Modo QStash (QSTASH_TOKEN configurado):
//   Despacha 1 mensaje por empresa → cada job tiene su propio timeout + retry.
//   Elimina el riesgo de timeout cuando hay >5 PDFs pesados pendientes.
//
// Modo fallback (sin QStash):
//   Procesa en batches de 3 en paralelo — misma lógica original.

const BATCH_SIZE = 3;

export async function GET(req: Request) {
  // Fail-closed: si CRON_SECRET queda vacío el endpoint NO se abre.
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const startedAt = Date.now();

  const { data: companies, error } = await admin
    .from("dm_benchmark_companies")
    .select("id, client_id, name, sustainability_report_url")
    .not("sustainability_report_url", "is", null)
    .not("sustainability_report_url", "eq", "");

  if (error || !companies) {
    return NextResponse.json({ ok: false, error: error?.message ?? "DB error" }, { status: 500 });
  }

  const { data: alreadyDone } = await admin
    .from("client_documents")
    .select("benchmark_company_id")
    .eq("kind", "competitor_report")
    .eq("parse_status", "ok")
    .in("benchmark_company_id", companies.map((c) => c.id));

  const doneIds = new Set((alreadyDone ?? []).map((d) => d.benchmark_company_id as string));
  const pending = companies.filter((c) => !doneIds.has(c.id));

  // ── Modo QStash: 1 job por empresa, retry automático ──────────────────────
  if (process.env.QSTASH_TOKEN && pending.length > 0) {
    const qstash = new Client({ token: process.env.QSTASH_TOKEN });
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.responsable.net";
    const jobUrl = `${appUrl}/api/jobs/ingest-one-company`;

    const dispatched: string[] = [];
    const dispatchErrors: { name: string; error: string }[] = [];

    await Promise.all(
      pending.map(async (company) => {
        if (!company.id || !company.client_id) return;
        try {
          await qstash.publishJSON({
            url: jobUrl,
            body: {
              benchmarkCompanyId: company.id,
              clientId: company.client_id,
              name: company.name ?? "",
              sourceUrl: company.sustainability_report_url,
            },
            retries: 3,
          });
          dispatched.push(company.name as string);
        } catch (e) {
          dispatchErrors.push({
            name: company.name as string,
            error: e instanceof Error ? e.message : "dispatch failed",
          });
        }
      })
    );

    return NextResponse.json({
      ok: true,
      mode: "qstash",
      totalWithUrl: companies.length,
      alreadyIngested: doneIds.size,
      pending: pending.length,
      dispatched: dispatched.length,
      dispatchErrors,
      durationMs: Date.now() - startedAt,
    });
  }

  // ── Modo fallback: batch síncrono ─────────────────────────────────────────
  let ingested = 0;
  let cached = 0;
  let failed = 0;
  const errors: { name: string; error: string }[] = [];

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (company) => {
        const result = await persistCompetitorReport({
          benchmarkCompanyId: company.id as string,
          clientId: company.client_id as string,
          uploadedBy: "cron:ingest-competitor-reports",
          sourceUrl: company.sustainability_report_url as string,
        });
        if (!result.ok) {
          failed++;
          errors.push({ name: company.name as string, error: result.error ?? "unknown" });
        } else if (result.cached) {
          cached++;
        } else {
          ingested++;
        }
      })
    );
  }

  return NextResponse.json({
    ok: true,
    mode: "sync",
    totalWithUrl: companies.length,
    alreadyIngested: doneIds.size,
    pending: pending.length,
    ingested,
    cached,
    failed,
    errors,
    durationMs: Date.now() - startedAt,
  });
}
