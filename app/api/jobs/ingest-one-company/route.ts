import { NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { createAdminClient } from "@/lib/supabase/admin";
import { persistCompetitorReport } from "@/lib/documents/competitor";
import { isDevMode } from "@/lib/env";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Job handler: procesa UN solo competidor por llamada.
// Recibe mensajes de QStash — cada empresa tiene su propio timeout + retry.

type JobPayload = {
  benchmarkCompanyId: string;
  clientId: string;
  name: string;
  sourceUrl: string;
};

export async function POST(req: Request) {
  // Verificar firma QStash (impide llamadas no autorizadas)
  const signingKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;

  // Fail-closed: sin llaves de firma QStash no hay forma de verificar el origen
  // → rechazar. Antes el fallback procesaba SIN verificar (endpoint abierto si
  // las env vars quedaban vacías). Solo dev local procesa directo.
  if (!signingKey || !nextSigningKey) {
    if (isDevMode()) {
      const payload = (await req.json()) as JobPayload;
      return processCompany(payload);
    }
    return NextResponse.json({ error: "QStash signing keys no configuradas" }, { status: 401 });
  }

  const receiver = new Receiver({ currentSigningKey: signingKey, nextSigningKey });
  const body = await req.text();
  const signature = req.headers.get("upstash-signature") ?? "";
  const isValid = await receiver.verify({ body, signature }).catch(() => false);
  if (!isValid) {
    return NextResponse.json({ error: "Invalid QStash signature" }, { status: 401 });
  }
  let payload: JobPayload;
  try {
    payload = JSON.parse(body) as JobPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }
  return processCompany(payload);
}

async function processCompany(payload: JobPayload) {
  const { benchmarkCompanyId, clientId, name, sourceUrl } = payload;
  if (!benchmarkCompanyId || !clientId || !sourceUrl) {
    return NextResponse.json({ error: "Payload incompleto" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verificar que no esté ya procesado (idempotencia)
  const { data: existing } = await admin
    .from("client_documents")
    .select("id, parse_status")
    .eq("benchmark_company_id", benchmarkCompanyId)
    .eq("kind", "competitor_report")
    .eq("parse_status", "ok")
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ ok: true, cached: true, name });
  }

  const result = await persistCompetitorReport({
    benchmarkCompanyId,
    clientId,
    uploadedBy: "job:ingest-one-company",
    sourceUrl,
  });

  if (!result.ok) {
    // Retornar 500 para que QStash reintente automáticamente
    return NextResponse.json(
      { ok: false, name, error: result.error ?? "unknown" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, cached: result.cached ?? false, name });
}
