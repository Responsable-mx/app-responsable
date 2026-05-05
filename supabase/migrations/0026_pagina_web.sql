-- ─────────────────────────────────────────────────────────────
-- 0026 — Agregar pagina_web en step 1 (informacion-base)
-- Habilita que la IA tenga URL del sitio corporativo del cliente
-- ─────────────────────────────────────────────────────────────

UPDATE public.questionnaire_templates
SET schema = jsonb_set(
  schema,
  '{steps,0,fields}',
  schema->'steps'->0->'fields' || jsonb_build_array(
    jsonb_build_object(
      'key','pagina_web',
      'label','Página web corporativa',
      'type','text',
      'hint','URL del sitio oficial — la IA usará este dominio como fuente primaria'
    )
  )
),
    version = 5,
    updated_at = now()
WHERE service_key = 'doble-materialidad';

-- Re-seed Altamira con pagina_web
UPDATE public.questionnaire_responses
SET responses = jsonb_set(
  responses,
  '{informacion-base,pagina_web}',
  jsonb_build_object(
    'value', 'https://altamira.com.mx',
    'source_type', 'consultor_only',
    'sources', '[]'::jsonb,
    'validated', true,
    'updated_at', to_char(now(),'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  )
),
    updated_by = 'seed@responsable.net',
    updated_at = now()
WHERE client_id = '11111111-1111-1111-1111-111111111111'::uuid
  AND service_key = 'doble-materialidad';
