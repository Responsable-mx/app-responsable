import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { requireConsultorForClient } from "@/lib/auth";
import { getClient } from "@/lib/clients";
import { checkAiRateLimit } from "@/lib/ai/rate-limit";
import { getModelConfig } from "@/lib/ai/models";
import { logAiCall } from "@/lib/ai/logging";
import { extractJsonObject } from "@/lib/ai/extract-json";

export const runtime = "nodejs";
export const maxDuration = 180;
export const dynamic = "force-dynamic";

// Rate limit: 5 búsquedas por 5 min (Aurora + web_search × 3)

const RequestSchema = z.object({
  kind: z.enum(["sustainability_report", "financial_report"]),
});

const CandidateSchema = z.object({
  url: z.string().url(),
  title: z.string().min(1),
  year: z.union([z.number(), z.string(), z.null()]).optional(),
});

const ResponseSchema = z.object({
  candidates: z.array(CandidateSchema).max(5),
});

type Ctx = { params: Promise<{ id: string }> };

const KIND_LABEL = {
  sustainability_report: "Informe de sostenibilidad / sustentabilidad / ESG / RSE",
  financial_report: "Informe financiero / informe anual / annual report",
} as const;



export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const rl = await checkAiRateLimit(user, {
    max: 5,
    windowMs: 5 * 60_000,
    errorMessage: "Demasiadas búsquedas de informes. Espera 5 minutos antes de reintentar.",
  });
  if (rl) return NextResponse.json({ error: rl.message }, { status: 429 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY no configurada" }, { status: 500 });
  }
  const client = await getClient(id).catch(() => null);
  if (!client) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Body inválido" }, { status: 400 });
  }
  const { kind } = parsed.data;

  const reportLabel = KIND_LABEL[kind];
  const systemPrompt = `Eres un investigador buscando informes corporativos públicos de empresas mexicanas.

Tarea: encontrar URLs PÚBLICAS y ACCESIBLES (sin login) del último ${reportLabel} de la empresa indicada.

REGLAS:
1. Usa web_search agresivamente. Busca: "[empresa] informe sostenibilidad", "[empresa] reporte anual", "[empresa] sustainability report PDF", etc.
2. Prefiere PDFs descargables del sitio corporativo del cliente.
3. Acepta también: páginas web del informe, registros BMV, sitios oficiales.
4. RECHAZA: artículos de prensa sobre el informe, blogs de terceros, resúmenes externos.
5. Devuelve hasta 5 candidatos ordenados por más reciente y más oficial.
6. Si no encuentras nada confiable: candidates: [].

FORMATO RESPUESTA (obligatorio, solo JSON):
{ "candidates": [{ "url": "https://...", "title": "...", "year": 2024 }, ...] }`;

  const userPrompt = `Empresa: ${client.name}
Sector: ${client.sector ?? "no especificado"}
Países: ${client.countries?.join(", ") ?? "México"}

Busca el ${reportLabel} más reciente y devuelve hasta 5 candidatos como JSON.`;

  const modelCfg = getModelConfig("aurora");
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let textOut = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheCreationTokens = 0;
  let cacheReadTokens = 0;
  let stopReason: string | null = null;
  const startedAt = Date.now();
  const timeoutSignal = AbortSignal.timeout(150_000);

  try {
    const msg = await anthropic.messages.create(
      {
        model: modelCfg.model,
        max_tokens: 1500,
        system: [{
          type: "text",
          text: systemPrompt,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cache_control: { type: "ephemeral" } as any,
        }],
        tools: [{
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          type: "web_search_20250305" as any,
          name: "web_search",
          max_uses: 3,
        }],
        messages: [{ role: "user", content: userPrompt }],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      { signal: timeoutSignal }
    );
    inputTokens = msg.usage?.input_tokens ?? 0;
    outputTokens = msg.usage?.output_tokens ?? 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cacheCreationTokens = (msg.usage as any)?.cache_creation_input_tokens ?? 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cacheReadTokens = (msg.usage as any)?.cache_read_input_tokens ?? 0;
    stopReason = msg.stop_reason ?? null;
    for (const block of msg.content) {
      if (block.type === "text") textOut += block.text;
    }
  } catch (e) {
    const isTimeout = e instanceof Error && e.name === "AbortError";
    const errorMsg = isTimeout
      ? "Búsqueda IA tardó demasiado"
      : e instanceof Error ? e.message : "Error Anthropic";
    void logAiCall({
      userEmail: user, role: "aurora", clientId: id, model: modelCfg.model,
      inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens,
      stopReason, latencyMs: Date.now() - startedAt, error: errorMsg,
    });
    return NextResponse.json({ error: errorMsg }, { status: isTimeout ? 504 : 500 });
  }

  void logAiCall({
    userEmail: user, role: "aurora", clientId: id, model: modelCfg.model,
    inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens,
    stopReason, latencyMs: Date.now() - startedAt, error: null,
  });

  const jsonText = extractJsonObject(textOut);
  if (!jsonText) {
    return NextResponse.json({ error: "Respuesta IA sin JSON" }, { status: 502 });
  }

  let aiData: z.infer<typeof ResponseSchema>;
  try {
    const raw = JSON.parse(jsonText);
    const result = ResponseSchema.safeParse(raw);
    if (!result.success) {
      return NextResponse.json({ error: "Schema IA inválido" }, { status: 502 });
    }
    aiData = result.data;
  } catch {
    return NextResponse.json({ error: "JSON inválido en respuesta IA" }, { status: 502 });
  }

  return NextResponse.json({ data: { kind, candidates: aiData.candidates } });
}
