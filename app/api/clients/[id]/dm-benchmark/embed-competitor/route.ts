import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireConsultorForClient } from "@/lib/auth";
import { persistCompetitorReport } from "@/lib/documents/competitor";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

// POST /api/clients/[id]/dm-benchmark/embed-competitor
// Body: { benchmark_company_id, source_url }
//
// Descarga el reporte público de un competidor, lo parsea, lo persiste como
// client_document kind='competitor_report' linked vía benchmark_company_id.
// El cron embed-chunks lo procesará en el próximo ciclo (≤24h) y poblará
// embeddings. Después, dm-benchmark compare lo reusará vía vector search.
//
// Idempotente: si ya hay un report persistido para este competidor con
// parse_status=ok, devuelve cached:true sin re-fetch.

const RequestSchema = z.object({
  benchmark_company_id: z.string().uuid(),
  source_url: z.string().url(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id: clientId } = await params;
  const user = await requireConsultorForClient(clientId);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación falló", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Verificar que la empresa competidora pertenece a este cliente
  const admin = createAdminClient();
  const { data: company, error: companyError } = await admin
    .from("dm_benchmark_companies")
    .select("id, client_id, name, website")
    .eq("id", parsed.data.benchmark_company_id)
    .single();

  if (companyError || !company) {
    return NextResponse.json({ error: "Empresa competidora no encontrada" }, { status: 404 });
  }
  if ((company.client_id as string) !== clientId) {
    return NextResponse.json({ error: "Empresa no pertenece a este cliente" }, { status: 403 });
  }

  const result = await persistCompetitorReport({
    benchmarkCompanyId: parsed.data.benchmark_company_id,
    clientId,
    uploadedBy: user,
    sourceUrl: parsed.data.source_url,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Error ingiriendo report" }, { status: 502 });
  }

  return NextResponse.json({
    data: {
      document_id: result.documentId,
      file_name: result.fileName,
      parse_status: result.parseStatus,
      cached: result.cached ?? false,
      company_name: company.name,
    },
  });
}
