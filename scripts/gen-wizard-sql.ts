// Genera SQL para migrar template doble-materialidad al formato wizard 9 pasos.
// Lee app/dev/clientes-wizard-preview/mock-data.ts y produce:
//   - UPDATE questionnaire_templates con schema wizard
//   - DELETE responses viejas
//   - INSERT response Altamira con todos los 84 campos + sources

import { MOCK_STEPS, type MockStep, type MockField, type SourceType } from "../app/dev/clientes-wizard-preview/mock-data";

type WizardField = {
  key: string;
  label: string;
  type: "text" | "textarea" | "multiselect";
  options?: string[];
  hint?: string;
};

type WizardStep = {
  step: number;
  key: string;
  title: string;
  subtitle: string;
  ai_can_fill: boolean;
  only_double_materialidad: boolean;
  fields: WizardField[];
};

type WizardSchema = {
  version: 2;
  type: "wizard";
  steps: WizardStep[];
};

function slugify(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const stepsTemplate: WizardStep[] = MOCK_STEPS.map((s: MockStep) => ({
  step: s.step,
  key: slugify(s.title),
  title: s.title,
  subtitle: s.subtitle,
  ai_can_fill: s.aiCanFill,
  only_double_materialidad: !!s.onlyDoubleMaterialidad,
  fields: s.fields.map((f: MockField) => {
    const out: WizardField = {
      key: f.key,
      label: f.label,
      type: f.type === "multiselect" ? "multiselect" : (f.value && f.value.length > 80 ? "textarea" : "text"),
    };
    if (f.options) out.options = f.options;
    if (f.hint) out.hint = f.hint;
    return out;
  }),
}));

const wizardSchema: WizardSchema = {
  version: 2,
  type: "wizard",
  steps: stepsTemplate,
};

// Response Altamira: { [step_key]: { [field_key]: { value, source_type, sources, validated } } }
const altamiraResponses: Record<string, Record<string, unknown>> = {};
const completedSections: string[] = [];

for (const s of MOCK_STEPS) {
  const stepKey = slugify(s.title);
  const stepData: Record<string, unknown> = {};
  let allFilled = true;
  for (const f of s.fields) {
    const sourceType: SourceType = f.sourceType ?? "consultor_only";
    const sources = f.sources ? f.sources.map((src) => ({
      url: src.url,
      title: src.title,
      date: src.date,
      type: src.url.includes("drive.google.com") ? "gdrive" :
            src.url.includes("onedrive") || src.url.includes("sharepoint") ? "onedrive" :
            src.url.startsWith("http") ? "web" : "manual",
    })) : [];
    stepData[f.key] = {
      value: f.value,
      source_type: sourceType,
      sources,
      validated: !!f.validated,
      stale: !!f.stale,
      updated_at: new Date().toISOString(),
    };
    if (f.value === null) allFilled = false;
  }
  altamiraResponses[stepKey] = stepData;
  if (allFilled) completedSections.push(stepKey);
}

const totalFields = MOCK_STEPS.reduce((acc, s) => acc + s.fields.length, 0);
const filledFields = MOCK_STEPS.reduce((acc, s) => acc + s.fields.filter((f) => f.value !== null).length, 0);

// SQL output
const schemaJson = JSON.stringify(wizardSchema).replace(/'/g, "''");
const responsesJson = JSON.stringify(altamiraResponses).replace(/'/g, "''");
const completedSql = completedSections.length > 0
  ? `ARRAY[${completedSections.map((s) => `'${s}'`).join(",")}]::text[]`
  : `ARRAY[]::text[]`;

const sql = `-- ─────────────────────────────────────────────────────────────
-- 0023 — Wizard de cuestionario: 9 pasos, ${totalFields} campos, source tracking
-- Generado por: scripts/gen-wizard-sql.ts (NO EDITAR a mano)
-- ─────────────────────────────────────────────────────────────

-- 1. Actualizar template a wizard 9 pasos
UPDATE public.questionnaire_templates
SET schema = '${schemaJson}'::jsonb,
    label = 'Doble Materialidad (Wizard)',
    version = 2,
    updated_at = now()
WHERE service_key = 'doble-materialidad';

-- 2. Limpiar responses viejas (formato 5-secciones incompatible con wizard)
DELETE FROM public.questionnaire_responses
WHERE service_key = 'doble-materialidad';

-- 3. Re-seed Altamira con respuestas en formato wizard (${filledFields}/${totalFields} campos)
INSERT INTO public.questionnaire_responses (
  client_id, service_key, responses, completed_sections, created_by, updated_by
)
VALUES (
  '11111111-1111-1111-1111-111111111111'::uuid,
  'doble-materialidad',
  '${responsesJson}'::jsonb,
  ${completedSql},
  'seed@responsable.net',
  'seed@responsable.net'
);
`;

import { writeFile } from "node:fs/promises";
import { join } from "node:path";

async function main() {
  const out = join(process.cwd(), "supabase/migrations/0023_wizard_template.sql");
  await writeFile(out, sql, "utf-8");
  console.log(`✓ Generado: ${out}`);
  console.log(`  Steps: ${stepsTemplate.length}, Fields: ${totalFields}, Filled (Altamira): ${filledFields}`);
  console.log(`  Completed sections: ${completedSections.length}`);
}
main();
