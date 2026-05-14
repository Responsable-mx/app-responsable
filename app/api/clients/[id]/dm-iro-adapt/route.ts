import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireConsultorForClient } from "@/lib/auth";
import { getClient } from "@/lib/clients";
import { createAnthropicClient } from "@/lib/ai/client";
import { anthropicBreaker } from "@/lib/ai/circuit-breaker";
import { logAiCall } from "@/lib/ai/logging";
import { getTaskConfig } from "@/lib/ai/models";
import { checkAiRateLimit } from "@/lib/ai/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 90;
export const dynamic = "force-dynamic";

const IroInputSchema = z.object({
  id: z.string(),
  descripcion: z.string().min(5),
  tipo: z.enum(["impacto_positivo", "impacto_negativo", "riesgo", "oportunidad"]),
  cadena: z.enum(["operacion", "upstream", "downstream", "sociedad_comunidad", "clientes_consumidores", "medio_ambiente"]),
  horizonte: z.enum(["corto", "mediano", "largo"]),
  tema_asociado: z.string().nullable().optional(),
});

const PostBody = z.object({
  iros: z.array(IroInputSchema).min(1).max(20),
  client_sector: z.string().nullable().optional(),
});

// Zod schema for validating LLM output
const AdaptedIroSchema = z.object({
  original_descripcion: z.string(),
  adapted_descripcion: z.string().min(10),
  tipo: z.enum(["impacto_positivo", "impacto_negativo", "riesgo", "oportunidad"]),
  cadena: z.enum(["operacion", "upstream", "downstream", "sociedad_comunidad", "clientes_consumidores", "medio_ambiente"]),
  horizonte: z.enum(["corto", "mediano", "largo"]),
  tema_asociado: z.string().nullable(),
  justificacion: z.string().min(5),
});

const AdaptResultSchema = z.object({
  adapted: z.array(AdaptedIroSchema).min(1),
});

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY)
    return NextResponse.json({ error: "ANTHROPIC_API_KEY no configurada" }, { status: 500 });

  const limited = await checkAiRateLimit(user, { windowMs: 5 * 60_000, max: 5 });
  if (limited) return NextResponse.json({ error: "Demasiadas solicitudes. Espera 5 minutos." }, { status: 429 });

  if (anthropicBreaker.isOpen)
    return NextResponse.json({ error: anthropicBreaker.userMessage }, { status: 503 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = PostBody.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Datos inválidos", detail: parsed.error.flatten() }, { status: 400 });

  const { iros, client_sector } = parsed.data;

  const client = await getClient(id).catch(() => null);
  const clientName = client?.name ?? "el cliente";
  const sectorCtx = client_sector ?? client?.sector ?? null;

  const irosBlock = iros
    .map((iro, i) =>
      `${i + 1}. [${iro.tipo} / ${iro.cadena} / ${iro.horizonte}${iro.tema_asociado ? ` / ${iro.tema_asociado}` : ""}]\n   "${iro.descripcion}"`
    )
    .join("\n\n");

  const prompt = `Eres un consultor senior de Doble Materialidad (ESRS/CSRD).

Cliente: ${clientName}${sectorCtx ? `\nSector: ${sectorCtx}` : ""}

Los siguientes IROs provienen de empresas de referencia del sector. Tu tarea es adaptarlos al contexto específico de ${clientName}, conservando la estructura ESRS pero personalizando la redacción, los datos y el impacto al contexto del cliente.

IROs de referencia:
${irosBlock}

Para cada IRO devuelve un objeto JSON con:
- original_descripcion: copia exacta del IRO original (sin cambios)
- adapted_descripcion: versión adaptada al cliente (causa → consecuencia concreta y medible para ${clientName})
- tipo: mismo valor o ajustado si aplica mejor al cliente
- cadena: mismo valor o ajustado
- horizonte: mismo valor o ajustado
- tema_asociado: mismo valor o más específico al cliente
- justificacion: 1 oración explicando por qué este IRO es relevante para ${clientName} y qué se cambió

Reglas:
- Si el IRO es muy genérico, hacerlo específico al sector/tamaño/geografía del cliente.
- Si el cliente ya gestiona bien el tema, ajustar hacia el gap o la oportunidad residual.
- Mantener formato "causa → consecuencia medible".
- No inventar cifras que no sean razonables para el sector.

Responde SOLO con JSON válido, sin texto adicional:
{
  "adapted": [
    {
      "original_descripcion": "...",
      "adapted_descripcion": "...",
      "tipo": "riesgo",
      "cadena": "operacion",
      "horizonte": "mediano",
      "tema_asociado": "...",
      "justificacion": "..."
    }
  ]
}`;

  const cfg = getTaskConfig("analyze");
  const anthropic = createAnthropicClient();
  const t0 = Date.now();

  try {
    const msg = await anthropic.messages.create(
      {
        model: cfg.model,
        max_tokens: cfg.maxTokens,
        system: "Eres un consultor senior de sostenibilidad especializado en Doble Materialidad ESRS/CSRD. Responde SOLO con JSON válido, sin texto adicional.",
        messages: [{ role: "user", content: prompt }],
      },
      { signal: AbortSignal.timeout(80_000) }
    );

    anthropicBreaker.recordSuccess();

    const rawText = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("")
      .trim();

    // Strip markdown fences if present
    const jsonText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

    let adaptedData: unknown;
    try {
      adaptedData = JSON.parse(jsonText);
    } catch {
      return NextResponse.json({ error: "La IA devolvió JSON inválido. Intenta de nuevo." }, { status: 500 });
    }

    const validated = AdaptResultSchema.safeParse(adaptedData);
    if (!validated.success) {
      return NextResponse.json({ error: "Estructura de respuesta IA inesperada. Intenta de nuevo." }, { status: 500 });
    }

    void logAiCall({
      userEmail: user,
      role: "aurora",
      clientId: id,
      model: cfg.model,
      inputTokens: msg.usage.input_tokens,
      outputTokens: msg.usage.output_tokens,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      latencyMs: Date.now() - t0,
      error: null,
      workflowStage: "dm_iro_adapt",
    });

    return NextResponse.json({ data: { adapted: validated.data.adapted } });
  } catch (e) {
    anthropicBreaker.recordFailure();
    const errMsg = e instanceof Error ? e.message : "Error Anthropic";
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
