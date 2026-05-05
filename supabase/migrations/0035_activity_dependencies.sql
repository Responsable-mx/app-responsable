-- 0035 — Dependencias entre actividades (finish-to-start)
-- B depende de A → B no debe iniciar antes de que A termine.
-- Solo se valida en UI (warn). DB permite cualquier fecha (no bloquea consultor).

ALTER TABLE public.stage_activities
  ADD COLUMN IF NOT EXISTS depends_on_activity_id uuid
    REFERENCES public.stage_activities(id) ON DELETE SET NULL;

-- Evitar self-reference
ALTER TABLE public.stage_activities
  DROP CONSTRAINT IF EXISTS chk_no_self_dependency;
ALTER TABLE public.stage_activities
  ADD CONSTRAINT chk_no_self_dependency
  CHECK (depends_on_activity_id IS NULL OR depends_on_activity_id <> id);

CREATE INDEX IF NOT EXISTS idx_stage_activities_depends_on
  ON public.stage_activities (depends_on_activity_id)
  WHERE depends_on_activity_id IS NOT NULL;

COMMENT ON COLUMN public.stage_activities.depends_on_activity_id IS
  'Dependencia finish-to-start: esta actividad no debe iniciar antes de que la referenciada termine. NULL = sin dependencia. ON DELETE SET NULL para tolerar borrado del predecesor.';
