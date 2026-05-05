import { z } from "zod";

// ── Catálogos ────────────────────────────────────────────────
export const CatalogCategorySchema = z.enum([
  "business_segments",
  "frameworks",
  "applicable_regulations",
  "policies",
  "certifications",
  "material_topics",
  "maturity_levels",
  "sectors",
  "countries",
  "revenue_models",
  "client_sizes",
  "services",
  "seniority_levels",
]);
export type CatalogCategoryId = z.infer<typeof CatalogCategorySchema>;

export const CatalogItemInputSchema = z.object({
  category: CatalogCategorySchema,
  value: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9_]+$/, "Solo minúsculas, números y guiones bajos")
    .optional(),
  label: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  group_name: z.string().trim().max(60).optional().nullable(),
  sort_order: z.number().int().min(0).max(10000).optional(),
  is_active: z.boolean().optional(),
});

export const ReorderCatalogSchema = z.object({
  category: CatalogCategorySchema,
  ordered_ids: z.array(z.string()).min(1).max(500),
});

// ── Usuarios ─────────────────────────────────────────────────
export const UserRoleSchema = z.enum(["admin", "consultor"]);

export const UserInputSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  role: UserRoleSchema,
  full_name: z.string().trim().max(120).optional().nullable(),
  active: z.boolean().optional(),
  seniority_level: z.string().trim().max(60).optional().nullable(),
});

export const AssignConsultorSchema = z.object({
  user_email: z.string().trim().toLowerCase().email().max(200),
  seniority_level: z.string().trim().max(60).optional().nullable(),
});

export const UpdateConsultorSenioritySchema = z.object({
  seniority_level: z.string().trim().max(60).nullable(),
});

export const UserPatchSchema = UserInputSchema.partial().omit({ email: true });

// ── Prompts ──────────────────────────────────────────────────
export const PromptKeySchema = z.enum([
  "system.app_navigation",
  "system.base_rules",
  "role.aurora",
  "role.rebeca",
  "role.elena",
  "role.valeria",
]);

export const PromptUpdateSchema = z.object({
  content: z.string().trim().min(10).max(50000),
});

export const PromptVersionLabelSchema = z.object({
  label: z.string().trim().max(80).nullable(),
});


export const ClientSizeSchema = z.enum([
  "micro",
  "pyme",
  "mediana",
  "grande",
  "corporativo",
]);

const catalogArray = z.array(z.string().trim().min(1).max(80)).max(50);

export const ClientInputSchema = z.object({
  // Identificación
  name: z.string().trim().min(2, "Nombre muy corto").max(200),
  sector: z.string().trim().max(120).optional().nullable(),
  subsector: z.string().trim().max(120).optional().nullable(),
  countries: z.array(z.string().trim().min(2).max(80)).max(30).optional(),
  size: ClientSizeSchema.optional().nullable(),

  // Atributos estructurados (nuevos)
  business_segments: catalogArray.optional(),
  frameworks: catalogArray.optional(),
  applicable_regulations: catalogArray.optional(),
  policies_in_place: catalogArray.optional(),
  certifications: catalogArray.optional(),
  material_topics: catalogArray.optional(),
  maturity_level: z.string().trim().max(60).optional().nullable(),
  has_double_materiality: z.boolean().optional().nullable(),
  has_sustainability_report: z.boolean().optional().nullable(),
  has_sustainability_strategy: z.boolean().optional().nullable(),

  // URLs públicas de documentos (PDF, web, Drive). Opcionales.
  sustainability_strategy_url: z
    .string()
    .trim()
    .max(600)
    .optional()
    .nullable(),
  sustainability_report_url: z
    .string()
    .trim()
    .max(600)
    .optional()
    .nullable(),
  double_materiality_url: z
    .string()
    .trim()
    .max(600)
    .optional()
    .nullable(),

  // Narrativa legacy — text libre (se conserva durante transición)
  info_general: z.string().max(20000).optional().nullable(),
  business_model: z.string().max(20000).optional().nullable(),
  impacts: z.string().max(20000).optional().nullable(),
  regulatory_context: z.string().max(20000).optional().nullable(),
  sustainability_strategy: z.string().max(20000).optional().nullable(),
  stakeholders: z.string().max(20000).optional().nullable(),

  // Narrativa estructurada — 6 JSONB con schema propio.
  // Aceptamos cualquier objeto; el form garantiza la forma antes de enviar.
  info_general_json: z.record(z.string(), z.unknown()).optional().nullable(),
  business_model_json: z.record(z.string(), z.unknown()).optional().nullable(),
  impacts_json: z.record(z.string(), z.unknown()).optional().nullable(),
  regulatory_context_json: z.record(z.string(), z.unknown()).optional().nullable(),
  sustainability_strategy_json: z.record(z.string(), z.unknown()).optional().nullable(),
  stakeholders_json: z.record(z.string(), z.unknown()).optional().nullable(),
});

export type ClientInput = z.infer<typeof ClientInputSchema>;

export const RoleSchema = z.enum(["aurora", "rebeca", "elena", "valeria"]);
export type RoleId = z.infer<typeof RoleSchema>;

export const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(30000),
});

export const ChatRequestSchema = z.object({
  role: RoleSchema,
  clientId: z.string().uuid().optional().nullable(),
  messages: z.array(ChatMessageSchema).min(1).max(50),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;
