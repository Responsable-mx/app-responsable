import "server-only";
import { isDevMode } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

// Cuentas del sistema (seed scripts, servicios automáticos). No representan
// consultores reales — la UI no debe mostrar su email/nombre como autor.
const SYSTEM_ACCOUNTS = new Set([
  "seed@responsable.net",
  "system@responsable.net",
  "cron@responsable.net",
]);

export function isSystemAccount(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (SYSTEM_ACCOUNTS.has(normalized)) return true;
  // Defensa extra: cualquier prefijo de scripts (seed-*, system-*, cron-*)
  // o dominio interno reservado. Evita leakear en UI si seed cambia de nombre.
  return /^(seed|system|cron)([-_].*)?@/.test(normalized);
}

export type UserRole = "admin" | "consultor" | "cliente";

export type AuthorizedUser = {
  email: string;
  role: UserRole;
  full_name: string | null;
  active: boolean;
  invited_by: string | null;
  last_login: string | null;
  seniority_level: string | null;
  // Solo para role='cliente'. NULL para admin/consultor. DB constraint
  // authorized_users_cliente_requires_client garantiza no-null cuando role='cliente'.
  client_id: string | null;
  is_test_account: boolean;
  // Overrides de acceso por módulo. {} = usar defaults del rol.
  feature_flags: Record<string, boolean>;
  created_at: string;
  updated_at: string;
};

export type UserInput = {
  email: string;
  role: UserRole;
  full_name?: string | null;
  active?: boolean;
  seniority_level?: string | null;
  client_id?: string | null;
  is_test_account?: boolean;
};

/**
 * Admins fallback de emergencia — leen de env var si la DB no está lista.
 * Una vez desplegada la migración 0006 y poblada la tabla, esta env var
 * puede eliminarse. Mientras tanto es safety net para no quedarnos sin
 * acceso si la tabla responde vacía por un error.
 */
function fallbackAdmins(): string[] {
  return (process.env.AUTHORIZED_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

const SEED_DEV_USERS: AuthorizedUser[] = [
  {
    email: "gwenaelle@responsable.net",
    role: "admin",
    full_name: "Gwenaelle Gérard",
    active: true,
    invited_by: null,
    last_login: null,
    seniority_level: "director",
    client_id: null,
    is_test_account: false,
    feature_flags: {},
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
  },
  {
    email: "nblondel@s-peak.com",
    role: "admin",
    full_name: "Nicolás Blondel",
    active: true,
    invited_by: null,
    last_login: null,
    seniority_level: "director",
    client_id: null,
    is_test_account: false,
    feature_flags: {},
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
  },
  {
    email: "elian@responsable.net",
    role: "admin",
    full_name: "Elian",
    active: true,
    invited_by: null,
    last_login: null,
    seniority_level: null,
    client_id: null,
    is_test_account: false,
    feature_flags: {},
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
  },
];

export async function listUsers(): Promise<AuthorizedUser[]> {
  if (isDevMode()) return SEED_DEV_USERS;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("authorized_users")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) {
    console.error("[users] list error:", error.message);
    return SEED_DEV_USERS;
  }
  // D-23: si la tabla devuelve cero filas en producción (wipe accidental, migración mala),
  // el fallback a cuentas hardcodeadas es silencioso. Logear explícitamente para que
  // el admin vea la alerta en los logs del servidor y pueda investigar.
  if (((data ?? []) as AuthorizedUser[]).length === 0) {
    console.error(
      "[users] WARN: authorized_users vacío en producción — usando fallback de emergencia. " +
      "Verificar integridad de DB: SELECT count(*) FROM authorized_users;"
    );
    return SEED_DEV_USERS;
  }
  return (data as AuthorizedUser[]);
}

export async function getUser(email: string): Promise<AuthorizedUser | null> {
  const normalized = email.trim().toLowerCase();
  if (isDevMode()) {
    return SEED_DEV_USERS.find((u) => u.email === normalized) ?? null;
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("authorized_users")
    .select("email,active,role,client_id,seniority_level,full_name,is_test_account,feature_flags,created_at,updated_at")
    .eq("email", normalized)
    .maybeSingle();
  if (error) {
    console.error("[users] get error:", error.message);
    return null;
  }
  return (data as AuthorizedUser) ?? null;
}

export async function isAuthorized(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  // Dev mode: dev@localhost pasa como admin autorizado para UI local.
  if (isDevMode() && normalized === "dev@localhost") return true;
  const user = await getUser(normalized);
  if (user) return user.active;
  // Fallback a env var solo si la DB no devolvió nada (seguridad en rollout).
  return fallbackAdmins().includes(normalized);
}

export async function isAdmin(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  // Dev mode: dev@localhost se trata como admin para ver Configuración local.
  if (isDevMode() && normalized === "dev@localhost") return true;
  const user = await getUser(normalized);
  if (user) return user.active && user.role === "admin";
  // Fallback: cualquier email en env var se trata como admin.
  return fallbackAdmins().includes(normalized);
}

export async function isConsultor(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (isDevMode() && normalized === "dev@localhost") return true;
  const user = await getUser(normalized);
  return !!user && user.active && (user.role === "admin" || user.role === "consultor");
}

export async function isClient(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (isDevMode() && normalized === "dev@localhost") return false;
  const user = await getUser(normalized);
  return !!user && user.active && user.role === "cliente";
}

export async function getUserClientId(email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (isDevMode() && normalized === "dev@localhost") return null;
  const user = await getUser(normalized);
  if (!user || !user.active || user.role !== "cliente") return null;
  return user.client_id;
}

export async function createUser(
  input: UserInput,
  invitedBy: string
): Promise<AuthorizedUser> {
  if (isDevMode()) {
    throw new Error(
      "Supabase no configurado (dev mode). Los usuarios se gestionan en producción."
    );
  }
  const email = input.email.trim().toLowerCase();
  // Defensa en profundidad: rol cliente requiere client_id en código,
  // además del CHECK en DB (authorized_users_cliente_requires_client).
  if (input.role === "cliente" && !input.client_id) {
    throw new Error("createUser: role 'cliente' requires client_id");
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("authorized_users")
    .insert({
      email,
      role: input.role,
      full_name: input.full_name ?? null,
      active: input.active ?? true,
      seniority_level: input.seniority_level ?? null,
      client_id: input.client_id ?? null,
      invited_by: invitedBy,
    })
    .select("*")
    .single();
  if (error) throw new Error(`createUser: ${error.message}`);
  return data as AuthorizedUser;
}

export async function updateUser(
  email: string,
  patch: Partial<UserInput>
): Promise<AuthorizedUser> {
  if (isDevMode()) {
    throw new Error("Supabase no configurado (dev mode).");
  }
  const normalized = email.trim().toLowerCase();
  const admin = createAdminClient();
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.role !== undefined) update.role = patch.role;
  if (patch.full_name !== undefined) update.full_name = patch.full_name;
  if (patch.active !== undefined) update.active = patch.active;
  if (patch.seniority_level !== undefined) update.seniority_level = patch.seniority_level;
  if (patch.client_id !== undefined) update.client_id = patch.client_id;
  if (patch.is_test_account !== undefined) update.is_test_account = patch.is_test_account;
  if ((patch as { feature_flags?: Record<string, boolean> }).feature_flags !== undefined) {
    update.feature_flags = (patch as { feature_flags?: Record<string, boolean> }).feature_flags;
  }

  // Defensa en profundidad: si el patch deja al usuario como cliente sin client_id,
  // bloquear antes de tocar DB (el CHECK constraint también lo atajaría).
  if (patch.role === "cliente" && patch.client_id === null) {
    throw new Error("updateUser: role 'cliente' requires client_id");
  }

  const { data, error } = await admin
    .from("authorized_users")
    .update(update)
    .eq("email", normalized)
    .select("*")
    .single();
  if (error) throw new Error(`updateUser: ${error.message}`);
  return data as AuthorizedUser;
}

export async function deleteUser(email: string): Promise<void> {
  if (isDevMode()) {
    throw new Error("Supabase no configurado (dev mode).");
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("authorized_users")
    .delete()
    .eq("email", email.trim().toLowerCase());
  if (error) throw new Error(`deleteUser: ${error.message}`);
}

export async function getUserRoles(email: string): Promise<{
  isAdmin: boolean;
  isClient: boolean;
  clientId: string | null;
  featureFlags: Record<string, boolean>;
}> {
  const normalized = email.trim().toLowerCase();
  if (isDevMode() && normalized === "dev@localhost") {
    return { isAdmin: true, isClient: false, clientId: null, featureFlags: {} };
  }
  const user = await getUser(normalized);
  if (user && user.active) {
    return {
      isAdmin: user.role === "admin",
      isClient: user.role === "cliente",
      clientId: user.role === "cliente" ? user.client_id : null,
      featureFlags: (user.feature_flags as Record<string, boolean>) ?? {},
    };
  }
  return { isAdmin: fallbackAdmins().includes(normalized), isClient: false, clientId: null, featureFlags: {} };
}

export async function recordLogin(email: string): Promise<void> {
  if (isDevMode()) return;
  try {
    const admin = createAdminClient();
    await admin
      .from("authorized_users")
      .update({ last_login: new Date().toISOString() })
      .eq("email", email.trim().toLowerCase());
  } catch (e) {
    console.error("[users] recordLogin error:", e);
  }
}
