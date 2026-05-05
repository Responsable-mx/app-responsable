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
