-- ─────────────────────────────────────────────────────────────
-- 0049 — questionnaire_templates: agrega placeholder al campo
--        servicio_contratado para reemplazar "Buscar empresa…"
--
-- El renderer MultiCombobox usa field.placeholder cuando existe.
-- Sin placeholder el default es "Buscar…" (neutro).
-- Aditiva — no altera datos existentes.
-- ─────────────────────────────────────────────────────────────

UPDATE public.questionnaire_templates
SET schema = jsonb_set(
  schema,
  '{steps,0,fields,1}',
  '{
    "key": "servicio_contratado",
    "label": "Servicio contratado",
    "type": "multiselect",
    "catalog": "services",
    "placeholder": "Buscar servicio…"
  }'::jsonb
)
WHERE service_key = 'doble-materialidad'
  AND (schema -> 'steps' -> 0 -> 'fields' -> 1 ->> 'key') = 'servicio_contratado';
