-- ─────────────────────────────────────────────────────────────
-- 0006 — Tabla authorized_users (whitelist DB-driven + roles).
--
-- Reemplaza AUTHORIZED_EMAILS env var. La env var queda como fallback
-- de emergencia en código.
--
-- Absorbe B1 (RLS restrictiva) usando esta tabla en lugar de env.
-- Aditiva. Las políticas destructivas de 0004 quedan obsoletas (no se aplica).
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.authorized_users (
  email       text PRIMARY KEY,
  role        text NOT NULL DEFAULT 'consultor',  -- 'admin' | 'consultor'
  full_name   text,
  active      boolean NOT NULL DEFAULT true,
  invited_by  text,
  last_login  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT authorized_users_role_check CHECK (role IN ('admin','consultor'))
);

COMMENT ON TABLE public.authorized_users IS
  'Whitelist de acceso + roles. Consumida por isAuthorizedEmail() y requireAdmin().';

ALTER TABLE public.authorized_users ENABLE ROW LEVEL SECURITY;

-- Permite a cada usuario leer su propia fila (útil para saber su rol desde
-- el cliente sin pasar por /api/users que solo admins pueden llamar).
DROP POLICY IF EXISTS "authorized_users_select_self" ON public.authorized_users;
CREATE POLICY "authorized_users_select_self" ON public.authorized_users FOR SELECT
  TO authenticated
  USING (lower(email) = lower(auth.email()));

DROP TRIGGER IF EXISTS trg_authorized_users_updated_at ON public.authorized_users;
CREATE TRIGGER trg_authorized_users_updated_at
  BEFORE UPDATE ON public.authorized_users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Seeds: admins iniciales ─────────────────────────────────
INSERT INTO public.authorized_users (email, role, full_name) VALUES
  ('gwenaelle@responsable.net', 'admin', 'Gwenaelle Gérard'),
  ('nblondel@s-peak.com',       'admin', 'Nicolás Blondel'),
  ('elian@responsable.net',     'admin', 'Elian')
  ON CONFLICT (email) DO NOTHING;

-- ── RLS whitelist-based en clients (cierra B1) ──────────────
-- Sustituye políticas abiertas de 0001 por políticas que validan contra
-- authorized_users.active.
DROP POLICY IF EXISTS "clients_select_authenticated" ON public.clients;
DROP POLICY IF EXISTS "clients_insert_authenticated" ON public.clients;
DROP POLICY IF EXISTS "clients_update_authenticated" ON public.clients;
DROP POLICY IF EXISTS "clients_delete_authenticated" ON public.clients;

DROP POLICY IF EXISTS "clients_select_whitelist" ON public.clients;
CREATE POLICY "clients_select_whitelist" ON public.clients FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email())
      AND au.active = true
  ));

DROP POLICY IF EXISTS "clients_insert_whitelist" ON public.clients;
CREATE POLICY "clients_insert_whitelist" ON public.clients FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email())
      AND au.active = true
  ));

DROP POLICY IF EXISTS "clients_update_whitelist" ON public.clients;
CREATE POLICY "clients_update_whitelist" ON public.clients FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email())
      AND au.active = true
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email())
      AND au.active = true
  ));

DROP POLICY IF EXISTS "clients_delete_whitelist" ON public.clients;
CREATE POLICY "clients_delete_whitelist" ON public.clients FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email())
      AND au.active = true
  ));
