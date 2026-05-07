-- 0058 — Elimina el campo pagina_web del paso 1 del wizard doble-materialidad.
-- La URL del sitio corporativo ahora vive en clients.website_url (mig 0057).
-- Filtra el array de fields del step 0 descartando el campo pagina_web.
UPDATE public.questionnaire_templates
SET schema = jsonb_set(
  schema,
  '{steps,0,fields}',
  (
    SELECT jsonb_agg(f ORDER BY idx)
    FROM jsonb_array_elements(schema -> 'steps' -> 0 -> 'fields')
      WITH ORDINALITY AS t(f, idx)
    WHERE f ->> 'key' != 'pagina_web'
  )
)
WHERE service_key = 'doble-materialidad'
  AND (schema -> 'steps' -> 0 -> 'fields') IS NOT NULL;
