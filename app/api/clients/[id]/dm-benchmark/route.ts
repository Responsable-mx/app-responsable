import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { createAnthropicClient } from "@/lib/ai/client";
import { z } from "zod";
import { requireConsultorForClient } from "@/lib/auth";
import { anthropicBreaker } from "@/lib/ai/circuit-breaker";
import { getClient } from "@/lib/clients";
import type { Client } from "@/lib/clients";
import { extractJsonObject } from "@/lib/ai/extract-json";
import { extractBatchResult } from "@/lib/ai/batch-result";
import { logAiCall } from "@/lib/ai/logging";
import { validateAiResponse } from "@/lib/ai/response-validator";
import { getModelConfig } from "@/lib/ai/models";
import { getPrompt } from "@/lib/ai/prompts";
import { createAdminClient } from "@/lib/supabase/admin";
import { RELATION_LABELS, irosToBenchmarkFields } from "@/lib/dm/fields";
import { listActiveIros, getIroQuestionnaireContext, type DmIroConfig } from "@/lib/dm/iros";
import { logChange } from "@/lib/audit-log";
import { cacheGet, cacheSet } from "@/lib/cache/redis";
import type { BenchmarkEmpresa } from "@/lib/dm/benchmark-empresas-types";

const BM_CACHE_TTL = 14 * 24 * 3600; // 14 días

function benchmarkCacheKey(clientId: string, companyIds: string[]): string {
  const hash = createHash("sha256").update([...companyIds].sort().join(",")).digest("hex").slice(0, 16);
  return `dm:bm:compare:${clientId}:${hash}`;
}

export const runtime = "nodejs";
export const maxDuration = 180;
export const dynamic = "force-dynamic";

// Límite de seguridad para evitar abuso de costo.
// 10 calls por 5 minutos cubre uso intensivo legítimo (8 consultores).
const BM_WINDOW_MS = 5 * 60_000;
const BM_MAX_CALLS = 10;

// ── Schemas ──────────────────────────────────────────────────────────────────

const ProposeBody = z.object({
  action: z.literal("propose"),
  // IDs de empresas que el consultor ya tiene seleccionadas — se marcan validated=true
  // ANTES de borrar las propuestas antiguas para que sobrevivan en el nuevo listado.
  selected_ids: z.array(z.string().uuid()).optional(),
});

const CompareBody = z.object({
  action: z.literal("compare"),
  company_ids: z.array(z.string().uuid()).min(1).max(20),
});

const AddManualBody = z.object({
  action: z.literal("add_manual"),
  name: z.string().min(1).max(200),
  relation: z.enum(["competitor_nacional", "competitor_internacional", "sector", "cadena_valor"]),
  country: z.string().max(100).optional().nullable(),
  sector: z.string().max(200).optional().nullable(),
  website: z.string().max(300).optional().nullable(),
  justification: z.string().max(600).optional().nullable(),
});

const RemoveBody = z.object({
  action: z.literal("remove"),
  company_id: z.string().uuid(),
});

const ImportFromReferentesBody = z.object({
  action: z.literal("import_from_referentes"),
});

const RequestBody = z.discriminatedUnion("action", [
  ProposeBody, CompareBody, AddManualBody, RemoveBody, ImportFromReferentesBody,
]);

const ProposedCompanySchema = z.object({
  name: z.string().min(1).max(200),
  country: z.string().max(100).optional().nullable(),
  sector: z.string().max(200).optional().nullable(),
  // Acepta URL completa, URL sin protocolo, null (cuando IA no tiene certeza), o ausente.
  // No aplicamos .url() estricto — la IA puede omitir "https://" o el campo completo.
  website: z.string().max(300).optional().nullable(),
  // Wave 7 C: URL del reporte de sustentabilidad oficial (PDF/HTML). Si presente,
  // auto-dispara ingest + embedding Voyage en background.
  sustainability_report_url: z.string().max(500).optional().nullable(),
  relation: z.enum(["competitor_nacional", "competitor_internacional", "sector", "cadena_valor"]),
  justification: z.string().max(600).optional().nullable(),
});

const ProposeResponseSchema = z.object({
  companies: z.array(ProposedCompanySchema).min(1).max(20),
});

const CompanyComparisonSchema = z.record(z.string(), z.string());
const CompareResponseSchema = z.object({
  comparison: z.record(z.string(), CompanyComparisonSchema),
  narrative: z.string().min(1),
});

type Ctx = { params: Promise<{ id: string }> };

// ── Helpers ──────────────────────────────────────────────────────────────────

async function buildProposePrompt(
  client: Client,
  feedbackContext: string,
): Promise<string> {
  const template = await getPrompt("dm.benchmark_propose");
  return template
    .replace(/\{\{client_name\}\}/g, client.name)
    .replace(/\{\{sector\}\}/g, client.sector ?? "no especificado")
    .replace(/\{\{countries\}\}/g, (client.countries as string[] | null)?.join(", ") ?? "México")
    .replace(/\{\{feedback_context\}\}/g, feedbackContext);
}

// Retorna 2 bloques separados para permitir cache del bloque estático de IROs:
//   irosCacheBlock → va en system[1] con cache_control ephemeral (cambia solo cuando admin edita IROs)
//   dynamicPrompt  → va en messages[user] (cliente + empresas + ctx cuestionario + chunks — cambia por run)
async function buildComparePrompt(
  clientId: string,
  clientName: string,
  clientSector: string | null,
  clientCountry: string | null,
  companies: Array<{ id?: string; name: string; country: string | null; relation: string }>,
  iros: DmIroConfig[],
): Promise<{ irosCacheBlock: string; dynamicPrompt: string }> {
  const companiesList = companies
    .map((c) => `- ${c.name} (${c.country ?? "país desconocido"}, ${RELATION_LABELS[c.relation as keyof typeof RELATION_LABELS] ?? c.relation})`)
    .join("\n");

  // Bloque estático de IROs — sin datos de cliente (va cacheado en system)
  const irosCacheBlock = `ESTÁNDARES ESRS A ANALIZAR (2 dimensiones por estándar):

${iros.map((iro) =>
  `[${iro.esrs_standard} — ${iro.label}]
  Impacto (empresa → sociedad): ${iro.impact_desc}
  Riesgo/Oportunidad (entorno → empresa): ${iro.risk_desc} | ${iro.opportunity_desc}`
).join("\n\n")}`;

  // Contexto del cuestionario por IRO — solo donde hay datos (dinámico, por cliente)
  const ctxLines = (await Promise.all(
    iros.map(async (iro) => {
      const ctx = await getIroQuestionnaireContext(clientId, iro);
      return ctx ? `  [${iro.esrs_standard}] ${ctx}` : null;
    })
  )).filter(Boolean);
  const clientCtxSection = ctxLines.length > 0
    ? `\nDATOS DEL CUESTIONARIO DE ${clientName} (evidencia verificada — priorizar sobre conocimiento general):\n${ctxLines.join("\n")}\n`
    : "";

  // Wave 7 C: chunks Voyage de reportes oficiales de competidores
  let competitorChunksSection = "";
  if (process.env.VOYAGE_API_KEY) {
    try {
      const { searchCompetitorChunks } = await import("@/lib/documents/competitor");
      const esrsQuery = iros.map((iro) => `${iro.esrs_standard} ${iro.label} ${iro.impact_desc} ${iro.risk_desc}`).join(" ");
      const perCompanyChunks = (await Promise.all(
        companies
          .filter((c) => c.id)
          .map(async (c) => {
            const matches = await searchCompetitorChunks({
              query: esrsQuery,
              benchmarkCompanyId: c.id!,
              limit: 8,
            });
            if (!matches || matches.length === 0) return null;
            const body = matches.map((m) => m.content).join("\n---\n").slice(0, 6000);
            return `### ${c.name}\n${body}`;
          })
      )).filter((x): x is string => x !== null);
      if (perCompanyChunks.length > 0) {
        competitorChunksSection = `\nINFORMACIÓN PRE-ENCONTRADA (reportes oficiales — usa esto antes que web_search):\n\n${perCompanyChunks.join("\n\n")}\n`;
      }
    } catch (e) {
      console.error("[dm-benchmark] competitor chunks lookup failed:", e);
    }
  }

  const fieldKeys = iros.flatMap((iro) => [
    `"${iro.esrs_standard}_impact"`,
    `"${iro.esrs_standard}_risk_opp"`,
  ]).join(", ");

  const dynamicPrompt = `Compara a ${clientName} (sector: ${clientSector ?? "no especificado"}, país: ${clientCountry ?? "México"}) contra las siguientes empresas.

EMPRESAS A COMPARAR:
${companiesList}
${clientCtxSection}${competitorChunksSection}
INSTRUCCIONES:
- Por cada dimensión (impacto + riesgo/oportunidad): UNA sola oración por empresa, máximo 35 palabras (incluye a ${clientName}).
- Sé telegráfico: dato concreto + relevancia ESG. Evita adjetivos vacíos y conectores narrativos.
- Si en "Datos del cuestionario" hay información del cliente, úsala como evidencia concreta en el análisis de ${clientName}.
- Si no hay datos públicos verificables para una empresa en una dimensión, escribe exactamente "Sin datos públicos disponibles."
- CRÍTICO: usa EXACTAMENTE los nombres de empresa tal como aparecen en EMPRESAS A COMPARAR como claves del JSON.
- CRÍTICO: cierra TODAS las llaves del JSON. Mejor menos contenido bien cerrado que más contenido truncado.
- Cierra con párrafo narrativo de 80-120 palabras: posición de ${clientName}, fortalezas, brechas, prioridad.

JSON únicamente — usa estas claves exactas: ${fieldKeys}
{
  "comparison": {
    "E1_impact": {
      "${clientName}": "análisis impacto ambiental del cliente",
      "Empresa A (nombre exacto)": "análisis impacto"
    },
    "E1_risk_opp": {
      "${clientName}": "análisis riesgo y oportunidad del cliente",
      "Empresa A (nombre exacto)": "análisis riesgo/oportunidad"
    }
  },
  "narrative": "síntesis ejecutiva 80-120 palabras"
}`;

  return { irosCacheBlock, dynamicPrompt };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const admin = createAdminClient();

  const [companiesRes, resultsRes, embeddedDocsRes] = await Promise.all([
    admin
      .from("dm_benchmark_companies")
      .select("*")
      .eq("client_id", id)
      .order("created_at", { ascending: true }),
    admin
      .from("dm_benchmark_results")
      .select("*")
      .eq("client_id", id)
      .order("created_at", { ascending: false })
      .limit(1),
    // Wave 7 C: qué competidores tienen ya un report persistido (parseado ok)
    admin
      .from("client_documents")
      .select("benchmark_company_id")
      .eq("client_id", id)
      .eq("kind", "competitor_report")
      .eq("parse_status", "ok"),
  ]);

  const latestResult = resultsRes.data?.[0] ?? null;
  const embeddedCompanyIds = new Set(
    (embeddedDocsRes.data ?? [])
      .map((d) => d.benchmark_company_id as string | null)
      .filter((x): x is string => !!x)
  );

  // Enriquecer companies con flag has_embedded_report
  const companiesEnriched = (companiesRes.data ?? []).map((c) => ({
    ...c,
    has_embedded_report: embeddedCompanyIds.has(c.id as string),
  }));

  // ── Chequeo de batch pendiente ──────────────────────────────────────────
  // Si hay un resultado pendiente con batch_id, consultamos Anthropic Batch API.
  // Esto permite que el frontend haga polling barato (GET) en lugar de esperar
  // un POST síncrono de 60s+.
  if (latestResult?.status === "pending" && latestResult?.batch_id) {
    try {
      const anthropic = createAnthropicClient();
      const batch = await anthropic.beta.messages.batches.retrieve(latestResult.batch_id);

      if (batch.processing_status === "ended") {
        // Procesar resultados del batch — D-162 helper centralizado
        const ext = await extractBatchResult(anthropic, latestResult.batch_id, CompareResponseSchema, "dm-benchmark batch");
        const comparison: Record<string, Record<string, string>> = ext.parsed?.comparison ?? {};
        const narrative: string = ext.parsed?.narrative ?? "";
        const batchError = ext.error;
        const { inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens } = ext;

        if (batchError) {
          console.error("[dm-benchmark batch]", batchError);
        }

        // Wave 6 — Validador E sobre narrative (texto que ve el consultor)
        const benchmarkWarnings = narrative
          ? validateAiResponse(narrative, { minLength: 50 }).filter((w) => w.severity !== "info")
          : [];
        if (benchmarkWarnings.length > 0) {
          console.warn("[dm-benchmark] validator warnings:", benchmarkWarnings.map((w) => w.code).join(", "));
        }

        const model = getModelConfig("aurora").model;
        const newStatus = batchError ? "failed" : "done";

        await admin
          .from("dm_benchmark_results")
          .update({
            comparison,
            narrative,
            status: newStatus,
            ...(batchError ? { error_message: batchError } : {}),
          })
          .eq("id", latestResult.id);

        // Guardar en caché cuando el resultado esté listo — evita re-run con mismas empresas
        if (newStatus === "done") {
          const snapshotIds = (latestResult.companies_snapshot as Array<{ id?: string }> ?? [])
            .map((c) => c.id)
            .filter((x): x is string => !!x);
          if (snapshotIds.length > 0) {
            void cacheSet(benchmarkCacheKey(id, snapshotIds), { result_id: latestResult.id }, BM_CACHE_TTL);
          }
        }

        void logAiCall({
          userEmail: user,
          role: "aurora",
          clientId: id,
          model,
          inputTokens,
          outputTokens,
          cacheCreationTokens,
          cacheReadTokens,
          latencyMs: Date.now() - new Date(latestResult.created_at as string).getTime(),
          error: batchError,
        });

        // Devolver resultado actualizado
        const updatedResult = {
          ...latestResult,
          comparison,
          narrative,
          status: newStatus,
        };

        return NextResponse.json({
          data: {
            companies: companiesEnriched,
            latest_result: updatedResult,
          },
        });
      }

      // Batch todavía en progreso — devolver tal cual
    } catch {
      // Si el check de batch falla, no bloquear al usuario — devolver estado actual
    }
  }

  return NextResponse.json({
    data: {
      companies: companiesEnriched,
      latest_result: latestResult,
    },
  });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY no configurada" }, { status: 500 });
  }

  // Rate limit DB cross-instancias: 10 calls por 5 minutos por usuario.
  {
    const adminRl = createAdminClient();
    const windowStart = new Date(Date.now() - BM_WINDOW_MS).toISOString();
    const { count } = await adminRl
      .from("ai_calls")
      .select("id", { count: "exact", head: true })
      .eq("user_email", user)
      .gte("created_at", windowStart);
    if ((count ?? 0) >= BM_MAX_CALLS) {
      return NextResponse.json(
        { error: "Demasiadas solicitudes de benchmark. Espera 5 minutos antes de reintentar." },
        { status: 429 }
      );
    }
  }

  if (anthropicBreaker.isOpen) {
    return NextResponse.json({ error: anthropicBreaker.userMessage }, { status: 503 });
  }

  const client = await getClient(id).catch(() => null);
  if (!client) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = RequestBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Body inválido" }, { status: 400 });
  }

  const anthropic = createAnthropicClient();
  const admin = createAdminClient();

  // ── PROPOSE: IA investiga y propone empresas (síncrono — Sonnet, 45s) ─────
  if (parsed.data.action === "propose") {
    const { selected_ids } = parsed.data;

    // ── Paso 1: persistir selecciones locales como validated=true ────────────
    // El consultor pudo haber marcado empresas sin correr el benchmark todavía.
    // Las marcamos antes de borrar para que sobrevivan en el nuevo listado.
    if (selected_ids && selected_ids.length > 0) {
      await admin
        .from("dm_benchmark_companies")
        .update({ validated: true })
        .eq("client_id", id)
        .in("id", selected_ids);
    }

    // ── Paso 2: feedback context — incluir TODAS las empresas conocidas ───────
    // proposed_by="ia" + proposed_by="consultor" — ambas cuentan como señal
    const { data: prevCompanies } = await admin
      .from("dm_benchmark_companies")
      .select("name, relation, validated, proposed_by, rejection_reason, reports_publicly")
      .eq("client_id", id);

    let feedbackContext = "";
    if (prevCompanies && prevCompanies.length > 0) {
      // Consultor-added + validated IA = aprobadas
      const approved = prevCompanies.filter(
        (c) => c.proposed_by === "consultor" || c.validated
      );
      // IA no validadas = rechazadas / ignoradas
      const rejected = prevCompanies.filter(
        (c) => c.proposed_by === "ia" && !c.validated
      );
      const lines: string[] = [];
      if (approved.length > 0) {
        lines.push(
          `El consultor ya aprobó estas empresas (no repetirlas, sino buscar alternativas complementarias):\n` +
          approved.map((c) => {
            const pub = c.reports_publicly === true ? " [con reporte ESG público verificado]" : "";
            return `  - ${c.name} [${c.relation}]${pub}`;
          }).join("\n")
        );
      }
      if (rejected.length > 0) {
        lines.push(
          `El consultor rechazó o no seleccionó estas empresas (no volver a proponerlas):\n` +
          rejected.map((c) => {
            const reason = c.rejection_reason
              ? ` — motivo: ${c.rejection_reason.replace(/_/g, " ")}`
              : "";
            return `  - ${c.name} [${c.relation}]${reason}`;
          }).join("\n")
        );
      }
      feedbackContext = lines.join("\n\n");
    }

    const model = getModelConfig("aurora").model;
    const prompt = await buildProposePrompt(client, feedbackContext);
    let textOut = "";
    let inputTokens = 0, outputTokens = 0, cacheCreationTokens = 0, cacheReadTokens = 0;
    const startedAt = Date.now();

    try {
      const msg = await anthropic.messages.create(
        {
          model,
          max_tokens: 2200, // 10 empresas × ~150 tok (nombre+país+sector+website+relación+justificación 2-3 oraciones)
          system: [{
            type: "text",
            text: "Eres un experto en análisis de sostenibilidad empresarial. Responde solo con JSON válido.",
             
            cache_control: { type: "ephemeral" },
          }],
          messages: [{ role: "user", content: prompt }],
        },
        { signal: AbortSignal.timeout(45_000) }
      );
      inputTokens = msg.usage?.input_tokens ?? 0;
      outputTokens = msg.usage?.output_tokens ?? 0;
      cacheCreationTokens = msg.usage?.cache_creation_input_tokens ?? 0;
      cacheReadTokens = msg.usage?.cache_read_input_tokens ?? 0;
      for (const block of msg.content) {
        if (block.type === "text") textOut += block.text;
      }
      anthropicBreaker.recordSuccess();
    } catch (e) {
      anthropicBreaker.recordFailure();
      const msg = e instanceof Error ? e.message : "Error Anthropic";
      void logAiCall({ userEmail: user, role: "aurora", clientId: id, model, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, latencyMs: Date.now() - startedAt, error: msg, workflowStage: "dm_benchmark" });
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    void logAiCall({ userEmail: user, role: "aurora", clientId: id, model, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, latencyMs: Date.now() - startedAt, error: null, workflowStage: "dm_benchmark" });

    const jsonText = extractJsonObject(textOut);
    if (!jsonText) return NextResponse.json({ error: "Respuesta IA sin JSON" }, { status: 502 });

    let aiData: z.infer<typeof ProposeResponseSchema>;
    try {
      const result = ProposeResponseSchema.safeParse(JSON.parse(jsonText));
      if (!result.success) return NextResponse.json({ error: "Schema IA inválido" }, { status: 502 });
      aiData = result.data;
    } catch {
      return NextResponse.json({ error: "JSON inválido en respuesta IA" }, { status: 502 });
    }

    // Eliminar propuestas anteriores de IA no seleccionadas.
    // Las que tienen validated=true sobreviven — el consultor las aprobó.
    await admin
      .from("dm_benchmark_companies")
      .delete()
      .eq("client_id", id)
      .eq("proposed_by", "ia")
      .eq("validated", false);

    const rows = aiData.companies.map((c) => ({
      client_id: id,
      name: c.name,
      country: c.country ?? null,
      sector: c.sector ?? null,
      website: c.website && c.website.length > 0 ? c.website : null,
      sustainability_report_url:
        c.sustainability_report_url && c.sustainability_report_url.length > 0
          ? c.sustainability_report_url
          : null,
      relation: c.relation,
      justification: c.justification ?? null,
      proposed_by: "ia",
      validated: false,
      created_by: user,
    }));

    const { data: inserted, error: insertErr } = await admin
      .from("dm_benchmark_companies")
      .insert(rows)
      .select();

    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

    // Wave 7 C: auto-dispatch ingest de reportes en background para competidores
    // con sustainability_report_url. Fire-and-forget — el endpoint responde inmediato,
    // los reports caen al pipeline y el cron embed-chunks los embeddea en próximo ciclo.
    if (inserted && process.env.VOYAGE_API_KEY) {
      const { persistCompetitorReport } = await import("@/lib/documents/competitor");
      for (const company of inserted) {
        const url = (company.sustainability_report_url as string | null) ?? null;
        if (!url) continue;
        // No await — background, no bloquea respuesta
        void persistCompetitorReport({
          benchmarkCompanyId: company.id as string,
          clientId: id,
          uploadedBy: user,
          sourceUrl: url,
        }).catch((e) => {
          console.error(
            `[dm-benchmark auto-ingest] failed for ${company.name}:`,
            e instanceof Error ? e.message : e
          );
        });
      }
    }

    return NextResponse.json({ data: { companies: inserted } });
  }

  // ── ADD MANUAL: consultor agrega una empresa directamente ──────────────
  if (parsed.data.action === "add_manual") {
    const { name, relation, country, sector, website, justification } = parsed.data;
    const { data: inserted, error: insertErr } = await admin
      .from("dm_benchmark_companies")
      .insert({
        client_id: id,
        name,
        relation,
        country: country ?? null,
        sector: sector ?? null,
        website: website && website.length > 0 ? website : null,
        justification: justification ?? null,
        proposed_by: "consultor",
        validated: false,
        created_by: user,
      })
      .select()
      .single();

    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
    return NextResponse.json({ data: { company: inserted } });
  }

  // ── REMOVE: eliminar empresa individual ──────────────────────────────────
  if (parsed.data.action === "remove") {
    const { company_id } = parsed.data;
    // Verificar que la empresa pertenece a este cliente
    const { data: existing } = await admin
      .from("dm_benchmark_companies")
      .select("id")
      .eq("id", company_id)
      .eq("client_id", id)
      .single();

    if (!existing) return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });

    const { error: deleteErr } = await admin
      .from("dm_benchmark_companies")
      .delete()
      .eq("id", company_id)
      .eq("client_id", id);

    if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 });
    return NextResponse.json({ data: { removed: true } });
  }

  // ── IMPORT_FROM_REFERENTES: importa empresas validadas en Etapa 3 ─────────
  // Lee dm_benchmark_empresas.enabled_companies, mapea a dm_benchmark_companies.
  // Deduplica por nombre (case-insensitive). Marca validated=true — ya revisadas.
  if (parsed.data.action === "import_from_referentes") {
    const { data: empresasRec } = await admin
      .from("dm_benchmark_empresas")
      .select("proposed_companies, enabled_companies")
      .eq("client_id", id)
      .single();

    if (!empresasRec) {
      return NextResponse.json({ error: "Etapa 3 no encontrada — genera primero las empresas de referencia" }, { status: 404 });
    }

    const enabledIds = (empresasRec.enabled_companies as string[] | null) ?? [];
    const allProposed = (empresasRec.proposed_companies as BenchmarkEmpresa[] | null) ?? [];
    const toImport = allProposed.filter((e) => enabledIds.includes(e.id));

    if (toImport.length === 0) {
      return NextResponse.json({ error: "Sin empresas habilitadas en Etapa 3" }, { status: 400 });
    }

    const criterioToRelation: Record<string, string> = {
      competidores_directos: "competitor_nacional",
      sp_yearbook:           "sector",
      internacionales:       "competitor_internacional",
      conglomerados:         "sector",
      b2b:                   "cadena_valor",
    };

    const { data: existing } = await admin
      .from("dm_benchmark_companies")
      .select("name")
      .eq("client_id", id);
    const existingNames = new Set((existing ?? []).map((e) => (e.name as string).toLowerCase()));

    const rows = toImport
      .filter((e) => !existingNames.has(e.nombre.toLowerCase()))
      .map((e) => ({
        client_id: id,
        name: e.nombre,
        country: e.pais ?? null,
        sector: e.subsector ?? null,
        website: null as string | null,
        sustainability_report_url: e.reporte_url ?? null,
        relation: criterioToRelation[e.criterio] ?? "sector",
        justification: e.justificacion ?? null,
        proposed_by: "consultor",
        validated: true,
        created_by: user,
      }));

    if (rows.length > 0) {
      const { error: insertErr } = await admin.from("dm_benchmark_companies").insert(rows);
      if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    void logChange({
      actorEmail: user,
      entityType: "dm_benchmark_company",
      entityId: id,
      action: "create",
      before: null,
      after: { imported_count: rows.length, skipped: toImport.length - rows.length, source: "dm_benchmark_empresas" },
    });

    return NextResponse.json({ data: { imported: rows.length, skipped: toImport.length - rows.length } });
  }

  // ── COMPARE: Batch API asíncrono — Sonnet, sin límite de 60s ────────────
  // Flujo:
  //   1. Crea fila pending en dm_benchmark_results
  //   2. Submite batch a Anthropic (retorna batch_id en <3s)
  //   3. Guarda batch_id en la fila
  //   4. Retorna {status:"pending"} al frontend inmediatamente
  //   5. Frontend hace polling del GET cada 5s
  //   6. GET detecta batch ended → procesa resultados → actualiza fila → retorna done
  if (parsed.data.action !== "compare") {
    return NextResponse.json({ error: "action no reconocido" }, { status: 400 });
  }
  const { company_ids } = parsed.data;

  const { data: companies, error: fetchErr } = await admin
    .from("dm_benchmark_companies")
    .select("*")
    .eq("client_id", id)
    .in("id", company_ids);

  if (fetchErr || !companies?.length) {
    return NextResponse.json({ error: "Empresas no encontradas" }, { status: 404 });
  }

  // Caché Redis: si ya existe un resultado "done" con las mismas empresas, devolverlo
  // directamente sin gastar $0.35-0.60 en Batch API.
  const cachedBm = await cacheGet<{ result_id: string }>(benchmarkCacheKey(id, company_ids));
  if (cachedBm?.result_id) {
    const { data: existingRow } = await admin
      .from("dm_benchmark_results")
      .select("id, status")
      .eq("id", cachedBm.result_id)
      .maybeSingle();
    if (existingRow?.status === "done") {
      return NextResponse.json({ data: { result_id: existingRow.id, status: "done" } });
    }
  }

  // Marcar como validated=true las empresas que el consultor seleccionó para comparar.
  // Esto alimenta el feedback loop cuando regenera (sepa cuáles ya aprobó).
  await admin
    .from("dm_benchmark_companies")
    .update({ validated: true })
    .eq("client_id", id)
    .in("id", company_ids);

  // Usar Sonnet (aurora) en Batch API — sin restricción de 60s de Vercel Hobby.
  // 50% descuento en tokens vs llamada síncrona.
  const model = getModelConfig("aurora").model;

  // Cargar IROs activos + marcos normativos de Etapa 2 en paralelo
  const [iros, referentesRes] = await Promise.all([
    listActiveIros(),
    admin.from("dm_referentes").select("enabled_frameworks").eq("client_id", id).maybeSingle(),
  ]);
  const enabledFrameworks = (referentesRes.data?.enabled_frameworks as string[] | null) ?? [];

  const fieldsSnapshot = irosToBenchmarkFields(iros);
  const { irosCacheBlock, dynamicPrompt: rawDynamic } = await buildComparePrompt(
    id,
    client.name,
    client.sector ?? null,
    (client.countries as string[] | null)?.[0] ?? null,
    companies,
    iros,
  );

  // Anteponer marcos normativos validados en Etapa 2 como base del análisis
  const frameworksLine = enabledFrameworks.length > 0
    ? `MARCOS NORMATIVOS ESG APLICABLES AL CLIENTE (validados en Etapa 2): ${enabledFrameworks.join(", ")}\n\n`
    : "";
  const dynamicPrompt = frameworksLine + rawDynamic;

  // Crear fila pending primero para obtener ID como custom_id del batch
  const { data: resultRow, error: insertResultErr } = await admin
    .from("dm_benchmark_results")
    .insert({
      client_id: id,
      companies_snapshot: companies,
      fields_snapshot: fieldsSnapshot,
      comparison: {},
      status: "pending",
      created_by: user,
    })
    .select()
    .single();

  if (insertResultErr || !resultRow) {
    return NextResponse.json({ error: "Error al crear registro de resultado" }, { status: 500 });
  }

  // max_tokens dinámico: (N empresas + cliente) × 40 dims × ~50 tok + 4K overhead.
  // 12K era suficiente para 8, pero con 12+ empresas el JSON se trunca y extractJsonObject retorna null.
  const entityCount = companies.length + 1; // +1 = el propio cliente
  const dynamicMaxTokens = Math.min(48000, Math.max(16000, entityCount * 1800 + 4000));

  // Submeter batch — retorna en <3s independientemente del tiempo de procesamiento
  try {
    const batch = await anthropic.beta.messages.batches.create(
      {
        requests: [{
          custom_id: resultRow.id,
          params: {
            model,
            max_tokens: dynamicMaxTokens,
            system: [
              {
                type: "text",
                text: "Eres un analista senior de sostenibilidad especializado en Doble Materialidad. Responde solo con JSON válido.",
                cache_control: { type: "ephemeral" },
              },
              {
                // IRO definitions son estáticas (cambian 2-3×/año cuando admin edita dm_iro_config).
                // Cache hit ahorra ~600 tokens de input en cada re-run del mismo consultor.
                type: "text",
                text: irosCacheBlock,
                cache_control: { type: "ephemeral" },
              },
            ],
            messages: [{ role: "user", content: dynamicPrompt }],
          },
        }],
      },
      { signal: AbortSignal.timeout(15_000) }
    );

    anthropicBreaker.recordSuccess();

    // Guardar batch_id — el GET handler lo usará para polling
    await admin
      .from("dm_benchmark_results")
      .update({ batch_id: batch.id })
      .eq("id", resultRow.id);

  } catch (e) {
    anthropicBreaker.recordFailure();
    const errMsg = e instanceof Error ? e.message : "Error Anthropic";
    await admin
      .from("dm_benchmark_results")
      .update({ status: "failed", error_message: errMsg })
      .eq("id", resultRow.id);
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }

  // Retornar pending — el frontend hace polling del GET hasta que status=done
  return NextResponse.json({
    data: {
      result_id: resultRow.id,
      status: "pending",
    },
  });
}

// ── PATCH — actualiza rejection_reason o reports_publicly de una empresa ─────

const CompanyPatchBody = z.object({
  company_id: z.string().uuid(),
  rejection_reason: z.enum([
    "sector_diferente",
    "tamano_incomparable",
    "sin_reporte",
    "ya_es_cliente",
    "otro",
  ]).nullable().optional(),
  reports_publicly: z.boolean().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = CompanyPatchBody.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Body inválido" }, { status: 400 });

  const { company_id, rejection_reason, reports_publicly } = parsed.data;

  // Verificar pertenencia al cliente
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("dm_benchmark_companies")
    .select("id")
    .eq("id", company_id)
    .eq("client_id", id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });

  const updatePayload: Record<string, unknown> = {};
  if (rejection_reason !== undefined) updatePayload.rejection_reason = rejection_reason;
  if (reports_publicly !== undefined) updatePayload.reports_publicly = reports_publicly;

  if (Object.keys(updatePayload).length === 0)
    return NextResponse.json({ error: "Sin campos a actualizar" }, { status: 400 });

  const { data, error } = await admin
    .from("dm_benchmark_companies")
    .update(updatePayload)
    .eq("id", company_id)
    .eq("client_id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  void logChange({
    actorEmail: user,
    entityType: "dm_benchmark_company",
    entityId: company_id,
    action: "update",
    before: null,
    after: { client_id: id, ...updatePayload },
  });
  return NextResponse.json({ data });
}
