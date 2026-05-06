-- ─────────────────────────────────────────────────────────────
-- 0036 — Rol `cliente` + tenant isolation por RLS.
--
-- Agrega tercer rol `cliente` con scoping row-level por client_id.
-- Aditiva en columnas. Reemplaza políticas SELECT en 7 tablas para
-- aplicar `is_own_client(client_id)` (admin/consultor ven todo,
-- cliente ve solo su fila). Tightenea mutaciones de 4 tablas para
-- bloquear el rol cliente a nivel DB (defensa en profundidad).
--
-- Tablas tocadas (RLS):
--   clients, questionnaire_responses, materiality_topics,
--   client_services, client_consultors, service_stages,
--   stage_activities.
--
-- No toca: chat_sessions (owner-by-email ya), audit_log (admin-only),
-- catalog_items, prompts, app_settings, stage_templates (read-only
-- para todos los activos sigue siendo aceptable, no exponen datos
-- de cliente cruzados).
-- ─────────────────────────────────────────────────────────────

BEGIN;

-- ============================================================
-- 1. authorized_users: agregar client_id + extender role
-- ============================================================

ALTER TABLE public.authorized_users
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_authorized_users_client_id
  ON public.authorized_users (client_id);

-- Extender enum de role: admin | consultor | cliente
ALTER TABLE public.authorized_users
  DROP CONSTRAINT IF EXISTS authorized_users_role_check;

ALTER TABLE public.authorized_users
  ADD CONSTRAINT authorized_users_role_check
  CHECK (role IN ('admin', 'consultor', 'cliente'));

-- Integridad: rol cliente requiere client_id NOT NULL
ALTER TABLE public.authorized_users
  DROP CONSTRAINT IF EXISTS authorized_users_cliente_requires_client;

ALTER TABLE public.authorized_users
  ADD CONSTRAINT authorized_users_cliente_requires_client
  CHECK (role <> 'cliente' OR client_id IS NOT NULL);

COMMENT ON COLUMN public.authorized_users.client_id IS
  'FK a clients para usuarios con role=cliente. NULL para admin/consultor. Constraint authorized_users_cliente_requires_client lo valida.';


-- ============================================================
-- 2. Helper: is_own_client(client_id) → boolean
-- Reutilizable en RLS de todas las tablas con client_id.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_own_client(p_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email())
      AND au.active = true
      AND (
        au.role IN ('admin', 'consultor')
        OR (au.role = 'cliente' AND au.client_id = p_client_id)
      )
  )
$$;

COMMENT ON FUNCTION public.is_own_client(uuid) IS
  'Tenant isolation helper. Admin/consultor → true para cualquier client_id. Cliente → true solo si el client_id coincide con su authorized_users.client_id. Usar en USING clauses de SELECT policies.';


-- ============================================================
-- 3. clients: SELECT scoped + mutaciones tightened
-- ============================================================

DROP POLICY IF EXISTS "clients_select_authenticated" ON public.clients;
CREATE POLICY "clients_select_v2" ON public.clients FOR SELECT
  TO authenticated
  USING (public.is_own_client(id));

DROP POLICY IF EXISTS "clients_insert_authenticated" ON public.clients;
CREATE POLICY "clients_insert_v2" ON public.clients FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email())
      AND au.active = true
      AND au.role IN ('admin', 'consultor')
  ));

DROP POLICY IF EXISTS "clients_update_authenticated" ON public.clients;
CREATE POLICY "clients_update_v2" ON public.clients FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email())
      AND au.active = true
      AND au.role IN ('admin', 'consultor')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email())
      AND au.active = true
      AND au.role IN ('admin', 'consultor')
  ));

DROP POLICY IF EXISTS "clients_delete_authenticated" ON public.clients;
CREATE POLICY "clients_delete_v2" ON public.clients FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email())
      AND au.active = true
      AND au.role = 'admin'
  ));


-- ============================================================
-- 4. questionnaire_responses: SELECT scoped + mutaciones tightened
-- ============================================================

DROP POLICY IF EXISTS "questionnaire_responses_select_whitelist" ON public.questionnaire_responses;
CREATE POLICY "questionnaire_responses_select_v2" ON public.questionnaire_responses FOR SELECT
  TO authenticated
  USING (public.is_own_client(client_id));

DROP POLICY IF EXISTS "questionnaire_responses_insert_whitelist" ON public.questionnaire_responses;
CREATE POLICY "questionnaire_responses_insert_v2" ON public.questionnaire_responses FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email())
      AND au.active = true
      AND au.role IN ('admin', 'consultor')
  ));

DROP POLICY IF EXISTS "questionnaire_responses_update_whitelist" ON public.questionnaire_responses;
CREATE POLICY "questionnaire_responses_update_v2" ON public.questionnaire_responses FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email())
      AND au.active = true
      AND au.role IN ('admin', 'consultor')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email())
      AND au.active = true
      AND au.role IN ('admin', 'consultor')
  ));

DROP POLICY IF EXISTS "questionnaire_responses_delete_whitelist" ON public.questionnaire_responses;
CREATE POLICY "questionnaire_responses_delete_v2" ON public.questionnaire_responses FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email())
      AND au.active = true
      AND au.role IN ('admin', 'consultor')
  ));


-- ============================================================
-- 5. materiality_topics: SELECT scoped + mutaciones tightened
-- ============================================================

DROP POLICY IF EXISTS "materiality_topics_select_whitelist" ON public.materiality_topics;
CREATE POLICY "materiality_topics_select_v2" ON public.materiality_topics FOR SELECT
  TO authenticated
  USING (public.is_own_client(client_id));

DROP POLICY IF EXISTS "materiality_topics_insert_whitelist" ON public.materiality_topics;
CREATE POLICY "materiality_topics_insert_v2" ON public.materiality_topics FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email())
      AND au.active = true
      AND au.role IN ('admin', 'consultor')
  ));

DROP POLICY IF EXISTS "materiality_topics_update_whitelist" ON public.materiality_topics;
CREATE POLICY "materiality_topics_update_v2" ON public.materiality_topics FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email())
      AND au.active = true
      AND au.role IN ('admin', 'consultor')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email())
      AND au.active = true
      AND au.role IN ('admin', 'consultor')
  ));

DROP POLICY IF EXISTS "materiality_topics_delete_whitelist" ON public.materiality_topics;
CREATE POLICY "materiality_topics_delete_v2" ON public.materiality_topics FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email())
      AND au.active = true
      AND au.role IN ('admin', 'consultor')
  ));


-- ============================================================
-- 6. client_services: SELECT scoped + mutaciones tightened
-- ============================================================

DROP POLICY IF EXISTS "client_services_select_whitelist" ON public.client_services;
CREATE POLICY "client_services_select_v2" ON public.client_services FOR SELECT
  TO authenticated
  USING (public.is_own_client(client_id));

DROP POLICY IF EXISTS "client_services_insert_whitelist" ON public.client_services;
CREATE POLICY "client_services_insert_v2" ON public.client_services FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email())
      AND au.active = true
      AND au.role IN ('admin', 'consultor')
  ));

DROP POLICY IF EXISTS "client_services_update_whitelist" ON public.client_services;
CREATE POLICY "client_services_update_v2" ON public.client_services FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email())
      AND au.active = true
      AND au.role IN ('admin', 'consultor')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email())
      AND au.active = true
      AND au.role IN ('admin', 'consultor')
  ));

DROP POLICY IF EXISTS "client_services_delete_whitelist" ON public.client_services;
CREATE POLICY "client_services_delete_v2" ON public.client_services FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email())
      AND au.active = true
      AND au.role IN ('admin', 'consultor')
  ));


-- ============================================================
-- 7. client_consultors: SELECT scoped (mutaciones via service role)
-- ============================================================

DROP POLICY IF EXISTS "client_consultors_select_whitelist" ON public.client_consultors;
CREATE POLICY "client_consultors_select_v2" ON public.client_consultors FOR SELECT
  TO authenticated
  USING (public.is_own_client(client_id));


-- ============================================================
-- 8. service_stages: SELECT scoped via client_services chain
-- (mutaciones admin-only ya en 0033, intactas)
-- ============================================================

DROP POLICY IF EXISTS "service_stages_select_whitelist" ON public.service_stages;
CREATE POLICY "service_stages_select_v2" ON public.service_stages FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.client_services cs
    WHERE cs.id = service_stages.client_service_id
      AND public.is_own_client(cs.client_id)
  ));


-- ============================================================
-- 9. stage_activities: SELECT scoped via service_stages → client_services chain
-- (mutaciones admin-only ya en 0033, intactas)
-- ============================================================

DROP POLICY IF EXISTS "stage_activities_select_whitelist" ON public.stage_activities;
CREATE POLICY "stage_activities_select_v2" ON public.stage_activities FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.service_stages ss
    JOIN public.client_services cs ON cs.id = ss.client_service_id
    WHERE ss.id = stage_activities.stage_id
      AND public.is_own_client(cs.client_id)
  ));


COMMIT;
