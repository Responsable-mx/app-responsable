import { NextRequest, NextResponse } from "next/server";
import { createAnthropicClient } from "@/lib/ai/client";
import { requireConsultorForClient } from "@/lib/auth";
import { checkAiRateLimit } from "@/lib/ai/rate-limit";
import { anthropicBreaker } from "@/lib/ai/circuit-breaker";
import { getModelConfig } from "@/lib/ai/models";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAiCall } from "@/lib/ai/logging";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Rate limit: 5 resúmenes ejecutivos por 5 min (Sonnet síncrono ~$0.05-0.10/call)

type Ctx = { params: Promise<{ id: string }> };

type IroRow = {
  n_iro: number;
  tema_esg: string;
  descripcion: string | null;
  tipo: string;
  horizonte: string | null;
  score_impacto: number | null;
  score_financiero: number | null;
};

// ── GET: retorna el último resumen ejecutivo ─────────────────────────────────

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const admin = createAdminClient();
  const { data } = await admin
    .from("dm_resumenes")
    .select("status, content, created_at, error_msg")
    .eq("client_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return NextResponse.json({ data: data ?? null });
}

// ── POST: genera un nuevo resumen ejecutivo (síncrono, max 45s) ──────────────

export async function POST(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const rl = await checkAiRateLimit(user, {
    max: 5,
    windowMs: 5 * 60_000,
    errorMessage: "Demasiadas solicitudes de resumen. Espera 5 minutos antes de reintentar.",
  });
  if (rl) return NextResponse.json({ error: rl.message }, { status: 429 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY no configurada" }, { status: 500 });
  }

  if (anthropicBreaker.isOpen) {
    return NextResponse.json({ error: anthropicBreaker.userMessage }, { status: 503 });
  }

  const admin = createAdminClient();

  // Cargar cliente
  const { data: client, error: clientErr } = await admin
    .from("clients")
    .select("id, name, sector")
    .eq("id", id)
    .single();

  if (clientErr || !client) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  }

  // Cargar IROs incluidos ordenados por score consolidado desc
  const { data: irosRaw } = await admin
    .from("client_iro_inventory")
    .select("n_iro, tema_esg, descripcion, tipo, horizonte, score_impacto, score_financiero")
    .eq("client_id", id)
    .eq("incluido", true)
    .order("score_impacto", { ascending: false });

  const iros = ((irosRaw ?? []) as IroRow[])
    .sort((a, b) => {
      const scoreA = (a.score_impacto ?? 0) + (a.score_financiero ?? 0);
      const scoreB = (b.score_impacto ?? 0) + (b.score_financiero ?? 0);
      return scoreB - scoreA;
    })
    .slice(0, 15);

  // Cargar narrativa benchmark más reciente
  const { data: benchmarkRow } = await admin
    .from("dm_benchmark_results")
    .select("narrative")
    .eq("client_id", id)
    .eq("status", "done")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const benchmarkNarrative = benchmarkRow?.narrative ?? "Sin datos de benchmark disponibles para este cliente.";

  // Construir lista de IROs para el prompt
  const irosList = iros.length
    ? iros
        .map((iro) => {
          const scoreConsolidado = Math.max(iro.score_impacto ?? 0, iro.score_financiero ?? 0);
          return `- [${iro.n_iro}] ${iro.tema_esg} — tipo: ${iro.tipo} — score_impacto: ${iro.score_impacto ?? 0}/3 — score_financiero: ${iro.score_financiero ?? 0}/3 — score_consolidado: ${scoreConsolidado}/3 — horizonte: ${iro.horizonte ?? "no especificado"}\n  ${iro.descripcion ?? ""}`;
        })
        .join("\n")
    : "No hay IROs materiales registrados para este cliente.";

  const prompt = `Eres un consultor senior de sostenibilidad. Genera un resumen ejecutivo de doble materialidad para ${client.name} (sector: ${client.sector ?? "no especificado"}).

CONTEXTO BENCHMARK:
${benchmarkNarrative}

INVENTARIO DE IROs MATERIALES (ordenados por score consolidado):
${irosList}

Genera el resumen ejecutivo con esta estructura EXACTA en Markdown:

## Contexto del análisis
[2-3 oraciones: sector, alcance, marco ESRS/NEIS, naturaleza de IROs]

## Temas de mayor materialidad
[Tabla Markdown con top 5: | Tema | Categoría | Score impacto | Score financiero | Horizonte | Por qué es prioritario |]

## Principales riesgos financieros
[3-4 oraciones. Los 2-3 riesgos con mayor score financiero. Lenguaje de negocio para Dirección General. Sin tecnicismos: sin "IRO", "ESRS", "materialidad".]

## Principales oportunidades
[3-4 oraciones. Las 2-3 oportunidades de mayor score y mayor potencial. Vincular con benchmark sectorial cuando sea posible.]

## Recomendación estratégica
[2-3 oraciones. Acción prioritaria inmediata + horizonte. Tono ejecutivo.]

Responde SOLO en español (es-MX). Sin preámbulos.`;

  // Insertar registro en estado pending
  const { data: newRow, error: insertErr } = await admin
    .from("dm_resumenes")
    .insert({
      client_id: id,
      status: "pending",
      created_by: user,
    })
    .select("id")
    .single();

  if (insertErr || !newRow) {
    return NextResponse.json({ error: "Error al inicializar registro de resumen" }, { status: 500 });
  }

  const model = getModelConfig("aurora").model;
  const startMs = Date.now();
  let content: string | null = null;
  let callError: string | null = null;
  let inputTokens = 0, outputTokens = 0, cacheCreationTokens = 0, cacheReadTokens = 0;

  try {
    const anthropic = createAnthropicClient();
    const response = await anthropic.messages.create(
      {
        model,
        max_tokens: 2000,
        system: [
          {
            type: "text",
            text: "Eres un consultor senior de sostenibilidad especializado en Doble Materialidad (ESRS/GRI/CSRD). Redactas resúmenes ejecutivos claros, accionables y en español de México.",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cache_control: { type: "ephemeral" } as any,
          },
        ],
        messages: [{ role: "user", content: prompt }],
      },
      { signal: AbortSignal.timeout(45_000) }
    );

    anthropicBreaker.recordSuccess();

    inputTokens = response.usage?.input_tokens ?? 0;
    outputTokens = response.usage?.output_tokens ?? 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cacheCreationTokens = (response.usage as any)?.cache_creation_input_tokens ?? 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cacheReadTokens = (response.usage as any)?.cache_read_input_tokens ?? 0;

    content = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

  } catch (e) {
    anthropicBreaker.recordFailure();
    callError = e instanceof Error ? e.message : "Error Anthropic";
  }

  const latencyMs = Date.now() - startMs;

  void logAiCall({
    userEmail: user,
    role: "aurora",
    clientId: id,
    model,
    inputTokens,
    outputTokens,
    cacheCreationTokens,
    cacheReadTokens,
    latencyMs,
    error: callError,
  });

  if (callError || !content) {
    await admin
      .from("dm_resumenes")
      .update({ status: "failed", error_msg: callError ?? "Respuesta vacía de la IA" })
      .eq("id", newRow.id);

    return NextResponse.json(
      { error: callError ?? "Error generando el resumen" },
      { status: 500 }
    );
  }

  await admin
    .from("dm_resumenes")
    .update({ status: "done", content })
    .eq("id", newRow.id);

  return NextResponse.json({ data: { status: "done", content } });
}
