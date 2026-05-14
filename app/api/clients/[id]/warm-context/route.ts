import { NextRequest, NextResponse } from "next/server";
import { requireConsultorForClient } from "@/lib/auth";
import { getClient } from "@/lib/clients";
import { getQuestionnaireBundle } from "@/lib/questionnaires/queries";
import { buildSystemBlocks } from "@/lib/ai/roles";
import { createAnthropicClient } from "@/lib/ai/client";
import { getModelConfig } from "@/lib/ai/models";

export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/clients/[id]/warm-context
 *
 * Dispara una llamada mínima a Anthropic (max_tokens=1) con el system prompt
 * del cliente para sembrar el caché ephemeral antes del primer mensaje real.
 * El primer turno del consultor paga cache_write; los siguientes pagan cache_read
 * (~10% del precio). Fire-and-forget desde ClientTabs.
 */
export async function POST(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ ok: false, reason: "no_key" });
  }

  const [user, client] = await Promise.all([
    requireConsultorForClient(id),
    getClient(id).catch(() => null),
  ]);

  if (!user || !client) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const questionnaire = await getQuestionnaireBundle(id, "doble-materialidad").catch(() => null);
  const systemBlocks = await buildSystemBlocks("aurora", client, questionnaire);
  const config = getModelConfig("aurora", "", 0);

  try {
    const anthropic = createAnthropicClient();
    await anthropic.messages.create(
      {
        model: config.model,
        max_tokens: 1,
        system: systemBlocks,
        messages: [{ role: "user", content: "ok" }],
      },
      { signal: AbortSignal.timeout(20_000) }
    );
  } catch {
    // Fail silently — warm es best-effort
  }

  return NextResponse.json({ ok: true });
}
