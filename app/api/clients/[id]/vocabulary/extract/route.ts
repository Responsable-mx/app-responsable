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

  // Carga los primeros 3 documentos parseados del cliente como fuente
  const { data: docs } = await sb
    .from("client_documents")
    .select("markdown_content, file_name")
    .eq("client_id", id)
    .eq("parse_status", "ok")
    .not("markdown_content", "is", null)
    .order("created_at", { ascending: false })
    .limit(3);

  if (!docs || docs.length === 0) {
    return NextResponse.json({ error: "El cliente no tiene documentos analizados. Sube documentos primero." }, { status: 400 });
  }

  const globalSynonyms = await loadGlobalSynonyms();
  const knownTerms = globalSynonyms.map((s) => s.responsable_term).join(", ");

  const docsText = docs
    .map((d, i) => `[Documento ${i + 1}: ${d.file_name}]\n${(d.markdown_content as string).slice(0, 15_000)}`)
    .join("\n\n---\n\n");

  const anthropic = new Anthropic();
  const model = getModelConfig("aurora"); // Sonnet — requiere comprensión contextual

  const t0 = Date.now();
  const response = await anthropic.messages.create({
    model: model.model,
    max_tokens: 1024,
    system: [{ type: "text", text: EXTRACT_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `Analiza estos documentos de la empresa cliente e identifica términos propios que usan para referirse a conceptos de sostenibilidad.

Términos de referencia que usa ResponSable (terminología estándar):
${knownTerms}

Documentos:
${docsText}

Encuentra términos que el cliente usa que son equivalentes o similares a los de la lista de referencia, pero con diferente nombre. Solo incluye términos donde hay equivalencia clara.

Responde SOLO con JSON válido:
{
  "proposals": [
    { "client_term": "como lo llama el cliente", "responsable_term": "equivalente en terminología ResponSable", "confidence": "high|medium|low" }
  ]
}

Máximo 10 propuestas. Solo incluye las que tengas certeza razonable. confidence=high si la equivalencia es obvia, medium si es inferida, low si es supuesta.`,
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
    return NextResponse.json({ proposals: json.proposals ?? [] });
  } catch {
    return NextResponse.json({ proposals: [] });
  }
}
