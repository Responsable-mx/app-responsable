import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireUser } from "@/lib/auth";
import { getClient } from "@/lib/clients";
import { getModelConfig } from "@/lib/ai/models";
import { buildSystemBlocks } from "@/lib/ai/roles";
import { ChatRequestSchema } from "@/lib/validation";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const user = await requireUser();
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

  const client = clientId ? await getClient(clientId).catch(() => null) : null;
  const config = getModelConfig(role);
  const systemBlocks = buildSystemBlocks(role, client);

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const encoder = new TextEncoder();
  const startedAt = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };

      try {
        const response = await anthropic.messages.stream({
          model: config.model,
          max_tokens: config.maxTokens,
          system: systemBlocks,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        });

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
        });
      } catch (err) {
        const e = err as { name?: string; message?: string; status?: number };
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
