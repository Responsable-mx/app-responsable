-- Reemplaza service_tag TEXT (canon mutable) por service_ids uuid[] (FK inmutable a catalog_items.id).
-- Idempotente: maneja el caso en que service_tag nunca existió en producción.

-- 1. Agregar columna nueva (IF NOT EXISTS = seguro si ya corrió parcialmente)
ALTER TABLE client_documents
  ADD COLUMN IF NOT EXISTS service_ids uuid[] NOT NULL DEFAULT '{}';

-- 2. Migrar + limpiar service_tag solo si la columna existe
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'client_documents' AND column_name = 'service_tag'
  ) THEN
    UPDATE client_documents cd
    SET service_ids = ARRAY(
      SELECT ci.id
      FROM catalog_items ci
      WHERE ci.category = 'services'
        AND ci.value = cd.service_tag
      LIMIT 1
    )
    WHERE cd.service_tag IS NOT NULL
      AND cd.service_tag <> '';

    ALTER TABLE client_documents DROP COLUMN service_tag;
  END IF;
END $$;

-- 3. Índice GIN para queries @> y &&
CREATE INDEX IF NOT EXISTS client_documents_service_ids_gin
  ON client_documents USING GIN(service_ids);
