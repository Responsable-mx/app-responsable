import { NextRequest, NextResponse } from "next/server";
import { createAnthropicClient } from "@/lib/ai/client";
import { z } from "zod";
import { requireConsultorForClient } from "@/lib/auth";
import { getClient } from "@/lib/clients";
import type { Client } from "@/lib/clients";
import { buildClientContext } from "@/lib/ai/roles";
import { extractJsonObject } from "@/lib/ai/extract-json";
import { logAiCall } from "@/lib/ai/logging";
import { getModelConfig } from "@/lib/ai/models";
import { createAdminClient } from "@/lib/supabase/admin";
import { BENCHMARK_FIELDS, RELATION_LABELS } from "@/lib/dm/fields";

export const runtime = "nodejs";
export const maxDuration = 180;
export const dynamic = "force-dynamic";

// Benchmark es más costoso que ai-fill (web_search + Opus comparison).
// Ventana más estricta: 3 requests por 5 minutos por usuario.
const BM_WINDOW_MS = 5 * 60_000;
const BM_MAX_CALLS = 3;

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

function buildProposePrompt(client: Client): string {
  return `Eres un experto en sostenibilidad empresarial y análisis competitivo ESG.

El cliente es: ${client.name} (sector: ${client.sector ?? "no especificado"}, país: ${(client.countries as string[] | null)?.join(", ") ?? "México"}).

Identifica empresas relevantes para un benchmark de Doble Materialidad. Necesito empresas en estas 4 categorías:
1. competitor_nacional — competidores directos en el mismo país
2. competitor_internacional — competidores internacionales de referencia
3. sector — empresas del mismo sector que ya son líderes en sostenibilidad
4. cadena_valor — proveedores clave o clientes estratégicos conocidos del sector

Propón entre 6 y 10 empresas en total. Para cada una indica: nombre, país, sector específico, tipo de relación y una justificación breve (1-2 oraciones) de por qué es relevante para el benchmark.

Responde ÚNICAMENTE con JSON válido, sin texto adicional:
{
  "companies": [
    {
      "name": "Nombre de la empresa",
      "country": "México",
      "sector": "Sector específico",
      "relation": "competitor_nacional",
      "justification": "Por qué es relevante para el benchmark"
    }
  ]
}`;
}

function buildComparePrompt(
  clientName: string,
  clientContext: string,
  companies: Array<{ name: string; country: string | null; relation: string }>,
): string {
  const fieldsList = BENCHMARK_FIELDS.map(
    (f) => `- ${f.key}: ${f.label}${f.description ? ` (${f.description})` : ""}`
  ).join("\n");

  const companiesList = companies
    .map((c) => `- ${c.name} (${c.country ?? "país desconocido"}, ${RELATION_LABELS[c.relation as keyof typeof RELATION_LABELS] ?? c.relation})`)
    .join("\n");

  return `Eres un analista senior de sostenibilidad especializado en Doble Materialidad (estándar ESRS/CSRD).

CONTEXTO DEL CLIENTE:
${clientContext}

EMPRESAS A COMPARAR:
${companiesList}

CAMPOS DE COMPARACIÓN:
${fieldsList}

Tu tarea: compara a ${clientName} contra cada empresa en los campos indicados. Usa información pública (reportes ESG, GRI, SASB).

Para cada campo, escribe UNA oración concisa por empresa. Si no tienes datos, escribe "Sin información pública".

Al final, un párrafo narrativo (máx. 80 palabras) con las fortalezas, brechas y oportunidades clave de ${clientName}.

Responde ÚNICAMENTE con JSON válido, sin texto adicional:
{
  "comparison": {
    "campo_key": {
      "${clientName}": "descripción",
      "Empresa A": "descripción"
    }
  },
  "narrative": "párrafo síntesis"
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

  return NextResponse.json({
    data: {
      companies: companiesRes.data ?? [],
      latest_result: resultsRes.data?.[0] ?? null,
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

  // Rate limit DB cross-instancias: 3 calls por 5 minutos por usuario.
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

  // ── PROPOSE: IA investiga y propone empresas ─────────────────────────────
  if (parsed.data.action === "propose") {
    const model = getModelConfig("aurora").model;
    const prompt = buildProposePrompt(client);
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
        { signal: AbortSignal.timeout(60_000) }
      );
      inputTokens = msg.usage?.input_tokens ?? 0;
      outputTokens = msg.usage?.output_tokens ?? 0;
      cacheCreationTokens = msg.usage?.cache_creation_input_tokens ?? 0;
      cacheReadTokens = msg.usage?.cache_read_input_tokens ?? 0;
      for (const block of msg.content) {
        if (block.type === "text") textOut += block.text;
      }
    } catch (e) {
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

    // Insertar nuevas propuestas
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

  // ── COMPARE: IA compara cliente vs empresas validadas ────────────────────
  const { company_ids } = parsed.data;

  const { data: companies, error: fetchErr } = await admin
    .from("dm_benchmark_companies")
    .select("*")
    .eq("client_id", id)
    .in("id", company_ids);

  if (fetchErr || !companies?.length) {
    return NextResponse.json({ error: "Empresas no encontradas" }, { status: 404 });
  }

  const model = getModelConfig("aurora").model; // Sonnet: más rápido que Opus, suficiente para JSON comparativo
  const clientContext = buildClientContext(client);
  const prompt = buildComparePrompt(client.name, clientContext, companies);

  let textOut = "";
  let inputTokens = 0, outputTokens = 0, cacheCreationTokens = 0, cacheReadTokens = 0;
  const startedAt = Date.now();

  // Insertar resultado en estado pending
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

  try {
    const msg = await anthropic.messages.create(
      {
        model,
        max_tokens: 800,
        system: [{
          type: "text",
          text: "Eres un analista senior de sostenibilidad especializado en Doble Materialidad. Responde solo con JSON válido.",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cache_control: { type: "ephemeral" } as any,
        }],
        messages: [{ role: "user", content: prompt }],
      },
      { signal: AbortSignal.timeout(20_000) }
    );
    inputTokens = msg.usage?.input_tokens ?? 0;
    outputTokens = msg.usage?.output_tokens ?? 0;
    cacheCreationTokens = msg.usage?.cache_creation_input_tokens ?? 0;
    cacheReadTokens = msg.usage?.cache_read_input_tokens ?? 0;
    for (const block of msg.content) {
      if (block.type === "text") textOut += block.text;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error Anthropic";
    void logAiCall({ userEmail: user, role: "aurora", clientId: id, model, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, latencyMs: Date.now() - startedAt, error: msg });
    await admin.from("dm_benchmark_results").update({ status: "failed", error_message: msg }).eq("id", resultRow.id);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  void logAiCall({ userEmail: user, role: "aurora", clientId: id, model, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, latencyMs: Date.now() - startedAt, error: null });

  const jsonText = extractJsonObject(textOut);
  if (!jsonText) {
    await admin.from("dm_benchmark_results").update({ status: "failed", error_message: "Respuesta IA sin JSON" }).eq("id", resultRow.id);
    return NextResponse.json({ error: "Respuesta IA sin JSON" }, { status: 502 });
  }

  let aiData: z.infer<typeof CompareResponseSchema>;
  try {
    const result = CompareResponseSchema.safeParse(JSON.parse(jsonText));
    if (!result.success) {
      await admin.from("dm_benchmark_results").update({ status: "failed", error_message: "Schema IA inválido" }).eq("id", resultRow.id);
      return NextResponse.json({ error: "Schema IA inválido" }, { status: 502 });
    }
    aiData = result.data;
  } catch {
    await admin.from("dm_benchmark_results").update({ status: "failed", error_message: "JSON inválido" }).eq("id", resultRow.id);
    return NextResponse.json({ error: "JSON inválido en respuesta IA" }, { status: 502 });
  }

  await admin.from("dm_benchmark_results").update({
    comparison: aiData.comparison,
    narrative: aiData.narrative,
    status: "done",
  }).eq("id", resultRow.id);

  return NextResponse.json({
    data: {
      result_id: resultRow.id,
      comparison: aiData.comparison,
      narrative: aiData.narrative,
      fields: BENCHMARK_FIELDS,
      companies: companies.map((c) => ({ id: c.id, name: c.name, relation: c.relation })),
    },
  });
}
