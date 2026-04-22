/**
 * Helpers sobre variables de entorno. Centralizado para evitar duplicación
 * (antes había 9 archivos con isDevMode() inline).
 *
 * Client-safe: este archivo NO importa 'server-only'. Los helpers
 * funcionan en server y en cliente (aunque las checks de NEXT_PUBLIC_*
 * son las únicas que el cliente ve).
 */

/**
 * Dev mode = sin Supabase configurado o con URL placeholder.
 * En dev mode, todas las lecturas devuelven fallbacks y las mutaciones
 * lanzan errores descriptivos (no revientan silenciosamente).
 */
export function isDevMode(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return !url || url === "https://xxx.supabase.co";
}
