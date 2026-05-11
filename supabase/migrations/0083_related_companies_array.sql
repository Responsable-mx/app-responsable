-- 0083: related_companies text → text[] (IDs de clientes del sistema)
-- Los valores text libre previos (si los hay) se descartan; el campo era nuevo y vacío en prod.

ALTER TABLE public.clients
  ALTER COLUMN related_companies TYPE text[]
  USING CASE
    WHEN related_companies IS NULL OR related_companies = '' THEN NULL
    ELSE ARRAY[]::text[]  -- descarta free-text previo; campo era vacío
  END;

COMMENT ON COLUMN public.clients.related_companies IS
  'IDs de otros clientes del sistema con los que existe relación (madre / hija / hermana).';
