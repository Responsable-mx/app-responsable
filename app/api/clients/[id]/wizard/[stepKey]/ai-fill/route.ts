import { NextRequest, NextResponse } from "next/server";
import { createAnthropicClient } from "@/lib/ai/client";
import { z } from "zod";
import { requireConsultorForClient } from "@/lib/auth";
import { getClient } from "@/lib/clients";
import { getQuestionnaireBundle } from "@/lib/questionnaires/queries";
import {
  getFieldValue,
  isFieldResponse,
  isWizardSchema,
  type FieldResponse,
  type WizardStep,
} from "@/lib/questionnaires/types";
import { getModelConfig } from "@/lib/ai/models";
import { logAiCall } from "@/lib/ai/logging";
import { extractJsonObject } from "@/lib/ai/extract-json";
import { checkAiRateLimit } from "@/lib/ai/rate-limit";
import { anthropicBreaker } from "@/lib/ai/circuit-breaker";

// Timeout serverless: hasta 5 min (web_search tarda ~30-90s por paso)
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Campos de cache del SDK de Anthropic (beta — no incluidos en el tipo oficial)
interface UsageWithCache {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

// D-14: Rate limit por usuario — capa única DB (cross-instance).
// D-61: capa 1 in-memory eliminada — era engañosa en Vercel multi-instancia
// (cada lambda tenía su propio Map; el límite se multiplicaba por N instancias).
// La capa DB es suficiente para el piloto de 8 usuarios.
const WINDOW_MS = 60_000; // 1 minuto
const MAX_CALLS_PER_WINDOW = 15; // 9 pasos bulk + 6 individuales de margen

// D-13: allowlist de caracteres válidos para stepKey (alfanumérico + guion).
// Previene inputs maliciosos aunque el lookup string-equality ya es seguro.
const VALID_STEP_KEY = /^[a-z0-9-]{1,64}$/;

type Ctx = { params: Promise<{ id: string; stepKey: string }> };

// Schema Zod del JSON que retorna la IA — bloquea formas inválidas en lugar de
// guardarlas en la DB del cliente.
const AiSourceSchema = z.object({
  url: z.string().min(1),
  title: z.string().min(1),
  date: z.string().optional().default(""),
});
const AiFieldSchema = z.object({
  value: z.union([z.string(), z.number(), z.null()]).optional(),
  source_type: z.enum(["public", "interpretation", "consultor_only"]).optional(),
  sources: z.array(AiSourceSchema).optional(),
});
const AiResponseSchema = z.record(z.string(), AiFieldSchema);

export async function POST(_req: NextRequest, { params }: Ctx) {
  const { id, stepKey } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY no configurada" }, { status: 500 });
  }

  // D-13: validar formato de stepKey antes de cualquier DB call.
  if (!VALID_STEP_KEY.test(stepKey)) {
    return NextResponse.json({ error: "stepKey inválido" }, { status: 400 });
  }

  // D-14: rate limit DB cross-instancias.
  const rl = await checkAiRateLimit(user, { max: MAX_CALLS_PER_WINDOW, windowMs: WINDOW_MS });
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
  if (!step.ai_can_fill) return NextResponse.json({ error: "Paso no soporta AI fill" }, { status: 400 });

  const client = await getClient(id).catch(() => null);

  // Guard only_double_materialidad: si el paso solo aplica a clientes con flag,
  // verificar antes de gastar tokens IA en datos que no se podrán guardar
  // (PATCH del cuestionario los rechaza con 422).
  if (step.only_double_materialidad) {
    if (client && client.has_double_materiality !== true) {
      return NextResponse.json(
        {
          error:
            "Este paso solo aplica a clientes con Doble Materialidad. Activa el flag en el cliente o elige otro paso.",
        },
        { status: 422 }
      );
    }
  }

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

FORMATO DE RESPUESTA — OBLIGATORIO:
Tu mensaje final DEBE empezar con { y terminar con }. Cero texto antes o después del JSON.
No incluyas explicaciones, razonamiento, ni markdown. Solo el objeto JSON.
{ "campo_key": { "value": "...", "source_type": "...", "sources": [{"url":"...","title":"...","date":"YYYY-MM-DD"}] }, ... }`;

  // Contexto del cliente desde DB + pasos previos llenos
  const contextLines: string[] = [];
  if (client) {
    contextLines.push(`Nombre: ${client.name}`);
    if (client.website_url) contextLines.push(`Sitio web corporativo: ${client.website_url}`);
    if (client.sector) contextLines.push(`Sector: ${client.sector}`);
    if (client.subsector) contextLines.push(`Subsector: ${client.subsector}`);
    if (client.countries?.length) contextLines.push(`Países: ${client.countries.join(", ")}`);
    if (client.size) contextLines.push(`Tamaño: ${client.size}`);
  }

  // Sprint B2: incluir contenido de informes públicos (sustentabilidad/financiero)
  // como fuente primaria. Cita la URL real al usar datos de estos docs.
  const reportsContext: string[] = [];
  try {
    const { listDocumentsByClient } = await import("@/lib/documents/queries");
    const reports = await listDocumentsByClient(id);
    for (const doc of reports) {
      if (doc.kind === "general") continue;
      if (!doc.markdown_content || doc.parse_status !== "ok") continue;
      const label = doc.kind === "sustainability_report" ? "INFORME DE SUSTENTABILIDAD" : "INFORME FINANCIERO";
      const sourceUrl = doc.source_url ?? "doc-cliente";
      // Tope conservador por doc para no inflar prompt: 30k chars c/u
      const slice = doc.markdown_content.slice(0, 30_000);
      reportsContext.push(
        `\n[${label} — ${doc.file_name}]\nFuente: ${sourceUrl}\n\n${slice}\n`
      );
    }
  } catch (e) {
    console.error("[ai-fill] reports context failed:", e);
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
${reportsContext.length > 0 ? `\n\nINFORMES PÚBLICOS DEL CLIENTE (FUENTE PRIMARIA — usa estos antes de web_search):\n${reportsContext.join("\n---\n")}\n` : ""}
PASO ACTUAL: ${step.title} — ${step.subtitle}

Campos a llenar:
${fieldsList}

${reportsContext.length > 0 ? "PRIORIDAD: usa los INFORMES PÚBLICOS arriba como fuente principal. Cita la URL real del informe en sources.url. Si el dato no está en los informes, complementa con web_search." : ""}Investiga fuentes públicas verificables sobre ${client?.name ?? "este cliente"} y retorna el JSON con los campos llenos siguiendo las 8 reglas operativas. No inventes URLs.`;

  // Modelo desde config centralizada (Aurora = autor, mismo rol que llena cuestionarios).
  const modelCfg = getModelConfig("aurora");
  const anthropic = createAnthropicClient();

  let textOut = "";
  const citationsCollected: { url: string; title: string }[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheCreationTokens = 0;
  let cacheReadTokens = 0;
  let stopReason: string | null = null;
  const startedAt = Date.now();

  // D-63: AbortSignal para evitar que Vercel mate la lambda abruptamente sin
  // dar feedback al cliente. maxDuration=300s; con 2 web_search (~90s c/u)
  // el timeout real es ~270s. AbortError se captura en el catch y retorna 504.
  const timeoutSignal = AbortSignal.timeout(270_000);

  try {
    const msg = await anthropic.messages.create({
      model: modelCfg.model,
      max_tokens: 4096,
      // System prompt como bloque cacheable (ephemeral) — system prompt es
      // constante en todas las llamadas (8 reglas + fuentes). Hits subsequentes
      // pagan 10% del costo input por estos tokens. Ahorro ~80-90% en bulk fill.
      system: [
        {
          type: "text",
          text: systemPrompt,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cache_control: { type: "ephemeral" } as any,
        },
      ],
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any, { signal: timeoutSignal });
    inputTokens = msg.usage?.input_tokens ?? 0;
    outputTokens = msg.usage?.output_tokens ?? 0;
    cacheCreationTokens = (msg.usage as UsageWithCache)?.cache_creation_input_tokens ?? 0;
    cacheReadTokens = (msg.usage as UsageWithCache)?.cache_read_input_tokens ?? 0;
    stopReason = msg.stop_reason ?? null;
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
    anthropicBreaker.recordSuccess();
  } catch (e) {
    anthropicBreaker.recordFailure();
    const isTimeout = e instanceof Error && e.name === "AbortError";
    const errorMsg = isTimeout
      ? "La búsqueda tardó demasiado. Inténtalo de nuevo en unos segundos."
      : e instanceof Error ? e.message : "Error Anthropic";
    void logAiCall({
      userEmail: user,
      role: "aurora",
      clientId: id,
      model: modelCfg.model,
      inputTokens,
      outputTokens,
      cacheCreationTokens,
      cacheReadTokens,
      stopReason,
      latencyMs: Date.now() - startedAt,
      error: errorMsg,
    });
    return NextResponse.json({ error: errorMsg }, { status: isTimeout ? 504 : 500 });
  }

  // Loggear uso real de tokens (visible en /configuracion/uso-ia).
  void logAiCall({
    userEmail: user,
    role: "aurora",
    clientId: id,
    model: modelCfg.model,
    inputTokens,
    outputTokens,
    cacheCreationTokens,
    cacheReadTokens,
    stopReason,
    latencyMs: Date.now() - startedAt,
    error: null,
  });

  // Extraer JSON del output. Prefiere code block; fallback a primer objeto balanceado.
  const jsonText = extractJsonObject(textOut);
  if (!jsonText) {
    return NextResponse.json({ error: "Respuesta IA sin JSON parseable" }, { status: 502 });
  }

  let parsed: z.infer<typeof AiResponseSchema>;
  try {
    const raw = JSON.parse(jsonText);
    const result = AiResponseSchema.safeParse(raw);
    if (!result.success) {
      return NextResponse.json(
        { error: `Schema IA inválido: ${result.error.issues.map((i) => i.message).join("; ")}` },
        { status: 502 }
      );
    }
    parsed = result.data;
  } catch {
    return NextResponse.json({ error: "JSON inválido en respuesta IA" }, { status: 502 });
  }

  // Construir FieldResponse por campo (solo campos del paso actual; descartar extras).
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
    const sourceType = ai.source_type ?? "consultor_only";
    let sources = (ai.sources ?? []).map((s) => ({
      url: s.url,
      title: s.title,
      date: s.date || "",
      type: "web" as const,
    }));
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

// Extrae primer objeto JSON balanceado del texto.

