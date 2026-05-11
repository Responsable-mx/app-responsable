import { NextRequest, NextResponse } from "next/server";
import { createAnthropicClient } from "@/lib/ai/client";
import { z } from "zod";
import { requireConsultorForClient } from "@/lib/auth";
import { anthropicBreaker } from "@/lib/ai/circuit-breaker";
import { getClient } from "@/lib/clients";
import type { Client } from "@/lib/clients";
import { extractJsonObject } from "@/lib/ai/extract-json";
import { logAiCall } from "@/lib/ai/logging";
import { getModelConfig } from "@/lib/ai/models";
import { getPrompt } from "@/lib/ai/prompts";
import { createAdminClient } from "@/lib/supabase/admin";
import { RELATION_LABELS, irosToBenchmarkFields } from "@/lib/dm/fields";
import { listActiveIros, getIroQuestionnaireContext, type DmIroConfig } from "@/lib/dm/iros";
import { logChange } from "@/lib/audit-log";

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

const RequestBody = z.discriminatedUnion("action", [ProposeBody, CompareBody, AddManualBody, RemoveBody]);

const ProposedCompanySchema = z.object({
  name: z.string().min(1).max(200),
  country: z.string().max(100).optional().nullable(),
  sector: z.string().max(200).optional().nullable(),
  // Acepta URL completa, URL sin protocolo, null (cuando IA no tiene certeza), o ausente.
  // No aplicamos .url() estricto — la IA puede omitir "https://" o el campo completo.
  website: z.string().max(300).optional().nullable(),
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

async function buildComparePrompt(
  clientId: string,
  clientName: string,
  clientSector: string | null,
  clientCountry: string | null,
  companies: Array<{ name: string; country: string | null; relation: string }>,
  iros: DmIroConfig[],
): Promise<string> {
  const companiesList = companies
    .map((c) => `- ${c.name} (${c.country ?? "país desconocido"}, ${RELATION_LABELS[c.relation as keyof typeof RELATION_LABELS] ?? c.relation})`)
    .join("\n");

  // Construir sección de IROs: 2 dimensiones por estándar + contexto del cuestionario
  const iroSections = await Promise.all(
    iros.map(async (iro) => {
      const ctx = await getIroQuestionnaireContext(clientId, iro);
      const ctxLine = ctx ? `\n  ▸ Datos del cuestionario de ${clientName}:\n${ctx}` : "";
      return `[${iro.esrs_standard} — ${iro.label}]
  Impacto (${clientName} → Sociedad): ${iro.impact_desc}
  Riesgo/Oportunidad (Entorno → ${clientName}): Riesgo: ${iro.risk_desc} | Oportunidad: ${iro.opportunity_desc}${ctxLine}`;
    })
  );

  const fieldKeys = iros.flatMap((iro) => [
    `"${iro.esrs_standard}_impact"`,
    `"${iro.esrs_standard}_risk_opp"`,
  ]).join(", ");

  return `Eres un analista ESG senior especializado en Doble Materialidad (ESRS/GRI/CSRD).
Compara a ${clientName} (sector: ${clientSector ?? "no especificado"}, país: ${clientCountry ?? "México"}) contra las siguientes empresas.

EMPRESAS A COMPARAR:
${companiesList}

ESTÁNDARES ESRS A ANALIZAR (2 dimensiones por estándar):
${iroSections.join("\n\n")}

INSTRUCCIONES:
- Por cada dimensión (impacto + riesgo/oportunidad): UNA sola oración por empresa, máximo 35 palabras (incluye a ${clientName}).
- Sé telegráfico: dato concreto + relevancia ESG. Evita adjetivos vacíos y conectores narrativos.
- Si en "Datos del cuestionario" hay información del cliente, úsala como evidencia concreta en el análisis de ${clientName}.
- Si no hay datos públicos verificables para una empresa en una dimensión, escribe exactamente "Sin datos públicos disponibles."
- CRÍTICO: usa EXACTAMENTE los nombres de empresa tal como aparecen en EMPRESAS A COMPARAR como claves del JSON.
- CRÍTICO: cierra TODAS las llaves del JSON. Mejor menos contenido bien cerrado que más contenido truncado.
- Cierra con párrafo narrativo de 50-70 palabras: posición de ${clientName}, fortalezas, brechas, prioridad.

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
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const admin = createAdminClient();

  const [companiesRes, resultsRes] = await Promise.all([
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
  ]);

  const latestResult = resultsRes.data?.[0] ?? null;

  // ── Chequeo de batch pendiente ──────────────────────────────────────────
  // Si hay un resultado pendiente con batch_id, consultamos Anthropic Batch API.
  // Esto permite que el frontend haga polling barato (GET) en lugar de esperar
  // un POST síncrono de 60s+.
  if (latestResult?.status === "pending" && latestResult?.batch_id) {
    try {
      const anthropic = createAnthropicClient();
      const batch = await anthropic.beta.messages.batches.retrieve(latestResult.batch_id);

      if (batch.processing_status === "ended") {
        // Procesar resultados del batch
        let comparison: Record<string, Record<string, string>> = {};
        let narrative = "";
        let batchError: string | null = null;
        let inputTokens = 0, outputTokens = 0, cacheCreationTokens = 0, cacheReadTokens = 0;

        for await (const result of await anthropic.beta.messages.batches.results(latestResult.batch_id)) {
          if (result.result.type === "succeeded") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const msg = result.result.message as any;
            inputTokens = msg.usage?.input_tokens ?? 0;
            outputTokens = msg.usage?.output_tokens ?? 0;
            cacheCreationTokens = msg.usage?.cache_creation_input_tokens ?? 0;
            cacheReadTokens = msg.usage?.cache_read_input_tokens ?? 0;

            const textOut = (msg.content as Array<{ type: string; text?: string }>)
              .filter((b) => b.type === "text")
              .map((b) => b.text ?? "")
              .join("");

            const jsonText = extractJsonObject(textOut);
            if (jsonText) {
              const parsed = CompareResponseSchema.safeParse(JSON.parse(jsonText));
              if (parsed.success) {
                comparison = parsed.data.comparison;
                narrative = parsed.data.narrative;
              } else {
                batchError = "Schema IA inválido";
              }
            } else {
              batchError = "Respuesta IA sin JSON";
              console.error("[dm-benchmark batch] stop_reason:", msg.stop_reason, "output_tokens:", msg.usage?.output_tokens, "textOut tail:", textOut.slice(-500));
            }
          } else if (result.result.type === "errored") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            batchError = (result.result as any).error?.message ?? "Error en batch";
          }
        }

        if (batchError) {
          console.error("[dm-benchmark batch]", batchError);
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

        void logAiCall({
          userEmail: user,
          role: "aurora",
          clientId: id,
          model,
          inputTokens,
          outputTokens,
          cacheCreationTokens,
          cacheReadTokens,
          latencyMs: 0, // batch — latencia no aplica
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
            companies: companiesRes.data ?? [],
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
      companies: companiesRes.data ?? [],
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cache_control: { type: "ephemeral" } as any,
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
      void logAiCall({ userEmail: user, role: "aurora", clientId: id, model, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, latencyMs: Date.now() - startedAt, error: msg });
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    void logAiCall({ userEmail: user, role: "aurora", clientId: id, model, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, latencyMs: Date.now() - startedAt, error: null });

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

  // ── COMPARE: Batch API asíncrono — Sonnet, sin límite de 60s ────────────
  // Flujo:
  //   1. Crea fila pending en dm_benchmark_results
  //   2. Submite batch a Anthropic (retorna batch_id en <3s)
  //   3. Guarda batch_id en la fila
  //   4. Retorna {status:"pending"} al frontend inmediatamente
  //   5. Frontend hace polling del GET cada 5s
  //   6. GET detecta batch ended → procesa resultados → actualiza fila → retorna done
  const { company_ids } = parsed.data;

  const { data: companies, error: fetchErr } = await admin
    .from("dm_benchmark_companies")
    .select("*")
    .eq("client_id", id)
    .in("id", company_ids);

  if (fetchErr || !companies?.length) {
    return NextResponse.json({ error: "Empresas no encontradas" }, { status: 404 });
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

  // Cargar IROs activos y construir prompt + fields_snapshot
  const iros = await listActiveIros();
  const fieldsSnapshot = irosToBenchmarkFields(iros);
  const prompt = await buildComparePrompt(
    id,
    client.name,
    client.sector ?? null,
    (client.countries as string[] | null)?.[0] ?? null,
    companies,
    iros,
  );

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

  // Submeter batch — retorna en <3s independientemente del tiempo de procesamiento
  try {
    const batch = await anthropic.beta.messages.batches.create(
      {
        requests: [{
          custom_id: resultRow.id,
          params: {
            model,
            max_tokens: 16000, // 10 IROs × 2 dims × N empresas (cap subido may-2026: 8K truncaba JSON con 5+ empresas — stop_reason=max_tokens → "Respuesta IA sin JSON")
            system: [{
              type: "text",
              text: "Eres un analista senior de sostenibilidad especializado en Doble Materialidad. Responde solo con JSON válido.",
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              cache_control: { type: "ephemeral" } as any,
            }],
            messages: [{ role: "user", content: prompt }],
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
