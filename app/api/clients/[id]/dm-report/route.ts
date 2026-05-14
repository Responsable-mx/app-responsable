import { NextRequest, NextResponse } from "next/server";
import { createAnthropicClient } from "@/lib/ai/client";
import { z } from "zod";
import { requireConsultorForClient } from "@/lib/auth";
import { getClient } from "@/lib/clients";
import { buildClientContext } from "@/lib/ai/roles";
import { extractBatchResult } from "@/lib/ai/batch-result";
import { logAiCall } from "@/lib/ai/logging";
import { getModelConfig } from "@/lib/ai/models";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkAiRateLimit } from "@/lib/ai/rate-limit";
import { listActiveIros } from "@/lib/dm/iros";
import { getPrompt } from "@/lib/ai/prompts";
import { anthropicBreaker } from "@/lib/ai/circuit-breaker";
import type { Client } from "@/lib/clients";

export const runtime = "nodejs";
export const maxDuration = 180;
export const dynamic = "force-dynamic";

// Rate limit: 3 reportes DM por 5 min (Opus vía Batch — ~$0.20-0.50/call)

const GenerateBody = z.object({
  result_id: z.string().uuid(),
});

const ReportNarrativeSchema = z.object({
  executive_summary: z.string().min(1),
  client_position: z.string().min(1),
  risks: z.array(z.object({
    title: z.string(),
    description: z.string(),
    severity: z.enum(["alta", "media", "baja"]),
  })).min(1),
  strengths: z.array(z.string()).min(1),
  improvement_areas: z.array(z.string()).min(1),
  recommendations: z.array(z.object({
    action: z.string(),
    priority: z.enum(["inmediata", "corto_plazo", "mediano_plazo"]),
  })).min(1),
  // Campos extendidos para visualizaciones en PDF
  priority_topics: z.array(z.object({
    tema: z.string(),
    score_financiero: z.number().min(1).max(10),
    score_impacto: z.number().min(1).max(10),
    prioridad: z.enum(["alta", "media", "baja"]),
    accion_clave: z.string(),
  })).min(3).max(8).optional(),
  benchmark_gaps: z.array(z.object({
    dimension: z.string(),
    nivel_cliente: z.enum(["Básico", "Intermedio", "Avanzado", "Líder"]),
    nivel_sector: z.enum(["Básico", "Intermedio", "Avanzado", "Líder"]),
    brecha: z.enum(["alta", "media", "baja", "ninguna"]),
  })).min(3).optional(),
  proximos_pasos: z.array(z.object({
    servicio: z.string(),
    descripcion: z.string(),
    plazo: z.enum(["90 días", "6 meses", "12 meses"]),
    tipo: z.enum(["diagnóstico", "implementación", "certificación", "reporte"]),
  })).min(3).max(5).optional(),
  roadmap_90d: z.array(z.object({
    fase:      z.enum(["0-30d", "30-60d", "60-90d"]),
    actividad: z.string().min(10).max(200),
    iro_refs:  z.string().max(60),
    prioridad: z.enum(["alta", "media", "baja"]),
  })).min(3).max(9).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

type ClientIroRow = {
  n_iro: number;
  tema_esg: string;
  descripcion: string;
  tipo: string;
  cadena: string;
  horizonte: string;
  score_impacto: number | null;
  score_financiero: number | null;
  confianza: string;
};

type ClientNisRow = {
  ibso_label: string;
  categoria: string;
  estado: string;
  calidad_dato: string;
  accion: string | null;
};

async function buildReportPrompt(
  client: Client,
  clientContext: string,
  benchmarkResult: {
    companies_snapshot: unknown;
    fields_snapshot: unknown;
    comparison: unknown;
    narrative: string;
  },
  clientIros: ClientIroRow[],
  clientNis: ClientNisRow[],
): Promise<string> {
  // ESRS catalog como referencia normativa
  const esrsIros = await listActiveIros().catch(() => []);
  const esrsContext = esrsIros.length
    ? `\nESTÁNDARES ESRS ANALIZADOS (referencia para el reporte):\n${esrsIros
        .map((iro) =>
          `${iro.esrs_standard} — ${iro.label}:\n  Impacto: ${iro.impact_desc}\n  Riesgo: ${iro.risk_desc}\n  Oportunidad: ${iro.opportunity_desc}`
        )
        .join("\n\n")}`
    : "";

  // IROs del cliente ya validados por el consultor
  const iroInventory = clientIros.length
    ? `\nINVENTARIO DE IROs DEL CLIENTE (${clientIros.length} IROs revisados por el consultor):\n${clientIros
        .map((iro) =>
          `IRO-${iro.n_iro} [${iro.tipo}] ${iro.tema_esg}: ${iro.descripcion} (cadena: ${iro.cadena}, horizonte: ${iro.horizonte}, impacto: ${iro.score_impacto ?? "?"}/5, financiero: ${iro.score_financiero ?? "?"}/5, confianza: ${iro.confianza})`
        )
        .join("\n")}`
    : "";

  // Brechas NIS/IBSO del cliente — solo indicadores con brecha real
  // Excluye no_aplica y disponible+alta (dato listo, no es brecha)
  const nisConBrecha = clientNis.filter(
    (n) => n.estado !== "no_aplica" && !(n.estado === "disponible" && n.calidad_dato === "alta")
  );

  // Cross-reference NIS brecha → IROs afectados por categoría ESG
  const CAT_PATTERNS: Record<string, RegExp> = {
    ambiental:  /emisi|co2|ghg|carbon|energi|agua|residuo|biodiversi|climat|ambient|contamin/i,
    social:     /labor|person|salud|segur|igualdad|comunidad|trabajador|derechos|emplead|cadena/i,
    gobernanza: /gobern|etica|corrupci|riesg|transparenc|cumplimient|directiv|consejo|gesti/i,
  };
  const iroRefsByCat = Object.fromEntries(
    Object.entries(CAT_PATTERNS).map(([cat, regex]) => [
      cat,
      clientIros.filter((iro) => regex.test(iro.tema_esg)).map((iro) => `IRO-${iro.n_iro}`),
    ])
  );

  const nisBrechas = nisConBrecha.length
    ? `\nMAPA DE BRECHAS NIS/IBSO:\n${nisConBrecha
        .map((n) => {
          const refs = iroRefsByCat[n.categoria]?.join(", ") ?? "";
          const iroRef = refs ? ` — IROs afectados: ${refs}` : "";
          return `${n.ibso_label} [${n.categoria}]: ${n.estado} (calidad: ${n.calidad_dato})${n.accion ? ` — acción: ${n.accion}` : ""}${iroRef}`;
        })
        .join("\n")}`
    : "";

  const benchmarkData = `Empresas comparadas: ${JSON.stringify(benchmarkResult.companies_snapshot, null, 2)}
Campos analizados: ${JSON.stringify(benchmarkResult.fields_snapshot, null, 2)}
Comparación detallada: ${JSON.stringify(benchmarkResult.comparison, null, 2)}
Síntesis del analista: ${benchmarkResult.narrative}`;

  // Leer template desde DB (con fallback al hardcoded en DEFAULT_PROMPTS)
  const template = await getPrompt("dm.report");

  return template
    .replaceAll("{{client_name}}", client.name)
    .replaceAll("{{client_context}}", clientContext)
    .replaceAll("{{esrs_context}}", esrsContext)
    .replaceAll("{{iro_inventory}}", iroInventory)
    .replaceAll("{{nis_brechas}}", nisBrechas)
    .replaceAll("{{benchmark_data}}", benchmarkData);
}

// ── GET: retorna el último reporte DM + verifica batch si pending ───────────

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("client_documents")
    .select("id, file_name, created_at, markdown_content, parse_status, batch_id")
    .eq("client_id", id)
    .eq("kind", "dm_report")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  // ── Chequeo de batch pendiente ──────────────────────────────────────────
  if (doc?.parse_status === "pending" && doc?.batch_id) {
    try {
      const anthropic = createAnthropicClient();
      const batch = await anthropic.beta.messages.batches.retrieve(doc.batch_id);

      if (batch.processing_status === "ended") {
        // D-162 helper centralizado
        const ext = await extractBatchResult(anthropic, doc.batch_id, ReportNarrativeSchema, "dm-report batch");
        const narrative = ext.parsed;
        const batchError = ext.error;
        const { inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens } = ext;

        const model = getModelConfig("elena").model;
        void logAiCall({
          userEmail: user,
          role: "elena",
          clientId: id,
          model,
          inputTokens,
          outputTokens,
          cacheCreationTokens,
          cacheReadTokens,
          latencyMs: Date.now() - new Date(doc.created_at).getTime(),
          error: batchError,
          workflowStage: "dm_report",
        });

        if (narrative) {
          // Re-leer datos de benchmark para reconstruir la sección "Detalle del Benchmark".
          // Sin esto, companies/fields/comparison llegan vacíos y esa sección queda en blanco.
          const [clientData, benchRes] = await Promise.all([
            getClient(id).catch(() => null),
            admin
              .from("dm_benchmark_results")
              .select("companies_snapshot, comparison")
              .eq("client_id", id)
              .eq("status", "done")
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle(),
          ]);
          const clientName = clientData?.name ?? "Cliente";
          const companies = (
            (benchRes.data?.companies_snapshot ?? []) as Array<{ name: string }>
          ).map((c) => c.name);
          const comparison = (
            benchRes.data?.comparison ?? {}
          ) as Record<string, Record<string, string>>;
          const fields = Object.keys(comparison);
          const markdown = buildMarkdownReport(clientName, narrative, companies, fields, comparison);

          await admin
            .from("client_documents")
            .update({ markdown_content: markdown, parse_status: "ok", batch_id: null })
            .eq("id", doc.id);

          return NextResponse.json({
            data: { ...doc, markdown_content: markdown, parse_status: "ok" },
          });
        } else {
          await admin
            .from("client_documents")
            .update({ parse_status: "failed" })
            .eq("id", doc.id);

          return NextResponse.json({
            data: { ...doc, parse_status: "failed" },
          });
        }
      }
      // Batch todavía en progreso — devolver estado actual
    } catch {
      // Si el check falla, no bloquear al usuario
    }
  }

  return NextResponse.json({ data: doc ?? null });
}

// ── POST: submite batch Opus para generar reporte (retorna en <3s) ──────────
// Flujo:
//   1. Valida benchmark result (status=done)
//   2. Inserta client_document con parse_status=pending
//   3. Submite batch Anthropic Batch API con Opus
//   4. Guarda batch_id en el documento
//   5. Retorna {status:"pending"} al frontend inmediatamente
//   6. Frontend hace polling del GET cada 5s
//   7. GET detecta batch ended → procesa → actualiza doc → retorna ok

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const rl = await checkAiRateLimit(user, {
    max: 3,
    windowMs: 5 * 60_000,
    errorMessage: "Demasiadas solicitudes de reporte. Espera 5 minutos antes de reintentar.",
  });
  if (rl) return NextResponse.json({ error: rl.message }, { status: 429 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY no configurada" }, { status: 500 });
  }

  const client = await getClient(id).catch(() => null);
  if (!client) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = GenerateBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "result_id requerido" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: benchmarkResult, error: fetchErr } = await admin
    .from("dm_benchmark_results")
    .select("*")
    .eq("id", parsed.data.result_id)
    .eq("client_id", id)
    .eq("status", "done")
    .single();

  if (fetchErr || !benchmarkResult) {
    return NextResponse.json({ error: "Resultado de benchmark no encontrado o aún no completado" }, { status: 404 });
  }

  if (anthropicBreaker.isOpen) {
    return NextResponse.json({ error: anthropicBreaker.userMessage }, { status: 503 });
  }

  // Contexto IA: IROs validados + brechas NIS + marcos normativos Etapa 2 + decisiones validación Etapa 10
  const [irosRes, nisRes, referentesRes, validacionRes] = await Promise.all([
    admin
      .from("client_iro_inventory")
      .select("n_iro, tema_esg, descripcion, tipo, cadena, horizonte, score_impacto, score_financiero, confianza")
      .eq("client_id", id)
      .eq("incluido", true)
      .order("n_iro", { ascending: true }),
    admin
      .from("client_nis_assessment")
      .select("ibso_label, categoria, estado, calidad_dato, accion")
      .eq("client_id", id)
      .order("sort_order", { ascending: true }),
    admin
      .from("dm_referentes")
      .select("enabled_frameworks")
      .eq("client_id", id)
      .maybeSingle(),
    admin
      .from("dm_validaciones")
      .select("iro_decisions, notas, fecha_junta")
      .eq("client_id", id)
      .maybeSingle(),
  ]);

  const clientIros = (irosRes.data ?? []) as ClientIroRow[];
  const clientNis  = (nisRes.data ?? []) as ClientNisRow[];
  const enabledFrameworks = (referentesRes.data?.enabled_frameworks as string[] | null) ?? [];
  const validacion = validacionRes.data;

  // Decisiones de la junta de validación (Etapa 10) como contexto de compromisos del cliente
  const validacionSection = validacion
    ? (() => {
        const decisions = validacion.iro_decisions as Record<string, { decision?: string; justificacion?: string }> | null;
        if (!decisions || Object.keys(decisions).length === 0) return "";
        const lines = Object.entries(decisions)
          .map(([iroId, d]) => `  IRO ${iroId}: ${d.decision ?? "sin decisión"}${d.justificacion ? ` — ${d.justificacion}` : ""}`)
          .join("\n");
        const notasLine = validacion.notas ? `\nNotas de junta: ${validacion.notas}` : "";
        return `\n\nDECISIONES DE VALIDACIÓN CON CLIENTE (Etapa 10 — ${validacion.fecha_junta ?? "fecha pendiente"}):\n${lines}${notasLine}`;
      })()
    : "";

  // Incluir marcos normativos de Etapa 2 + compromisos validación como trazabilidad del reporte
  const clientContext = buildClientContext(client) +
    (enabledFrameworks.length > 0
      ? `\n\nMarcos normativos ESG aplicables: ${enabledFrameworks.join(", ")}`
      : "") +
    validacionSection;
  const prompt = await buildReportPrompt(
    client,
    clientContext,
    benchmarkResult as {
      companies_snapshot: unknown;
      fields_snapshot: unknown;
      comparison: unknown;
      narrative: string;
    },
    clientIros,
    clientNis,
  );

  const anthropic = createAnthropicClient();
  const model = getModelConfig("elena").model;
  const fileName = `reporte-dm-${client.name.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.md`;

  // Eliminar reporte anterior e insertar nuevo en estado pending
  await admin.from("client_documents").delete().eq("client_id", id).eq("kind", "dm_report");

  const { data: docRow, error: insertErr } = await admin
    .from("client_documents")
    .insert({
      client_id: id,
      uploaded_by: user,
      kind: "dm_report",
      file_name: fileName,
      file_type: "md",
      mime_type: "text/markdown",
      size_bytes: 1, // placeholder — el contenido real llega cuando el batch termina
      storage_path: `dm-reports/${id}/report-${Date.now()}.md`,
      markdown_content: "",
      parse_status: "pending",
    })
    .select("id, file_name, created_at")
    .single();

  if (insertErr || !docRow) {
    return NextResponse.json({ error: "Error al crear registro de reporte" }, { status: 500 });
  }

  // Submeter batch con Opus — retorna en <3s, procesamiento 2-5 min
  try {
    const batch = await anthropic.beta.messages.batches.create(
      {
        requests: [{
          custom_id: docRow.id,
          params: {
            model,
            max_tokens: 16000, // cap subido may-2026 — 6000 truncaba secciones extendidas (priority_topics + benchmark_gaps + proximos_pasos + roadmap_90d) (stop_reason=max_tokens → parse_status=failed)
            system: [{
              type: "text",
              text: "Eres un consultor senior de Doble Materialidad (ESRS/GRI/CSRD). Redactas reportes ejecutivos claros y accionables. Responde solo con JSON válido.",
               
              cache_control: { type: "ephemeral" },
            }],
            messages: [{ role: "user", content: prompt }],
          },
        }],
      },
      { signal: AbortSignal.timeout(15_000) }
    );

    anthropicBreaker.recordSuccess();

    await admin
      .from("client_documents")
      .update({ batch_id: batch.id })
      .eq("id", docRow.id);

  } catch (e) {
    anthropicBreaker.recordFailure();
    const errMsg = e instanceof Error ? e.message : "Error Anthropic";
    await admin.from("client_documents").delete().eq("id", docRow.id);
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }

  return NextResponse.json({
    data: {
      doc_id: docRow.id,
      file_name: docRow.file_name,
      created_at: docRow.created_at,
      parse_status: "pending",
    },
  });
}

function buildMarkdownReport(
  clientName: string,
  narrative: z.infer<typeof ReportNarrativeSchema>,
  companies: string[],
  fields: string[],
  comparison: Record<string, Record<string, string>>,
): string {
  const riskSection = narrative.risks
    .map((r) => `### ${r.title} (Severidad: ${r.severity})\n${r.description}`)
    .join("\n\n");

  const strengthsSection = narrative.strengths.map((s) => `- ${s}`).join("\n");
  const areasSection = narrative.improvement_areas.map((a) => `- ${a}`).join("\n");

  const recoSection = narrative.recommendations
    .map((r) => `- **[${r.priority.replace(/_/g, " ")}]** ${r.action}`)
    .join("\n");

  const comparisonTable = Object.entries(comparison)
    .map(([fieldKey, values]) => {
      // El key ya contiene el label legible (ej: E1_impact → "E1 Cambio Climático — Impacto")
      // Se busca en fields_snapshot si se pasa; si no, formatea el key
      const fieldLabel = fields.find((f) => f === fieldKey)
        ?? fieldKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      const rows = Object.entries(values)
        .map(([company, value]) => `| ${company} | ${value} |`)
        .join("\n");
      return `#### ${fieldLabel}\n| Empresa | Situación |\n|---------|----------|\n${rows}`;
    })
    .join("\n\n");

  const companiesLine = companies.length ? `*Empresas analizadas: ${companies.join(", ")}*\n\n` : "";
  const fieldsLine = fields.length ? `*Campos analizados: ${fields.join(", ")}*\n\n` : "";

  const proximosPasosSection = narrative.proximos_pasos?.length
    ? `\n---\n\n## Próximos Pasos\n\n${narrative.proximos_pasos
        .map((p) => `- **[${p.plazo}]** ${p.servicio}: ${p.descripcion}`)
        .join("\n")}\n`
    : "";

  // Embeber JSON completo al final — recuperado por export-dm-pdf para el PDF estructurado
  const embeddedJson = `\n---NARRATIVE_JSON_START---\n${JSON.stringify(narrative)}\n---NARRATIVE_JSON_END---\n`;

  return `# Reporte de Doble Materialidad — ${clientName}
*Generado: ${new Date().toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" })}*

---

## Resumen Ejecutivo

${narrative.executive_summary}

---

## Posicionamiento vs Grupo de Referencia

${companiesLine}${narrative.client_position}

---

## Riesgos Identificados

${riskSection}

---

## Fortalezas

${strengthsSection}

---

## Áreas de Mejora

${areasSection}

---

## Recomendaciones

${recoSection}

---

## Detalle del Benchmark

${fieldsLine}${comparisonTable}
${proximosPasosSection}${embeddedJson}`;
}
