-- 0076: Añadir kind='proposal' a client_documents + eliminar propuesta_comercial_url del wizard
-- Nota: el constraint previo ya incluía 'dm_report' (agregado en migración posterior a 0041).
-- El nuevo constraint preserva los 4 valores existentes + agrega 'proposal'.

-- 1. Reemplazar constraint de kind (DO block para nombre dinámico)
DO $$
DECLARE
  v_con text;
BEGIN
  SELECT con.conname INTO v_con
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE con.contype = 'c'
    AND rel.relname = 'client_documents'
    AND nsp.nspname = 'public'
    AND pg_get_constraintdef(con.oid) LIKE '%financial_report%'
  LIMIT 1;

  IF v_con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.client_documents DROP CONSTRAINT %I', v_con);
  END IF;
END $$;

ALTER TABLE public.client_documents
  ADD CONSTRAINT client_documents_kind_check
    CHECK (kind IN ('general', 'sustainability_report', 'financial_report', 'dm_report', 'proposal'));

-- 2. Eliminar campo propuesta_comercial_url del schema del wizard (step 1: informacion-base)
UPDATE public.questionnaire_templates
SET schema = jsonb_set(
  schema,
  '{steps,0,fields}',
  (
    SELECT jsonb_agg(f ORDER BY idx)
    FROM jsonb_array_elements(schema->'steps'->0->'fields')
         WITH ORDINALITY AS t(f, idx)
    WHERE f->>'key' != 'propuesta_comercial_url'
  )
)
WHERE service_key = 'doble-materialidad';
