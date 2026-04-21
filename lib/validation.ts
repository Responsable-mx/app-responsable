import { z } from "zod";

export const ClientSizeSchema = z.enum([
  "micro",
  "pyme",
  "mediana",
  "grande",
  "corporativo",
]);

export const ClientInputSchema = z.object({
  name: z.string().trim().min(2, "Nombre muy corto").max(200),
  sector: z.string().trim().max(120).optional().nullable(),
  countries: z.array(z.string().trim().min(2).max(80)).max(30).optional(),
  size: ClientSizeSchema.optional().nullable(),
  info_general: z.string().max(20000).optional().nullable(),
  business_model: z.string().max(20000).optional().nullable(),
  impacts: z.string().max(20000).optional().nullable(),
  regulatory_context: z.string().max(20000).optional().nullable(),
  sustainability_strategy: z.string().max(20000).optional().nullable(),
  stakeholders: z.string().max(20000).optional().nullable(),
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
