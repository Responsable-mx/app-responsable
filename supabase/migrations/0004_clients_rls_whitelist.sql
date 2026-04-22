-- ─────────────────────────────────────────────────────────────
-- 0004 — RLS restrictiva por whitelist (B1).
--
-- ⚠️ DESTRUCTIVO: usa DROP POLICY. Requiere --confirm-destructive y OK
-- textual del usuario. Ver DEUDA.md#B1.
--
-- Cambia las políticas abiertas (cualquier authenticated) por políticas
-- que validan el email del usuario contra una tabla `authorized_users`.
-- ─────────────────────────────────────────────────────────────

-- ── tabla authorized_users ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.authorized_users (
  email       text PRIMARY KEY,
  role        text NOT NULL DEFAULT 'consultor',  -- 'admin' | 'consultor'
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.authorized_users IS
  'Whitelist de emails con acceso a la app. Sincronizada con AUTHORIZED_EMAILS.';

ALTER TABLE public.authorized_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "authorized_users_select_self"
  ON public.authorized_users FOR SELECT
  TO authenticated
  USING (email = auth.email());

-- ── Seeds (los 2 usuarios iniciales) ─────────────────────────
INSERT INTO public.authorized_users (email, role) VALUES
  ('gwenaelle@responsable.net', 'admin')
  ON CONFLICT (email) DO NOTHING;
INSERT INTO public.authorized_users (email, role) VALUES
  ('nblondel@s-peak.com', 'admin')
  ON CONFLICT (email) DO NOTHING;

-- ── Políticas nuevas en clients ──────────────────────────────
CREATE POLICY IF NOT EXISTS "clients_select_whitelist"
  ON public.clients FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.authorized_users au WHERE au.email = auth.email()));

CREATE POLICY IF NOT EXISTS "clients_insert_whitelist"
  ON public.clients FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.authorized_users au WHERE au.email = auth.email()));

CREATE POLICY IF NOT EXISTS "clients_update_whitelist"
  ON public.clients FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.authorized_users au WHERE au.email = auth.email()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.authorized_users au WHERE au.email = auth.email()));

CREATE POLICY IF NOT EXISTS "clients_delete_whitelist"
  ON public.clients FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.authorized_users au WHERE au.email = auth.email()));

-- ── Drop de políticas abiertas (destructivo) ─────────────────
DROP POLICY IF EXISTS "clients_select_authenticated" ON public.clients;
DROP POLICY IF EXISTS "clients_insert_authenticated" ON public.clients;
DROP POLICY IF EXISTS "clients_update_authenticated" ON public.clients;
DROP POLICY IF EXISTS "clients_delete_authenticated" ON public.clients;
