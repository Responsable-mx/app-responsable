import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireConsultorForClient } from "@/lib/auth";
import { createAnthropicClient } from "@/lib/ai/client";
import { anthropicBreaker } from "@/lib/ai/circuit-breaker";
import { logAiCall } from "@/lib/ai/logging";
import { getTaskConfig } from "@/lib/ai/models";
import { checkAiRateLimit } from "@/lib/ai/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const GroupSummarySchema = z.object({
  company_name: z.string(),
  tipo_counts: z.record(z.string(), z.number()),
  top_temas: z.array(z.string()),
});

const PostBody = z.object({
  groups_summary: z.array(GroupSummarySchema).min(1).max(20),
  client_sector: z.string().nullable().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY)
    return NextResponse.json({ error: "ANTHROPIC_API_KEY no configurada" }, { status: 500 });

  const limited = await checkAiRateLimit(user, { windowMs: 5 * 60_000, max: 10 });
  if (limited) return NextResponse.json({ error: "Demasiadas solicitudes. Espera 5 minutos." }, { status: 429 });

  if (anthropicBreaker.isOpen)
    return NextResponse.json({ error: anthropicBreaker.userMessage }, { status: 503 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = PostBody.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Datos inválidos", detail: parsed.error.flatten() }, { status: 400 });

  const { groups_summary, client_sector } = parsed.data;

  const sectorCtx = client_sector ? `Sector del cliente: ${client_sector}\n` : "";
  const companiesBlock = groups_summary
    .map((g) => {
      const tipoLines = Object.entries(g.tipo_counts)
        .map(([tipo, n]) => `  - ${tipo}: ${n}`)
        .join("\n");
      const temasLine = g.top_temas.length > 0 ? `  Temas principales: ${g.top_temas.join(", ")}` : "";
      return `**${g.company_name}**\n${tipoLines}\n${temasLine}`;
    })
    .join("\n\n");

  const prompt = `Eres un consultor senior de sostenibilidad y Doble Materialidad (ESRS/CSRD).

${sectorCtx}Se analizaron ${groups_summary.length} empresas de referencia del sector. Aquí está el resumen de sus IROs:

${companiesBlock}

Escribe una narrativa ejecutiva de 3 a 4 párrafos que:
1. Sintetice los patrones de materialidad dominantes en el sector (riesgos e impactos más frecuentes).
2. Identifique las oportunidades más relevantes que el sector está priorizando.
3. Señale los temas ESRS con mayor cobertura y los que tienen menor presencia (posibles brechas).
4. Concluya con una recomendación sobre los temas prioritarios para adaptar al estudio del cliente.

Estilo: directo, profesional, nivel McKinsey. Sin bullets. Sin encabezados. Solo párrafos. Máximo 350 palabras.`;

  const cfg = getTaskConfig("compose");
  const anthropic = createAnthropicClient();
  const t0 = Date.now();

  try {
    const msg = await anthropic.messages.create(
      {
        model: cfg.model,
        max_tokens: cfg.maxTokens,
        system: "Eres un consultor senior de sostenibilidad especializado en Doble Materialidad ESRS/CSRD. Responde en español de México, tono ejecutivo.",
        messages: [{ role: "user", content: prompt }],
      },
      { signal: AbortSignal.timeout(50_000) }
    );

    anthropicBreaker.recordSuccess();

    const narrative = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("")
      .trim();

    void logAiCall({
      userEmail: user,
      role: "aurora",
      clientId: id,
      model: cfg.model,
      inputTokens: msg.usage.input_tokens,
      outputTokens: msg.usage.output_tokens,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      latencyMs: Date.now() - t0,
      error: null,
      workflowStage: "dm_iro_synthesis",
    });

    // Persistir narrativa en dm_benchmark_empresas para sobrevivir recargas
    const admin = createAdminClient();
    void admin
      .from("dm_benchmark_empresas")
      .upsert({ client_id: id, synthesis_narrative: narrative, updated_at: new Date().toISOString() }, { onConflict: "client_id" });

    return NextResponse.json({ data: { narrative } });
  } catch (e) {
    anthropicBreaker.recordFailure();
    const msg = e instanceof Error ? e.message : "Error Anthropic";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
