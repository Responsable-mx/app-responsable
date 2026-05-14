-- 0094: workflow_stage en ai_calls + columnas ROI en auto_update_config
--
-- workflow_stage: etiqueta semántica por flujo (dm_referentes, dm_benchmark,
-- chat, ai_fill, embeddings, etc.). Nullable — filas previas quedan como NULL.
-- No se necesita CHECK constraint: el dominio crece con nuevos flujos.
--
-- ROI columns en auto_update_config: acumulan costo estimado y ahorro estimado
-- de cada ejecución del cron de auto-actualización.

ALTER TABLE ai_calls
  ADD COLUMN IF NOT EXISTS workflow_stage TEXT;

ALTER TABLE auto_update_config
  ADD COLUMN IF NOT EXISTS last_run_cost_usd     NUMERIC(10,4) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_run_savings_usd   NUMERIC(10,4) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS total_cost_usd         NUMERIC(10,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_savings_usd      NUMERIC(10,4) DEFAULT 0;

-- Índice para filtrar por etapa en ventanas de tiempo (usage dashboard)
CREATE INDEX IF NOT EXISTS idx_ai_calls_workflow_stage
  ON ai_calls (workflow_stage, created_at DESC)
  WHERE workflow_stage IS NOT NULL;
