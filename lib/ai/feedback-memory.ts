import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// ── Memoria de feedback IA (Wave 3c — D) ───────────────────
// Lee últimos N rechazos (rating=down) del rol + cliente y los formatea
// como ejemplos "a evitar" para inyectar al system prompt.
//
// Por qué cliente+rol: las correcciones de Nuvoil sobre Aurora no aplican
// igual a Cemex sobre Rebeca. Memoria contextualizada > memoria global.
//
// Por qué últimos N: con 8 consultores piloto, N=5 ya da señal suficiente
// sin saturar prompt. Tope hard 10.
// ───────────────────────────────────────────────────────────

const REASON_LABEL: Record<string, string> = {
  factually_wrong: "datos incorrectos",
  sector_off: "sector equivocado",
  bad_format: "mal formato",
  language: "idioma raro",
  too_generic: "muy genérico",
  missed_context: "ignoró contexto",
  other: "otro motivo",
};

export type FeedbackMemoryOptions = {
  role: string;
  clientId: string | null;
  limit?: number;
};

/**
 * Cuenta cuántos rechazos vigentes hay para mostrar al consultor.
 * Útil para badge "memoria IA: 5 rechazos activos".
 */
export async function countActiveFeedback(opts: FeedbackMemoryOptions): Promise<number> {
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
  if (error || count === null) return 0;
  return Math.min(count, limit);
}

/**
 * Devuelve texto formateado con los últimos rechazos. Vacío si no hay.
 * Se inyecta como tercer bloque del system prompt — sin cache_control
 * para que refleje feedback nuevo sin invalidar bloques cacheados.
 */
export async function buildFeedbackMemoryBlock(opts: FeedbackMemoryOptions): Promise<string> {
  const limit = Math.min(opts.limit ?? 5, 10);
  const admin = createAdminClient();

  // Filtros: rol exacto + cliente exacto (si hay) + solo "down" + con razón
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
    const reasonLabel = row.reason_code ? REASON_LABEL[row.reason_code] ?? row.reason_code : "sin razón";
    const excerpt = (row.message_excerpt as string).slice(0, 200).replace(/\s+/g, " ").trim();
    const reasonText = row.reason_text ? ` — "${(row.reason_text as string).slice(0, 100)}"` : "";
    return `${i + 1}. [${reasonLabel}${reasonText}] Respuesta evitar: "${excerpt}${excerpt.length >= 200 ? "…" : ""}"`;
  });

  return [
    "<feedback_consultor>",
    `Estos son los últimos ${data.length} ejemplo${data.length > 1 ? "s" : ""} de respuestas tuyas que el consultor marcó como NO útiles, con la razón. Aprende de estos patrones para NO repetirlos:`,
    "",
    ...lines,
    "",
    "Cuando contestes, evita explícitamente reproducir el patrón que falló (sector mal identificado, datos imprecisos, formato pobre, jerga inglesa, etc.). Si tienes duda, prefiere pedir aclaración antes que repetir el error.",
    "</feedback_consultor>",
  ].join("\n");
}
