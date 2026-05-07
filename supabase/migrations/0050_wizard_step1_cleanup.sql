-- ─────────────────────────────────────────────────────────────
-- 0050 — questionnaire_templates: eliminar nombre_empresa y
--        servicio_contratado del paso 1 del wizard.
--
-- Ambos campos eran redundantes con datos ya capturados en el
-- perfil del cliente (clients.name y clients.services).
-- Con Option A, services se asigna desde ClientForm — el wizard
-- solo captura información específica del engagement.
--
-- Campos que quedan en el paso 1 después de esta migración:
--   alcance_geografico, propuesta_comercial_url,
--   relacion_empresas, pagina_web
--
-- Aditiva sobre schema JSONB. No toca questionnaire_responses
-- (los datos históricos de esos campos quedan en el JSONB de
-- respuestas pero ya no se renderizan en el wizard).
-- ─────────────────────────────────────────────────────────────

UPDATE public.questionnaire_templates
SET schema = jsonb_set(
  schema,
  '{steps,0,fields}',
  (
    SELECT jsonb_agg(f ORDER BY idx)
    FROM jsonb_array_elements(schema -> 'steps' -> 0 -> 'fields')
         WITH ORDINALITY AS t(f, idx)
    WHERE f ->> 'key' NOT IN ('nombre_empresa', 'servicio_contratado')
  )
)
WHERE service_key = 'doble-materialidad';
