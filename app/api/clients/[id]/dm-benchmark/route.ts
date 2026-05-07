import { NextRequest, NextResponse } from "next/server";
import { createAnthropicClient } from "@/lib/ai/client";
import { z } from "zod";
import { requireConsultorForClient } from "@/lib/auth";
import { anthropicBreaker } from "@/lib/ai/circuit-breaker";
import { getClient } from "@/lib/clients";
import type { Client } from "@/lib/clients";
import { extractJsonObject } from "@/lib/ai/extract-json";
import { logAiCall } from "@/lib/ai/logging";
import { getModelConfig } from "@/lib/ai/models";
import { getPrompt } from "@/lib/ai/prompts";
import { createAdminClient } from "@/lib/supabase/admin";
import { BENCHMARK_FIELDS, RELATION_LABELS } from "@/lib/dm/fields";

export const runtime = "nodejs";
export const maxDuration = 180;
export const dynamic = "force-dynamic";

// Límite de seguridad para evitar abuso de costo.
// 10 calls por 5 minutos cubre uso intensivo legítimo (8 consultores).
const BM_WINDOW_MS = 5 * 60_000;
const BM_MAX_CALLS = 10;

// ── Schemas ──────────────────────────────────────────────────────────────────

const ProposeBody = z.object({ action: z.literal("propose") });

const CompareBody = z.object({
  action: z.literal("compare"),
  company_ids: z.array(z.string().uuid()).min(1).max(20),
});

const RequestBody = z.discriminatedUnion("action", [ProposeBody, CompareBody]);

const ProposedCompanySchema = z.object({
  name: z.string().min(1).max(200),
  country: z.string().max(100).optional(),
  sector: z.string().max(200).optional(),
  relation: z.enum(["competitor_nacional", "competitor_internacional", "sector", "cadena_valor"]),
  justification: z.string().max(400).optional(),
});

const ProposeResponseSchema = z.object({
  companies: z.array(ProposedCompanySchema).min(1).max(20),
});

const CompanyComparisonSchema = z.record(z.string(), z.string());
const CompareResponseSchema = z.object({
  comparison: z.record(z.string(), CompanyComparisonSchema),
  narrative: z.string().min(1),
});

type Ctx = { params: Promise<{ id: string }> };

// ── Helpers ──────────────────────────────────────────────────────────────────

async function buildProposePrompt(client: Client): Promise<string> {
  const template = await getPrompt("dm.benchmark_propose");
  return template
    .replace(/\{\{client_name\}\}/g, client.name)
    .replace(/\{\{sector\}\}/g, client.sector ?? "no especificado")
    .replace(/\{\{countries\}\}/g, (client.countries as string[] | null)?.join(", ") ?? "México");
}

function buildComparePrompt(
  clientName: string,
  clientSector: string | null,
  clientCountry: string | null,
  companies: Array<{ name: string; country: string | null; relation: string }>,
): string {
  const fieldsList = BENCHMARK_FIELDS.map(
    (f) => `- ${f.key}: ${f.label}${f.description ? ` (${f.description})` : ""}`
  ).join("\n");

  const companiesList = companies
    .map((c) => `- ${c.name} (${c.country ?? "país desconocido"}, ${RELATION_LABELS[c.relation as keyof typeof RELATION_LABELS] ?? c.relation})`)
    .join("\n");

  return `Analista ESG senior. Compara a ${clientName} (sector: ${clientSector ?? "no especificado"}, país: ${clientCountry ?? "México"}) contra las siguientes empresas en campos de Doble Materialidad.

EMPRESAS A COMPARAR:
${companiesList}

CAMPOS DE ANÁLISIS:
${fieldsList}

Instrucciones:
- Por cada campo: 2-3 oraciones por empresa (incluye a ${clientName}). Cita datos concretos cuando existan (toneladas CO₂, %, iniciativas específicas).
- Si no hay datos públicos verificables, escribe "Sin datos públicos disponibles" y explica brevemente por qué es relevante el campo para ese actor.
- Cierra con párrafo narrativo de 80-100 palabras: posición de ${clientName} en el benchmark, fortalezas claras, brechas materiales y recomendación de priorización.
- CRÍTICO: usa EXACTAMENTE los nombres de empresa tal como aparecen en la lista EMPRESAS A COMPARAR como claves del JSON (no los abrevies).

JSON únicamente:
{
  "comparison": {
    "campo_key": {
      "${clientName}": "descripción detallada",
      "Empresa A (nombre completo exacto)": "descripción detallada"
    }
  },
  "narrative": "síntesis ejecutiva"
}`;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const admin = createAdminClient();

  const [companiesRes, resultsRes] = await Promise.all([
    admin
      .from("dm_benchmark_companies")
      .select("*")
      .eq("client_id", id)
      .order("created_at", { ascending: true }),
    admin
      .from("dm_benchmark_results")
      .select("*")
      .eq("client_id", id)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const latestResult = resultsRes.data?.[0] ?? null;

  // ── Chequeo de batch pendiente ──────────────────────────────────────────
  // Si hay un resultado pendiente con batch_id, consultamos Anthropic Batch API.
  // Esto permite que el frontend haga polling barato (GET) en lugar de esperar
  // un POST síncrono de 60s+.
  if (latestResult?.status === "pending" && latestResult?.batch_id) {
    try {
      const anthropic = createAnthropicClient();
      const batch = await anthropic.beta.messages.batches.retrieve(latestResult.batch_id);

      if (batch.processing_status === "ended") {
        // Procesar resultados del batch
        let comparison: Record<string, Record<string, string>> = {};
        let narrative = "";
        let batchError: string | null = null;
        let inputTokens = 0, outputTokens = 0, cacheCreationTokens = 0, cacheReadTokens = 0;

        for await (const result of await anthropic.beta.messages.batches.results(latestResult.batch_id)) {
          if (result.result.type === "succeeded") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const msg = result.result.message as any;
            inputTokens = msg.usage?.input_tokens ?? 0;
            outputTokens = msg.usage?.output_tokens ?? 0;
            cacheCreationTokens = msg.usage?.cache_creation_input_tokens ?? 0;
            cacheReadTokens = msg.usage?.cache_read_input_tokens ?? 0;

            const textOut = (msg.content as Array<{ type: string; text?: string }>)
              .filter((b) => b.type === "text")
              .map((b) => b.text ?? "")
              .join("");

            const jsonText = extractJsonObject(textOut);
            if (jsonText) {
              const parsed = CompareResponseSchema.safeParse(JSON.parse(jsonText));
              if (parsed.success) {
                comparison = parsed.data.comparison;
                narrative = parsed.data.narrative;
              } else {
                batchError = "Schema IA inválido";
              }
            } else {
              batchError = "Respuesta IA sin JSON";
            }
          } else if (result.result.type === "errored") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            batchError = (result.result as any).error?.message ?? "Error en batch";
          }
        }

        if (batchError) {
          console.error("[dm-benchmark batch]", batchError);
        }

        const model = getModelConfig("aurora").model;
        const newStatus = batchError ? "failed" : "done";

        await admin
          .from("dm_benchmark_results")
          .update({
            comparison,
            narrative,
            status: newStatus,
            ...(batchError ? { error_message: batchError } : {}),
          })
          .eq("id", latestResult.id);

        void logAiCall({
          userEmail: user,
          role: "aurora",
          clientId: id,
          model,
          inputTokens,
          outputTokens,
          cacheCreationTokens,
          cacheReadTokens,
          latencyMs: 0, // batch — latencia no aplica
          error: batchError,
        });

        // Devolver resultado actualizado
        const updatedResult = {
          ...latestResult,
          comparison,
          narrative,
          status: newStatus,
        };

        return NextResponse.json({
          data: {
            companies: companiesRes.data ?? [],
            latest_result: updatedResult,
          },
        });
      }

      // Batch todavía en progreso — devolver tal cual
    } catch {
      // Si el check de batch falla, no bloquear al usuario — devolver estado actual
    }
  }

  return NextResponse.json({
    data: {
      companies: companiesRes.data ?? [],
      latest_result: latestResult,
    },
  });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY no configurada" }, { status: 500 });
  }

  // Rate limit DB cross-instancias: 10 calls por 5 minutos por usuario.
  {
    const adminRl = createAdminClient();
    const windowStart = new Date(Date.now() - BM_WINDOW_MS).toISOString();
    const { count } = await adminRl
      .from("ai_calls")
      .select("id", { count: "exact", head: true })
      .eq("user_email", user)
      .gte("created_at", windowStart);
    if ((count ?? 0) >= BM_MAX_CALLS) {
      return NextResponse.json(
        { error: "Demasiadas solicitudes de benchmark. Espera 5 minutos antes de reintentar." },
        { status: 429 }
      );
    }
  }

  if (anthropicBreaker.isOpen) {
    return NextResponse.json({ error: anthropicBreaker.userMessage }, { status: 503 });
  }

  const client = await getClient(id).catch(() => null);
  if (!client) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = RequestBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Body inválido" }, { status: 400 });
  }

  const anthropic = createAnthropicClient();
  const admin = createAdminClient();

  // ── PROPOSE: IA investiga y propone empresas (síncrono — Sonnet, 45s) ─────
  if (parsed.data.action === "propose") {
    const model = getModelConfig("aurora").model;
    const prompt = await buildProposePrompt(client);
    let textOut = "";
    let inputTokens = 0, outputTokens = 0, cacheCreationTokens = 0, cacheReadTokens = 0;
    const startedAt = Date.now();

    try {
      const msg = await anthropic.messages.create(
        {
          model,
          max_tokens: 1500,
          system: [{
            type: "text",
            text: "Eres un experto en análisis de sostenibilidad empresarial. Responde solo con JSON válido.",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cache_control: { type: "ephemeral" } as any,
          }],
          messages: [{ role: "user", content: prompt }],
        },
        { signal: AbortSignal.timeout(45_000) }
      );
      inputTokens = msg.usage?.input_tokens ?? 0;
      outputTokens = msg.usage?.output_tokens ?? 0;
      cacheCreationTokens = msg.usage?.cache_creation_input_tokens ?? 0;
      cacheReadTokens = msg.usage?.cache_read_input_tokens ?? 0;
      for (const block of msg.content) {
        if (block.type === "text") textOut += block.text;
      }
      anthropicBreaker.recordSuccess();
    } catch (e) {
      anthropicBreaker.recordFailure();
      const msg = e instanceof Error ? e.message : "Error Anthropic";
      void logAiCall({ userEmail: user, role: "aurora", clientId: id, model, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, latencyMs: Date.now() - startedAt, error: msg });
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    void logAiCall({ userEmail: user, role: "aurora", clientId: id, model, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, latencyMs: Date.now() - startedAt, error: null });

    const jsonText = extractJsonObject(textOut);
    if (!jsonText) return NextResponse.json({ error: "Respuesta IA sin JSON" }, { status: 502 });

    let aiData: z.infer<typeof ProposeResponseSchema>;
    try {
      const result = ProposeResponseSchema.safeParse(JSON.parse(jsonText));
      if (!result.success) return NextResponse.json({ error: "Schema IA inválido" }, { status: 502 });
      aiData = result.data;
    } catch {
      return NextResponse.json({ error: "JSON inválido en respuesta IA" }, { status: 502 });
    }

    // Eliminar propuestas anteriores de IA (no las del consultor)
    await admin.from("dm_benchmark_companies").delete().eq("client_id", id).eq("proposed_by", "ia");

    const rows = aiData.companies.map((c) => ({
      client_id: id,
      name: c.name,
      country: c.country ?? null,
      sector: c.sector ?? null,
      relation: c.relation,
      proposed_by: "ia",
      validated: false,
      created_by: user,
    }));

    const { data: inserted, error: insertErr } = await admin
      .from("dm_benchmark_companies")
      .insert(rows)
      .select();

    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

    return NextResponse.json({ data: { companies: inserted } });
  }

  // ── COMPARE: Batch API asíncrono — Sonnet, sin límite de 60s ────────────
  // Flujo:
  //   1. Crea fila pending en dm_benchmark_results
  //   2. Submite batch a Anthropic (retorna batch_id en <3s)
  //   3. Guarda batch_id en la fila
  //   4. Retorna {status:"pending"} al frontend inmediatamente
  //   5. Frontend hace polling del GET cada 5s
  //   6. GET detecta batch ended → procesa resultados → actualiza fila → retorna done
  const { company_ids } = parsed.data;

  const { data: companies, error: fetchErr } = await admin
    .from("dm_benchmark_companies")
    .select("*")
    .eq("client_id", id)
    .in("id", company_ids);

  if (fetchErr || !companies?.length) {
    return NextResponse.json({ error: "Empresas no encontradas" }, { status: 404 });
  }

  // Usar Sonnet (aurora) en Batch API — sin restricción de 60s de Vercel Hobby.
  // 50% descuento en tokens vs llamada síncrona.
  const model = getModelConfig("aurora").model;
  const prompt = buildComparePrompt(
    client.name,
    client.sector ?? null,
    (client.countries as string[] | null)?.[0] ?? null,
    companies,
  );

  // Crear fila pending primero para obtener ID como custom_id del batch
  const { data: resultRow, error: insertResultErr } = await admin
    .from("dm_benchmark_results")
    .insert({
      client_id: id,
      companies_snapshot: companies,
      fields_snapshot: BENCHMARK_FIELDS,
      comparison: {},
      status: "pending",
      created_by: user,
    })
    .select()
    .single();

  if (insertResultErr || !resultRow) {
    return NextResponse.json({ error: "Error al crear registro de resultado" }, { status: 500 });
  }

  // Submeter batch — retorna en <3s independientemente del tiempo de procesamiento
  try {
    const batch = await anthropic.beta.messages.batches.create(
      {
        requests: [{
          custom_id: resultRow.id,
          params: {
            model,
            max_tokens: 6000, // 10 empresas × 5 campos × 2-3 oraciones ≈ 4500 tokens mínimo
            system: [{
              type: "text",
              text: "Eres un analista senior de sostenibilidad especializado en Doble Materialidad. Responde solo con JSON válido.",
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

    // Guardar batch_id — el GET handler lo usará para polling
    await admin
      .from("dm_benchmark_results")
      .update({ batch_id: batch.id })
      .eq("id", resultRow.id);

  } catch (e) {
    anthropicBreaker.recordFailure();
    const errMsg = e instanceof Error ? e.message : "Error Anthropic";
    await admin
      .from("dm_benchmark_results")
      .update({ status: "failed", error_message: errMsg })
      .eq("id", resultRow.id);
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }

  // Retornar pending — el frontend hace polling del GET hasta que status=done
  return NextResponse.json({
    data: {
      result_id: resultRow.id,
      status: "pending",
    },
  });
}
