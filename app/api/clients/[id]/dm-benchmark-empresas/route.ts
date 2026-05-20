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
import type {
  BenchmarkEmpresasData,
  BenchmarkEmpresa,
  BenchmarkEmpresaCriterio,
} from "@/lib/dm/benchmark-empresas-types";

export const runtime    = "nodejs";
export const maxDuration = 300;
export const dynamic    = "force-dynamic";

// ── Schemas ───────────────────────────────────────────────────────────────────

const PatchBody = z.object({
  enabled_companies: z.array(z.string()).max(50),
});

const EmpresaSchema = z.object({
  id:                   z.string().min(1).max(80),
  nombre:               z.string().min(1).max(200),
  pais:                 z.string().min(1).max(100),
  reporte_url:          z.string().url().optional().nullable(),
  metodologia:          z.array(z.string().min(1).max(30)).min(1).max(8),
  criterio:             z.enum(["competidores_directos","sp_yearbook","internacionales","conglomerados","b2b"]),
  subsector:            z.string().max(200).optional().nullable(),
  justificacion:        z.string().max(800).optional().nullable(),
  recommendation_score: z.number().min(1).max(10).optional().nullable(),
});

const AddCompanyBody = z.object({
  action:   z.literal("add_company"),
  nombre:   z.string().min(1).max(200),
  pais:     z.string().min(1).max(100),
  reporte_url: z.string().url().optional().nullable(),
  metodologia: z.array(z.string().min(1).max(30)).min(1).max(8),
  criterio: z.enum(["competidores_directos","sp_yearbook","internacionales","conglomerados","b2b"]),
  subsector:z.string().max(200).optional().nullable(),
});

const UpdateCompanyBody = z.object({
  action:      z.literal("update_company"),
  id:          z.string().min(1).max(80),
  nombre:      z.string().min(1).max(200).optional(),
  pais:        z.string().min(1).max(100).optional(),
  reporte_url: z.union([z.string().url(), z.literal(""), z.null()]).optional(),
  metodologia: z.array(z.string().min(1).max(30)).min(1).max(8).optional(),
  subsector:   z.string().max(200).optional().nullable(),
});

const GenerateResponseSchema = z.object({
  companies:          z.array(EmpresaSchema).min(1).max(20),
  criterios_omitidos: z.array(z.enum(["competidores_directos","sp_yearbook","internacionales","conglomerados","b2b"])).max(5),
});

const SearchUrlsBody = z.object({
  action:      z.literal("search_urls"),
  company_ids: z.array(z.string().max(80)).max(20).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

// ── Prompt ────────────────────────────────────────────────────────────────────

// Bloque estático — cacheable con cache_control ephemeral
const GENERATE_SYSTEM = `Eres un experto en sostenibilidad empresarial y benchmarking ESG.

TAREA: Proponer empresas de referencia para un benchmarking de sostenibilidad ESG.
Proponer exactamente 3 empresas por cada criterio aplicable.

CRITERIOS:
- competidores_directos: Competidores directos del sector con informe de sostenibilidad publicado.
- sp_yearbook: Empresas del sector en el S&P Sustainability Yearbook (año más reciente disponible).
- internacionales: Empresas internacionales del sector con informe de sostenibilidad regional o global.
- conglomerados: Grupos empresariales con ≥2 sectores en común (solo si el cliente es conglomerado/grupo grande).
- b2b: Clientes o proveedores del sector con informe de sostenibilidad publicado.

REGLAS:
1. Solo empresas reales y verificables con informes públicos.
2. URL del informe más reciente solo si la conoces con certeza — si no, omitir (null).
3. metodologia: array con los estándares usados: ["GRI"], ["SASB"], ["TCFD"], ["CSRD"], ["GRI","SASB"], etc.
4. subsector: segmento específico dentro del sector (ej. "Refinación / Downstream").
5. justificacion: 2-3 oraciones explicando por qué esta empresa es un referente relevante.
6. id: slug corto único, ej. "c1_pemex", "c2_ecopetrol".
7. Incluir en criterios_omitidos los criterios que no aplican al cliente.
8. recommendation_score: puntuación 1-10 basada en estos 4 criterios (2.5 pts c/u):
   - Comparabilidad operativa: ¿qué tan similar es el modelo de negocio / escala al cliente?
   - Madurez en sostenibilidad: ¿años reportando, certificaciones, metas net-zero, SBTI?
   - Cobertura geográfica: ¿opera en la misma región / mercado que el cliente?
   - Posición en cadena de valor: ¿comparte eslabones upstream/downstream relevantes?
   Ejemplo: empresa con alta comparabilidad (2.5) + alta madurez (2.5) + misma región (2.0) + cadena parcial (1.5) = 8.5 → redondear a entero más cercano → 9.
9. SOLO JSON válido, sin markdown ni texto adicional.

{"companies":[{"id":"c1_ejemplo","nombre":"Empresa S.A.","pais":"México","reporte_url":null,"metodologia":["GRI","SASB"],"criterio":"competidores_directos","subsector":"...","justificacion":"...","recommendation_score":8}],"criterios_omitidos":["conglomerados"]}`;

function buildGenerateUserContent(
  clientName: string,
  sector: string,
  industry: string | null,
  countries: string,
  size: string | null,
): string {
  const year      = new Date().getFullYear();
  const prevYear  = year - 1;
  const isLarge   = size ? /grande|corporativo|conglomerado|grupo/i.test(size) : false;
  const isMedium  = !isLarge;

  return `CONTEXTO DEL CLIENTE:
- Empresa: ${clientName}
- Sector: ${sector}
- Industria: ${industry ?? "no especificada"}
- Países de operación: ${countries}
- Tamaño: ${size ?? "no especificado"}

INSTRUCCIONES POR CRITERIO:
- competidores_directos: Priorizar empresas que operen en ${countries}.
- sp_yearbook: Usar edición ${year} (o ${prevYear} si la de ${year} aún no se publicó).
- conglomerados: ${isLarge ? `Aplica — buscar grupos con ≥2 sectores comunes con ${clientName}.` : `No aplica — incluir en criterios_omitidos.`}
- b2b: ${isMedium ? "Incluir si hay relaciones B2B relevantes conocidas; si no, incluir en criterios_omitidos." : "Incluir proveedores/clientes clave del sector."}`;
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("dm_benchmark_empresas")
    .select("*")
    .eq("client_id", id)
    .maybeSingle();

  if (error) {
    console.error("[dm-benchmark-empresas GET]", error);
    return NextResponse.json({ error: "Error de base de datos" }, { status: 500 });
  }

  return NextResponse.json({ data: data as BenchmarkEmpresasData | null });
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json().catch(() => null) as { action?: string } | null;
  if (!body?.action) return NextResponse.json({ error: "action requerido" }, { status: 400 });

  const admin  = createAdminClient();

  // ── Action: add_company (manual addition) ──────────────────────────────────
  if (body.action === "add_company") {
    const parsed = AddCompanyBody.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { nombre, pais, reporte_url, metodologia, criterio, subsector } = parsed.data;

    const { data: rec } = await admin
      .from("dm_benchmark_empresas")
      .select("proposed_companies, enabled_companies")
      .eq("client_id", id)
      .maybeSingle();

    const proposed = (rec?.proposed_companies ?? []) as BenchmarkEmpresa[];
    const enabled  = (rec?.enabled_companies  ?? []) as string[];

    const newId = `manual_${Date.now()}`;
    const newCompany: BenchmarkEmpresa = {
      id: newId, nombre, pais,
      reporte_url: reporte_url ?? null,
      metodologia, criterio,
      subsector: subsector ?? null,
      justificacion: null,
    };

    const updatedProposed = [...proposed, newCompany];
    const updatedEnabled  = [...enabled, newId];

    const { error } = await admin.from("dm_benchmark_empresas").upsert({
      client_id: id,
      proposed_companies: updatedProposed,
      enabled_companies:  updatedEnabled,
      updated_at: new Date().toISOString(),
    }, { onConflict: "client_id" });

    if (error) {
      console.error("[dm-benchmark-empresas add_company]", error);
      return NextResponse.json({ error: "Error de base de datos" }, { status: 500 });
    }
    return NextResponse.json({ data: { company: newCompany } });
  }

  // ── Action: update_company (edit existing) ────────────────────────────────
  if (body.action === "update_company") {
    const parsed = UpdateCompanyBody.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { id: companyId, nombre, pais, reporte_url, metodologia, subsector } = parsed.data;

    const { data: rec } = await admin
      .from("dm_benchmark_empresas")
      .select("proposed_companies")
      .eq("client_id", id)
      .maybeSingle();

    const proposed = (rec?.proposed_companies ?? []) as BenchmarkEmpresa[];
    const updated  = proposed.map((c) =>
      c.id === companyId
        ? {
            ...c,
            ...(nombre      !== undefined && { nombre }),
            ...(pais        !== undefined && { pais }),
            ...(reporte_url !== undefined && { reporte_url: reporte_url === "" ? null : reporte_url }),
            ...(metodologia !== undefined && { metodologia }),
            ...(subsector   !== undefined && { subsector }),
          }
        : c
    );

    const { error } = await admin.from("dm_benchmark_empresas").upsert({
      client_id: id,
      proposed_companies: updated,
      updated_at: new Date().toISOString(),
    }, { onConflict: "client_id" });

    if (error) {
      console.error("[dm-benchmark-empresas update_company]", error);
      return NextResponse.json({ error: "Error de base de datos" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // ── Action: generate ───────────────────────────────────────────────────────
  if (body.action === "generate") {
    const rl = await checkAiRateLimit(user, { max: 3, windowMs: 5 * 60_000, errorMessage: "Demasiadas solicitudes de generación. Espera 5 minutos." });
    if (rl) return NextResponse.json({ error: rl.message }, { status: 429 });

    if (anthropicBreaker.isOpen) {
      return NextResponse.json({ error: anthropicBreaker.userMessage }, { status: 503 });
    }

    const client = await getClient(id).catch(() => null);
    if (!client) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

    await admin.from("dm_benchmark_empresas").upsert({
      client_id: id,
      generation_status: "generating",
      updated_at: new Date().toISOString(),
    }, { onConflict: "client_id" });

    const sector    = client.sector ?? "no especificado";
    const industry  = (client as Record<string, unknown>).industry as string | null ?? null;
    const countries = (client.countries as string[] | null)?.join(", ") ?? "México";
    const size      = (client as Record<string, unknown>).size as string | null ?? null;

    // Cargar marcos normativos validados en Etapa 2 para priorizar empresas que los usan
    const { data: referentesRow } = await admin
      .from("dm_referentes")
      .select("enabled_frameworks")
      .eq("client_id", id)
      .maybeSingle();
    const enabledFrameworks = (referentesRow?.enabled_frameworks as string[] | null) ?? [];

    let userContent = buildGenerateUserContent(client.name, sector, industry, countries, size);
    if (enabledFrameworks.length > 0) {
      userContent += `\n\nMARCOS NORMATIVOS ESG DEL CLIENTE (validados en Etapa 2): ${enabledFrameworks.join(", ")}\nPriorizar empresas que reporten bajo estos marcos cuando sea posible.`;
    }

    const { model } = getModelConfig("aurora");
    const anthropic  = createAnthropicClient();
    let textOut = "", inputTokens = 0, outputTokens = 0, cacheCreationTokens = 0, cacheReadTokens = 0;
    const startedAt = Date.now();

    try {
      const msg = await anthropic.messages.create({
        model,
        max_tokens: 4000,
        system: [{ type: "text", text: GENERATE_SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userContent }],
      }, { signal: AbortSignal.timeout(90_000) });

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
      void logAiCall({ userEmail: user, role: "aurora", clientId: id, model, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, latencyMs: Date.now() - startedAt, error: errMsg, workflowStage: "dm_benchmark_empresas" });
      await admin.from("dm_benchmark_empresas").upsert({ client_id: id, generation_status: "failed", updated_at: new Date().toISOString() }, { onConflict: "client_id" });
      return NextResponse.json({ error: errMsg }, { status: 500 });
    }

    void logAiCall({ userEmail: user, role: "aurora", clientId: id, model, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, latencyMs: Date.now() - startedAt, error: null, workflowStage: "dm_benchmark_empresas" });

    const jsonText = extractJsonObject(textOut);
    if (!jsonText) {
      await admin.from("dm_benchmark_empresas").upsert({ client_id: id, generation_status: "failed", updated_at: new Date().toISOString() }, { onConflict: "client_id" });
      return NextResponse.json({ error: "Respuesta IA sin JSON" }, { status: 502 });
    }

    const validated = GenerateResponseSchema.safeParse(JSON.parse(jsonText));
    if (!validated.success) {
      await admin.from("dm_benchmark_empresas").upsert({ client_id: id, generation_status: "failed", updated_at: new Date().toISOString() }, { onConflict: "client_id" });
      return NextResponse.json({ error: "Schema IA inválido" }, { status: 502 });
    }

    const { companies: rawCompanies, criterios_omitidos } = validated.data;

    // Solo SSRF guard — no validateUrl (CDNs corporativos bloquean HEAD/GET de bots)
    const companies = rawCompanies.map((c) => {
      if (!c.reporte_url) return c;
      return isPublicHttpUrl(c.reporte_url).ok ? c : { ...c, reporte_url: null };
    });

    const enabledIds = companies.map((c) => c.id);

    await admin.from("dm_benchmark_empresas").upsert({
      client_id: id,
      proposed_companies: companies as BenchmarkEmpresa[],
      enabled_companies:  enabledIds,
      omitted_criteria:   criterios_omitidos as BenchmarkEmpresaCriterio[],
      generation_status: "done",
      updated_at: new Date().toISOString(),
    }, { onConflict: "client_id" });

    return NextResponse.json({ data: { companies, enabled_companies: enabledIds, criterios_omitidos } });
  }

  // ── Action: search_urls (web_search para empresas sin URL) ───────────────────
  if (body.action === "search_urls") {
    if (anthropicBreaker.isOpen) {
      return NextResponse.json({ error: anthropicBreaker.userMessage }, { status: 503 });
    }

    const parsed = SearchUrlsBody.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { data: rec } = await admin
      .from("dm_benchmark_empresas")
      .select("proposed_companies")
      .eq("client_id", id)
      .maybeSingle();

    if (!rec) return NextResponse.json({ error: "No hay empresas generadas" }, { status: 404 });

    const proposed   = (rec.proposed_companies ?? []) as BenchmarkEmpresa[];
    const targetIds  = parsed.data.company_ids;
    const toSearch   = proposed.filter((c) =>
      !c.reporte_url && (targetIds ? targetIds.includes(c.id) : true)
    );

    if (toSearch.length === 0) {
      return NextResponse.json({ data: { updated: 0, total: 0 } });
    }

    const anthropic = createAnthropicClient();
    // Haiku: búsqueda de URL es tarea formulaica (web_search + retornar link), no requiere Sonnet
    const { model } = getModelConfig("valeria");
    const updatedMap = new Map<string, string>();

    // Concurrency: 3 simultaneous searches
    const CONCURRENCY = 3;
    for (let i = 0; i < toSearch.length; i += CONCURRENCY) {
      const batch = toSearch.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(async (empresa) => {
          const t0 = Date.now();
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Anthropic SDK beta: web_search + submit_url tools
            const msg = await (anthropic.messages.create as (opts: unknown, extra?: unknown) => Promise<any>)(
              {
                model,
                max_tokens: 1200,
                system: [{ type: "text" as const, text: "You are an ESG report URL finder. Use web_search to find the official sustainability or annual report page for a company. Always call web_search before submit_url. Return only the current, canonical URL.", cache_control: { type: "ephemeral" as const } }],
                tools: [
                  { type: "web_search_20250305", name: "web_search", max_uses: 3 },
                  {
                    name: "submit_url",
                    description: "Submit the URL of the official sustainability or ESG report page found.",
                    input_schema: {
                      type: "object",
                      properties: {
                        url: {
                          type: "string",
                          description: "Full URL to the report page or PDF. Empty string if not found.",
                        },
                      },
                      required: ["url"],
                    },
                  },
                ],
                messages: [{
                  role: "user",
                  content: `MANDATORY: You MUST call web_search at least once before calling submit_url. Do NOT rely solely on training knowledge — perform a live search to get the current report URL.

Find the official sustainability or ESG report page for "${empresa.nombre}" (${empresa.pais}${empresa.subsector ? `, ${empresa.subsector}` : ""}).

Try these search queries in order:
1. "${empresa.nombre} sustainability report 2024"
2. "${empresa.nombre} ESG report annual 2024"
3. "${empresa.nombre} informe de sostenibilidad 2024"

Accept HTML landing pages or direct PDF links. After searching, call submit_url with the best URL found. If nothing found after 3 searches, call submit_url with url: "".`,
                }],
              },
              { signal: AbortSignal.timeout(60_000) }
            );

            const stopReason = msg.stop_reason as string;
            const blockSummary = (msg.content ?? []).map(
              (b: { type: string; name?: string }) =>
                b.type === "tool_use" ? `tool_use:${b.name}` : b.type
            ).join(",");
            console.log(`[search_urls] ${empresa.nombre}: stop=${stopReason} blocks=[${blockSummary}] elapsed=${Date.now() - t0}ms`);

            // Extract URL from submit_url tool call (structured output — preferred)
            let foundUrl: string | null = null;
            const usedWebSearch = (msg.content ?? []).some(
              (b: { type: string; name?: string }) => b.type === "tool_use" && b.name === "web_search"
            );
            for (const block of msg.content ?? []) {
              if (block.type === "tool_use" && block.name === "submit_url") {
                const url = (block.input as { url?: string })?.url?.trim();
                if (url && url.length > 10 && url.startsWith("http")) foundUrl = url;
              }
            }
            // Fallback: citation URLs from text blocks
            if (!foundUrl) {
              for (const block of msg.content ?? []) {
                if (block.type === "text") {
                  const citations = (block.citations as Array<{ url?: string }> | undefined) ?? [];
                  const picked = citations.find(c => c.url)?.url ?? null;
                  if (picked) { foundUrl = picked; break; }
                  const match = (block.text as string | undefined)?.match(/https?:\/\/[^\s"'<>\n.,)]+/);
                  if (match) { foundUrl = match[0]; break; }
                }
              }
            }

            console.log(`[search_urls] ${empresa.nombre}: usedWebSearch=${usedWebSearch} url=${foundUrl} elapsed=${Date.now() - t0}ms`);

            if (!foundUrl) return { id: empresa.id, url: null };
            // Skip validateUrl — corporate CDNs (BP, Iberdrola, Pemex) block our user-agent.
            // AI-provided URLs (web_search or training knowledge) are trustworthy for large companies.
            // Only SSRF guard needed.
            return { id: empresa.id, url: isPublicHttpUrl(foundUrl).ok ? foundUrl : null };
          } catch (err) {
            console.error(`[search_urls] ${empresa.nombre}: ERROR elapsed=${Date.now() - t0}ms ${err instanceof Error ? err.message : String(err)}`);
            return { id: empresa.id, url: null };
          }
        })
      );

      for (const result of results) {
        if (result.status === "fulfilled" && result.value.url) {
          updatedMap.set(result.value.id, result.value.url);
        }
      }
    }

    const updatedCount = updatedMap.size;
    if (updatedCount > 0) {
      const updatedProposed = proposed.map((c) =>
        updatedMap.has(c.id) ? { ...c, reporte_url: updatedMap.get(c.id)! } : c
      );
      await admin.from("dm_benchmark_empresas").upsert({
        client_id: id,
        proposed_companies: updatedProposed,
        updated_at: new Date().toISOString(),
      }, { onConflict: "client_id" });
    }

    return NextResponse.json({ data: { updated: updatedCount, total: toSearch.length } });
  }

  return NextResponse.json({ error: "action no reconocido" }, { status: 400 });
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body   = await req.json().catch(() => null);
  const parsed = PatchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("dm_benchmark_empresas").upsert({
    client_id: id,
    enabled_companies: parsed.data.enabled_companies,
    updated_at: new Date().toISOString(),
  }, { onConflict: "client_id" });

  if (error) {
    console.error("[dm-benchmark-empresas PATCH]", error);
    return NextResponse.json({ error: "Error de base de datos" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
