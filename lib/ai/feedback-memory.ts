import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// -- Memoria de feedback IA (Wave 3c - D) --
// Lee ultimos N rechazos (rating=down) del rol + cliente y los formatea
// como ejemplos "a evitar" para inyectar al system prompt.
//
// Por que cliente+rol: las correcciones de Nuvoil sobre Aurora no aplican
// igual a Cemex sobre Rebeca. Memoria contextualizada > memoria global.
//
// Por que ultimos N: con 8 consultores piloto, N=5 ya da senal suficiente
// sin saturar prompt. Tope hard 10.

// Cache 5 min -- el feedback cambia raramente (thumbs-down esporadico).
// Key: `${role}:${clientId ?? "global"}`
const feedbackCache = new Map<string, { count: number; text: string; fetchedAt: number }>();
const FEEDBACK_TTL_MS = 300_000;

const REASON_LABEL: Record<string, string> = {
  factually_wrong: "datos incorrectos",
  sector_off: "sector equivocado",
  bad_format: "mal formato",
  language: "idioma raro",
  too_generic: "muy generico",
  missed_context: "ignoro contexto",
  other: "otro motivo",
};

export type FeedbackMemoryOptions = {
  role: string;
  clientId: string | null;
  limit?: number;
};

/**
 * Cuenta cuantos rechazos vigentes hay. Cacheado 5 min -- se llama en
 * cada mensaje de chat como guardia antes de buildFeedbackMemoryBlock.
 */
export async function countActiveFeedback(opts: FeedbackMemoryOptions): Promise<number> {
  const cacheKey = `${opts.role}:${opts.clientId ?? "global"}`;
  const cached = feedbackCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < FEEDBACK_TTL_MS) return cached.count;

  const limit = Math.min(opts.limit ?? 5, 10);
  const admin = createAdminClient();
  let query = admin
    .from("ia_feedback")
    .select("id", { count: "exact", head: true })
    .eq("role", opts.role)
    .eq("rating", "down")
    .not("reason_code", "is", null)
    .limit(limit);
  if (opts.clientId) {
    query = query.eq("client_id", opts.clientId);
  } else {
    query = query.is("client_id", null);
  }
  const { count, error } = await query;
  const result = error || count === null ? 0 : Math.min(count, limit);
  const existing = feedbackCache.get(cacheKey);
  feedbackCache.set(cacheKey, { count: result, text: existing?.text ?? "", fetchedAt: Date.now() });
  return result;
}

/**
 * Devuelve texto formateado con los ultimos rechazos. Vacio si no hay.
 * Se inyecta como tercer bloque del system prompt con cache_control ephemeral.
 */
export async function buildFeedbackMemoryBlock(opts: FeedbackMemoryOptions): Promise<string> {
  const cacheKey = `${opts.role}:${opts.clientId ?? "global"}`;
  const cached = feedbackCache.get(cacheKey);
  if (cached && cached.text !== "" && Date.now() - cached.fetchedAt < FEEDBACK_TTL_MS) {
    return cached.text;
  }

  const limit = Math.min(opts.limit ?? 5, 10);
  const admin = createAdminClient();

  let query = admin
    .from("ia_feedback")
    .select("message_excerpt, reason_code, reason_text, created_at")
    .eq("role", opts.role)
    .eq("rating", "down")
    .not("reason_code", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (opts.clientId) {
    query = query.eq("client_id", opts.clientId);
  } else {
    query = query.is("client_id", null);
  }

  const { data, error } = await query;
  if (error || !data || data.length === 0) return "";

  const lines = data.map((row, i) => {
    const reasonLabel = row.reason_code ? REASON_LABEL[row.reason_code] ?? row.reason_code : "sin razon";
    const excerpt = (row.message_excerpt as string).slice(0, 200).replace(/\s+/g, " ").trim();
    const reasonText = row.reason_text ? ` -- "${(row.reason_text as string).slice(0, 100)}"` : "";
    return `${i + 1}. [${reasonLabel}${reasonText}] Respuesta evitar: "${excerpt}${excerpt.length >= 200 ? "..." : ""}"`;
  });

  const text = [
    "<feedback_consultor>",
    `Estos son los ultimos ${data.length} ejemplo${data.length > 1 ? "s" : ""} de respuestas tuyas que el consultor marco como NO utiles, con la razon. Aprende de estos patrones para NO repetirlos:`,
    "",
    ...lines,
    "",
    "Cuando contestes, evita explicitamente reproducir el patron que fallo (sector mal identificado, datos imprecisos, formato pobre, jerga inglesa, etc.). Si tienes duda, prefiere pedir aclaracion antes que repetir el error.",
    "</feedback_consultor>",
  ].join("\n");

  feedbackCache.set(cacheKey, { count: data.length, text, fetchedAt: Date.now() });
  return text;
}