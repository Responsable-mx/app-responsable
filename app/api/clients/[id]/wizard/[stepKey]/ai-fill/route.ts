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
import { getModelConfig, getTaskConfig } from "@/lib/ai/models";
import { logAiCall } from "@/lib/ai/logging";
import { validateAiResponse, type ValidationWarning } from "@/lib/ai/response-validator";
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

export async function POST(req: NextRequest, { params }: Ctx) {
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

  // Body opcional con scope de protección. Si no viene body (compat con caller
  // viejo), se preserva comportamiento anterior (sobrescribe todo).
  // - excludeValidated: si true, los campos con validated=true se preservan tal cual.
  // - excludeFilled: si true (modo "solo vacíos"), los campos con valor no se tocan.
  let scopeOpts: { excludeValidated: boolean; excludeFilled: boolean } = {
    excludeValidated: false,
    excludeFilled: false,
  };
  try {
    const body = await req.json().catch(() => null);
    if (body && typeof body === "object") {
      scopeOpts = {
        excludeValidated: body.excludeValidated === true,
        excludeFilled: body.excludeFilled === true,
      };
    }
  } catch {
    // Body opcional — ignorar parse error.
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

FLUJO DE TRABAJO:
1. Revisa los DOCUMENTOS DEL CLIENTE del contexto (fuente primaria).
2. Usa web_search para complementar (máx 2 búsquedas).
3. Cuando termines la investigación, llama UNA SOLA VEZ la herramienta submit_responses con el objeto { responses: { campo_key: {...} } }.
4. NO escribas texto plano con el JSON. SIEMPRE usa la herramienta submit_responses para entregar el resultado.`;

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

  // Documentos del cliente como fuente primaria — incluye todos los tipos
  // (sustainability_report, financial_report, general). Cita URL real cuando exista.
  // DOC_RELEVANCE_ENABLED: BM25 sobre chunks_cache pre-calculados (~70% menos tokens).
  // Sin flag: dump 30K chars/doc hasta 150K total (legacy).
  // Con flag: top chunks relevantes por field labels + sinónimos RSE (~8K/doc, 50K total).
  const useRelevance = process.env.DOC_RELEVANCE_ENABLED === "true";
  const reportsContext: string[] = [];

  // Sinónimos RSE fijos aseguran recall en documentos técnicos (GRI, ESRS, etc.)
  const RSE_SYNONYMS = "ODS materialidad ESRS GRI SASB TCFD impacto riesgo oportunidad stakeholder gobernanza clima carbono huella residuos agua diversidad equidad inclusion cadena valor";
  const relevanceQuery = useRelevance
    ? [step.title, step.subtitle ?? "", ...step.fields.map((f) => f.label), RSE_SYNONYMS].filter(Boolean).join(" ")
    : "";

  // Wave 7: si VOYAGE_API_KEY existe y cliente tiene chunks embeddidos, hacer
  // 1 búsqueda vector global ANTES del fallback BM25. Mejor recall semántico
  // (sinónimos, paráfrasis, inglés). Si retorna chunks suficientes, skip BM25.
  let vectorChunks: string[] | null = null;
  if (useRelevance && process.env.VOYAGE_API_KEY) {
    try {
      const { searchSimilarChunks, rerankChunks } = await import("@/lib/documents/embeddings");
      const matches = await searchSimilarChunks({ query: relevanceQuery, clientId: id, limit: 20 });
      if (matches && matches.length >= 3) {
        const rawChunks = matches.map((m) => m.content);
        // Rerank: de los 20 chunks semánticos, mantener top 10 más relevantes.
        // Reduce noise y tokens sin sacrificar los mejores resultados.
        vectorChunks = await rerankChunks({
          query: relevanceQuery,
          chunks: rawChunks,
          topK: 10,
          meta: { userEmail: user, clientId: id },
        });
      }
    } catch (e) {
      console.error("[ai-fill] vector search failed, falling back to BM25:", e);
    }
  }

  try {
    const { listDocumentsByClient } = await import("@/lib/documents/queries");
    const reports = await listDocumentsByClient(id);
    let totalChars = 0;
    const TOTAL_CAP = useRelevance ? 50_000 : 150_000;
    const PER_DOC_CAP = useRelevance ? 8_000 : 30_000;

    // Wave 7: si tenemos chunks vectoriales, usarlos como contexto principal
    if (vectorChunks && vectorChunks.length > 0) {
      const docList = reports.filter((d) => d.parse_status === "ok").map((d) => d.file_name).join(", ");
      const vectorBody = vectorChunks.slice(0, 25).join("\n\n---\n\n").slice(0, TOTAL_CAP);
      reportsContext.push(
        `\n[CHUNKS RELEVANTES — búsqueda semántica Voyage AI sobre: ${docList || "documentos del cliente"}]\n\n${vectorBody}\n`
      );
      totalChars = vectorBody.length;
    }

    // Si vectorChunks ya cubre el contexto, skip BM25 redundante.
    if (vectorChunks && vectorChunks.length > 0) {
      // Resultados Voyage suficientes — no agregar BM25 sobre docs largos.
    } else {
    for (const doc of reports) {
      if (!doc.markdown_content || doc.parse_status !== "ok") continue;
      const remaining = TOTAL_CAP - totalChars;
      if (remaining <= 1000) break;
      const label =
        doc.kind === "sustainability_report" ? "INFORME DE SUSTENTABILIDAD" :
        doc.kind === "financial_report"      ? "INFORME FINANCIERO" :
                                                "DOCUMENTO DEL CLIENTE";
      const sourceUrl = doc.source_url ?? "doc-cliente";

      let docContent: string;
      if (useRelevance && doc.markdown_content.length > PER_DOC_CAP) {
        const { chunkMarkdown, selectTopChunks } = await import("@/lib/documents/relevance");
        // Usar chunks pre-calculados si existen; recomputar solo como fallback
        const chunks = Array.isArray(doc.chunks_cache) && doc.chunks_cache.length > 0
          ? doc.chunks_cache
          : chunkMarkdown(doc.markdown_content, { chunkSize: 1200, overlap: 150 });
        const selected = selectTopChunks(chunks, relevanceQuery, {
          maxChars: Math.min(PER_DOC_CAP, remaining),
          minScore: 0.05,
        });
        docContent = selected.length > 0
          ? selected.map((s) => s.chunk).join("\n\n---\n\n")
          : doc.markdown_content.slice(0, Math.min(PER_DOC_CAP, remaining));
      } else {
        docContent = doc.markdown_content.slice(0, Math.min(PER_DOC_CAP, remaining));
      }
      totalChars += docContent.length;
      reportsContext.push(
        `\n[${label} — ${doc.file_name}]\nFuente: ${sourceUrl}\n\n${docContent}\n`
      );
    }
    } // close else block (BM25 fallback)
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
${reportsContext.length > 0 ? `\n\nDOCUMENTOS DEL CLIENTE (FUENTE PRIMARIA — usa estos antes de web_search):\n${reportsContext.join("\n---\n")}\n` : ""}
PASO ACTUAL: ${step.title} — ${step.subtitle}

Campos a llenar:
${fieldsList}

${reportsContext.length > 0 ? "PRIORIDAD: usa los DOCUMENTOS DEL CLIENTE arriba como fuente principal. Cita la URL real del documento en sources.url cuando exista. Si el dato no está en los documentos, complementa con web_search. " : ""}Investiga fuentes públicas verificables sobre ${client?.name ?? "este cliente"} y al terminar llama la herramienta submit_responses con las respuestas por campo. No inventes URLs.`;

  // Modelo desde config centralizada (Aurora = autor, mismo rol que llena cuestionarios).
  const modelCfg = getModelConfig("aurora");
  const anthropic = createAnthropicClient();

  let textOut = "";
  let toolResponses: Record<string, unknown> | null = null;
  const citationsCollected: { url: string; title: string }[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheCreationTokens = 0;
  let cacheReadTokens = 0;
  let stopReason: string | null = null;
  const startedAt = Date.now();
  let usedModel = modelCfg.model;

  // Tool compartido entre fast path y full path
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const submitResponsesTool: any = {
    name: "submit_responses",
    description: "Envía las respuestas finales por campo del paso del cuestionario. Llamar UNA SOLA VEZ al terminar la investigación.",
    input_schema: {
      type: "object",
      properties: {
        responses: {
          type: "object",
          description: "Mapa de field_key → {value, source_type, sources[]}. Una entrada por cada campo del paso.",
          additionalProperties: {
            type: "object",
            properties: {
              value: { type: ["string", "number", "null"], description: "Contenido del campo (string máx 500 chars) o null si no hay fuente." },
              source_type: { type: "string", enum: ["public", "interpretation", "consultor_only"] },
              sources: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    url: { type: "string" },
                    title: { type: "string" },
                    date: { type: "string", description: "YYYY-MM-DD o vacío" },
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

  // ── HAIKU FAST PATH ─────────────────────────────────────────────────────────
  // Cuando vectorChunks proveen contexto local suficiente, intentar extracción
  // con Haiku (~12× más barato). Fallback a Sonnet si ≥40% campos son null.
  let skipSonnet = false;
  if (vectorChunks && vectorChunks.length >= 3) {
    const haikuCfg = getTaskConfig("extract");
    try {
      const haikuMsg = await anthropic.messages.create({
        model: haikuCfg.model,
        max_tokens: 4096,
        system: "Eres un asistente de extracción de datos ESG. Lee los DOCUMENTOS DEL CLIENTE en el prompt y extrae los campos pedidos. Solo extrae datos que encuentres explícitamente — no inventes ni interpoles. Campo no encontrado: value null, source_type \"consultor_only\". Llama submit_responses con el resultado final.",
        tools: [submitResponsesTool],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tool_choice: { type: "tool", name: "submit_responses" } as any,
        messages: [{ role: "user", content: userPrompt }],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any, { signal: AbortSignal.timeout(45_000) });

      inputTokens        = haikuMsg.usage?.input_tokens ?? 0;
      outputTokens       = haikuMsg.usage?.output_tokens ?? 0;
      cacheCreationTokens = (haikuMsg.usage as UsageWithCache)?.cache_creation_input_tokens ?? 0;
      cacheReadTokens    = (haikuMsg.usage as UsageWithCache)?.cache_read_input_tokens ?? 0;
      stopReason         = haikuMsg.stop_reason ?? null;

      for (const block of haikuMsg.content) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (block.type === "tool_use" && (block as any).name === "submit_responses") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const input = (block as any).input as { responses?: unknown } | undefined;
          if (input?.responses && typeof input.responses === "object") {
            toolResponses = input.responses as Record<string, unknown>;
          }
        }
      }

      if (toolResponses) {
        const pr = AiResponseSchema.safeParse(toolResponses);
        const nullCount = pr.success
          ? step.fields.filter(f => pr.data[f.key]?.value == null).length
          : step.fields.length;
        if (nullCount / step.fields.length < 0.40) {
          skipSonnet = true;
          usedModel  = haikuCfg.model;
          anthropicBreaker.recordSuccess();
        } else {
          // Demasiados nulls — Sonnet con web_search llenará los huecos
          toolResponses       = null;
          inputTokens         = 0;
          outputTokens        = 0;
          cacheCreationTokens = 0;
          cacheReadTokens     = 0;
        }
      }
    } catch {
      // Haiku falló → usar Sonnet sin penalizar al usuario
      toolResponses = null;
      inputTokens   = 0;
      outputTokens  = 0;
    }
  }

  // ── SONNET FULL PATH (web_search + submit_responses) ────────────────────────
  // D-63: AbortSignal para evitar que Vercel mate la lambda abruptamente sin
  // dar feedback al cliente. maxDuration=300s; con 2 web_search (~90s c/u)
  // el timeout real es ~270s. AbortError se captura en el catch y retorna 504.
  const timeoutSignal = AbortSignal.timeout(270_000);

  if (!skipSonnet) {
    try {
      const msg = await anthropic.messages.create({
        model: modelCfg.model,
        // Bump a 8192: con varios campos + sources + citations el output puede
        // truncarse a 4096. submit_responses puede recibir hasta el cap del tool input.
        max_tokens: 8192,
        // System prompt como bloque cacheable (ephemeral) — system prompt es
        // constante en todas las llamadas (8 reglas + fuentes). Hits subsequentes
        // pagan 10% del costo input por estos tokens. Ahorro ~80-90% en bulk fill.
        system: [
          {
            type: "text",
            text: systemPrompt,

            cache_control: { type: "ephemeral" },
          },
        ],
        tools: [
          {
            // Web search tool: la IA busca fuentes públicas reales (no inventa)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Anthropic SDK beta
            type: "web_search_20250305" as any,
            name: "web_search",
            max_uses: 2,
          },
          submitResponsesTool,
        ],
        // tool_choice auto deja al modelo decidir orden (web_search primero,
        // luego submit_responses). System prompt fuerza llamada final.
        messages: [{ role: "user", content: userPrompt }],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Anthropic SDK beta
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Anthropic SDK beta
          const citations = (block as any).citations as Array<{ url?: string; title?: string }> | undefined;
          if (Array.isArray(citations)) {
            for (const c of citations) {
              if (c.url && c.title) citationsCollected.push({ url: c.url, title: c.title });
            }
          }
        }
        // Capturar input de submit_responses — output estructurado preferido.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Anthropic SDK beta
        if (block.type === "tool_use" && (block as any).name === "submit_responses") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Anthropic SDK beta
          const input = (block as any).input as { responses?: unknown } | undefined;
          if (input && typeof input === "object" && input.responses && typeof input.responses === "object") {
            toolResponses = input.responses as Record<string, unknown>;
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
        model: usedModel,
        inputTokens,
        outputTokens,
        cacheCreationTokens,
        cacheReadTokens,
        stopReason,
        latencyMs: Date.now() - startedAt,
        error: errorMsg,
        workflowStage: "ai_fill",
      });
      return NextResponse.json({ error: errorMsg }, { status: isTimeout ? 504 : 500 });
    }
  }

  // Loggear uso real de tokens (visible en /configuracion/uso-ia).
  void logAiCall({
    userEmail: user,
    role: "aurora",
    clientId: id,
    model: usedModel,
    inputTokens,
    outputTokens,
    cacheCreationTokens,
    cacheReadTokens,
    stopReason,
    latencyMs: Date.now() - startedAt,
    error: null,
    workflowStage: "ai_fill",
  });

  // Output estructurado preferido (tool_use submit_responses).
  // Fallback a parseo de texto si el modelo no llamó la tool.
  let rawParsed: unknown;
  if (toolResponses) {
    rawParsed = toolResponses;
  } else {
    const jsonText = extractJsonObject(textOut);
    if (!jsonText) {
      const debug = textOut.slice(0, 200).replace(/\s+/g, " ");
      return NextResponse.json(
        {
          error: `IA no devolvió respuestas estructuradas (stop_reason=${stopReason ?? "?"}). Output: "${debug}…"`,
        },
        { status: 502 }
      );
    }
    try {
      rawParsed = JSON.parse(jsonText);
    } catch {
      return NextResponse.json({ error: "JSON inválido en respuesta IA" }, { status: 502 });
    }
  }

  const result_ = AiResponseSchema.safeParse(rawParsed);
  if (!result_.success) {
    return NextResponse.json(
      {
        error: `Schema IA inválido: ${result_.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      },
      { status: 502 }
    );
  }
  const parsed = result_.data;

  // Construir FieldResponse por campo (solo campos del paso actual; descartar extras).
  const now = new Date().toISOString();
  const result: Record<string, FieldResponse> = {};
  // Snapshot del paso actual para protección de campos validados/llenos.
  const existingStep =
    (bundle.response?.responses?.[stepKey] as Record<string, unknown> | undefined) ?? {};
  for (const field of step.fields) {
    // Scope guards: preservar campo existente si la operación pidió skip.
    const existingRaw = existingStep[field.key];
    if (isFieldResponse(existingRaw)) {
      if (scopeOpts.excludeValidated && existingRaw.validated) {
        result[field.key] = existingRaw;
        continue;
      }
      if (
        scopeOpts.excludeFilled &&
        existingRaw.value !== null &&
        existingRaw.value !== "" &&
        !(Array.isArray(existingRaw.value) && existingRaw.value.length === 0)
      ) {
        result[field.key] = existingRaw;
        continue;
      }
    }
    const ai = parsed[field.key];
    if (!ai) {
      // IA omitió este campo. Si había un valor previo, preservarlo — no pisar
      // trabajo del consultor con null por omisión silenciosa del modelo.
      if (isFieldResponse(existingRaw) && existingRaw.value !== null) {
        result[field.key] = existingRaw;
        continue;
      }
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
    // Validador E: detecta códigos catálogo expuestos, jerga inglesa, disclaimers
    const valueStr = typeof ai.value === "string" ? ai.value : "";
    const warnings: ValidationWarning[] = valueStr
      ? validateAiResponse(valueStr, { minLength: 0 }).filter((w) => w.severity !== "info")
      : [];
    result[field.key] = {
      value: typeof ai.value === "string" || typeof ai.value === "number" ? ai.value : null,
      source_type: sourceType,
      sources,
      validated: false,
      updated_at: now,
      ...(warnings.length > 0 ? { ai_warnings: warnings } : {}),
    };
  }

  return NextResponse.json({ data: result });
}

// Extrae primer objeto JSON balanceado del texto.

