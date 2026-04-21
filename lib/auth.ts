import { createClient } from "@/lib/supabase/server";
import type { NextRequest } from "next/server";

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Check whitelist AUTHORIZED_EMAILS. */
export function isAuthorizedEmail(email: string): boolean {
  const authorized = (process.env.AUTHORIZED_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return authorized.includes(email.toLowerCase());
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

/** Valida `Authorization: Bearer CRON_SECRET`. */
export function verifyCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}
