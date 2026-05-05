import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireUser } from "@/lib/auth";
import { getClient } from "@/lib/clients";
import { getQuestionnaireBundle } from "@/lib/questionnaires/queries";
import {
  getFieldValue,
  isFieldResponse,
  isWizardSchema,
  type FieldResponse,
  type WizardStep,
} from "@/lib/questionnaires/types";

// Timeout serverless: hasta 5 min (web_search tarda ~30-90s por paso)
export const maxDuration = 300;
export const dynamic = "force-dynamic";

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

  const systemPrompt = `Eres un consultor de ResponSable llenando cuestionario de Doble Materialidad para cliente corporativo en México.

REGLAS OPERATIVAS (Cuestionario_Contexto_Negocio.md):

1. **Llenar máximo posible** con datos públicos verificables. No autolimitarse.
2. **No inventar datos.** Si no existe fuente pública verificable → value: null y source_type: "consultor_only" con nota "Pendiente — requiere input del asesor / cliente".
3. **No interpretar en campos verdes (público).** Solo hechos verificables, no opiniones, juicios ni síntesis.
4. **Citar fuente con URL completa en cada dato verde.** Sin URL, el dato no se queda. Filtro contra alucinaciones.
5. **Interpretaciones (amarillo) con disclaimer.** Iniciar value con "Basado en información pública disponible — sujeto a validación del asesor." y citar fuentes que sustentan el juicio.
6. **Campos rojos (solo asesor/cliente)**: NO rellenar. value: null, source_type: "consultor_only".
7. **Fuente >2 años**: agregar al final del value "(Fuente con más de 2 años — verificar vigencia con el cliente.)"
8. **Diferenciar reportado vs real**: si es dato de informe público, indicar "Reportado en informe público — el asesor confirma datos internos no reportados."

FUENTES PERMITIDAS (búscalas con web_search):
- Sitio corporativo del cliente (la página web está en el contexto del paso 1)
- LinkedIn de la empresa
- Informes de sostenibilidad públicos
- Registros regulatorios (SEMARNAT, PROFEPA, INAI, CONDUSEF, COFECE, BMV, SAT)
- Prensa profesional (Reforma, Expansión, El Economista, Bloomberg LATAM)
- Asociaciones sectoriales (CANACAR, CANAINTRA, CONCAMIN)
- Bases ESG (CDP, GRI Database)

USO OBLIGATORIO DE web_search:
- Antes de escribir cualquier value distinto de null, USA la herramienta web_search
- Busca primero el sitio corporativo del cliente
- Después busca LinkedIn y prensa
- Cita cada URL exactamente como aparece en los resultados (no inventes)
- Si web_search no devuelve resultados confiables → value: null, source_type: "consultor_only"

PARA CADA CAMPO retorna:
- value: contenido (string máx 500 chars) o null
- source_type: "public" | "interpretation" | "consultor_only"
- sources: [{url, title, date (YYYY-MM-DD)}] — vacío si consultor_only

Retorna SOLO JSON válido sin texto extra:
{ "campo_key": { "value": "...", "source_type": "...", "sources": [{"url":"...","title":"...","date":"YYYY-MM-DD"}] }, ... }`;

  // Contexto del cliente desde DB + pasos previos llenos
  const client = await getClient(id).catch(() => null);
  const contextLines: string[] = [];
  if (client) {
    contextLines.push(`Nombre: ${client.name}`);
    if (client.sector) contextLines.push(`Sector: ${client.sector}`);
    if (client.subsector) contextLines.push(`Subsector: ${client.subsector}`);
    if (client.countries?.length) contextLines.push(`Países: ${client.countries.join(", ")}`);
    if (client.size) contextLines.push(`Tamaño: ${client.size}`);
  }
  // Respuestas previas llenas (para no duplicar trabajo)
  const previousResponses = bundle.response?.responses ?? {};
  const previousLines: string[] = [];
  if (isWizardSchema(bundle.template.schema)) {
    for (const prevStep of bundle.template.schema.steps) {
      if (prevStep.key === stepKey) break;
      const stepResp = (previousResponses[prevStep.key] as Record<string, unknown> | undefined) ?? {};
      const filledFields: string[] = [];
      for (const field of prevStep.fields) {
        const raw = stepResp[field.key];
        if (isFieldResponse(raw) && raw.value !== null) {
          const v = String(getFieldValue(raw)).slice(0, 200);
          filledFields.push(`  ${field.label}: ${v}`);
        }
      }
      if (filledFields.length > 0) {
        previousLines.push(`\n[Paso previo: ${prevStep.title}]`);
        previousLines.push(...filledFields);
      }
    }
  }

  const userPrompt = `Cliente: ${client?.name ?? id}

CONTEXTO YA CAPTURADO:
${contextLines.length ? contextLines.join("\n") : "(sin datos básicos)"}
${previousLines.join("\n")}

PASO ACTUAL: ${step.title} — ${step.subtitle}

Campos a llenar:
${fieldsList}

Investiga fuentes públicas verificables sobre ${client?.name ?? "este cliente"} y retorna el JSON con los campos llenos siguiendo las 8 reglas operativas. No inventes URLs.`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let textOut = "";
  let citationsCollected: { url: string; title: string }[] = [];
  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      system: systemPrompt,
      tools: [
        {
          // Web search tool: la IA busca fuentes públicas reales (no inventa)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          type: "web_search_20250305" as any,
          name: "web_search",
          max_uses: 2,
        },
      ],
      messages: [{ role: "user", content: userPrompt }],
    });
    for (const block of msg.content) {
      if (block.type === "text") {
        textOut += block.text;
        // Extraer citations del bloque de texto si vienen en formato Anthropic
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const citations = (block as any).citations as Array<{ url?: string; title?: string }> | undefined;
        if (Array.isArray(citations)) {
          for (const c of citations) {
            if (c.url && c.title) citationsCollected.push({ url: c.url, title: c.title });
          }
        }
      }
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
    let sources = Array.isArray(ai.sources)
      ? ai.sources
          .filter((s): s is { url: string; title: string; date: string } =>
            typeof s === "object" && s !== null && "url" in s && "title" in s && "date" in s
          )
          .map((s) => ({ url: s.url, title: s.title, date: s.date, type: "web" as const }))
      : [];
    // Fallback: si IA llenó pero olvidó sources Y hay citations recolectadas → tomar las primeras 2
    if (sources.length === 0 && ai.value && sourceType !== "consultor_only" && citationsCollected.length > 0) {
      sources = citationsCollected.slice(0, 2).map((c) => ({
        url: c.url,
        title: c.title,
        date: new Date().toISOString().slice(0, 10),
        type: "web" as const,
      }));
    }
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
