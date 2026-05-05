// Tipos del cuestionario wizard (v2).
// Schema vive en BD (questionnaire_templates.schema JSONB).
// Backward-compat: el formato v1 (sections) sigue tipado pero deprecado.

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "select"
  | "multiselect";

export type SelectOption = { value: string; label: string };

// ── Wizard schema (v2) — formato actual ───────────────────────

export type WizardField = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[] | SelectOption[]; // simple strings or full options
  placeholder?: string;
  helper?: string;
  hint?: string;
};

export type WizardStep = {
  step: number;
  key: string;
  title: string;
  subtitle: string;
  ai_can_fill: boolean;
  only_double_materialidad: boolean;
  fields: WizardField[];
};

export type WizardSchema = {
  version: 2;
  type: "wizard";
  steps: WizardStep[];
};

// ── v1 deprecado (sections genéricas) ─────────────────────────

export type QuestionField = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: SelectOption[];
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

// ── Per-field response (con source tracking) ──────────────────

export type SourceType = "public" | "interpretation" | "consultor_only";

export type SourceItem = {
  url: string;
  title: string;
  date: string; // ISO YYYY-MM-DD
  type?: "web" | "onedrive" | "gdrive" | "manual";
};

export type FieldValue = string | number | boolean | string[] | null;

export type FieldResponse = {
  value: FieldValue;
  source_type: SourceType;
  sources: SourceItem[];
  validated: boolean;
  stale?: boolean;
  updated_at: string;
};

// Estructura responses: { [step_key]: { [field_key]: FieldResponse } }
export type WizardResponseData = Record<string, Record<string, FieldResponse>>;

// Backward-compat con v1 simple
export type SectionResponses = Record<string, FieldValue>;
export type QuestionnaireResponseData = Record<string, SectionResponses | Record<string, FieldResponse>>;

// ── Bundle returned by GET endpoint ───────────────────────────

export type QuestionnaireTemplate = {
  service_key: string;
  label: string;
  schema: WizardSchema | QuestionnaireSchema; // v2 or v1
  version: number;
  created_at: string;
  updated_at: string;
};

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

// ── Helpers ──────────────────────────────────────────────────

export function isWizardSchema(s: WizardSchema | QuestionnaireSchema): s is WizardSchema {
  return "steps" in s && Array.isArray((s as WizardSchema).steps);
}

export function isFieldResponse(v: unknown): v is FieldResponse {
  return typeof v === "object" && v !== null && "value" in v && "source_type" in v;
}

export function getFieldValue(raw: unknown): FieldValue {
  if (isFieldResponse(raw)) return raw.value;
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") return raw;
  if (Array.isArray(raw)) return raw as string[];
  return null;
}

export function isFieldFilled(value: FieldValue): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return !Number.isNaN(value);
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.length > 0;
  return false;
}

/**
 * Un campo está "completo" cuando:
 *  1. Tiene valor, Y
 *  2. Si source_type es "public" o "interpretation", tiene al menos 1 fuente.
 *
 * Usada en computeProgress para que un campo con interpretation+sin sources
 * cuente como incompleto (pct < 100) y no entre en completedSections,
 * evitando que el autosave quede bloqueado por la validación server-side.
 */
export function isFieldComplete(raw: unknown): boolean {
  if (!isFieldResponse(raw)) return isFieldFilled(getFieldValue(raw));
  if (!isFieldFilled(raw.value)) return false;
  const needsSources = raw.source_type === "public" || raw.source_type === "interpretation";
  if (needsSources && (!raw.sources || raw.sources.length === 0)) return false;
  return true;
}

export function isSourceStale(date: string, asOf: Date = new Date()): boolean {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return false;
  const twoYearsAgo = new Date(asOf);
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  return d < twoYearsAgo;
}

export function computeProgress(
  schema: WizardSchema | QuestionnaireSchema,
  responses: QuestionnaireResponseData
): QuestionnaireBundle["progress"] {
  let totalFields = 0;
  let filledFields = 0;
  const sectionProgress: Record<string, { filled: number; total: number; pct: number }> = {};

  if (isWizardSchema(schema)) {
    for (const step of schema.steps) {
      const stepResp = responses[step.key] ?? {};
      const total = step.fields.length;
      let filled = 0;
      for (const field of step.fields) {
        const raw = (stepResp as Record<string, unknown>)[field.key];
        // isFieldComplete valida sources en campos public/interpretation —
        // sin fuentes el campo cuenta como incompleto aunque tenga valor.
        if (isFieldComplete(raw)) filled++;
      }
      sectionProgress[step.key] = {
        filled,
        total,
        pct: total === 0 ? 100 : Math.round((filled / total) * 100),
      };
      totalFields += total;
      filledFields += filled;
    }
  } else {
    for (const section of schema.sections) {
      const sectionResp = responses[section.key] ?? {};
      const total = section.fields.length;
      let filled = 0;
      for (const field of section.fields) {
        const raw = (sectionResp as Record<string, unknown>)[field.key];
        if (isFieldFilled(getFieldValue(raw))) filled++;
      }
      sectionProgress[section.key] = {
        filled,
        total,
        pct: total === 0 ? 100 : Math.round((filled / total) * 100),
      };
      totalFields += total;
      filledFields += filled;
    }
  }

  return {
    totalFields,
    filledFields,
    pct: totalFields === 0 ? 0 : Math.round((filledFields / totalFields) * 100),
    sectionProgress,
  };
}
