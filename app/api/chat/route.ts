import { NextRequest } from "next/server";
import crypto from "node:crypto";
import { createAnthropicClient } from "@/lib/ai/client";
import { requireConsultorOrAdmin } from "@/lib/auth";
import { getClient } from "@/lib/clients";
import { getQuestionnaireBundle } from "@/lib/questionnaires/queries";
import { getModelConfig } from "@/lib/ai/models";
import { buildSystemBlocks } from "@/lib/ai/roles";
import { logAiCall } from "@/lib/ai/logging";
import { validateAiResponse } from "@/lib/ai/response-validator";
import { buildFeedbackMemoryBlock, countActiveFeedback } from "@/lib/ai/feedback-memory";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDevMode } from "@/lib/env";
import { ChatRequestSchema } from "@/lib/validation";
import type { ChatStreamEvent } from "@/lib/ai/stream-types";
import { anthropicBreaker } from "@/lib/ai/circuit-breaker";

export const maxDuration = 120;

// AbortSignal 100s (margen ~17% vs maxDuration 120s).
// Aurora puede tardar 80-90s con contexto extenso — 45s era demasiado corto.
const STREAM_TIMEOUT_MS = 100_000;
const OVERLOADED_RETRY_DELAY_MS = 2_000;

// Summarization: comprimir historial largo con Haiku para reducir tokens y latencia.
// Trigger: >14 mensajes (7 turnos). Mantiene últimos 4 mensajes (2 turnos) intactos.
const COMPRESS_TRIGGER = 14;
const COMPRESS_KEEP_TAIL = 4;

type MsgLike = { role: "user" | "assistant"; content: string | unknown };

async function compressConversation(
  messages: MsgLike[],
  anthropic: ReturnType<typeof createAnthropicClient>
): Promise<MsgLike[]> {
  if (messages.length <= COMPRESS_TRIGGER) return messages;
  const toSummarize = messages.slice(0, messages.length - COMPRESS_KEEP_TAIL);
  const tail = messages.slice(messages.length - COMPRESS_KEEP_TAIL);
  try {
    const haiku = process.env.ANTHROPIC_MODEL_HAIKU || "claude-haiku-4-5-20251001";
    const resp = await anthropic.messages.create({
      model: haiku,
      max_tokens: 600,
      messages: [{
        role: "user",
        content: `Resume esta conversación en ≤400 palabras. Preserva: decisiones, datos específicos, instrucciones del consultor, nombres de empresas o estándares mencionados. Omite: saludos, repeticiones, frases de cortesía.\n\nCONVERSACIÓN:\n${toSummarize.map((m) => `[${m.role === "user" ? "CONSULTOR" : "IA"}]: ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`).join("\n\n")}`,
      }],
    }, { signal: AbortSignal.timeout(15_000) });
    const summary = resp.content.find((b) => b.type === "text")?.text ?? "";
    if (!summary) return messages;
    return [
      { role: "user" as const, content: `[RESUMEN — ${toSummarize.length} mensajes anteriores comprimidos]\n${summary}` },
      { role: "assistant" as const, content: "Entendido, continúo con el contexto del resumen." },
      ...tail,
    ];
  } catch {
    return messages; // fail-open
  }
}

// Rate limit: 30 mensajes / 5 min por email. Evita que un loop accidental
// queme crédito Anthropic.
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MIN = 5;

async function checkAndRecordRateLimit(
  email: string,
  role: string,
  clientId: string | null
): Promise<{ limited: boolean; count: number }> {
  if (isDevMode()) return { limited: false, count: 0 };
  try {
    const admin = createAdminClient();
    const since = new Date(
      Date.now() - RATE_LIMIT_WINDOW_MIN * 60 * 1000
    ).toISOString();
    const { count } = await admin
      .from("chat_requests")
      .select("id", { count: "exact", head: true })
      .eq("user_email", email)
      .gte("created_at", since);
    const used = count ?? 0;
    if (used >= RATE_LIMIT_MAX) {
      return { limited: true, count: used };
    }
    await admin
      .from("chat_requests")
      .insert({ user_email: email, role, client_id: clientId });
    return { limited: false, count: used + 1 };
  } catch (e) {
    console.error("[chat rate limit]", e);
    return { limited: false, count: 0 }; // falla abierto
  }
}

export async function POST(req: NextRequest) {
  const user = await requireConsultorOrAdmin();
  if (!user) {
    return new Response(JSON.stringify({ error: "No autorizado" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: parsed.error.issues.map((i) => i.message).join("; "),
      }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  const { role, clientId, messages } = parsed.data;

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY no configurada" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  const rl = await checkAndRecordRateLimit(user, role, clientId ?? null);
  if (rl.limited) {
    return new Response(
      JSON.stringify({
        error: `Has enviado ${rl.count} mensajes en los últimos ${RATE_LIMIT_WINDOW_MIN} minutos. Espera un momento y vuelve a intentar.`,
      }),
      {
        status: 429,
        headers: {
          "content-type": "application/json",
          "retry-after": String(RATE_LIMIT_WINDOW_MIN * 60),
        },
      }
    );
  }

  // D-10: fetch client + questionnaire en paralelo para trazabilidad Chat→Cuestionario.
  const [client, questionnaire] = await Promise.all([
    clientId ? getClient(clientId).catch(() => null) : Promise.resolve(null),
    clientId ? getQuestionnaireBundle(clientId, "doble-materialidad").catch(() => null) : Promise.resolve(null),
  ]);
  const lastUserMsg = messages.filter((m) => m.role === "user").pop();
  const lastUserText = typeof lastUserMsg?.content === "string" ? lastUserMsg.content : "";
  const historyTurns = Math.floor(messages.length / 2);
  const config = getModelConfig(role, lastUserText, historyTurns);
  const baseSystemBlocks = await buildSystemBlocks(role, client, questionnaire);
  // Wave 3c (D): memoria de feedback negativo del consultor para este rol+cliente.
  // Se agrega como 3er bloque SIN cache_control — refleja feedback nuevo sin
  // invalidar los 2 bloques cacheados (contexto cliente + reglas del rol).
  // Skip la query completa si no hay rechazos activos (caso más común en piloto)
  const feedbackCount = await countActiveFeedback({ role, clientId: clientId || null }).catch(() => 0);

  // Metadata para el evento SSE "sources" (transparencia hacia el consultor).
  let sourceMeta: { chunksUsed: number; pages: number[] } | null = null;

  const [feedbackText, docChunksText] = await Promise.all([
    feedbackCount > 0
      ? buildFeedbackMemoryBlock({ role, clientId: clientId || null }).catch(() => "")
      : Promise.resolve(""),
    // Búsqueda semántica de chunks relevantes del informe del cliente.
    // Fail-open: si Voyage falla o no hay docs, el chat continúa sin chunks.
    clientId && process.env.VOYAGE_API_KEY && lastUserText.length > 10
      ? (async () => {
          try {
            const { searchSimilarChunks, rerankChunks } = await import("@/lib/documents/embeddings");
            const matches = await searchSimilarChunks({ query: lastUserText, clientId, limit: 20 });
            if (!matches || matches.length === 0) return "";
            const chunks = matches.length >= 3
              ? await rerankChunks({ query: lastUserText, chunks: matches.map((m) => m.content), topK: 8, meta: { userEmail: user, clientId } })
              : matches.map((m) => m.content);
            // Incluir número de página cuando disponible — habilita citations precisas
            const pageByContent = new Map(matches.map((m) => [m.content, m.page_number ?? null]));
            const chunksWithPage = chunks.map((c) => {
              const page = pageByContent.get(c);
              return page != null ? `[Página ${page}]\n${c}` : c;
            });
            // Capturar metadata para evento SSE sources
            const pages = [...new Set(
              matches.map((m) => m.page_number).filter((p): p is number => p != null)
            )].sort((a, b) => a - b);
            sourceMeta = { chunksUsed: chunks.length, pages };
            return `FRAGMENTOS RELEVANTES DEL INFORME DEL CLIENTE:\n${chunksWithPage.join("\n\n---\n\n")}`;
          } catch {
            return "";
          }
        })()
      : Promise.resolve(""),
  ]);

  // Orden de bloques optimizado para caché:
  // 1+2. baseSystemBlocks (context + role) — cacheados con ephemeral
  // 3. feedbackText — semi-estático (cambia solo con feedback nuevo) → cacheable
  // 4. docChunksText — dinámico por query → NO cacheable, va al final
  const systemBlocks = [
    ...baseSystemBlocks,
    ...(feedbackText ? [{ type: "text" as const, text: feedbackText, cache_control: { type: "ephemeral" as const } }] : []),
    ...(docChunksText ? [{ type: "text" as const, text: docChunksText }] : []),
  ];

  // Audit trail: hash del prompt estático (bloques 1+2+3, sin docChunks que cambia por query).
  // 16 chars de SHA-256 — suficiente para detectar cambios de versión de prompt.
  const promptHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(baseSystemBlocks) + (feedbackText ?? ""))
    .digest("hex")
    .slice(0, 16);

  // Circuit breaker: rechazar inmediatamente si Anthropic está en cascada de fallos
  if (anthropicBreaker.isOpen) {
    const enc = new TextEncoder();
    const errStream = new ReadableStream({
      start(controller) {
        const ev: ChatStreamEvent = { type: "error", error: anthropicBreaker.userMessage };
        controller.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`));
        controller.close();
      },
    });
    return new Response(errStream, {
      headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache" },
    });
  }

  const anthropic = createAnthropicClient();
  const encoder = new TextEncoder();
  const startedAt = Date.now();

  // Comprimir historial largo con Haiku antes de enviarlo al modelo principal.
  // Reduce tokens y latencia en sesiones de >7 turnos. Fail-open.
  const compressedMessages = await compressConversation(messages, anthropic);

  const stream = new ReadableStream({
    async start(controller) {
      // Emite eventos tipados — schema en lib/ai/stream-types.ts.
      const send = (event: ChatStreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      let ttftMs: number | null = null;

      const logUsage = (
        usage: {
          input_tokens?: number | null;
          output_tokens?: number | null;
          cache_creation_input_tokens?: number | null;
          cache_read_input_tokens?: number | null;
        } | null,
        stopReason: string | null,
        error: string | null = null
      ) => {
        logAiCall({
          userEmail: user,
          role,
          clientId: clientId ?? null,
          model: config.model,
          inputTokens: usage?.input_tokens ?? undefined,
          outputTokens: usage?.output_tokens ?? undefined,
          cacheCreationTokens: usage?.cache_creation_input_tokens ?? undefined,
          cacheReadTokens: usage?.cache_read_input_tokens ?? undefined,
          stopReason,
          latencyMs: Date.now() - startedAt,
          error,
          workflowStage: "chat",
          promptHash,
          ttftMs,
        });
      };

      const runOnce = async () => {
        // Emitir fragmentos del informe usados ANTES de iniciar el stream.
        if (sourceMeta && sourceMeta.chunksUsed > 0) {
          send({ type: "sources", chunks_used: sourceMeta.chunksUsed, pages: sourceMeta.pages });
        }

        const response = await anthropic.messages.stream(
          {
            model: config.model,
            max_tokens: config.maxTokens,
            system: systemBlocks,
            messages: compressedMessages.map((m) => ({
              role: m.role,
              content: m.content as string,
            })),
          },
          { signal: AbortSignal.timeout(STREAM_TIMEOUT_MS) }
        );

        // Acumular respuesta para validador E (post-stream).
        let fullResponseText = "";
        for await (const event of response) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            // Capturar TTFT al llegar el primer token
            if (ttftMs === null) ttftMs = Date.now() - startedAt;
            fullResponseText += event.delta.text;
            send({ type: "delta", text: event.delta.text });
          }
        }

        const finalMessage = await response.finalMessage();
        // Validador E: detecta códigos catálogo, jerga inglesa, URLs malformadas
        const validatorWarnings = validateAiResponse(fullResponseText)
          .filter((w) => w.severity !== "info");
        send({
          type: "done",
          usage: finalMessage.usage,
          stop_reason: finalMessage.stop_reason,
          // ayuda al cliente a confirmar que hay cache hit en turnos subsecuentes
          cache_read_tokens: finalMessage.usage.cache_read_input_tokens ?? 0,
          ...(validatorWarnings.length > 0 ? { warnings: validatorWarnings } : {}),
        });
        logUsage(finalMessage.usage, finalMessage.stop_reason);
        anthropicBreaker.recordSuccess();
      };

      try {
        await runOnce();
      } catch (err) {
        const e = err as {
          name?: string;
          message?: string;
          status?: number;
        };

        // Retry ÚNICO ante 529 (overloaded) de Anthropic
        if (e.status === 529) {
          anthropicBreaker.recordFailure();
          await new Promise((r) =>
            setTimeout(r, OVERLOADED_RETRY_DELAY_MS)
          );
          try {
            await runOnce();
            return;
          } catch (err2) {
            const e2 = err2 as {
              name?: string;
              message?: string;
              status?: number;
            };
            anthropicBreaker.recordFailure();
            const msg2 =
              "La IA está saturada. Espera un momento e intenta de nuevo.";
            console.error(
              "[/api/chat retry]",
              e2.name,
              e2.status,
              e2.message,
              Date.now() - startedAt
            );
            send({ type: "error", error: msg2 });
            logUsage(null, null, `529-retry-failed: ${e2.message}`);
            return;
          }
        }

        // Retry ÚNICO ante 429 (rate limit de Anthropic — Opus tiene cuota más baja)
        if (e.status === 429) {
          await new Promise((r) => setTimeout(r, 4_000));
          try {
            await runOnce();
            return;
          } catch (err2) {
            const e2 = err2 as { name?: string; message?: string; status?: number };
            const msg2 = "El servicio de IA alcanzó el límite de velocidad. Espera unos segundos e intenta de nuevo.";
            console.error("[/api/chat 429-retry]", e2.name, e2.status, e2.message, Date.now() - startedAt);
            send({ type: "error", error: msg2 });
            logUsage(null, null, `429-retry-failed: ${e2.message}`);
            return;
          }
        }

        // 503 / timeout — registrar en breaker
        if (e.status === 503 || e.name === "AbortError" || e.name === "TimeoutError") {
          anthropicBreaker.recordFailure();
        }

        console.error(
          "[/api/chat]",
          e.name,
          e.status,
          e.message,
          Date.now() - startedAt
        );

        const msg =
          e.name === "AbortError" || e.name === "TimeoutError"
            ? "La IA tardó más de lo esperado. Intenta de nuevo."
            : `Error: ${e.message ?? "desconocido"}`;
        send({ type: "error", error: msg });
        logUsage(null, null, msg);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
