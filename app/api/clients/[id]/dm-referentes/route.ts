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
import { checkAiRateLimit } from "@/lib/ai/rate-limit";
import type { ReferentesData, ReferenteFramework, TopicRaw, TopicGrouped } from "@/lib/dm/referentes-types";

export const runtime    = "nodejs";
export const maxDuration = 180;
export const dynamic    = "force-dynamic";

// ── Schemas ───────────────────────────────────────────────────────────────────

const PatchBody = z.object({
  enabled_frameworks: z.array(z.string()).min(1).max(20),
});

const UpdateFrameworkBody = z.object({
  action: z.literal("update_framework"),
  id:     z.string().min(1).max(50),
  url:    z.union([z.string().url(), z.literal(""), z.null()]).optional(),
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
  descripcion: z.string().min(1).max(3000),
  referente:   z.string().min(1).max(50),
});

const TopicGroupedSchema = z.object({
  tema_consolidado:        z.string().min(1).max(200),
  descripcion_consolidada: z.string().min(1).max(3000),
  referentes:              z.array(z.string()).min(1),
});

const TopicsResponseSchema = z.object({
  coverage_score: z.number().min(0).max(10),
  coverage_note:  z.string().min(1).max(1000),
  topics_raw:     z.array(TopicRawSchema).min(1).max(200),
  topics_grouped: z.array(TopicGroupedSchema).min(1).max(50),
});

type Ctx = { params: Promise<{ id: string }> };


function sanitizeFrameworkUrls(frameworks: ReferenteFramework[]): ReferenteFramework[] {
  return frameworks.map((f) => {
    if (!f.url) return f;
    if (!isPublicHttpUrl(f.url).ok) {
      console.warn(`[dm-referentes] URL rechazada por SSRF guard para ${f.id}: ${f.url}`);
      return { ...f, url: null };
    }
    return f;
  });
}

// ── Prompts ───────────────────────────────────────────────────────────────────

// Bloque estático — cacheable con cache_control ephemeral
const FRAMEWORKS_SYSTEM = `Eres un experto en estándares de sostenibilidad y reporting ESG.

TAREA: Proponer los marcos de referencia de sostenibilidad aplicables a un cliente para un Estudio de Doble Materialidad.

REGLAS:
1. Siempre incluir: SASB (con estándar sectorial si aplica), GRI Standards, ESRS (estándares europeos).
2. Incluir referentes sectoriales específicos si aplican: IPIECA (oil & gas), GCCA (cemento/concreto), PRI (inversión/finanzas), TCFD (finanzas/clima), GRESB (real estate), etc.
3. Por cada referente: id corto (ej. "SASB"), nombre completo, descripción de 2-3 oraciones, URL oficial si la conoces con certeza, nota sobre por qué es relevante para este sector.
4. Máximo 8 referentes — solo los realmente aplicables. No inventar estándares.
5. Responde ÚNICAMENTE con JSON válido, sin markdown ni texto adicional.

{"frameworks":[{"id":"SASB","name":"SASB Standards","description":"...","url":"https://sasb.ifrs.org","sector_note":"..."}]}`;

const TOPICS_SYSTEM = `Eres un experto en materialidad ESG y reporting de sostenibilidad.

TAREA 1 — TABLA DE TEMAS (raw, fiel a fuentes):
Genera una tabla extrayendo fielmente los temas de sostenibilidad que cada referente menciona para este sector.
- NO agrupar, NO emitir juicio propio.
- Solo información proveniente de los referentes listados.
- Máximo 80 filas. Sé conciso en las descripciones (máx 2 oraciones por fila).

TAREA 2 — TABLA AGRUPADA:
Agrupa los temas de la tabla raw en temas comunes. Consolida descripciones sin omitir aspectos de riesgo, oportunidad o impacto. No inventar nada. Máximo 30 grupos.

TAREA 3 — AUTOEVALUACIÓN:
Evalúa del 1 al 10 qué tan completo está el mapeo. Justifica en 2-3 oraciones.

Responde ÚNICAMENTE con JSON válido:
{"coverage_score":8.5,"coverage_note":"...","topics_raw":[{"tema":"Cambio climático","subtema":"Emisiones GEI Alcance 1 y 2","descripcion":"...","referente":"GRI"}],"topics_grouped":[{"tema_consolidado":"Cambio climático y emisiones","descripcion_consolidada":"...","referentes":["GRI","ESRS","SASB"]}]}`;

function buildFrameworksUserContent(sector: string, industry: string | null, countries: string): string {
  return `CONTEXTO DEL CLIENTE:
- Sector: ${sector}
- Industria: ${industry ?? "no especificada"}
- Países de operación: ${countries}`;
}

function buildTopicsUserContent(
  sector: string,
  clientName: string,
  frameworks: ReferenteFramework[],
): string {
  const frameworksList = frameworks
    .map((f) => `- ${f.id}: ${f.name}${f.sector_note ? ` (${f.sector_note})` : ""}`)
    .join("\n");

  return `CLIENTE: ${clientName}
SECTOR: ${sector}

MARCOS DE REFERENCIA VALIDADOS:
${frameworksList}`;
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

  const admin  = createAdminClient();

  // ── Action: update_framework (editar URL manualmente) ──────────────────────
  if (body.action === "update_framework") {
    const parsed = UpdateFrameworkBody.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { id: frameworkId, url } = parsed.data;

    const { data: rec } = await admin
      .from("dm_referentes")
      .select("proposed_frameworks")
      .eq("client_id", id)
      .maybeSingle();

    const proposed = (rec?.proposed_frameworks ?? []) as ReferenteFramework[];
    const updated  = proposed.map((f) =>
      f.id === frameworkId
        ? { ...f, url: (url === "" || url === null) ? null : url }
        : f
    );

    const { error } = await admin.from("dm_referentes").upsert({
      client_id: id,
      proposed_frameworks: updated,
      updated_at: new Date().toISOString(),
    }, { onConflict: "client_id" });

    if (error) {
      console.error("[dm-referentes update_framework]", error);
      return NextResponse.json({ error: "Error de base de datos" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  const client = await getClient(id).catch(() => null);
  if (!client) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

  const { model } = getModelConfig("aurora");

  // ── Action: generate_frameworks ─────────────────────────────────────────────
  if (body.action === "generate_frameworks") {
    const rl = await checkAiRateLimit(user, { max: 3, windowMs: 5 * 60_000, errorMessage: "Demasiadas solicitudes de marcos. Espera 5 minutos." });
    if (rl) return NextResponse.json({ error: rl.message }, { status: 429 });

    await admin.from("dm_referentes").upsert({
      client_id: id,
      frameworks_status: "generating",
      updated_at: new Date().toISOString(),
    }, { onConflict: "client_id" });

    const sector    = client.sector ?? "no especificado";
    const industry  = (client as Record<string, unknown>).industry as string | null ?? null;
    const countries = (client.countries as string[] | null)?.join(", ") ?? "México";
    const userContent = buildFrameworksUserContent(sector, industry, countries);

    // Cache de sector: si otro cliente del mismo sector ya tiene frameworks recientes, copiar sin IA
    if (sector !== "no especificado") {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: peerClients } = await admin
        .from("clients")
        .select("id")
        .eq("sector", sector)
        .neq("id", id)
        .limit(20);

      if (peerClients && peerClients.length > 0) {
        const peerIds = (peerClients as { id: string }[]).map((c) => c.id);
        const { data: peerRef } = await admin
          .from("dm_referentes")
          .select("proposed_frameworks, enabled_frameworks")
          .in("client_id", peerIds)
          .eq("frameworks_status", "done")
          .gte("updated_at", thirtyDaysAgo)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (peerRef?.proposed_frameworks) {
          const frameworks = sanitizeFrameworkUrls(peerRef.proposed_frameworks as ReferenteFramework[]);
          await admin.from("dm_referentes").upsert({
            client_id: id,
            proposed_frameworks: frameworks,
            enabled_frameworks: frameworks.map((f) => f.id),
            frameworks_status: "done",
            updated_at: new Date().toISOString(),
          }, { onConflict: "client_id" });
          return NextResponse.json({ data: { frameworks, enabled_frameworks: frameworks.map((f) => f.id), cached: true } });
        }
      }
    }

    const anthropic  = createAnthropicClient();
    let textOut = "", inputTokens = 0, outputTokens = 0, cacheCreationTokens = 0, cacheReadTokens = 0;
    const startedAt = Date.now();

    try {
      const msg = await anthropic.messages.create({
        model,
        max_tokens: 4000,
        system: [{ type: "text", text: FRAMEWORKS_SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userContent }],
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
      void logAiCall({ userEmail: user, role: "aurora", clientId: id, model, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, latencyMs: Date.now() - startedAt, error: errMsg, workflowStage: "dm_referentes" });
      await admin.from("dm_referentes").upsert({ client_id: id, frameworks_status: "failed", updated_at: new Date().toISOString() }, { onConflict: "client_id" });
      return NextResponse.json({ error: errMsg }, { status: 500 });
    }

    void logAiCall({ userEmail: user, role: "aurora", clientId: id, model, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, latencyMs: Date.now() - startedAt, error: null, workflowStage: "dm_referentes" });

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

    const frameworks = sanitizeFrameworkUrls(validated.data.frameworks as ReferenteFramework[]);
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
    const rl = await checkAiRateLimit(user, { max: 3, windowMs: 5 * 60_000, errorMessage: "Demasiadas solicitudes de temas. Espera 5 minutos." });
    if (rl) return NextResponse.json({ error: rl.message }, { status: 429 });
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

    const userContent = buildTopicsUserContent(client.sector ?? "no especificado", client.name, active);
    const anthropic = createAnthropicClient();
    let textOut = "", inputTokens = 0, outputTokens = 0, cacheCreationTokens = 0, cacheReadTokens = 0;
    const startedAt = Date.now();

    try {
      const msg = await anthropic.messages.create({
        model,
        max_tokens: 16000,
        system: [{ type: "text", text: TOPICS_SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userContent }],
      }, { signal: AbortSignal.timeout(170_000) });

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
      void logAiCall({ userEmail: user, role: "aurora", clientId: id, model, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, latencyMs: Date.now() - startedAt, error: errMsg, workflowStage: "dm_referentes" });
      await admin.from("dm_referentes").upsert({ client_id: id, topics_status: "failed", updated_at: new Date().toISOString() }, { onConflict: "client_id" });
      return NextResponse.json({ error: errMsg }, { status: 500 });
    }

    void logAiCall({ userEmail: user, role: "aurora", clientId: id, model, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, latencyMs: Date.now() - startedAt, error: null, workflowStage: "dm_referentes" });

    const jsonText  = extractJsonObject(textOut);
    if (!jsonText) {
      await admin.from("dm_referentes").upsert({ client_id: id, topics_status: "failed", updated_at: new Date().toISOString() }, { onConflict: "client_id" });
      return NextResponse.json({ error: "Respuesta IA sin JSON" }, { status: 502 });
    }
    const validated = TopicsResponseSchema.safeParse(JSON.parse(jsonText));
    if (!validated.success) {
      console.error("[dm-referentes generate_topics] schema inválido:", JSON.stringify(validated.error.flatten()));
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

  // ── Action: search_urls ────────────────────────────────────────────────────────
  if (body.action === "search_urls") {
    const { data: rec } = await admin
      .from("dm_referentes")
      .select("proposed_frameworks")
      .eq("client_id", id)
      .maybeSingle();

    const proposed = (rec?.proposed_frameworks ?? []) as ReferenteFramework[];
    const missing  = proposed.filter((f) => !f.url);

    if (missing.length === 0) {
      return NextResponse.json({ data: { updated: 0, total: 0 } });
    }

    // URLs canónicas hardcoded — más confiables que LLM para frameworks estables
    const CANONICAL_URLS: Record<string, string> = {
      GRI:      "https://www.globalreporting.org/standards/",
      SASB:     "https://sasb.ifrs.org/standards/",
      ESRS:     "https://www.efrag.org/en/projects/esrs-set-1",
      TCFD:     "https://www.fsb-tcfd.org/recommendations/",
      CDP:      "https://www.cdp.net/en/guidance",
      IPIECA:   "https://www.ipieca.org/resources/good-practice/ipieca-iog-api-sustainability-reporting-guidance/",
      PRI:      "https://www.unpri.org/reporting-and-assessment/about-pri-reporting/1138.article",
      GRESB:    "https://www.gresb.com/nl-en/",
      GCCA:     "https://gccassociation.org/sustainability-innovation/gcca-sustainability-guidelines/",
      ISO26000: "https://www.iso.org/iso-26000-social-responsibility.html",
      GHG:      "https://ghgprotocol.org/corporate-standard",
      SBTI:     "https://sciencebasedtargets.org/resources/",
      CSRD:     "https://finance.ec.europa.eu/capital-markets-union-and-financial-markets/company-reporting-and-auditing/company-reporting/corporate-sustainability-reporting_en",
      TNFD:     "https://tnfd.global/reporting/",
      SDG:      "https://sdgs.un.org/goals",
      SDGS:     "https://sdgs.un.org/goals",
    };

    let updated = 0;
    const updatedProposed = [...proposed];
    const stillMissing: ReferenteFramework[] = [];

    // Paso 1: llenar desde mapa hardcoded
    for (const f of missing) {
      const key = f.id.toUpperCase().replace(/[\s-]/g, "");
      const canonical = CANONICAL_URLS[key] ?? CANONICAL_URLS[f.id];
      if (canonical) {
        const idx = updatedProposed.findIndex((p) => p.id === f.id);
        if (idx !== -1) { updatedProposed[idx] = { ...updatedProposed[idx]!, url: canonical } as ReferenteFramework; updated++; }
      } else {
        stillMissing.push(f);
      }
    }

    // Paso 2: web_search para frameworks no conocidos
    if (stillMissing.length > 0) {
      const anthropic = createAnthropicClient();
      const { model: searchModel } = getModelConfig("aurora");

      const CONCURRENCY = 3;
      for (let i = 0; i < stillMissing.length; i += CONCURRENCY) {
        const batch = stillMissing.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(
          batch.map(async (f) => {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Anthropic SDK beta: web_search
              const msg = await (anthropic.messages.create as (opts: unknown, extra?: unknown) => Promise<any>)(
                {
                  model: searchModel,
                  max_tokens: 800,
                  system: [{ type: "text" as const, text: "You are an ESG framework URL finder. Use web_search to find the official URL for ESG/sustainability frameworks. Always call web_search before submit_url. Return only the official canonical URL.", cache_control: { type: "ephemeral" as const } }],
                  tools: [
                    { type: "web_search_20250305", name: "web_search", max_uses: 2 },
                    {
                      name: "submit_url",
                      description: "Submit the official URL for the ESG framework.",
                      input_schema: {
                        type: "object",
                        properties: { url: { type: "string", description: "Official URL or empty string if not found." } },
                        required: ["url"],
                      },
                    },
                  ],
                  messages: [{
                    role: "user",
                    content: `MANDATORY: Call web_search before submit_url. Find the official standards/guidance page for the ESG framework "${f.name}" (id: ${f.id}). Search for "${f.name} official standards" or "${f.name} reporting framework site". Call submit_url with the main official URL. If not found, call submit_url with url: "".`,
                  }],
                },
                { signal: AbortSignal.timeout(40_000) }
              );

              let foundUrl: string | null = null;
              for (const block of msg.content ?? []) {
                if (block.type === "tool_use" && block.name === "submit_url") {
                  const url = (block.input as { url?: string })?.url?.trim();
                  if (url && url.length > 10 && url.startsWith("http")) foundUrl = url;
                }
              }
              console.log(`[dm-referentes search_urls] ${f.id}: url=${foundUrl}`);
              return { id: f.id, url: foundUrl };
            } catch (err) {
              console.error(`[dm-referentes search_urls] ${f.id}: ERROR ${err instanceof Error ? err.message : String(err)}`);
              return { id: f.id, url: null };
            }
          })
        );

        for (const result of results) {
          if (result.status === "fulfilled" && result.value.url) {
            const candidate = result.value.url;
            if (isPublicHttpUrl(candidate).ok) {
              const idx = updatedProposed.findIndex((p) => p.id === result.value.id);
              if (idx !== -1) { updatedProposed[idx] = { ...updatedProposed[idx]!, url: candidate } as ReferenteFramework; updated++; }
            }
          }
        }
      }
    }

    if (updated > 0) {
      await admin.from("dm_referentes").upsert({
        client_id: id,
        proposed_frameworks: updatedProposed,
        updated_at: new Date().toISOString(),
      }, { onConflict: "client_id" });
    }

    return NextResponse.json({ data: { updated, total: missing.length } });
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
