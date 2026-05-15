import { NextResponse } from "next/server";
import { requireConsultorForClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadGlobalSynonyms } from "@/lib/ai/synonyms";
import Anthropic from "@anthropic-ai/sdk";
import { getModelConfig } from "@/lib/ai/models";
import { logAiCall } from "@/lib/ai/logging";
import { checkAiRateLimit } from "@/lib/ai/rate-limit";

const EXTRACT_SYSTEM = `Eres un experto en terminología de RSE y sostenibilidad corporativa. Analizas documentos de empresas para identificar el vocabulario propio que usan, comparándolo con la terminología estándar de consultoría en sostenibilidad.`;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = await checkAiRateLimit(user, { max: 3, windowMs: 5 * 60_000 });
  if (limited) return NextResponse.json({ error: limited.message }, { status: 429 });

  const sb = createAdminClient();

  // Carga TODOS los docs parseados, ordenados por relevancia de tipo:
  // sustainability_report y dm_report primero (mayor densidad de vocabulario RSE),
  // luego proposal, financial_report y general. Dentro de cada tipo, más reciente primero.
  const { data: allDocs } = await sb
    .from("client_documents")
    .select("markdown_content, file_name, kind")
    .eq("client_id", id)
    .eq("parse_status", "ok")
    .not("markdown_content", "is", null)
    .order("created_at", { ascending: false });

  if (!allDocs || allDocs.length === 0) {
    return NextResponse.json({ error: "El cliente no tiene documentos analizados. Sube documentos primero." }, { status: 400 });
  }

  // Prioridad por tipo — el vocabulario RSE vive en informes de sustentabilidad, no en generales
  const KIND_PRIORITY: Record<string, number> = {
    sustainability_report: 1,
    dm_report: 2,
    proposal: 3,
    financial_report: 4,
    general: 5,
  };
  const sorted = [...allDocs].sort(
    (a, b) => (KIND_PRIORITY[a.kind as string] ?? 9) - (KIND_PRIORITY[b.kind as string] ?? 9)
  );

  // Acumula hasta 80k chars totales, 10k por doc — cubre los docs relevantes sin inflar el prompt
  const CAP_TOTAL = 80_000;
  const CAP_PER_DOC = 10_000;
  let total = 0;
  const docs: typeof sorted = [];
  for (const d of sorted) {
    if (total >= CAP_TOTAL) break;
    docs.push(d);
    total += Math.min((d.markdown_content as string).length, CAP_PER_DOC);
  }

  // Carga términos ya guardados para excluirlos del análisis
  const { data: existingVocab } = await sb
    .from("client_vocabulary")
    .select("client_term")
    .eq("client_id", id);

  const existingTermsSet = new Set(
    (existingVocab ?? []).map((e) => e.client_term.toLowerCase().trim())
  );
  const existingTermsList = (existingVocab ?? []).map((e) => e.client_term);

  const [globalSynonyms] = await Promise.all([loadGlobalSynonyms()]);
  const knownTerms = globalSynonyms.map((s) => s.responsable_term).join(", ");

  const docsText = docs
    .map((d, i) => `[Documento ${i + 1}: ${d.file_name}]\n${(d.markdown_content as string).slice(0, CAP_PER_DOC)}`)
    .join("\n\n---\n\n");

  const alreadySavedBlock = existingTermsList.length > 0
    ? `\nTérminos YA guardados para este cliente (NO repetir en tus propuestas):\n${existingTermsList.join(", ")}\n`
    : "";

  const anthropic = new Anthropic();
  const model = getModelConfig("aurora"); // Sonnet — requiere comprensión contextual

  const t0 = Date.now();
  const response = await anthropic.messages.create({
    model: model.model,
    max_tokens: 2048,
    system: [{ type: "text", text: EXTRACT_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `Analiza estos documentos de la empresa cliente e identifica términos propios que usan para referirse a conceptos de sostenibilidad.

Términos de referencia que usa ResponSable (terminología estándar):
${knownTerms}
${alreadySavedBlock}
Documentos:
${docsText}

Encuentra términos NUEVOS que el cliente usa y que son equivalentes o similares a los de la lista de referencia, pero con diferente nombre. Solo incluye términos donde hay equivalencia clara. No repitas términos ya guardados.

Responde SOLO con JSON válido:
{
  "proposals": [
    { "client_term": "como lo llama el cliente", "responsable_term": "equivalente en terminología ResponSable", "confidence": "high|medium|low" }
  ]
}

Incluye todos los términos que encuentres con equivalencia clara. No hay límite de propuestas — mejor más completo que truncado. Solo incluye los que tengas certeza razonable. confidence=high si la equivalencia es obvia, medium si es inferida, low si es supuesta.`,
      },
    ],
  });

  const latencyMs = Date.now() - t0;
  void logAiCall({
    userEmail: user,
    clientId: id,
    role: "aurora",
    model: model.model,
    workflowStage: "vocabulary_extract",
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    latencyMs,
  });

  const raw = response.content[0]?.type === "text" ? response.content[0].text : "";
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    const json = match ? JSON.parse(match[0]) as { proposals?: Array<{ client_term: string; responsable_term: string; confidence: string }> } : {};
    // Filtro server-side como red de seguridad — descarta cualquier término ya guardado
    const proposals = (json.proposals ?? []).filter(
      (p) => !existingTermsSet.has(p.client_term.toLowerCase().trim())
    );
    return NextResponse.json({ proposals });
  } catch {
    return NextResponse.json({ proposals: [] });
  }
}
