import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorized, isAdmin, isConsultor, isClient, getUserClientId } from "@/lib/users";
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

/**
 * Requiere sesión + rol admin O consultor (NO cliente). Devuelve email
 * si el usuario es interno, null si no. Usar para endpoints internos
 * que un cliente externo no debe alcanzar (chat IA, listado global,
 * mutaciones cross-cliente, etc).
 */
export async function requireConsultorOrAdmin(): Promise<string | null> {
  const email = await requireUser();
  if (!email) return null;
  if (email === "dev@localhost") return email;
  return (await isConsultor(email)) ? email : null;
}

/**
 * Requiere sesión + rol cliente. Devuelve { email, clientId } o null.
 * El clientId se obtiene de authorized_users.client_id (no del JWT)
 * para que un cliente no pueda forzar el id por header. Usar en
 * endpoints específicos del portal cliente.
 */
export async function requireClient(): Promise<{ email: string; clientId: string } | null> {
  const email = await requireUser();
  if (!email) return null;
  if (email === "dev@localhost") return null; // dev mode no simula cliente
  if (!(await isClient(email))) return null;
  const clientId = await getUserClientId(email);
  if (!clientId) return null;
  return { email, clientId };
}

/**
 * Requiere consultor asignado al cliente O admin.
 * Previene IDOR: un consultor no asignado no puede leer/mutar datos del cliente.
 * Admins exentos (acceso a todos los clientes).
 * Returns: email del usuario autenticado, null si sin acceso.
 */
export async function requireConsultorForClient(clientId: string): Promise<string | null> {
  const email = await requireUser();
  if (!email) return null;
  if (email === "dev@localhost") return email;
  // Admins tienen acceso a cualquier cliente
  if (await isAdmin(email)) return email;
  // Consultor: verificar asignación en client_consultors
  const admin = createAdminClient();
  const { data } = await admin
    .from("client_consultors")
    .select("client_id")
    .eq("client_id", clientId)
    .eq("user_email", email)
    .maybeSingle();
  return data ? email : null;
}

/** Valida `Authorization: Bearer CRON_SECRET`. */
export function verifyCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}
