import { NextRequest, NextResponse } from "next/server";
import { createAnthropicClient } from "@/lib/ai/client";
import { z } from "zod";
import { requireConsultorForClient } from "@/lib/auth";
import { getClient } from "@/lib/clients";
import { getQuestionnaireBundle } from "@/lib/questionnaires/queries";
import {
  isWizardSchema,
  type FieldResponse,
  type WizardStep,
} from "@/lib/questionnaires/types";
import { getModelConfig } from "@/lib/ai/models";
import { logAiCall } from "@/lib/ai/logging";
import { extractJsonObject } from "@/lib/ai/extract-json";
import { checkAiRateLimit } from "@/lib/ai/rate-limit";
import { anthropicBreaker } from "@/lib/ai/circuit-breaker";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Campos de cache del SDK de Anthropic (beta — no incluidos en el tipo oficial)
interface UsageWithCache {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

// Mismo patrón de validación de stepKey que ai-fill.
const VALID_STEP_KEY = /^[a-z0-9-]{1,64}$/;

// D-76: rate limit 15 calls/min (misma ventana que ai-fill)

// Límite de texto para no inflar el prompt más allá de lo útil.
// ~50k chars ≈ 12k tokens — suficiente para un documento de entrevista o un Excel.
const MAX_TEXT_CHARS = 50_000;

const DocFillRequestSchema = z.object({
  text: z
    .string()
    .min(10, "El texto debe tener al menos 10 caracteres")
    .max(MAX_TEXT_CHARS, `El texto es demasiado largo (máx ${MAX_TEXT_CHARS.toLocaleString()} caracteres)`),
});

// Schema de respuesta idéntico a ai-fill para que el front pueda reutilizar
// el mismo handler de merge/save.
const AiSourceSchema = z.object({
  url: z.string().min(1),
  title: z.string().min(1),
  date: z.string().optional().default(""),
});
const AiFieldSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]).optional(),
  source_type: z.enum(["public", "interpretation", "consultor_only"]).optional(),
  sources: z.array(AiSourceSchema).optional(),
});
const AiResponseSchema = z.record(z.string(), AiFieldSchema);

type Ctx = { params: Promise<{ id: string; stepKey: string }> };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const submitResponsesTool: any = {
  name: "submit_responses",
  description: "Envía las respuestas finales por campo del paso del cuestionario. Llamar UNA SOLA VEZ al terminar la extracción.",
  input_schema: {
    type: "object",
    properties: {
      responses: {
        type: "object",
        description: "Mapa de field_key → {value, source_type, sources[]}. Una entrada por cada campo del paso.",
        additionalProperties: {
          type: "object",
          properties: {
            value: { anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }, { type: "array", items: { type: "string" } }, { type: "null" }], description: "Contenido extraído del documento o null si no está mencionado." },
            source_type: { type: "string", enum: ["interpretation", "consultor_only"] },
            sources: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  url: { type: "string" },
                  title: { type: "string" },
                  date: { type: "string" },
                },
                required: ["url", "title"],
              },
            },
          },
          required: ["value", "source_type"],
        },
      },
    },
    required: ["responses"],
  } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
};

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id, stepKey } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY no configurada" }, { status: 500 });
  }

  if (!VALID_STEP_KEY.test(stepKey)) {
    return NextResponse.json({ error: "stepKey inválido" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = DocFillRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 }
    );
  }
  const { text } = parsed.data;

  // D-76: rate limit DB cross-instancias.
  const rl = await checkAiRateLimit(user, { max: 15, windowMs: 60_000 });
  if (rl) return NextResponse.json({ error: rl.message }, { status: 429 });

  if (anthropicBreaker.isOpen) {
    return NextResponse.json({ error: anthropicBreaker.userMessage }, { status: 503 });
  }

  let bundle;
  try {
    bundle = await getQuestionnaireBundle(id, "doble-materialidad");
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
  if (!bundle) return NextResponse.json({ error: "Template no encontrado" }, { status: 404 });
  if (!isWizardSchema(bundle.template.schema)) {
    return NextResponse.json({ error: "Template no es wizard" }, { status: 400 });
  }

  const step: WizardStep | undefined = bundle.template.schema.steps.find((s) => s.key === stepKey);
  if (!step) return NextResponse.json({ error: "Paso no encontrado" }, { status: 404 });

  // Contexto básico del cliente para mejorar extracción.
  const client = await getClient(id).catch(() => null);

  // Incluir tipo de campo y opciones válidas para que el LLM no invente valores.
  const fieldsList = step.fields
    .map((f) => {
      const typeNote =
        f.type === "boolean"
          ? " [retornar: true o false]"
          : (f.type === "select" || f.type === "multiselect") && Array.isArray(f.options) && f.options.length > 0
          ? ` [${f.type === "multiselect" ? "array, múltiples valores" : "valor único"}: ${(f.options as Array<string | { value: string }>).map((o) => (typeof o === "string" ? o : o.value)).join(" | ")}]`
          : (f.type === "select" || f.type === "multiselect") && f.catalog
          ? ` [selección — catálogo: ${f.catalog}]`
          : "";
      return `- ${f.key}: ${f.label}${typeNote}${f.hint ? ` (${f.hint})` : ""}`;
    })
    .join("\n");

  const systemPrompt = `Eres un consultor de ResponSable extrayendo información de un documento para llenar el cuestionario de Doble Materialidad de un cliente corporativo mexicano.

REGLAS OPERATIVAS:

1. USA ÚNICAMENTE información que aparezca explícitamente en el documento proporcionado.
2. NO deduzcas, interpretes ni inventes datos que no estén en el texto.
3. Si un campo no está mencionado en el documento → value: null, source_type: "consultor_only".
4. Para datos extraídos directamente del documento → source_type: "interpretation", sources: [{"url": "documento-cliente", "title": "Documento importado por consultor", "date": "${new Date().toISOString().slice(0, 10)}"}].
5. Resumen máximo 500 caracteres por campo.
6. NO busques en internet. SOLO el documento.
7. Si el dato está en el documento pero es ambiguo, inclúyelo con nota "(sujeto a verificación del consultor)".

ENTREGA DE RESULTADOS — OBLIGATORIO:
Cuando termines la extracción, llama la herramienta submit_responses con las respuestas por campo.
NO escribas texto plano con el JSON. SIEMPRE usa la herramienta submit_responses para entregar el resultado.`;

  const userPrompt = `Cliente: ${client?.name ?? id}
Paso del cuestionario: ${step.title} — ${step.subtitle}

CAMPOS A EXTRAER:
${fieldsList}

DOCUMENTO PROPORCIONADO POR EL CONSULTOR:
\`\`\`
${text}
\`\`\`

Extrae los valores de cada campo desde el documento. Solo usa datos presentes en el texto.`;

  // Usar Aurora (mismo modelo que ai-fill) para consistencia de calidad y costo.
  const modelCfg = getModelConfig("aurora");
  const anthropic = createAnthropicClient();

  let textOut = "";
  let toolResponses: Record<string, unknown> | null = null;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheCreationTokens = 0;
  let cacheReadTokens = 0;
  let stopReason: string | null = null;
  const startedAt = Date.now();

  // Timeout conservador: sin web_search es mucho más rápido que ai-fill.
  // maxDuration=60s; timeout 45s deja margen.
  const timeoutSignal = AbortSignal.timeout(45_000);

  try {
    const msg = await anthropic.messages.create(
      {
        model: modelCfg.model,
        max_tokens: 4096,
        system: [
          {
            type: "text",
            text: systemPrompt,

            cache_control: { type: "ephemeral" },
          },
        ],
        tools: [submitResponsesTool],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tool_choice: { type: "tool", name: "submit_responses" } as any,
        messages: [{ role: "user", content: userPrompt }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      { signal: timeoutSignal }
    );
    inputTokens = msg.usage?.input_tokens ?? 0;
    outputTokens = msg.usage?.output_tokens ?? 0;
    cacheCreationTokens = (msg.usage as UsageWithCache)?.cache_creation_input_tokens ?? 0;
    cacheReadTokens = (msg.usage as UsageWithCache)?.cache_read_input_tokens ?? 0;
    stopReason = msg.stop_reason ?? null;
    for (const block of msg.content) {
      if (block.type === "text") textOut += block.text;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (block.type === "tool_use" && (block as any).name === "submit_responses") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const input = (block as any).input as { responses?: unknown } | undefined;
        if (input?.responses && typeof input.responses === "object") {
          toolResponses = input.responses as Record<string, unknown>;
        }
      }
    }
    anthropicBreaker.recordSuccess();
  } catch (e) {
    anthropicBreaker.recordFailure();
    const isTimeout = e instanceof Error && e.name === "AbortError";
    const errorMsg = isTimeout
      ? "La extracción tardó demasiado. Inténtalo de nuevo."
      : e instanceof Error ? e.message : "Error Anthropic";
    void logAiCall({
      userEmail: user, role: "aurora", clientId: id, model: modelCfg.model,
      inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens,
      stopReason, latencyMs: Date.now() - startedAt, error: errorMsg, workflowStage: "doc_fill",
    });
    return NextResponse.json({ error: errorMsg }, { status: isTimeout ? 504 : 500 });
  }

  void logAiCall({
    userEmail: user, role: "aurora", clientId: id, model: modelCfg.model,
    inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens,
    stopReason, latencyMs: Date.now() - startedAt, error: null, workflowStage: "doc_fill",
  });

  // Preferir output estructurado (tool_use) sobre parseo regex de texto.
  let aiParsed: z.infer<typeof AiResponseSchema>;
  if (toolResponses) {
    const result = AiResponseSchema.safeParse(toolResponses);
    if (!result.success) {
      return NextResponse.json(
        { error: `Schema IA inválido: ${result.error.issues.map((i) => i.message).join("; ")}` },
        { status: 502 }
      );
    }
    aiParsed = result.data;
  } else {
    const jsonText = extractJsonObject(textOut);
    if (!jsonText) {
      return NextResponse.json({ error: "Respuesta IA sin JSON parseable" }, { status: 502 });
    }
    try {
      const raw = JSON.parse(jsonText);
      const result = AiResponseSchema.safeParse(raw);
      if (!result.success) {
        return NextResponse.json(
          { error: `Schema IA inválido: ${result.error.issues.map((i) => i.message).join("; ")}` },
          { status: 502 }
        );
      }
      aiParsed = result.data;
    } catch {
      return NextResponse.json({ error: "JSON inválido en respuesta IA" }, { status: 502 });
    }
  }

  // Construir FieldResponse igual que ai-fill — solo campos del paso actual.
  const now = new Date().toISOString();
  const result: Record<string, FieldResponse> = {};
  for (const field of step.fields) {
    const ai = aiParsed[field.key];
    if (!ai) {
      result[field.key] = { value: null, source_type: "consultor_only", sources: [], validated: false, updated_at: now };
      continue;
    }
    result[field.key] = {
      value:
        typeof ai.value === "string" || typeof ai.value === "number" || typeof ai.value === "boolean"
          ? ai.value
          : Array.isArray(ai.value)
          ? ai.value
          : null,
      source_type: ai.source_type ?? "consultor_only",
      sources: (ai.sources ?? []).map((s) => ({
        url: s.url, title: s.title, date: s.date || "", type: "web" as const,
      })),
      validated: false,
      updated_at: now,
    };
  }

  return NextResponse.json({ data: result });
}
