-- 0033 — D-43: RLS mutaciones de etapas/actividades restringida a admin
-- Aditiva. Reemplaza políticas INSERT/UPDATE/DELETE de 0032 con check de rol.
-- Lectura (SELECT) permanece abierta a todos los usuarios activos.
--
-- Fundamento: INSERT/DELETE de etapas y actividades solo hace sentido para admin.
-- UPDATE de stage_activities sigue siendo admin-only en RLS; el endpoint
-- /api/activities/:id controla en capa API que consultores puedan editar
-- actual_start/actual_end (vía service role que bypasea RLS).

-- ============================================================
-- service_stages: mutaciones solo admin
-- ============================================================

DROP POLICY IF EXISTS "service_stages_insert_whitelist" ON public.service_stages;
CREATE POLICY "service_stages_insert_admin" ON public.service_stages FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email())
      AND au.active = true
      AND au.role = 'admin'
  ));

DROP POLICY IF EXISTS "service_stages_update_whitelist" ON public.service_stages;
CREATE POLICY "service_stages_update_admin" ON public.service_stages FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email())
      AND au.active = true
      AND au.role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email())
      AND au.active = true
      AND au.role = 'admin'
  ));

DROP POLICY IF EXISTS "service_stages_delete_whitelist" ON public.service_stages;
CREATE POLICY "service_stages_delete_admin" ON public.service_stages FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email())
      AND au.active = true
      AND au.role = 'admin'
  ));

-- ============================================================
-- stage_activities: mutaciones solo admin
-- (UPDATE de actual_* por consultores se realiza via API con service role)
-- ============================================================

DROP POLICY IF EXISTS "stage_activities_insert_whitelist" ON public.stage_activities;
CREATE POLICY "stage_activities_insert_admin" ON public.stage_activities FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email())
      AND au.active = true
      AND au.role = 'admin'
  ));

DROP POLICY IF EXISTS "stage_activities_update_whitelist" ON public.stage_activities;
CREATE POLICY "stage_activities_update_admin" ON public.stage_activities FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email())
      AND au.active = true
      AND au.role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email())
      AND au.active = true
      AND au.role = 'admin'
  ));

DROP POLICY IF EXISTS "stage_activities_delete_whitelist" ON public.stage_activities;
CREATE POLICY "stage_activities_delete_admin" ON public.stage_activities FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email())
      AND au.active = true
      AND au.role = 'admin'
  ));
