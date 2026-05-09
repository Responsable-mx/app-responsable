-- Reemplaza service_tag TEXT (canon mutable) por service_ids uuid[] (FK inmutable a catalog_items.id).
-- Razón: el canon de catalog_items.value es editable por el admin → cualquier doc con service_tag
-- quedaría huérfano silenciosamente. El UUID id es inmutable por diseño.
-- Multi-servicio: un doc puede aplicar a N servicios simultáneamente.

-- 1. Agregar columna nueva
ALTER TABLE client_documents
  ADD COLUMN IF NOT EXISTS service_ids uuid[] NOT NULL DEFAULT '{}';

-- 2. Migrar valores existentes: buscar UUID del catalog_item cuyo value coincida
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

-- 3. Índice GIN para queries con @> (contiene) e &&  (intersecta)
CREATE INDEX IF NOT EXISTS client_documents_service_ids_gin
  ON client_documents USING GIN(service_ids);

-- 4. Eliminar columna obsoleta
ALTER TABLE client_documents
  DROP COLUMN IF EXISTS service_tag;
