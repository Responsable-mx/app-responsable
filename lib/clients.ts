import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ClientInput } from "@/lib/validation";

export function isDevMode(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return !url || url === "https://xxx.supabase.co";
}

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

  // Identificación
  sector: string | null;
  subsector: string | null;
  countries: string[] | null;
  size: string | null;

  // Atributos estructurados
  business_segments: string[] | null;
  frameworks: string[] | null;
  applicable_regulations: string[] | null;
  policies_in_place: string[] | null;
  certifications: string[] | null;
  material_topics: string[] | null;
  maturity_level: string | null;
  has_double_materiality: boolean | null;
  has_sustainability_report: boolean | null;
  has_sustainability_strategy: boolean | null;

  // Narrativa
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

const NARRATIVE_BLOCKS = [
  "info_general",
  "business_model",
  "impacts",
  "regulatory_context",
  "sustainability_strategy",
  "stakeholders",
] as const;

const STRUCTURED_ARRAYS = [
  "business_segments",
  "frameworks",
  "applicable_regulations",
  "policies_in_place",
  "certifications",
  "material_topics",
] as const;

const ALL_COLUMNS = [
  "id,name,sector,subsector,countries,size",
  "business_segments,frameworks,applicable_regulations,policies_in_place",
  "certifications,material_topics,maturity_level",
  "has_double_materiality,has_sustainability_report,has_sustainability_strategy",
  "info_general,business_model,impacts,regulatory_context,sustainability_strategy,stakeholders",
  "created_by,updated_by,created_at,updated_at",
].join(",");

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
      return (data ?? []) as unknown as Client[];
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
      return (data as unknown as Client) ?? null;
    },
  });
}

/** Extrae solo las keys válidas del input para insert/update. */
function coerceInput(input: Partial<ClientInput>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const KEYS = [
    "name",
    "sector",
    "subsector",
    "countries",
    "size",
    ...STRUCTURED_ARRAYS,
    "maturity_level",
    "has_double_materiality",
    "has_sustainability_report",
    "has_sustainability_strategy",
    ...NARRATIVE_BLOCKS,
  ] as const;
  for (const k of KEYS) {
    const v = input[k as keyof ClientInput];
    if (v !== undefined) out[k] = v;
  }
  return out;
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
      const patch = coerceInput(input);
      patch.created_by = createdBy;
      patch.updated_by = createdBy;
      const { data, error } = await admin
        .from("clients")
        .insert(patch)
        .select(ALL_COLUMNS)
        .single();
      if (error) throw new Error(`createClient: ${error.message}`);
      return data as unknown as Client;
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
      const patch = coerceInput(input);
      patch.updated_by = updatedBy;
      patch.updated_at = new Date().toISOString();
      const { data, error } = await admin
        .from("clients")
        .update(patch)
        .eq("id", id)
        .select(ALL_COLUMNS)
        .single();
      if (error) throw new Error(`updateClient: ${error.message}`);
      return data as unknown as Client;
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

// ── Completitud v2 (14 puntos: 8 atributos + 6 bloques) ──────
/**
 * Mide qué tan lleno está el contexto del cliente.
 * - 8 atributos estructurados (cada grupo con ≥1 valor cuenta como 1)
 * - 6 bloques narrativos (cada uno con ≥20 chars cuenta como 1)
 * Total: 14.
 */
export function clientContextCompleteness(
  client: Pick<
    Client,
    | "business_segments"
    | "frameworks"
    | "applicable_regulations"
    | "policies_in_place"
    | "certifications"
    | "material_topics"
    | "maturity_level"
    | "has_double_materiality"
    | "info_general"
    | "business_model"
    | "impacts"
    | "regulatory_context"
    | "sustainability_strategy"
    | "stakeholders"
  >
): { filled: number; total: 14 } {
  const arrGroups: Array<string[] | null | undefined> = [
    client.business_segments,
    client.frameworks,
    client.applicable_regulations,
    client.policies_in_place,
    client.certifications,
    client.material_topics,
  ];
  const arrFilled = arrGroups.filter((a) => (a?.length ?? 0) > 0).length;
  const singleFilled =
    (client.maturity_level ? 1 : 0) +
    (client.has_double_materiality !== null &&
    client.has_double_materiality !== undefined
      ? 1
      : 0);
  const narrativeFilled = NARRATIVE_BLOCKS.filter(
    (k) => ((client[k] as string | null)?.trim().length ?? 0) >= 20
  ).length;
  return {
    filled: arrFilled + singleFilled + narrativeFilled,
    total: 14,
  };
}
