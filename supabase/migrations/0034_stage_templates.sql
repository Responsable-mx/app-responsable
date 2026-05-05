-- 0034 — Plantillas de etapas/actividades reutilizables entre proyectos
-- Estructura completa serializada en JSONB. Al aplicar, se crean rows reales
-- en service_stages + stage_activities con offsets relativos a una fecha base.

CREATE TABLE IF NOT EXISTS public.stage_templates (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  description text,
  -- catalog key (services) — opcional, ayuda a filtrar plantillas por servicio.
  service     text,
  -- { "stages": [{ "name": ..., "order_index": ..., "activities": [{ "name": ..., "description": ..., "order_index": ..., "offset_start_days": ..., "offset_end_days": ... }] }] }
  data        jsonb       NOT NULL DEFAULT '{"stages":[]}'::jsonb,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.stage_templates IS
  'Plantillas reutilizables de etapas/actividades. Al aplicar a un client_service, expande a service_stages + stage_activities con offsets en días desde fecha base.';

CREATE INDEX IF NOT EXISTS idx_stage_templates_service ON public.stage_templates (service);

ALTER TABLE public.stage_templates ENABLE ROW LEVEL SECURITY;

-- RLS: lectura para todos los autorizados, mutación solo admin (controlado por API).
DROP POLICY IF EXISTS "stage_templates_select_whitelist" ON public.stage_templates;
CREATE POLICY "stage_templates_select_whitelist" ON public.stage_templates FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email()) AND au.active = true
  ));

DROP POLICY IF EXISTS "stage_templates_insert_admin" ON public.stage_templates;
CREATE POLICY "stage_templates_insert_admin" ON public.stage_templates FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email()) AND au.active = true AND au.role = 'admin'
  ));

DROP POLICY IF EXISTS "stage_templates_update_admin" ON public.stage_templates;
CREATE POLICY "stage_templates_update_admin" ON public.stage_templates FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email()) AND au.active = true AND au.role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email()) AND au.active = true AND au.role = 'admin'
  ));

DROP POLICY IF EXISTS "stage_templates_delete_admin" ON public.stage_templates;
CREATE POLICY "stage_templates_delete_admin" ON public.stage_templates FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email()) AND au.active = true AND au.role = 'admin'
  ));

DROP TRIGGER IF EXISTS trg_stage_templates_updated_at ON public.stage_templates;
CREATE TRIGGER trg_stage_templates_updated_at
  BEFORE UPDATE ON public.stage_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
