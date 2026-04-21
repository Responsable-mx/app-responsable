import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ClientInput } from "@/lib/validation";

export type Client = {
  id: string;
  name: string;
  sector: string | null;
  countries: string[] | null;
  size: string | null;
  info_general: string | null;
  business_model: string | null;
  impacts: string | null;
  regulatory_context: string | null;
  sustainability_strategy: string | null;
  stakeholders: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

const ALL_COLUMNS =
  "id,name,sector,countries,size,info_general,business_model,impacts,regulatory_context,sustainability_strategy,stakeholders,created_by,updated_by,created_at,updated_at";

/** Lista todos los clientes. Todos los consultores ven todos. */
export async function listClients(): Promise<Client[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("clients")
    .select(ALL_COLUMNS)
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`listClients: ${error.message}`);
  return (data ?? []) as Client[];
}

export async function getClient(id: string): Promise<Client | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("clients")
    .select(ALL_COLUMNS)
    .eq("id", id)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getClient: ${error.message}`);
  return (data as Client) ?? null;
}

export async function createClientRow(
  input: ClientInput,
  createdBy: string
): Promise<Client> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("clients")
    .insert({
      name: input.name,
      sector: input.sector ?? null,
      countries: input.countries ?? null,
      size: input.size ?? null,
      info_general: input.info_general ?? null,
      business_model: input.business_model ?? null,
      impacts: input.impacts ?? null,
      regulatory_context: input.regulatory_context ?? null,
      sustainability_strategy: input.sustainability_strategy ?? null,
      stakeholders: input.stakeholders ?? null,
      created_by: createdBy,
      updated_by: createdBy,
    })
    .select(ALL_COLUMNS)
    .single();
  if (error) throw new Error(`createClient: ${error.message}`);
  return data as Client;
}

export async function updateClientRow(
  id: string,
  input: Partial<ClientInput>,
  updatedBy: string
): Promise<Client> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("clients")
    .update({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.sector !== undefined ? { sector: input.sector } : {}),
      ...(input.countries !== undefined ? { countries: input.countries } : {}),
      ...(input.size !== undefined ? { size: input.size } : {}),
      ...(input.info_general !== undefined
        ? { info_general: input.info_general }
        : {}),
      ...(input.business_model !== undefined
        ? { business_model: input.business_model }
        : {}),
      ...(input.impacts !== undefined ? { impacts: input.impacts } : {}),
      ...(input.regulatory_context !== undefined
        ? { regulatory_context: input.regulatory_context }
        : {}),
      ...(input.sustainability_strategy !== undefined
        ? { sustainability_strategy: input.sustainability_strategy }
        : {}),
      ...(input.stakeholders !== undefined
        ? { stakeholders: input.stakeholders }
        : {}),
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(ALL_COLUMNS)
    .single();
  if (error) throw new Error(`updateClient: ${error.message}`);
  return data as Client;
}

export async function deleteClientRow(id: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("clients").delete().eq("id", id);
  if (error) throw new Error(`deleteClient: ${error.message}`);
}
