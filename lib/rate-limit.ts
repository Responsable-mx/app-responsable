/**
 * lib/rate-limit.ts
 *
 * Rate limiting genérico para endpoints HTTP (no-IA).
 * Fuente de verdad: tabla `rate_limit_hits` (cross-instancias serverless).
 * Fail-open: si la query falla, permite el request.
 *
 * Diferencia con lib/ai/rate-limit.ts:
 *   - Ese usa `ai_calls` y mide uso de IA (créditos, costos).
 *   - Este usa `rate_limit_hits` y protege endpoints contra tráfico excesivo.
 *
 * Uso:
 *   const limited = await checkRateLimit(`GET:/api/clients:${email}`, { max: 60, windowMs: 60_000 });
 *   if (limited) return NextResponse.json({ error: limited.message }, { status: 429 });
 */

import { createAdminClient } from "@/lib/supabase/admin";

export interface RateLimitResult {
  limited: true;
  message: string;
  retryAfterMs: number;
}

export interface RateLimitOptions {
  /** Número máximo de hits permitidos en la ventana */
  max: number;
  /** Ventana en milisegundos */
  windowMs: number;
  /** Mensaje personalizado (opcional) */
  errorMessage?: string;
}

/**
 * Comprueba si `key` superó el rate limit en la ventana dada.
 * Inserta un hit y cuenta los anteriores en la misma ventana.
 * Retorna null si NO está limitado, o RateLimitResult si sí.
 */
export async function checkRateLimit(
  key: string,
  opts: RateLimitOptions
): Promise<RateLimitResult | null> {
  const { max, windowMs, errorMessage } = opts;
  const windowSec = Math.round(windowMs / 1_000);
  const windowMinutes = Math.ceil(windowMs / 60_000);

  try {
    const admin = createAdminClient();
    const windowStart = new Date(Date.now() - windowMs).toISOString();

    // Contar hits existentes en la ventana (sin insertar aún)
    const { count } = await admin
      .from("rate_limit_hits")
      .select("id", { count: "exact", head: true })
      .eq("key", key)
      .gte("created_at", windowStart);

    if ((count ?? 0) >= max) {
      return {
        limited: true,
        retryAfterMs: windowMs,
        message:
          errorMessage ??
          `Demasiadas solicitudes. Espera ${windowMinutes} minuto${windowMinutes !== 1 ? "s" : ""} antes de reintentar.`,
      };
    }

    // Registrar este hit (fire-and-forget — aceptamos pequeña condición de carrera)
    // Para un equipo de 8-20 personas la carrera es irrelevante.
    void admin
      .from("rate_limit_hits")
      .insert({ key })
      .then(() => null, (e: unknown) => console.error("[checkRateLimit] insert hit failed:", e));

    // Limpiar hits viejos cada ~100 requests (1% del tiempo) para no crecer indefinidamente
    if (Math.random() < 0.01) {
      const cutoff = new Date(Date.now() - Math.max(windowMs, 3_600_000)).toISOString(); // min 1h
      void admin
        .from("rate_limit_hits")
        .delete()
        .lt("created_at", cutoff)
        .then(() => null, () => null);
    }

    return null;
  } catch (e) {
    // Fail-open: no bloquear al usuario si la query de rate limit falla
    console.error("[checkRateLimit] DB error — fail-open:", e);
    return null;
  }
}

/** Construye la key estándar para un endpoint autenticado */
export function rateLimitKey(method: string, path: string, email: string): string {
  return `${method}:${path}:${email}`;
}
