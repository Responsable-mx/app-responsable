import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireUser } from "@/lib/auth";
import { getQuestionnaireBundle } from "@/lib/questionnaires/queries";
import {
  isWizardSchema,
  type FieldResponse,
  type WizardStep,
} from "@/lib/questionnaires/types";

type Ctx = { params: Promise<{ id: string; stepKey: string }> };

export async function POST(_req: NextRequest, { params }: Ctx) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY no configurada" }, { status: 500 });
  }

  const { id, stepKey } = await params;

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
  if (!step.ai_can_fill) return NextResponse.json({ error: "Paso no soporta AI fill" }, { status: 400 });

  // Construir prompt con contexto del cliente + campos a llenar.
  const fieldsList = step.fields
    .map((f) => `- ${f.key}: ${f.label}${f.hint ? ` (${f.hint})` : ""}`)
    .join("\n");

  const systemPrompt = `Eres un consultor experto de ResponSable que ayuda a llenar cuestionarios de Doble Materialidad para clientes corporativos en México.

Tu tarea: llenar los campos del paso "${step.title}" del cuestionario, usando información pública o interpretación basada en el contexto del cliente.

Para cada campo retorna:
- value: el contenido que llena el campo (string, máximo 500 caracteres por campo)
- source_type: "public" si es dato verificable público, "interpretation" si es inferencia/análisis tuyo, "consultor_only" si requiere input del consultor
- sources: arreglo de {url, title, date (YYYY-MM-DD)} con fuentes públicas relevantes (puede ser vacío)

Si no tienes información suficiente para un campo, marca value como null y source_type como "consultor_only".

Retorna SOLO un JSON válido con la estructura: { "campo_key": { "value": "...", "source_type": "...", "sources": [...] }, ... }`;

  const userPrompt = `Cliente con ID ${id}.

Campos a llenar (paso "${step.title}" — ${step.subtitle}):
${fieldsList}

Retorna el JSON.`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let textOut = "";
  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    for (const block of msg.content) {
      if (block.type === "text") textOut += block.text;
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error Anthropic" },
      { status: 500 }
    );
  }

  // Extraer JSON del output (puede venir en code block)
  const jsonMatch = textOut.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) ?? textOut.match(/(\{[\s\S]*\})/);
  if (!jsonMatch) {
    return NextResponse.json({ error: "Respuesta IA sin JSON parseable" }, { status: 502 });
  }

  let parsed: Record<string, { value: unknown; source_type?: string; sources?: unknown[] }>;
  try {
    parsed = JSON.parse(jsonMatch[1]);
  } catch {
    return NextResponse.json({ error: "JSON inválido en respuesta IA" }, { status: 502 });
  }

  // Construir FieldResponse por campo
  const now = new Date().toISOString();
  const result: Record<string, FieldResponse> = {};
  for (const field of step.fields) {
    const ai = parsed[field.key];
    if (!ai) {
      result[field.key] = {
        value: null,
        source_type: "consultor_only",
        sources: [],
        validated: false,
        updated_at: now,
      };
      continue;
    }
    const sourceType =
      ai.source_type === "public" || ai.source_type === "interpretation"
        ? ai.source_type
        : "consultor_only";
    const sources = Array.isArray(ai.sources)
      ? ai.sources
          .filter((s): s is { url: string; title: string; date: string } =>
            typeof s === "object" && s !== null && "url" in s && "title" in s && "date" in s
          )
          .map((s) => ({ url: s.url, title: s.title, date: s.date, type: "web" as const }))
      : [];
    result[field.key] = {
      value: typeof ai.value === "string" || typeof ai.value === "number" ? ai.value : null,
      source_type: sourceType,
      sources,
      validated: false,
      updated_at: now,
    };
  }

  return NextResponse.json({ data: result });
}
