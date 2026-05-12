import { NextRequest, NextResponse } from "next/server";
import { createAnthropicClient } from "@/lib/ai/client";
import { z } from "zod";
import { requireConsultorForClient } from "@/lib/auth";
import { anthropicBreaker } from "@/lib/ai/circuit-breaker";
import { getClient } from "@/lib/clients";
import { extractJsonObject } from "@/lib/ai/extract-json";
import { logAiCall } from "@/lib/ai/logging";
import { getModelConfig } from "@/lib/ai/models";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPublicHttpUrl } from "@/lib/documents/ssrf";
import type { ReferentesData, ReferenteFramework, TopicRaw, TopicGrouped } from "@/lib/dm/referentes-types";

export const runtime    = "nodejs";
export const maxDuration = 180;
export const dynamic    = "force-dynamic";

// ── Schemas ───────────────────────────────────────────────────────────────────

const PatchBody = z.object({
  enabled_frameworks: z.array(z.string()).min(1).max(20),
});

const FrameworkSchema = z.object({
  id:          z.string().min(1).max(50),
  name:        z.string().min(1).max(100),
  description: z.string().min(1).max(600),
  url:         z.string().optional().nullable(),
  sector_note: z.string().optional().nullable(),
});

const FrameworksResponseSchema = z.object({
  frameworks: z.array(FrameworkSchema).min(1).max(15),
});

const TopicRawSchema = z.object({
  tema:        z.string().min(1).max(200),
  subtema:     z.string().optional().nullable(),
  descripcion: z.string().min(1).max(800),
  referente:   z.string().min(1).max(50),
});

const TopicGroupedSchema = z.object({
  tema_consolidado:        z.string().min(1).max(200),
  descripcion_consolidada: z.string().min(1).max(1000),
  referentes:              z.array(z.string()).min(1),
});

const TopicsResponseSchema = z.object({
  coverage_score: z.number().min(1).max(10),
  coverage_note:  z.string().min(1).max(500),
  topics_raw:     z.array(TopicRawSchema).min(1).max(200),
  topics_grouped: z.array(TopicGroupedSchema).min(1).max(50),
});

type Ctx = { params: Promise<{ id: string }> };

// ── URL validation ────────────────────────────────────────────────────────────

async function validateUrl(url: string): Promise<boolean> {
  const guard = isPublicHttpUrl(url);
  if (!guard.ok) return false;
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(5_000),
      headers: { "User-Agent": "ResponSable-ReferentesCheck/1.0" },
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function sanitizeFrameworkUrls(frameworks: ReferenteFramework[]): Promise<ReferenteFramework[]> {
  return Promise.all(
    frameworks.map(async (f) => {
      if (!f.url) return f;
      const valid = await validateUrl(f.url);
      if (!valid) {
        console.warn(`[dm-referentes] URL inválida/404 para ${f.id}: ${f.url}`);
        return { ...f, url: null };
      }
      return f;
    }),
  );
}

// ── Prompts ───────────────────────────────────────────────────────────────────

function buildFrameworksPrompt(sector: string, industry: string | null, countries: string): string {
  return `Eres un experto en estándares de sostenibilidad y reporting ESG.

CONTEXTO DEL CLIENTE:
- Sector: ${sector}
- Industria: ${industry ?? "no especificada"}
- Países de operación: ${countries}

TAREA: Proponer los marcos de referencia de sostenibilidad aplicables a este cliente para un Estudio de Doble Materialidad.

REGLAS:
1. Siempre incluir: SASB (con estándar sectorial si aplica), GRI Standards, ESRS (estándares europeos).
2. Incluir referentes sectoriales específicos si aplican: IPIECA (oil & gas), GCCA (cemento/concreto), PRI (inversión/finanzas), TCFD (finanzas/clima), GRESB (real estate), etc.
3. Por cada referente: id corto (ej. "SASB"), nombre completo, descripción de 2-3 oraciones, URL oficial si la conoces con certeza, nota sobre por qué es relevante para este sector.
4. Máximo 8 referentes — solo los realmente aplicables. No inventar estándares.
5. Responde ÚNICAMENTE con JSON válido, sin markdown ni texto adicional.

{
  "frameworks": [
    {
      "id": "SASB",
      "name": "SASB Standards",
      "description": "...",
      "url": "https://sasb.ifrs.org",
      "sector_note": "..."
    }
  ]
}`;
}

function buildTopicsPrompt(
  sector: string,
  clientName: string,
  frameworks: ReferenteFramework[],
): string {
  const frameworksList = frameworks
    .map((f) => `- ${f.id}: ${f.name}${f.sector_note ? ` (${f.sector_note})` : ""}`)
    .join("\n");

  return `Eres un experto en materialidad ESG y reporting de sostenibilidad.

CLIENTE: ${clientName}
SECTOR: ${sector}

MARCOS DE REFERENCIA VALIDADOS:
${frameworksList}

TAREA 1 — TABLA DE TEMAS (raw, fiel a fuentes):
Genera una tabla extrayendo fielmente los temas de sostenibilidad que cada referente menciona para este sector.
- NO agrupar, NO emitir juicio propio.
- Solo información proveniente de los referentes listados.
- Máximo 150 filas.

TAREA 2 — TABLA AGRUPADA:
Agrupa los temas de la tabla raw en temas comunes. Consolida descripciones sin omitir aspectos de riesgo, oportunidad o impacto. No inventar nada.

TAREA 3 — AUTOEVALUACIÓN:
Evalúa del 1 al 10 qué tan completo está el mapeo. Justifica en 2-3 oraciones.

Responde ÚNICAMENTE con JSON válido:
{
  "coverage_score": 8.5,
  "coverage_note": "El mapeo cubre los temas materiales principales del sector...",
  "topics_raw": [
    { "tema": "Cambio climático", "subtema": "Emisiones GEI Alcance 1 y 2", "descripcion": "...", "referente": "GRI" }
  ],
  "topics_grouped": [
    { "tema_consolidado": "Cambio climático y emisiones", "descripcion_consolidada": "...", "referentes": ["GRI", "ESRS", "SASB"] }
  ]
}`;
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("dm_referentes")
    .select("*")
    .eq("client_id", id)
    .maybeSingle();

  if (error) {
    console.error("[dm-referentes GET]", error);
    return NextResponse.json({ error: "Error de base de datos" }, { status: 500 });
  }

  return NextResponse.json({ data: data as ReferentesData | null });
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (anthropicBreaker.isOpen) {
    return NextResponse.json({ error: anthropicBreaker.userMessage }, { status: 503 });
  }

  const body = await req.json().catch(() => null) as { action?: string } | null;
  if (!body?.action) return NextResponse.json({ error: "action requerido" }, { status: 400 });

  const client = await getClient(id).catch(() => null);
  if (!client) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

  const admin  = createAdminClient();
  const { model } = getModelConfig("aurora");

  // ── Action: generate_frameworks ─────────────────────────────────────────────
  if (body.action === "generate_frameworks") {
    await admin.from("dm_referentes").upsert({
      client_id: id,
      frameworks_status: "generating",
      updated_at: new Date().toISOString(),
    }, { onConflict: "client_id" });

    const sector    = client.sector ?? "no especificado";
    const industry  = (client as Record<string, unknown>).industry as string | null ?? null;
    const countries = (client.countries as string[] | null)?.join(", ") ?? "México";
    const prompt    = buildFrameworksPrompt(sector, industry, countries);

    const anthropic  = createAnthropicClient();
    let textOut = "", inputTokens = 0, outputTokens = 0, cacheCreationTokens = 0, cacheReadTokens = 0;
    const startedAt = Date.now();

    try {
      const msg = await anthropic.messages.create({
        model,
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      }, { signal: AbortSignal.timeout(120_000) });

      inputTokens         = msg.usage?.input_tokens ?? 0;
      outputTokens        = msg.usage?.output_tokens ?? 0;
      cacheCreationTokens = msg.usage?.cache_creation_input_tokens ?? 0;
      cacheReadTokens     = msg.usage?.cache_read_input_tokens ?? 0;
      for (const block of msg.content) {
        if (block.type === "text") textOut += block.text;
      }
      anthropicBreaker.recordSuccess();
    } catch (e) {
      anthropicBreaker.recordFailure();
      const errMsg = e instanceof Error ? e.message : "Error Anthropic";
      void logAiCall({ userEmail: user, role: "aurora", clientId: id, model, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, latencyMs: Date.now() - startedAt, error: errMsg });
      await admin.from("dm_referentes").upsert({ client_id: id, frameworks_status: "failed", updated_at: new Date().toISOString() }, { onConflict: "client_id" });
      return NextResponse.json({ error: errMsg }, { status: 500 });
    }

    void logAiCall({ userEmail: user, role: "aurora", clientId: id, model, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, latencyMs: Date.now() - startedAt, error: null });

    const jsonText   = extractJsonObject(textOut);
    if (!jsonText) {
      console.error("[dm-referentes generate_frameworks] textOut sin JSON:", JSON.stringify(textOut.slice(0, 800)));
      await admin.from("dm_referentes").upsert({ client_id: id, frameworks_status: "failed", updated_at: new Date().toISOString() }, { onConflict: "client_id" });
      return NextResponse.json({ error: "Respuesta IA sin JSON" }, { status: 502 });
    }
    const validated = FrameworksResponseSchema.safeParse(JSON.parse(jsonText));
    if (!validated.success) {
      await admin.from("dm_referentes").upsert({ client_id: id, frameworks_status: "failed", updated_at: new Date().toISOString() }, { onConflict: "client_id" });
      return NextResponse.json({ error: "Schema IA inválido" }, { status: 502 });
    }

    const frameworks = await sanitizeFrameworkUrls(validated.data.frameworks as ReferenteFramework[]);
    await admin.from("dm_referentes").upsert({
      client_id: id,
      proposed_frameworks: frameworks,
      enabled_frameworks:  frameworks.map((f) => f.id),
      frameworks_status: "done",
      updated_at: new Date().toISOString(),
    }, { onConflict: "client_id" });

    return NextResponse.json({ data: { frameworks, enabled_frameworks: frameworks.map((f) => f.id) } });
  }

  // ── Action: generate_topics ─────────────────────────────────────────────────
  if (body.action === "generate_topics") {
    const { data: rec } = await admin
      .from("dm_referentes")
      .select("proposed_frameworks, enabled_frameworks")
      .eq("client_id", id)
      .maybeSingle();

    const proposed = (rec?.proposed_frameworks ?? []) as ReferenteFramework[];
    const enabled  = (rec?.enabled_frameworks  ?? []) as string[];
    const active   = proposed.filter((f) => enabled.includes(f.id));

    if (active.length === 0) {
      return NextResponse.json({ error: "Valida al menos un referente antes de generar la tabla" }, { status: 400 });
    }

    await admin.from("dm_referentes").upsert({
      client_id: id,
      topics_status: "generating",
      updated_at: new Date().toISOString(),
    }, { onConflict: "client_id" });

    const prompt    = buildTopicsPrompt(client.sector ?? "no especificado", client.name, active);
    const anthropic = createAnthropicClient();
    let textOut = "", inputTokens = 0, outputTokens = 0, cacheCreationTokens = 0, cacheReadTokens = 0;
    const startedAt = Date.now();

    try {
      const msg = await anthropic.messages.create({
        model,
        max_tokens: 8000,
        messages: [{ role: "user", content: prompt }],
      }, { signal: AbortSignal.timeout(150_000) });

      inputTokens         = msg.usage?.input_tokens ?? 0;
      outputTokens        = msg.usage?.output_tokens ?? 0;
      cacheCreationTokens = msg.usage?.cache_creation_input_tokens ?? 0;
      cacheReadTokens     = msg.usage?.cache_read_input_tokens ?? 0;
      for (const block of msg.content) {
        if (block.type === "text") textOut += block.text;
      }
      anthropicBreaker.recordSuccess();
    } catch (e) {
      anthropicBreaker.recordFailure();
      const errMsg = e instanceof Error ? e.message : "Error Anthropic";
      void logAiCall({ userEmail: user, role: "aurora", clientId: id, model, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, latencyMs: Date.now() - startedAt, error: errMsg });
      await admin.from("dm_referentes").upsert({ client_id: id, topics_status: "failed", updated_at: new Date().toISOString() }, { onConflict: "client_id" });
      return NextResponse.json({ error: errMsg }, { status: 500 });
    }

    void logAiCall({ userEmail: user, role: "aurora", clientId: id, model, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, latencyMs: Date.now() - startedAt, error: null });

    const jsonText  = extractJsonObject(textOut);
    if (!jsonText) {
      await admin.from("dm_referentes").upsert({ client_id: id, topics_status: "failed", updated_at: new Date().toISOString() }, { onConflict: "client_id" });
      return NextResponse.json({ error: "Respuesta IA sin JSON" }, { status: 502 });
    }
    const validated = TopicsResponseSchema.safeParse(JSON.parse(jsonText));
    if (!validated.success) {
      await admin.from("dm_referentes").upsert({ client_id: id, topics_status: "failed", updated_at: new Date().toISOString() }, { onConflict: "client_id" });
      return NextResponse.json({ error: "Schema IA inválido" }, { status: 502 });
    }

    const { coverage_score, coverage_note, topics_raw, topics_grouped } = validated.data;
    await admin.from("dm_referentes").upsert({
      client_id: id,
      coverage_score,
      coverage_note,
      topics_raw:     topics_raw as TopicRaw[],
      topics_grouped: topics_grouped as TopicGrouped[],
      topics_status: "done",
      updated_at: new Date().toISOString(),
    }, { onConflict: "client_id" });

    return NextResponse.json({ data: { coverage_score, coverage_note, topics_raw, topics_grouped } });
  }

  return NextResponse.json({ error: "action no reconocido" }, { status: 400 });
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body    = await req.json().catch(() => null);
  const parsed  = PatchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("dm_referentes").upsert({
    client_id: id,
    enabled_frameworks: parsed.data.enabled_frameworks,
    updated_at: new Date().toISOString(),
  }, { onConflict: "client_id" });

  if (error) {
    console.error("[dm-referentes PATCH]", error);
    return NextResponse.json({ error: "Error de base de datos" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
