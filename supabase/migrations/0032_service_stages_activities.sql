-- 0032 — Etapas y actividades por servicio del cliente
-- Modelo: client_services -> service_stages -> stage_activities
-- Status de actividad es COMPUTADO desde fechas (no almacenado).
-- Plan vs realidad: planned_* vs actual_* dates.

-- ============================================================
-- service_stages: etapas de un servicio contratado
-- ============================================================
CREATE TABLE IF NOT EXISTS public.service_stages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_service_id uuid NOT NULL REFERENCES public.client_services(id) ON DELETE CASCADE,
  name              text NOT NULL,
  order_index       integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.service_stages IS
  'Etapas de un servicio del cliente (ej: Diagnóstico, Taller, Reporte). Ordenadas por order_index.';

CREATE INDEX IF NOT EXISTS idx_service_stages_service
  ON public.service_stages (client_service_id, order_index);

ALTER TABLE public.service_stages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_stages_select_whitelist" ON public.service_stages;
CREATE POLICY "service_stages_select_whitelist" ON public.service_stages FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email()) AND au.active = true
  ));

DROP POLICY IF EXISTS "service_stages_insert_whitelist" ON public.service_stages;
CREATE POLICY "service_stages_insert_whitelist" ON public.service_stages FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email()) AND au.active = true
  ));

DROP POLICY IF EXISTS "service_stages_update_whitelist" ON public.service_stages;
CREATE POLICY "service_stages_update_whitelist" ON public.service_stages FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email()) AND au.active = true
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email()) AND au.active = true
  ));

DROP POLICY IF EXISTS "service_stages_delete_whitelist" ON public.service_stages;
CREATE POLICY "service_stages_delete_whitelist" ON public.service_stages FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email()) AND au.active = true
  ));

DROP TRIGGER IF EXISTS trg_service_stages_updated_at ON public.service_stages;
CREATE TRIGGER trg_service_stages_updated_at
  BEFORE UPDATE ON public.service_stages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- stage_activities: actividades dentro de una etapa
-- planned_* = fechas plan; actual_* = fechas reales (cambian seguido)
-- assignee_email = consultor lead de la actividad (puede diferir del equipo del cliente)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.stage_activities (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id        uuid NOT NULL REFERENCES public.service_stages(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  order_index     integer NOT NULL DEFAULT 0,
  planned_start   date,
  planned_end     date,
  actual_start    date,
  actual_end      date,
  assignee_email  text REFERENCES public.authorized_users(email) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- Validaciones: si hay end, debe haber start; end >= start
  CONSTRAINT chk_planned_dates CHECK (planned_end IS NULL OR planned_start IS NULL OR planned_end >= planned_start),
  CONSTRAINT chk_actual_dates  CHECK (actual_end  IS NULL OR actual_start  IS NULL OR actual_end  >= actual_start)
);

COMMENT ON TABLE public.stage_activities IS
  'Actividades de una etapa. planned_*=plan; actual_*=realidad. Status es computado: pending/in_progress/completed/delayed según fechas.';

CREATE INDEX IF NOT EXISTS idx_stage_activities_stage
  ON public.stage_activities (stage_id, order_index);
CREATE INDEX IF NOT EXISTS idx_stage_activities_assignee
  ON public.stage_activities (assignee_email);
CREATE INDEX IF NOT EXISTS idx_stage_activities_planned_range
  ON public.stage_activities (planned_start, planned_end);

ALTER TABLE public.stage_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stage_activities_select_whitelist" ON public.stage_activities;
CREATE POLICY "stage_activities_select_whitelist" ON public.stage_activities FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email()) AND au.active = true
  ));

DROP POLICY IF EXISTS "stage_activities_insert_whitelist" ON public.stage_activities;
CREATE POLICY "stage_activities_insert_whitelist" ON public.stage_activities FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email()) AND au.active = true
  ));

DROP POLICY IF EXISTS "stage_activities_update_whitelist" ON public.stage_activities;
CREATE POLICY "stage_activities_update_whitelist" ON public.stage_activities FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email()) AND au.active = true
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email()) AND au.active = true
  ));

DROP POLICY IF EXISTS "stage_activities_delete_whitelist" ON public.stage_activities;
CREATE POLICY "stage_activities_delete_whitelist" ON public.stage_activities FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email()) AND au.active = true
  ));

DROP TRIGGER IF EXISTS trg_stage_activities_updated_at ON public.stage_activities;
CREATE TRIGGER trg_stage_activities_updated_at
  BEFORE UPDATE ON public.stage_activities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
