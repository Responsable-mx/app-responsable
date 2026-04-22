import { createClient } from "@/lib/supabase/server";
import { isAuthorized, isAdmin } from "@/lib/users";
import type { NextRequest } from "next/server";

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Whitelist check. Fuente primaria: tabla authorized_users.
 * Fallback: env var AUTHORIZED_EMAILS (seguridad en rollout).
 */
export async function isAuthorizedEmail(email: string): Promise<boolean> {
  return isAuthorized(email);
}

/**
 * Sincrónico solo para compatibilidad con código anterior.
 * Deprecated — usar isAuthorizedEmail (async) en código nuevo.
 */
export function isAuthorizedEmailSync(email: string): boolean {
  const authorized = (process.env.AUTHORIZED_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return authorized.includes(email.trim().toLowerCase());
}

/**
 * Valida sesión y devuelve email del usuario. Null si no autenticado.
 * En dev mode (sin Supabase) devuelve dev@localhost para no bloquear.
 */
export async function requireUser(): Promise<string | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl || supabaseUrl === "https://xxx.supabase.co") {
    return "dev@localhost";
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email ?? "";
  if (!email) return null;
  return normalizeEmail(email);
}

/**
 * Requiere sesión + rol admin. Devuelve email si admin, null si no.
 * Usar en endpoints de configuración.
 */
export async function requireAdmin(): Promise<string | null> {
  const email = await requireUser();
  if (!email) return null;
  // En dev mode, dev@localhost pasa como admin para no bloquear UI local.
  if (email === "dev@localhost") return email;
  return (await isAdmin(email)) ? email : null;
}

/** Valida `Authorization: Bearer CRON_SECRET`. */
export function verifyCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}
