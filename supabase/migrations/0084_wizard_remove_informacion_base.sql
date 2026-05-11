-- 0084: questionnaire_templates — eliminar step "informacion-base" (step 1)
--
-- El único campo restante (alcance_geografico) ahora vive en
-- client_engagements.alcance (mig 0081) y es editable desde la ficha
-- del cliente. Mantenerlo en el wizard duplicaría la fuente de verdad.
--
-- Los pasos restantes (2-9) se renumeran a 1-8 para mantener continuidad.
-- Los datos históricos en questionnaire_responses.responses["informacion-base"]
-- también se eliminan (campo removido del JSONB de respuestas existentes).

UPDATE public.questionnaire_templates
SET schema = jsonb_set(
  schema,
  '{steps}',
  (
    SELECT jsonb_agg(
      -- Restar 1 al campo "step" de todos los pasos que quedaron
      jsonb_set(step_elem, '{step}', to_jsonb((step_elem->>'step')::int - 1))
      ORDER BY idx
    )
    FROM jsonb_array_elements(schema->'steps') WITH ORDINALITY AS t(step_elem, idx)
    WHERE step_elem->>'key' != 'informacion-base'
  )
)
WHERE service_key = 'doble-materialidad';

-- Limpiar datos históricos: eliminar clave "informacion-base" de todas las respuestas
UPDATE public.questionnaire_responses
SET responses = responses - 'informacion-base'
WHERE responses ? 'informacion-base';
