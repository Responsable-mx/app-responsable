import { NextRequest, NextResponse } from "next/server";
import { createAnthropicClient } from "@/lib/ai/client";
import { z } from "zod";
import { requireConsultorForClient } from "@/lib/auth";
import { anthropicBreaker } from "@/lib/ai/circuit-breaker";
import { getClient } from "@/lib/clients";
import { extractJsonObject } from "@/lib/ai/extract-json";
import { logAiCall } from "@/lib/ai/logging";
import { getModelConfig } from "@/lib/ai/models";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkAiRateLimit } from "@/lib/ai/rate-limit";
import {
  buildIroGenerationPrompt,
  getFullQuestionnaireContext,
  IroGenerationSchema,
  type IroInventoryItem,
} from "@/lib/dm/iro-generation";

export const runtime = "nodejs";
export const maxDuration = 180;
export const dynamic = "force-dynamic";

// Rate limit: 5 generaciones por 5 min (Sonnet Batch — ~$0.05-0.15/call)
const IRO_RATE_LIMIT = { windowMs: 5 * 60_000, maxCalls: 5 };

const PatchBody = z.object({
  id:               z.string().uuid(),
  incluido:         z.boolean().optional(),
  score_impacto:    z.number().int().min(1).max(3).optional(),
  score_financiero: z.number().int().min(1).max(3).optional(),
  descripcion:      z.string().min(1).max(600).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

// ── GET — devuelve batch status + lista de IROs ───────────────────────────────

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const admin = createAdminClient();

  const [batchRes, irosRes] = await Promise.all([
    admin
      .from("dm_iro_batches")
      .select("*")
      .eq("client_id", id)
      .order("created_at", { ascending: false })
      .limit(1),
    admin
      .from("client_iro_inventory")
      .select("*")
      .eq("client_id", id)
      .order("n_iro", { ascending: true }),
  ]);

  const latestBatch = batchRes.data?.[0] ?? null;
  const iros = (irosRes.data ?? []) as IroInventoryItem[];

  // Polling: si batch pendiente, consultar Anthropic
  if (latestBatch?.status === "pending" && latestBatch?.batch_id) {
    try {
      const anthropic = createAnthropicClient();
      const batch = await anthropic.beta.messages.batches.retrieve(latestBatch.batch_id);

      if (batch.processing_status === "ended") {
        let parsed: z.infer<typeof IroGenerationSchema> | null = null;
        let batchError: string | null = null;
        let inputTokens = 0, outputTokens = 0;

        for await (const result of await anthropic.beta.messages.batches.results(latestBatch.batch_id)) {
          if (result.result.type === "succeeded") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const msg = result.result.message as any;
            inputTokens = msg.usage?.input_tokens ?? 0;
            outputTokens = msg.usage?.output_tokens ?? 0;
            const textOut = (msg.content as Array<{ type: string; text?: string }>)
              .filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
            const jsonText = extractJsonObject(textOut);
            if (jsonText) {
              const r = IroGenerationSchema.safeParse(JSON.parse(jsonText));
              if (r.success) parsed = r.data;
              else batchError = "Schema IA inválido";
            } else {
              batchError = "Sin JSON en respuesta IA";
            }
          } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            batchError = (result.result as any).error?.message ?? "Error en batch";
          }
        }

        if (parsed && !batchError) {
          // Limpiar IROs anteriores e insertar los nuevos
          await admin.from("client_iro_inventory").delete().eq("client_id", id);
          const rows = parsed.iros.map((iro) => ({
            client_id:        id,
            n_iro:            iro.n_iro,
            tema_esg:         iro.tema_esg,
            descripcion:      iro.descripcion,
            tipo:             iro.tipo,
            estado:           iro.estado,
            cadena:           iro.cadena,
            horizonte:        iro.horizonte,
            evidencia:        iro.evidencia ?? null,
            confianza:        iro.confianza,
            score_impacto:    iro.score_impacto,
            score_financiero: iro.score_financiero,
            incluido:         true,
          }));
          const { data: inserted } = await admin
            .from("client_iro_inventory").insert(rows).select();
          await admin.from("dm_iro_batches").update({ status: "done" }).eq("id", latestBatch.id);
          void logAiCall({
            userEmail: latestBatch.created_by, role: "aurora", clientId: id,
            model: getModelConfig("aurora").model,
            inputTokens, outputTokens, cacheCreationTokens: 0, cacheReadTokens: 0,
            latencyMs: 0, error: null,
          });
          return NextResponse.json({
            data: { status: "done", iros: (inserted ?? []) as IroInventoryItem[] },
          });
        } else {
          await admin.from("dm_iro_batches")
            .update({ status: "failed", error_msg: batchError })
            .eq("id", latestBatch.id);
          return NextResponse.json({ data: { status: "failed", iros } });
        }
      }
    } catch {
      // Fallo silencioso — devolver estado actual sin bloquear UI
    }
  }

  return NextResponse.json({
    data: {
      status: latestBatch?.status ?? "idle",
      iros,
    },
  });
}

// ── POST — dispara generación de IROs via Batch API ──────────────────────────

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY)
    return NextResponse.json({ error: "ANTHROPIC_API_KEY no configurada" }, { status: 500 });

  const limited = await checkAiRateLimit(user, { windowMs: IRO_RATE_LIMIT.windowMs, max: IRO_RATE_LIMIT.maxCalls });
  if (limited) return NextResponse.json({ error: "Demasiadas solicitudes. Espera 5 minutos." }, { status: 429 });

  if (anthropicBreaker.isOpen)
    return NextResponse.json({ error: anthropicBreaker.userMessage }, { status: 503 });

  const client = await getClient(id).catch(() => null);
  if (!client) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

  const admin = createAdminClient();

  // Obtener contexto cuestionario + señales benchmark
  const [questionnaireContext, benchmarkRes] = await Promise.all([
    getFullQuestionnaireContext(id),
    admin
      .from("dm_benchmark_results")
      .select("narrative, companies_snapshot")
      .eq("client_id", id)
      .eq("status", "done")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const latestBenchmark = benchmarkRes.data?.[0] ?? null;
  const benchmarkNarrative = latestBenchmark?.narrative ?? "";
  const benchmarkCompanies = latestBenchmark?.companies_snapshot
    ? (latestBenchmark.companies_snapshot as Array<{ name: string; relation: string }>)
        .map((c) => c.name).join(", ")
    : "";

  const prompt = await buildIroGenerationPrompt({
    clientName: client.name,
    sector: client.sector ?? null,
    country: (client.countries as string[] | null)?.[0] ?? null,
    questionnaireContext,
    benchmarkNarrative,
    benchmarkCompanies,
  });

  const model = getModelConfig("aurora").model;

  // Crear fila pending para obtener ID como custom_id del batch
  const { data: batchRow, error: insertErr } = await admin
    .from("dm_iro_batches")
    .insert({ client_id: id, status: "pending", created_by: user })
    .select()
    .single();

  if (insertErr || !batchRow)
    return NextResponse.json({ error: "Error al crear registro de generación" }, { status: 500 });

  try {
    const anthropic = createAnthropicClient();
    const batch = await anthropic.beta.messages.batches.create(
      {
        requests: [{
          custom_id: batchRow.id,
          params: {
            model,
            max_tokens: 4000,
            system: [{
              type: "text",
              text: "Eres un consultor senior de Doble Materialidad. Responde solo con JSON válido.",
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              cache_control: { type: "ephemeral" } as any,
            }],
            messages: [{ role: "user", content: prompt }],
          },
        }],
      },
      { signal: AbortSignal.timeout(15_000) }
    );

    anthropicBreaker.recordSuccess();
    await admin.from("dm_iro_batches").update({ batch_id: batch.id }).eq("id", batchRow.id);
  } catch (e) {
    anthropicBreaker.recordFailure();
    const errMsg = e instanceof Error ? e.message : "Error Anthropic";
    await admin.from("dm_iro_batches").update({ status: "failed", error_msg: errMsg }).eq("id", batchRow.id);
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }

  return NextResponse.json({ data: { status: "pending" } });
}

// ── PATCH — actualiza un IRO individual ──────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = PatchBody.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Body inválido" }, { status: 400 });

  const { id: iroId, ...fields } = parsed.data;

  const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (fields.incluido !== undefined)         updatePayload.incluido = fields.incluido;
  if (fields.score_impacto !== undefined)    updatePayload.score_impacto = fields.score_impacto;
  if (fields.score_financiero !== undefined) updatePayload.score_financiero = fields.score_financiero;
  if (fields.descripcion !== undefined)      updatePayload.descripcion = fields.descripcion.trim();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("client_iro_inventory")
    .update(updatePayload)
    .eq("id", iroId)
    .eq("client_id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
