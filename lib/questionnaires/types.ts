// Tipos del cuestionario por servicio.
// Schema vive en BD (questionnaire_templates.schema JSONB), tipado aquí para UI.

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "select"
  | "multiselect";

export type SelectOption = {
  value: string;
  label: string;
};

export type QuestionField = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: SelectOption[]; // para select / multiselect
  placeholder?: string;
  helper?: string;
};

export type QuestionSection = {
  key: string;
  label: string;
  description?: string;
  fields: QuestionField[];
};

export type QuestionnaireSchema = {
  sections: QuestionSection[];
};

export type QuestionnaireTemplate = {
  service_key: string;
  label: string;
  schema: QuestionnaireSchema;
  version: number;
  created_at: string;
  updated_at: string;
};

// Respuestas: { [section_key]: { [field_key]: value } }
export type FieldValue = string | number | boolean | string[] | null;
export type SectionResponses = Record<string, FieldValue>;
export type QuestionnaireResponseData = Record<string, SectionResponses>;

export type QuestionnaireResponse = {
  id: string;
  client_id: string;
  service_key: string;
  responses: QuestionnaireResponseData;
  completed_sections: string[];
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

// Resultado bundle GET endpoint.
export type QuestionnaireBundle = {
  template: QuestionnaireTemplate;
  response: QuestionnaireResponse | null;
  progress: {
    totalFields: number;
    filledFields: number;
    pct: number;
    sectionProgress: Record<string, { filled: number; total: number; pct: number }>;
  };
};

export function countSectionFields(section: QuestionSection): number {
  return section.fields.length;
}

export function isFieldFilled(value: FieldValue): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return !Number.isNaN(value);
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.length > 0;
  return false;
}

export function computeProgress(
  template: QuestionnaireSchema,
  responses: QuestionnaireResponseData
): QuestionnaireBundle["progress"] {
  let totalFields = 0;
  let filledFields = 0;
  const sectionProgress: Record<string, { filled: number; total: number; pct: number }> = {};

  for (const section of template.sections) {
    const sectionResp = responses[section.key] ?? {};
    const total = section.fields.length;
    let filled = 0;
    for (const field of section.fields) {
      if (isFieldFilled(sectionResp[field.key] ?? null)) filled++;
    }
    sectionProgress[section.key] = {
      filled,
      total,
      pct: total === 0 ? 100 : Math.round((filled / total) * 100),
    };
    totalFields += total;
    filledFields += filled;
  }

  return {
    totalFields,
    filledFields,
    pct: totalFields === 0 ? 0 : Math.round((filledFields / totalFields) * 100),
    sectionProgress,
  };
}
