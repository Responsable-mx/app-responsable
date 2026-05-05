import "server-only";
import { isDevMode } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ClientInput } from "@/lib/validation";
import {
  NARRATIVE_SCHEMAS,
  countAllSubfields,
  countFilledInBlock,
  type NarrativeBlockKey,
} from "@/lib/clients/narrative-schemas";

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
  services: string[] | null;
  frameworks: string[] | null;
  applicable_regulations: string[] | null;
  policies_in_place: string[] | null;
  certifications: string[] | null;
  material_topics: string[] | null;
  maturity_level: string | null;
  has_double_materiality: boolean | null;
  has_sustainability_report: boolean | null;
  has_sustainability_strategy: boolean | null;

  // URLs de documentos clave (opcionales)
  sustainability_strategy_url: string | null;
  sustainability_report_url: string | null;
  double_materiality_url: string | null;

  // Narrativa legacy (text, se conserva)
  info_general: string | null;
  business_model: string | null;
  impacts: string | null;
  regulatory_context: string | null;
  sustainability_strategy: string | null;
  stakeholders: string | null;

  // Narrativa estructurada (JSONB)
  info_general_json: Record<string, unknown> | null;
  business_model_json: Record<string, unknown> | null;
  impacts_json: Record<string, unknown> | null;
  regulatory_context_json: Record<string, unknown> | null;
  sustainability_strategy_json: Record<string, unknown> | null;
  stakeholders_json: Record<string, unknown> | null;

  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;

  // Logo opcional (migración 0029). Null/undefined = render monogram fallback en
  // ClientAvatar. Optional para no romper fixtures existentes que no traen el campo.
  logo_url?: string | null;
};

const NARRATIVE_BLOCKS: NarrativeBlockKey[] = [
  "info_general",
  "business_model",
  "impacts",
  "regulatory_context",
  "sustainability_strategy",
  "stakeholders",
];

const STRUCTURED_ARRAYS = [
  "business_segments",
  "frameworks",
  "applicable_regulations",
  "policies_in_place",
  "certifications",
  "material_topics",
] as const;

const JSON_BLOCKS = [
  "info_general_json",
  "business_model_json",
  "impacts_json",
  "regulatory_context_json",
  "sustainability_strategy_json",
  "stakeholders_json",
] as const;

const ALL_COLUMNS = [
  "id,name,sector,subsector,countries,size,logo_url",
  "business_segments,frameworks,applicable_regulations,policies_in_place",
  "certifications,material_topics,maturity_level",
  "has_double_materiality,has_sustainability_report,has_sustainability_strategy",
  "sustainability_strategy_url,sustainability_report_url,double_materiality_url",
  "info_general,business_model,impacts,regulatory_context,sustainability_strategy,stakeholders",
  "info_general_json,business_model_json,impacts_json",
  "regulatory_context_json,sustainability_strategy_json,stakeholders_json",
  "created_by,updated_by,created_at,updated_at",
].join(",");

// Dev-mode seed: 2 clientes fake para poder navegar el mockup sin DB real.
const DEV_SEED_CLIENTS: Client[] = [
  {
    id: "dev-heineken",
    name: "Heineken México",
    sector: "bebidas",
    subsector: "Cervezas",
    countries: ["mx"],
    size: "corporativo",
    business_segments: ["b2b", "b2b2c"],
    services: null,
    frameworks: ["gri", "sbti", "cdp"],
    applicable_regulations: ["nis_mx", "issb_global"],
    policies_in_place: ["etica", "proveedores", "ddhh", "ambiental"],
    certifications: ["esr_cemefi", "iso_14001", "gptw"],
    material_topics: ["cambio_climatico", "agua", "ddhh", "cadena_suministro"],
    maturity_level: "avanzado",
    has_double_materiality: true,
    has_sustainability_report: true,
    has_sustainability_strategy: true,
    sustainability_strategy_url: "https://www.heinekenmexico.com/brew-a-better-world",
    sustainability_report_url: "https://www.heinekenmexico.com/reporte-2023.pdf",
    double_materiality_url: null,
    info_general: null,
    business_model: null,
    impacts: null,
    regulatory_context: null,
    sustainability_strategy: null,
    stakeholders: null,
    info_general_json: {
      unidades_negocio: ["Cervezas MX", "Refrescos MX"],
      productos_principales:
        "Tecate, Heineken 0.0, Dos Equis, Amstel Ultra, Sol, Indio",
      volumen_anual: "42 Mhl/año 2025",
      notas: "3 plantas en MX (Tecate, Monterrey, Orizaba)",
    },
    business_model_json: {
      tipo_ingresos: ["venta_mayorista", "venta_directa"],
      propuesta_valor:
        "Portafolio de cervezas premium y masivas con fuerte presencia en on-trade y modernización del off-trade.",
      dependencias_criticas: [
        "Agua del acuífero Tecate",
        "Aluminio Novelis",
        "Cebada malteada importada",
      ],
    },
    impacts_json: {
      emisiones_alcance_1_2: [
        { medido: true, valor: 45000, base_year: 2023, target: "-30% vs 2023 al 2030" },
      ],
      emisiones_alcance_3: [{ medido: false }],
      agua_m3: [{ medido: true, valor: 18000000, estres_hidrico: true }],
      rotacion_personal_pct: 12,
      diversidad_mujeres_liderazgo_pct: 38,
    },
    regulatory_context_json: {},
    sustainability_strategy_json: {
      pilares: ["Cambio climático", "Cadena circular", "Gente y comunidades"],
      objetivos: [
        { pilar: "Cambio climático", meta: "Net zero alcance 1+2 al 2040", deadline: 2040 },
      ],
      kpis: [
        {
          metrica: "Emisiones alcance 1+2",
          valor_actual: "45000",
          unidad: "tCO2e",
          target: "-30% vs 2023",
          base_year: 2023,
        },
        {
          metrica: "Agua consumida",
          valor_actual: "18",
          unidad: "Mm³",
          target: "-20% al 2030",
          base_year: 2023,
        },
      ],
      reportes_publicados: [
        { ano: 2023, marco: "gri" },
        { ano: 2022, marco: "gri" },
      ],
      materialidad_metodologia: "Encuestas + entrevistas + análisis de prensa",
      materialidad_ano: 2024,
      materialidad_proximo_refresh: 2027,
    },
    stakeholders_json: {
      grupos_clave: [
        {
          grupo: "Comunidades Tecate",
          dependencia: "alta",
          canal: "Mesa trimestral",
          expectativas: "Agua, empleo local, impacto en tráfico",
        },
        {
          grupo: "Proveedores agrícolas MX",
          dependencia: "media",
          canal: "Programa SmartAgri",
          expectativas: "Precio justo, asistencia técnica",
        },
      ],
    },
    created_by: "gwenaelle@responsable.net",
    updated_by: "gwenaelle@responsable.net",
    created_at: "2026-03-01T00:00:00Z",
    updated_at: "2026-04-15T00:00:00Z",
  },
  {
    id: "dev-ikea",
    name: "IKEA México",
    sector: "retail",
    subsector: "Mobiliario hogar",
    countries: ["mx"],
    size: "grande",
    business_segments: ["b2c", "b2b2c"],
    services: null,
    frameworks: ["gri"],
    applicable_regulations: ["nom_035_mx"],
    policies_in_place: ["etica", "diversidad", "ambiental"],
    certifications: ["gptw"],
    material_topics: ["cambio_climatico", "economia_circular", "diversidad"],
    maturity_level: "gestionado",
    has_double_materiality: false,
    has_sustainability_report: false,
    has_sustainability_strategy: true,
    sustainability_strategy_url: null,
    sustainability_report_url: null,
    double_materiality_url: null,
    info_general: null,
    business_model: null,
    impacts: null,
    regulatory_context: null,
    sustainability_strategy: null,
    stakeholders: null,
    info_general_json: {
      productos_principales: "Muebles, decoración, cocina, textil",
      volumen_anual: "3 tiendas físicas + e-commerce MX",
    },
    business_model_json: {
      tipo_ingresos: ["venta_directa"],
      propuesta_valor:
        "Diseño escandinavo democrático, precios accesibles, autoarmado.",
    },
    impacts_json: {},
    regulatory_context_json: {},
    sustainability_strategy_json: {
      pilares: ["Circularidad", "Personas", "Clima positivo"],
      reportes_publicados: [],
    },
    stakeholders_json: {},
    created_by: "elian@responsable.net",
    updated_by: "elian@responsable.net",
    created_at: "2026-02-15T00:00:00Z",
    updated_at: "2026-03-20T00:00:00Z",
  },
];

export function listClients(filter?: {
  search?: string;
  limit?: number;
}): Promise<Client[]> {
  return withDevModeFallback<Client[]>({
    kind: "read",
    fallback: DEV_SEED_CLIENTS,
    async run() {
      const admin = createAdminClient();
      // Tipado: Supabase builder cambia tipo en cada encadenamiento — usamos any
      // para evitar dance de genéricos complejos. La query sigue siendo segura
      // porque los métodos son los mismos; solo varía el orden de .ilike().
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = admin
        .from("clients")
        .select(ALL_COLUMNS)
        .order("updated_at", { ascending: false })
        .limit(filter?.limit ?? 500);
      const term = filter?.search?.trim();
      if (term) {
        // ilike en Postgres: case-insensitive, sin índice full-text.
        // Para <1000 clientes es suficiente; índice GIN si escala.
        q = q.ilike("name", `%${term}%`);
      }
      const { data, error } = await q;
      if (error) throw new Error(`listClients: ${error.message}`);
      return (data ?? []) as unknown as Client[];
    },
  });
}

export function getClient(id: string): Promise<Client | null> {
  return withDevModeFallback<Client | null>({
    kind: "read",
    fallback: DEV_SEED_CLIENTS.find((c) => c.id === id) ?? null,
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

/** Filtra y extrae las keys válidas del input. */
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
    "sustainability_strategy_url",
    "sustainability_report_url",
    "double_materiality_url",
    ...NARRATIVE_BLOCKS,
    ...JSON_BLOCKS,
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

// ── Completitud v3 ───────────────────────────────────────────
/**
 * Mide qué tan lleno está el contexto. Cuenta:
 * - 8 atributos estructurados (grupo llenado = 1).
 * - 1 punto por cada sub-campo de narrativa JSONB que tenga valor.
 *
 * Total: 8 atributos + countAllSubfields() sub-campos narrativos.
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
    | "info_general_json"
    | "business_model_json"
    | "impacts_json"
    | "regulatory_context_json"
    | "sustainability_strategy_json"
    | "stakeholders_json"
  >
): { filled: number; total: number } {
  // 8 atributos
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

  // Sub-campos JSONB
  const narrativeFilled = NARRATIVE_SCHEMAS.reduce((sum, schema) => {
    const jsonCol = schema.jsonColumn;
    const json = (client as unknown as Record<string, unknown>)[jsonCol] as
      | Record<string, unknown>
      | null;
    return sum + countFilledInBlock(schema, json ?? null);
  }, 0);

  const total = 8 + countAllSubfields();
  return {
    filled: arrFilled + singleFilled + narrativeFilled,
    total,
  };
}
