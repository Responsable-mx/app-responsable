-- 0055 — Fix sector/subsector de Distribuidora Altamira.
-- El campo sector tenía "Alimentos · Distribución" (sector+subsector combinados).
-- Separar en sus columnas correctas.
UPDATE public.clients
SET
  sector    = 'Alimentos',
  subsector = 'Distribución'
WHERE lower(name) ILIKE '%altamira%'
  AND sector = 'Alimentos · Distribución';
