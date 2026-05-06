import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireConsultorOrAdmin } from "@/lib/auth";
import { getClient } from "@/lib/clients";
import { getQuestionnaireBundle } from "@/lib/questionnaires/queries";
import { getModelConfig } from "@/lib/ai/models";
import { buildSystemBlocks } from "@/lib/ai/roles";
import { logAiCall } from "@/lib/ai/logging";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDevMode } from "@/lib/env";
import { ChatRequestSchema } from "@/lib/validation";
import type { ChatStreamEvent } from "@/lib/ai/stream-types";

export const maxDuration = 60;

// AbortSignal 45s (margen ~30% vs maxDuration 60s).
const STREAM_TIMEOUT_MS = 45_000;
const OVERLOADED_RETRY_DELAY_MS = 2_000;

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
  const config = getModelConfig(role);
  const systemBlocks = await buildSystemBlocks(role, client, questionnaire);

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const encoder = new TextEncoder();
  const startedAt = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      // Emite eventos tipados — schema en lib/ai/stream-types.ts.
      const send = (event: ChatStreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

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
        });
      };

      const runOnce = async () => {
        const response = await anthropic.messages.stream(
          {
            model: config.model,
            max_tokens: config.maxTokens,
            system: systemBlocks,
            messages: messages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          },
          { signal: AbortSignal.timeout(STREAM_TIMEOUT_MS) }
        );

        for await (const event of response) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            send({ type: "delta", text: event.delta.text });
          }
        }

        const finalMessage = await response.finalMessage();
        send({
          type: "done",
          usage: finalMessage.usage,
          stop_reason: finalMessage.stop_reason,
          // ayuda al cliente a confirmar que hay cache hit en turnos subsecuentes
          cache_read_tokens: finalMessage.usage.cache_read_input_tokens ?? 0,
        });
        logUsage(finalMessage.usage, finalMessage.stop_reason);
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
