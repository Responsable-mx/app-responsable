import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import Anthropic from "@anthropic-ai/sdk";
import { getModelConfig } from "@/lib/ai/models";
import { logAiCall } from "@/lib/ai/logging";

const ReqSchema = z.object({ term: z.string().min(1).max(200) });

const SUGGEST_SYSTEM = `Eres un experto en terminología de RSE (Responsabilidad Social Empresarial) y sostenibilidad corporativa en LATAM. Tu tarea es generar sinónimos y términos equivalentes para palabras clave de consultoría en sostenibilidad.`;

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body: unknown = await req.json().catch(() => ({}));
  const parsed = ReqSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "term requerido" }, { status: 400 });

  const { term } = parsed.data;
  const client = new Anthropic();
  const model = getModelConfig("valeria"); // Haiku — tarea simple

  const t0 = Date.now();
  const response = await client.messages.create({
    model: model.model,
    max_tokens: 512,
    system: [{ type: "text", text: SUGGEST_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `Para el término de consultoría en sostenibilidad: "${term}"

Genera sinónimos y variantes equivalentes en español y en inglés que usan empresas y el mercado en general.

Responde SOLO con JSON válido, sin markdown:
{
  "synonyms_es": ["variante 1 en español", "variante 2"],
  "synonyms_en": ["variant 1 in English", "variant 2"]
}

Incluye máximo 6 variantes por idioma. Solo términos realmente usados en el mercado.`,
      },
    ],
  });

  const latencyMs = Date.now() - t0;
  void logAiCall({
    userEmail: admin,
    clientId: null,
    role: "valeria",
    model: model.model,
    workflowStage: "glosario_suggest",
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    latencyMs,
  });

  const raw = response.content[0]?.type === "text" ? response.content[0].text : "";
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    const json = match ? JSON.parse(match[0]) as { synonyms_es?: string[]; synonyms_en?: string[] } : {};
    return NextResponse.json({
      synonyms_es: Array.isArray(json.synonyms_es) ? json.synonyms_es : [],
      synonyms_en: Array.isArray(json.synonyms_en) ? json.synonyms_en : [],
    });
  } catch {
    return NextResponse.json({ synonyms_es: [], synonyms_en: [] });
  }
}
