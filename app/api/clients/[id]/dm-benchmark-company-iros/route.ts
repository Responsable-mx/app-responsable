import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireConsultorForClient } from "@/lib/auth";
import { anthropicBreaker } from "@/lib/ai/circuit-breaker";
import { getClient } from "@/lib/clients";
import { createAnthropicClient } from "@/lib/ai/client";
import { extractBatchResult } from "@/lib/ai/batch-result";
import { logAiCall } from "@/lib/ai/logging";
import { getModelConfig } from "@/lib/ai/models";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkAiRateLimit } from "@/lib/ai/rate-limit";
import {
  BenchmarkIroResultSchema,
  type BenchmarkCompanyIro,
  type BenchmarkIroBatch,
} from "@/lib/dm/benchmark-iro-types";

export const runtime = "nodejs";
export const maxDuration = 180;
export const dynamic = "force-dynamic";

// Rate limit: 3 generaciones por 5 min (~$0.05-0.15/call Sonnet Batch)
const RATE_LIMIT = { windowMs: 5 * 60_000, maxCalls: 3 };

// ── Prompt ────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  "Eres un consultor senior de Doble Materialidad especializado en ESRS/CSRD. " +
  "Analiza la información disponible de la empresa y extrae o interpreta sus Impactos, " +
  "Riesgos y Oportunidades (IROs). Responde SOLO con JSON válido, sin texto adicional.";

function buildPrompt(params: {
  companyName: string;
  sector: string | null;
  country: string | null;
  clientSector: string | null;
  reportChunks: string;
  reportUrl: string | null;
}): string {
  const { companyName, sector, country, clientSector, reportChunks, reportUrl } = params;

  const companyCtx = [
    `Empresa: ${companyName}`,
    sector ? `Sector: ${sector}` : null,
    country ? `País: ${country}` : null,
    reportUrl ? `Informe de sustentabilidad: ${reportUrl}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const chunksSection = reportChunks
    ? `\nEXTRACTOS DEL INFORME DE SUSTENTABILIDAD (fuente primaria):\n${reportChunks}\n`
    : `\n(No se encontraron extractos del informe en la base de datos. Usa tu conocimiento sobre la empresa y el sector para interpretar los IROs.)\n`;

  return `## Contexto
${companyCtx}
${clientSector ? `Sector de referencia (cliente): ${clientSector}` : ""}
${chunksSection}

## Instrucción

1. Si la empresa tiene información explícita de IROs en los extractos → extráelos fielmente. Marca fuente como "reporte" y confianza "alto".
2. Si la empresa no reporta IROs directamente pero hay información de impactos/riesgos/estrategia → interpreta los IROs con base en la evidencia. Marca fuente según corresponda y confianza "medio" o "alto".
3. Si no hay extractos del informe → interpreta los IROs con base en el sector y conocimiento general de la empresa. Marca fuente como "interpretacion_ia" y confianza "bajo" o "medio".

### Formato de cada IRO (campo descripcion)
- Redacción: causa → consecuencia concreta y medible.
- Ejemplo: "Incremento de la temperatura global (causa) reduce rendimiento de cultivos en zonas de operación en hasta 30% para 2035 (consecuencia)."
- Evitar: genérico, vago, sin causa clara o sin consecuencia medible.

### Clasificaciones
- tipo: "impacto_positivo" | "impacto_negativo" | "riesgo" | "oportunidad"
  - Riesgo: siempre negativo — evento o condición que afecta la sostenibilidad financiera.
  - Oportunidad: siempre positivo — factor que fortalece resiliencia, competitividad o acceso a capital.
- cadena: "operacion" | "upstream" | "downstream" | "sociedad_comunidad" | "clientes_consumidores" | "medio_ambiente"
- horizonte: "corto" | "mediano" | "largo"
- fuente_tipo: "reporte" | "sitio_web" | "interpretacion_ia"
- confianza: "alto" (evidencia explícita) | "medio" (inferencia contextual) | "bajo" (suposición sin evidencia directa)

### Cantidad
Genera entre 8 y 20 IROs. Cubre todas las dimensiones ESG relevantes para el sector.

## Respuesta (solo JSON, sin markdown)

{
  "iros": [
    {
      "n_iro": 1,
      "descripcion": "...",
      "tipo": "impacto_negativo",
      "cadena": "operacion",
      "horizonte": "mediano",
      "tema_asociado": "Cambio climático",
      "fuente_tipo": "reporte",
      "confianza": "alto"
    }
  ]
}`;
}

// ── Tipos de respuesta ─────────────────────────────────────────────────────────

type CompanyIroGroup = {
  company_id: string;
  company_name: string;
  batch: BenchmarkIroBatch | null;
  iros: BenchmarkCompanyIro[];
};

type Ctx = { params: Promise<{ id: string }> };

// ── GET — batch status + IROs por empresa (todas o una) ───────────────────────

export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("company_id");

  const admin = createAdminClient();

  // Obtener empresas del benchmark validadas para este cliente
  const { data: companies } = await admin
    .from("dm_benchmark_companies")
    .select("id, name")
    .eq("client_id", id)
    .eq("validated", true);

  const companyIds = (companies ?? []).map((c) => c.id as string);
  if (companyIds.length === 0)
    return NextResponse.json({ data: { groups: [] } });

  // Si company_id en query → solo esa empresa
  const targetIds = companyId ? [companyId] : companyIds;

  const [batchesRes, irosRes] = await Promise.all([
    admin
      .from("dm_benchmark_iro_batches")
      .select("*")
      .in("benchmark_company_id", targetIds),
    admin
      .from("dm_benchmark_company_iros")
      .select("*")
      .eq("client_id", id)
      .in("benchmark_company_id", targetIds)
      .order("n_iro", { ascending: true }),
  ]);

  const batches = (batchesRes.data ?? []) as BenchmarkIroBatch[];
  const iros = (irosRes.data ?? []) as BenchmarkCompanyIro[];

  // Polling: finalizar batches pendientes
  const pendingBatches = batches.filter((b) => b.status === "pending" && b.batch_id);
  if (pendingBatches.length > 0) {
    const anthropic = createAnthropicClient();
    await Promise.all(
      pendingBatches.map(async (b) => {
        try {
          const batch = await anthropic.beta.messages.batches.retrieve(b.batch_id!);
          if (batch.processing_status !== "ended") return;

          const ext = await extractBatchResult(
            anthropic,
            b.batch_id!,
            BenchmarkIroResultSchema,
            `dm-benchmark-iro ${b.benchmark_company_id}`
          );

          if (ext.parsed && !ext.error) {
            // Reemplazar IROs anteriores de esta empresa
            await admin
              .from("dm_benchmark_company_iros")
              .delete()
              .eq("benchmark_company_id", b.benchmark_company_id);

            const rows = ext.parsed.iros.map((iro) => ({
              client_id:            id,
              benchmark_company_id: b.benchmark_company_id,
              n_iro:                iro.n_iro,
              descripcion:          iro.descripcion,
              tipo:                 iro.tipo,
              cadena:               iro.cadena,
              horizonte:            iro.horizonte,
              tema_asociado:        iro.tema_asociado ?? null,
              fuente_tipo:          iro.fuente_tipo,
              confianza:            iro.confianza,
            }));

            await admin.from("dm_benchmark_company_iros").insert(rows);
            await admin
              .from("dm_benchmark_iro_batches")
              .update({ status: "done" })
              .eq("id", b.id);

            // Actualizar colecciones locales para incluir en la respuesta
            batches.splice(batches.indexOf(b), 1, { ...b, status: "done" });
            const newIros = await admin
              .from("dm_benchmark_company_iros")
              .select("*")
              .eq("benchmark_company_id", b.benchmark_company_id)
              .order("n_iro", { ascending: true });
            iros.push(...((newIros.data ?? []) as BenchmarkCompanyIro[]));

            void logAiCall({
              userEmail: b.created_by,
              role: "aurora",
              clientId: id,
              model: getModelConfig("aurora").model,
              inputTokens: ext.inputTokens,
              outputTokens: ext.outputTokens,
              cacheCreationTokens: ext.cacheCreationTokens,
              cacheReadTokens: ext.cacheReadTokens,
              latencyMs: Date.now() - new Date(b.created_at).getTime(),
              error: null,
              workflowStage: "dm_benchmark_company_iros",
            });
          } else {
            await admin
              .from("dm_benchmark_iro_batches")
              .update({ status: "failed", error_msg: ext.error })
              .eq("id", b.id);
            batches.splice(batches.indexOf(b), 1, { ...b, status: "failed" });
          }
        } catch {
          // Fallo silencioso — devolver estado actual
        }
      })
    );
  }

  // Construir response agrupado por empresa
  const batchByCompany = Object.fromEntries(
    batches.map((b) => [b.benchmark_company_id, b])
  );
  const irosByCompany = iros.reduce<Record<string, BenchmarkCompanyIro[]>>((acc, iro) => {
    if (!acc[iro.benchmark_company_id]) acc[iro.benchmark_company_id] = [];
    acc[iro.benchmark_company_id]!.push(iro);
    return acc;
  }, {});

  const groups: CompanyIroGroup[] = targetIds.map((cid) => {
    const company = (companies ?? []).find((c) => c.id === cid);
    return {
      company_id:   cid,
      company_name: company?.name ?? cid,
      batch:        batchByCompany[cid] ?? null,
      iros:         irosByCompany[cid] ?? [],
    };
  });

  return NextResponse.json({ data: { groups } });
}

// ── POST — dispara generación de IROs para una empresa ───────────────────────

const PostBody = z.object({
  company_id: z.string().uuid(),
});

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY)
    return NextResponse.json({ error: "ANTHROPIC_API_KEY no configurada" }, { status: 500 });

  const limited = await checkAiRateLimit(user, { windowMs: RATE_LIMIT.windowMs, max: RATE_LIMIT.maxCalls });
  if (limited)
    return NextResponse.json({ error: "Demasiadas solicitudes. Espera 5 minutos." }, { status: 429 });

  if (anthropicBreaker.isOpen)
    return NextResponse.json({ error: anthropicBreaker.userMessage }, { status: 503 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = PostBody.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "company_id requerido (uuid)" }, { status: 400 });

  const { company_id } = parsed.data;

  const admin = createAdminClient();

  // Verificar que la empresa pertenece a este cliente y está validada
  const { data: companyRow } = await admin
    .from("dm_benchmark_companies")
    .select("id, name, sector, sustainability_report_url")
    .eq("id", company_id)
    .eq("client_id", id)
    .eq("validated", true)
    .maybeSingle();

  if (!companyRow)
    return NextResponse.json({ error: "Empresa no encontrada o no validada" }, { status: 404 });

  const client = await getClient(id).catch(() => null);
  if (!client) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

  // Buscar chunks embeddidos del reporte del competidor (Wave 7 C)
  let reportChunks = "";
  try {
    const { searchCompetitorChunks } = await import("@/lib/documents/competitor");
    const matches = await searchCompetitorChunks({
      query: "impactos riesgos oportunidades ESG sostenibilidad materialidad",
      benchmarkCompanyId: company_id,
      limit: 12,
    });
    if (matches && matches.length > 0) {
      reportChunks = matches
        .map((m) => m.content)
        .join("\n---\n")
        .slice(0, 10_000);
    }
  } catch {
    // Sin chunks disponibles — continuar con conocimiento del modelo
  }

  const prompt = buildPrompt({
    companyName: companyRow.name as string,
    sector:      (companyRow.sector as string | null) ?? null,
    country:     null,
    clientSector: client.sector ?? null,
    reportChunks,
    reportUrl:   (companyRow.sustainability_report_url as string | null) ?? null,
  });

  const model = getModelConfig("aurora").model;

  // Upsert batch row (UNIQUE en benchmark_company_id → reemplaza si ya existe)
  await admin
    .from("dm_benchmark_iro_batches")
    .delete()
    .eq("benchmark_company_id", company_id);

  const { data: batchRow, error: insertErr } = await admin
    .from("dm_benchmark_iro_batches")
    .insert({
      client_id:            id,
      benchmark_company_id: company_id,
      status:               "pending",
      created_by:           user,
    })
    .select()
    .single();

  if (insertErr || !batchRow)
    return NextResponse.json({ error: "Error al crear registro de generación" }, { status: 500 });

  try {
    const anthropic = createAnthropicClient();
    const batch = await anthropic.beta.messages.batches.create(
      {
        requests: [
          {
            custom_id: batchRow.id,
            params: {
              model,
              max_tokens: 8000,
              system: [
                {
                  type: "text",
                  text: SYSTEM_PROMPT,
                  cache_control: { type: "ephemeral" },
                },
              ],
              messages: [{ role: "user", content: prompt }],
            },
          },
        ],
      },
      { signal: AbortSignal.timeout(15_000) }
    );

    anthropicBreaker.recordSuccess();
    await admin
      .from("dm_benchmark_iro_batches")
      .update({ batch_id: batch.id })
      .eq("id", batchRow.id);
  } catch (e) {
    anthropicBreaker.recordFailure();
    const errMsg = e instanceof Error ? e.message : "Error Anthropic";
    await admin
      .from("dm_benchmark_iro_batches")
      .update({ status: "failed", error_msg: errMsg })
      .eq("id", batchRow.id);
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }

  return NextResponse.json({ data: { status: "pending", company_id } });
}
