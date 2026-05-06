-- Agrega baseline_start / baseline_end a stage_activities.
-- Se copian desde planned_* al "congelar plan base" para comparar ejecución vs. plan original.
-- Aditiva: ADD COLUMN IF NOT EXISTS. Sin destrucción de datos.
ALTER TABLE stage_activities
  ADD COLUMN IF NOT EXISTS baseline_start date,
  ADD COLUMN IF NOT EXISTS baseline_end   date;
