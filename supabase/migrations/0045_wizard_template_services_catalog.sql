-- ─────────────────────────────────────────────────────────────
-- 0045 — questionnaire_templates: campo servicio_contratado
--        usa catálogo dinámico en lugar de opciones hardcodeadas
--
-- Reemplaza "options" con "catalog": "services" en el campo
-- servicio_contratado del paso 1. El renderer de QuestionnaireTab
-- fetcha /api/catalogs?category=services para obtener las opciones.
-- Aditiva — no altera datos existentes en questionnaire_responses.
-- ─────────────────────────────────────────────────────────────

UPDATE public.questionnaire_templates
SET schema = jsonb_set(
  schema,
  '{steps,0,fields,1}',
  '{
    "key": "servicio_contratado",
    "label": "Servicio contratado",
    "type": "multiselect",
    "catalog": "services"
  }'::jsonb
)
WHERE slug = 'wizard-v2'
  AND (schema -> 'steps' -> 0 -> 'fields' -> 1 ->> 'key') = 'servicio_contratado';
