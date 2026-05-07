/**
 * lib/ai/rate-limit.ts
 *
 * Helper compartido para rate limiting DB-based (cross-instancias serverless).
 * Fuente de verdad: tabla `ai_calls`. Fail-open: si la query falla, permite
 * el request (no bloquear al usuario por problema de infraestructura).
 *
 * Uso:
 *   const limited = await checkAiRateLimit(userEmail, { max: 3, windowMs: 5 * 60_000 });
 *   if (limited) return NextResponse.json({ error: limited.message }, { status: 429 });
 */

import { createAdminClient } from "@/lib/supabase/admin";

export interface RateLimitResult {
  limited: true;
  message: string;
}

export interface RateLimitOptions {
  /** Número máximo de llamadas permitidas en la ventana */
  max: number;
  /** Ventana en milisegundos */
  windowMs: number;
  /** Mensaje personalizado de error (opcional) */
  errorMessage?: string;
}

/**
 * Comprueba si el usuario superó el rate limit leyendo `ai_calls`.
 * Retorna `null` si NO está limitado, o un objeto `{ limited, message }` si sí.
 * Fail-open: errores de DB retornan null (permiten el request).
 */
export async function checkAiRateLimit(
  userEmail: string,
  opts: RateLimitOptions
): Promise<RateLimitResult | null> {
  const { max, windowMs, errorMessage } = opts;
  const windowMinutes = Math.round(windowMs / 60_000);

  try {
    const admin = createAdminClient();
    const windowStart = new Date(Date.now() - windowMs).toISOString();
    const { count } = await admin
      .from("ai_calls")
      .select("id", { count: "exact", head: true })
      .eq("user_email", userEmail)
      .gte("created_at", windowStart);

    if ((count ?? 0) >= max) {
      return {
        limited: true,
        message:
          errorMessage ??
          `Demasiadas solicitudes. Espera ${windowMinutes} minuto${windowMinutes !== 1 ? "s" : ""} antes de reintentar.`,
      };
    }
    return null;
  } catch (e) {
    // Fail-open: no bloquear al usuario si la query de rate limit falla.
    console.error("[checkAiRateLimit] DB error — fail-open:", e);
    return null;
  }
}
