import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type ClientConsultor = {
  id: string;
  client_id: string;
  user_email: string;
  seniority_level: string | null;
  assigned_at: string;
  assigned_by: string | null;
  full_name: string | null;
  user_seniority_level: string | null;
};

export async function listClientConsultors(
  clientId: string
): Promise<ClientConsultor[]> {
  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("client_consultors")
    .select("id, client_id, user_email, seniority_level, assigned_at, assigned_by")
    .eq("client_id", clientId)
    .order("assigned_at", { ascending: true });
  if (error) throw new Error(`listClientConsultors: ${error.message}`);
  if (!rows || rows.length === 0) return [];

  const emails = rows.map((r) => r.user_email as string);
  const { data: users } = await admin
    .from("authorized_users")
    .select("email, full_name, seniority_level")
    .in("email", emails);

  const userMap = new Map(
    (users ?? []).map((u) => [
      u.email as string,
      { full_name: u.full_name as string | null, seniority_level: u.seniority_level as string | null },
    ])
  );

  return rows.map((row) => {
    const user = userMap.get(row.user_email as string);
    return {
      id: row.id as string,
      client_id: row.client_id as string,
      user_email: row.user_email as string,
      seniority_level: (row.seniority_level as string | null) ?? null,
      assigned_at: row.assigned_at as string,
      assigned_by: (row.assigned_by as string | null) ?? null,
      full_name: user?.full_name ?? null,
      user_seniority_level: user?.seniority_level ?? null,
    };
  });
}

export async function assignConsultor(
  clientId: string,
  userEmail: string,
  seniorityLevel: string | null,
  assignedBy: string
): Promise<ClientConsultor> {
  const admin = createAdminClient();
  const email = userEmail.trim().toLowerCase();
  const { data, error } = await admin
    .from("client_consultors")
    .insert({
      client_id: clientId,
      user_email: email,
      seniority_level: seniorityLevel ?? null,
      assigned_by: assignedBy,
    })
    .select("*")
    .single();
  if (error) throw new Error(`assignConsultor: ${error.message}`);
  return data as unknown as ClientConsultor;
}

export async function updateConsultorSeniority(
  clientId: string,
  userEmail: string,
  seniorityLevel: string | null
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("client_consultors")
    .update({ seniority_level: seniorityLevel })
    .eq("client_id", clientId)
    .eq("user_email", userEmail.trim().toLowerCase());
  if (error) throw new Error(`updateConsultorSeniority: ${error.message}`);
}

// ── Vista inversa: proyectos asignados a un consultor ──────────────────────────

export type ConsultorProject = {
  client_id: string;
  client_name: string;
  /** Override de seniority específico para este proyecto. null = usa global. */
  override_seniority: string | null;
  /** Seniority global del consultor en authorized_users. */
  global_seniority: string | null;
};

/**
 * Retorna los proyectos (clientes) en que está asignado el consultor,
 * con su nivel de seniority efectivo (override > global).
 * Usado en el sidebar para mostrar "Mis proyectos".
 */
export async function listConsultorProjects(
  userEmail: string
): Promise<ConsultorProject[]> {
  const email = userEmail.trim().toLowerCase();
  const admin = createAdminClient();

  // 1. Asignaciones del consultor
  const { data: rows, error } = await admin
    .from("client_consultors")
    .select("client_id, seniority_level")
    .eq("user_email", email)
    .order("assigned_at", { ascending: true });
  if (error) throw new Error(`listConsultorProjects: ${error.message}`);
  if (!rows || rows.length === 0) return [];

  const clientIds = rows.map((r) => r.client_id as string);

  // 2. Nombres de los clientes
  const { data: clients } = await admin
    .from("clients")
    .select("id, name")
    .in("id", clientIds);
  const clientMap = new Map(
    (clients ?? []).map((c) => [c.id as string, c.name as string])
  );

  // 3. Seniority global del consultor (una sola fila)
  const { data: userRow } = await admin
    .from("authorized_users")
    .select("seniority_level")
    .eq("email", email)
    .maybeSingle();
  const globalSeniority = (userRow?.seniority_level as string | null) ?? null;

  return rows.map((row) => ({
    client_id: row.client_id as string,
    client_name: clientMap.get(row.client_id as string) ?? "Cliente",
    override_seniority: (row.seniority_level as string | null) ?? null,
    global_seniority: globalSeniority,
  }));
}

export async function removeConsultor(
  clientId: string,
  userEmail: string
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("client_consultors")
    .delete()
    .eq("client_id", clientId)
    .eq("user_email", userEmail.trim().toLowerCase());
  if (error) throw new Error(`removeConsultor: ${error.message}`);
}
