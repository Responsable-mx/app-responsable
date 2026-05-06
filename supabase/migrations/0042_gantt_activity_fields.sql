-- Sprint J: marcador de hito contractual (muestra diamante ◆ en timeline).
--            Reemplaza la heurística planned_start = planned_end.
ALTER TABLE stage_activities
  ADD COLUMN IF NOT EXISTS is_milestone BOOLEAN NOT NULL DEFAULT false;

-- Sprint O: días estimados por el consultor.
--           Base para calcular burnrate vs días reales y ajustar EVM.
ALTER TABLE stage_activities
  ADD COLUMN IF NOT EXISTS estimated_days INTEGER
    CHECK (estimated_days IS NULL OR (estimated_days > 0 AND estimated_days <= 3650));

-- Sprint P: nota de bloqueo asíncrona.
--           Visible en tooltip + icono en barra del Gantt.
--           Máx 500 caracteres — resumen ejecutivo del impedimento.
ALTER TABLE stage_activities
  ADD COLUMN IF NOT EXISTS blocker_note TEXT
    CHECK (blocker_note IS NULL OR char_length(blocker_note) <= 500);
