-- Migration 0095: synthesis_narrative en dm_benchmark_empresas + no_aplica en client_nis_assessment
-- Aplicar antes del deploy.

-- 1. Columna para persistir narrativa de síntesis de IROs sector (Etapa 5)
ALTER TABLE dm_benchmark_empresas
  ADD COLUMN IF NOT EXISTS synthesis_narrative TEXT;

-- 2. Agregar 'no_aplica' al CHECK constraint de client_nis_assessment.estado
--    El filtro en dm-resumen ya excluye este valor; ahora puede existir en DB.
ALTER TABLE client_nis_assessment
  DROP CONSTRAINT IF EXISTS client_nis_assessment_estado_check;

ALTER TABLE client_nis_assessment
  ADD CONSTRAINT client_nis_assessment_estado_check
  CHECK (estado IN ('no_identificado', 'parcial', 'disponible', 'no_aplica'));
