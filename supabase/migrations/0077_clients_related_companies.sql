-- 0077: Mover "Relación con otras empresas del sistema" del cuestionario al perfil del cliente

-- 1. Nueva columna en clients
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS related_companies text;

COMMENT ON COLUMN public.clients.related_companies IS
  'Relación con otras empresas en el sistema ResponSable (madre / hija / hermana). Atributo del cliente, no del engagement.';

-- 2. Eliminar campo relacion_empresas del wizard step 1
UPDATE public.questionnaire_templates
SET schema = jsonb_set(
  schema,
  '{steps,0,fields}',
  (
    SELECT jsonb_agg(f ORDER BY idx)
    FROM jsonb_array_elements(schema->'steps'->0->'fields')
         WITH ORDINALITY AS t(f, idx)
    WHERE f->>'key' != 'relacion_empresas'
  )
)
WHERE service_key = 'doble-materialidad';
