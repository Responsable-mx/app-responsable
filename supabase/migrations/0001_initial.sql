-- ─────────────────────────────────────────────────────────────
-- 0001_initial — App ResponSable
-- Puramente aditiva. Crea clients + access_codes + RLS básico.
-- ─────────────────────────────────────────────────────────────

-- ── clients ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clients (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  sector       text,
  countries    text[],
  size         text,

  -- 6 bloques del Word "Contexto del cliente" como markdown libre
  info_general             text,
  business_model           text,
  impacts                  text,
  regulatory_context       text,
  sustainability_strategy  text,
  stakeholders             text,

  created_by   text,   -- email del consultor que lo creó
  updated_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.clients IS
  'Clientes de consultoría ResponSable. Los 6 bloques de contexto alimentan a los 4 roles IA (Aurora/Rebeca/Elena/Valeria).';

CREATE INDEX IF NOT EXISTS idx_clients_sector ON public.clients (sector);
CREATE INDEX IF NOT EXISTS idx_clients_updated_at ON public.clients (updated_at DESC);

-- Habilitar RLS. Política: todo usuario autenticado puede leer/escribir.
-- (Decisión de negocio: los 8 consultores comparten todos los clientes).
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "clients_select_authenticated"
  ON public.clients FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY IF NOT EXISTS "clients_insert_authenticated"
  ON public.clients FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "clients_update_authenticated"
  ON public.clients FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "clients_delete_authenticated"
  ON public.clients FOR DELETE
  TO authenticated
  USING (true);


-- ── access_codes (OTP email) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.access_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL,
  code        text NOT NULL,
  used        boolean NOT NULL DEFAULT false,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.access_codes IS
  'Códigos OTP de un solo uso para login. TTL 10 min. Ver /api/auth/send-code.';

CREATE INDEX IF NOT EXISTS idx_access_codes_email_used ON public.access_codes (email, used);
CREATE INDEX IF NOT EXISTS idx_access_codes_created_at ON public.access_codes (created_at DESC);

-- RLS: bloquear acceso directo. Solo service role (admin) escribe/lee.
ALTER TABLE public.access_codes ENABLE ROW LEVEL SECURITY;

-- Sin políticas → nadie autenticado puede leer. Service role bypasses RLS.


-- ── Trigger updated_at ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clients_updated_at ON public.clients;
CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
