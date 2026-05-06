-- Agrega actual_progress (0-100) a stage_activities para barra de progreso en Gantt.
-- Aditiva: ADD COLUMN IF NOT EXISTS. Sin destrucción de datos.
ALTER TABLE stage_activities
  ADD COLUMN IF NOT EXISTS actual_progress smallint
    CONSTRAINT stage_activities_progress_range
      CHECK (actual_progress IS NULL OR (actual_progress >= 0 AND actual_progress <= 100));
