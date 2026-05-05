import "server-only";
import { isDevMode } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeProgress,
  type QuestionnaireBundle,
  type QuestionnaireResponse,
  type QuestionnaireResponseData,
  type QuestionnaireTemplate,
} from "./types";

const DEV_TEMPLATE: QuestionnaireTemplate = {
  service_key: "doble-materialidad",
  label: "Doble Materialidad",
  schema: {
    sections: [
      {
        key: "informacion-base",
        label: "Información base",
        description: "Datos generales, giro, ubicación, tamaño",
        fields: [
          { key: "razon_social", label: "Razón social", type: "text", required: true },
          { key: "rfc", label: "RFC", type: "text" },
          { key: "empleados", label: "Empleados directos", type: "number" },
        ],
      },
    ],
  },
  version: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export async function getQuestionnaireBundle(
  clientId: string,
  serviceKey: string
): Promise<QuestionnaireBundle | null> {
  if (isDevMode()) {
    return {
      template: DEV_TEMPLATE,
      response: null,
      progress: computeProgress(DEV_TEMPLATE.schema, {}),
    };
  }

  const supabase = createAdminClient();

  const { data: tplRow, error: tplErr } = await supabase
    .from("questionnaire_templates")
    .select("*")
    .eq("service_key", serviceKey)
    .maybeSingle();

  if (tplErr) throw new Error(`Error leyendo template: ${tplErr.message}`);
  if (!tplRow) return null;

  const template = tplRow as QuestionnaireTemplate;

  const { data: respRow, error: respErr } = await supabase
    .from("questionnaire_responses")
    .select("*")
    .eq("client_id", clientId)
    .eq("service_key", serviceKey)
    .maybeSingle();

  if (respErr) throw new Error(`Error leyendo responses: ${respErr.message}`);

  const response = (respRow as QuestionnaireResponse | null) ?? null;
  const responsesData = response?.responses ?? {};
  const progress = computeProgress(template.schema, responsesData);

  return { template, response, progress };
}

// Error tipado para conflicto optimistic-lock — el caller mapea a HTTP 409.
export class QuestionnaireConflictError extends Error {
  constructor(public serverUpdatedAt: string) {
    super("CONFLICT");
    this.name = "QuestionnaireConflictError";
  }
}

export async function upsertQuestionnaireResponse(opts: {
  clientId: string;
  serviceKey: string;
  responses: QuestionnaireResponseData;
  completedSections: string[];
  actorEmail: string;
  // Optimistic lock: si viene, debe coincidir con updated_at server actual o se rechaza.
  expectedUpdatedAt?: string | null;
}): Promise<QuestionnaireResponse> {
  if (isDevMode()) {
    throw new Error("Supabase no configurado (dev mode). Llena .env.local para guardar respuestas.");
  }

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("questionnaire_responses")
    .select("id, created_by, updated_at")
    .eq("client_id", opts.clientId)
    .eq("service_key", opts.serviceKey)
    .maybeSingle();

  if (existing) {
    // Optimistic concurrency: rechazar si otro consultor ya guardó cambios.
    if (
      opts.expectedUpdatedAt !== undefined &&
      opts.expectedUpdatedAt !== null &&
      existing.updated_at !== opts.expectedUpdatedAt
    ) {
      throw new QuestionnaireConflictError(existing.updated_at);
    }
    const { data, error } = await supabase
      .from("questionnaire_responses")
      .update({
        responses: opts.responses,
        completed_sections: opts.completedSections,
        updated_by: opts.actorEmail,
      })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw new Error(`Error actualizando: ${error.message}`);
    return data as QuestionnaireResponse;
  }

  const { data, error } = await supabase
    .from("questionnaire_responses")
    .insert({
      client_id: opts.clientId,
      service_key: opts.serviceKey,
      responses: opts.responses,
      completed_sections: opts.completedSections,
      created_by: opts.actorEmail,
      updated_by: opts.actorEmail,
    })
    .select()
    .single();

  if (error) throw new Error(`Error creando: ${error.message}`);
  return data as QuestionnaireResponse;
}
