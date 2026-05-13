import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { persistCompetitorReport } from "@/lib/documents/competitor";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Cron Wave 7 C: cada 24h, ingiere reportes pendientes de empresas competidoras.
//
// Flujo:
// 1. Fetch dm_benchmark_companies con sustainability_report_url + sin doc ya ingerido
// 2. Persiste c/u como client_document kind='competitor_report' (idempotente)
// 3. El cron embed-chunks (6:30 AM) popula embeddings en el siguiente ciclo
//
// Batches de 3 en paralelo — PDFs pueden ser 10-25MB, timeout 90s por empresa.
// Seguro contra duplicados: persistCompetitorReport retorna cached:true si ya existe.

const BATCH_SIZE = 3;

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const startedAt = Date.now();

  // Empresas con URL + sin client_document competitor_report parseado con éxito
  const { data: companies, error } = await admin
    .from("dm_benchmark_companies")
    .select(`
      id,
      client_id,
      name,
      sustainability_report_url
    `)
    .not("sustainability_report_url", "is", null)
    .not("sustainability_report_url", "eq", "");

  if (error || !companies) {
    return NextResponse.json({ ok: false, error: error?.message ?? "DB error" }, { status: 500 });
  }

  // Excluir las que ya tienen un report ingerido con parse_status=ok
  const { data: alreadyDone } = await admin
    .from("client_documents")
    .select("benchmark_company_id")
    .eq("kind", "competitor_report")
    .eq("parse_status", "ok")
    .in("benchmark_company_id", companies.map((c) => c.id));

  const doneIds = new Set((alreadyDone ?? []).map((d) => d.benchmark_company_id as string));
  const pending = companies.filter((c) => !doneIds.has(c.id));

  let ingested = 0;
  let cached = 0;
  let failed = 0;
  const errors: { name: string; error: string }[] = [];

  // Procesar en batches de BATCH_SIZE en paralelo
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
