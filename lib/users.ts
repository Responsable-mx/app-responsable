import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type UserRole = "admin" | "consultor";

export type AuthorizedUser = {
  email: string;
  role: UserRole;
  full_name: string | null;
  active: boolean;
  invited_by: string | null;
  last_login: string | null;
  created_at: string;
  updated_at: string;
};

export type UserInput = {
  email: string;
  role: UserRole;
  full_name?: string | null;
  active?: boolean;
};

function isDevMode(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return !url || url === "https://xxx.supabase.co";
}

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
  return ((data ?? []) as AuthorizedUser[]).length > 0
    ? (data as AuthorizedUser[])
    : SEED_DEV_USERS;
}

export async function getUser(email: string): Promise<AuthorizedUser | null> {
  const normalized = email.trim().toLowerCase();
  if (isDevMode()) {
    return SEED_DEV_USERS.find((u) => u.email === normalized) ?? null;
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("authorized_users")
    .select("*")
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
  const user = await getUser(normalized);
  if (user) return user.active;
  // Fallback a env var solo si la DB no devolvió nada (seguridad en rollout).
  return fallbackAdmins().includes(normalized);
}

export async function isAdmin(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  const user = await getUser(normalized);
  if (user) return user.active && user.role === "admin";
  // Fallback: cualquier email en env var se trata como admin.
  return fallbackAdmins().includes(normalized);
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
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("authorized_users")
    .insert({
      email,
      role: input.role,
      full_name: input.full_name ?? null,
      active: input.active ?? true,
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
