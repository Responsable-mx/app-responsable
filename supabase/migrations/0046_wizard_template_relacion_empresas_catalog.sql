-- ─────────────────────────────────────────────────────────────
-- 0046 — questionnaire_templates: relacion_empresas
--        usa catálogo dinámico de clientes existentes
--
-- Cambia el campo relacion_empresas de tipo "text" a "multiselect"
-- con catalog="clients". El renderer de QuestionnaireTab fetcha
-- /api/clients?catalog=1&exclude=<clientId> para obtener la lista.
-- Aditiva — compatible con valores string legacy (normalización en renderer).
-- ─────────────────────────────────────────────────────────────

UPDATE public.questionnaire_templates
SET schema = jsonb_set(
  schema,
  '{steps,0,fields,4}',
  '{
    "key": "relacion_empresas",
    "label": "Relación con otras empresas del sistema",
    "type": "multiselect",
    "catalog": "clients",
    "hint": "Madre / hija / hermana — selecciona los clientes relacionados"
  }'::jsonb
)
WHERE service_key = 'doble-materialidad'
  AND (schema -> 'steps' -> 0 -> 'fields' -> 4 ->> 'key') = 'relacion_empresas';
