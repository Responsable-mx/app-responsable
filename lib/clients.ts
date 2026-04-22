import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ClientInput } from "@/lib/validation";

/** Dev mode: sin Supabase configurado, evitamos tirar 500. */
export function isDevMode(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return !url || url === "https://xxx.supabase.co";
}

/**
 * Wrapper uniforme para operaciones que tocan Supabase:
 *  - En dev mode devuelve el fallback (lectura) o lanza error descriptivo (mutación).
 *  - En producción ejecuta la operación normal.
 * Kind determina el mensaje de error de las mutaciones.
 */
type ReadOp<T> = { kind: "read"; fallback: T; run: () => Promise<T> };
type WriteOp<T> = {
  kind: "write";
  action: "crear" | "editar" | "eliminar";
  run: () => Promise<T>;
};
function withDevModeFallback<T>(op: ReadOp<T>): Promise<T>;
function withDevModeFallback<T>(op: WriteOp<T>): Promise<T>;
async function withDevModeFallback<T>(
  op: ReadOp<T> | WriteOp<T>
): Promise<T> {
  if (isDevMode()) {
    if (op.kind === "read") return op.fallback;
    throw new Error(
      `Supabase no configurado (dev mode). Llena .env.local para ${op.action} clientes.`
    );
  }
  return op.run();
}

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

export function listClients(): Promise<Client[]> {
  return withDevModeFallback<Client[]>({
    kind: "read",
    fallback: [],
    async run() {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("clients")
        .select(ALL_COLUMNS)
        .order("updated_at", { ascending: false })
        .limit(500);
      if (error) throw new Error(`listClients: ${error.message}`);
      return (data ?? []) as Client[];
    },
  });
}

export function getClient(id: string): Promise<Client | null> {
  return withDevModeFallback<Client | null>({
    kind: "read",
    fallback: null,
    async run() {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("clients")
        .select(ALL_COLUMNS)
        .eq("id", id)
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`getClient: ${error.message}`);
      return (data as Client) ?? null;
    },
  });
}

export function createClientRow(
  input: ClientInput,
  createdBy: string
): Promise<Client> {
  return withDevModeFallback<Client>({
    kind: "write",
    action: "crear",
    async run() {
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
    },
  });
}

export function updateClientRow(
  id: string,
  input: Partial<ClientInput>,
  updatedBy: string
): Promise<Client> {
  return withDevModeFallback<Client>({
    kind: "write",
    action: "editar",
    async run() {
      const admin = createAdminClient();
      const patch: Record<string, unknown> = {
        updated_by: updatedBy,
        updated_at: new Date().toISOString(),
      };
      const KEYS: Array<keyof ClientInput> = [
        "name",
        "sector",
        "countries",
        "size",
        "info_general",
        "business_model",
        "impacts",
        "regulatory_context",
        "sustainability_strategy",
        "stakeholders",
      ];
      for (const k of KEYS) {
        if (input[k] !== undefined) patch[k] = input[k];
      }

      const { data, error } = await admin
        .from("clients")
        .update(patch)
        .eq("id", id)
        .select(ALL_COLUMNS)
        .single();
      if (error) throw new Error(`updateClient: ${error.message}`);
      return data as Client;
    },
  });
}

export function deleteClientRow(id: string): Promise<void> {
  return withDevModeFallback<void>({
    kind: "write",
    action: "eliminar",
    async run() {
      const admin = createAdminClient();
      const { error } = await admin.from("clients").delete().eq("id", id);
      if (error) throw new Error(`deleteClient: ${error.message}`);
    },
  });
}

// ── Completitud (F1) ─────────────────────────────────────────
/**
 * Cuántos de los 6 bloques están llenos (≥20 chars de contenido útil).
 * Se usa en el selector de cliente para mostrar "3/6 bloques" y avisar al
 * consultor cuando el contexto está incompleto.
 */
export function clientContextCompleteness(
  client: Pick<
    Client,
    | "info_general"
    | "business_model"
    | "impacts"
    | "regulatory_context"
    | "sustainability_strategy"
    | "stakeholders"
  >
): { filled: number; total: 6 } {
  const blocks = [
    client.info_general,
    client.business_model,
    client.impacts,
    client.regulatory_context,
    client.sustainability_strategy,
    client.stakeholders,
  ];
  const filled = blocks.filter((b) => (b?.trim().length ?? 0) >= 20).length;
  return { filled, total: 6 };
}
