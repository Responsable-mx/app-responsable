-- ─────────────────────────────────────────────────────────────
-- 0020 — Tabla audit_log para mutaciones admin (DRSP-7).
--
-- Captura quién, qué, cuándo y opcionalmente el snapshot before/after de
-- cada cambio admin sobre prompts, users, catalogs, clients y futuras
-- entidades. STARTER_OBS §2.
--
-- Aditiva. Solo service role escribe; lectura solo admin via RLS.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_email   text NOT NULL,
  entity_type   text NOT NULL,
  entity_id     text,
  action        text NOT NULL CHECK (action IN ('create','update','delete','restore')),
  before        jsonb,
  after         jsonb,
  metadata      jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.audit_log IS
  'Registro de mutaciones admin: prompts, users, catalogs, clients. Cada fila es una acción atómica con autor, momento y diff.';
COMMENT ON COLUMN public.audit_log.entity_type IS
  'Tipo de entidad: prompts | users | catalogs | clients | catalogs_reorder | client_services | etc.';
COMMENT ON COLUMN public.audit_log.entity_id IS
  'Identificador de la entidad: prompt key, user email, catalog item id, client id, etc.';
COMMENT ON COLUMN public.audit_log.metadata IS
  'Contexto adicional no estructurado (request id, user agent, etc.).';

CREATE INDEX IF NOT EXISTS audit_log_entity_idx
  ON public.audit_log (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx
  ON public.audit_log (actor_email, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_created_idx
  ON public.audit_log (created_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Solo admins activos pueden leer el audit log.
-- Idempotente sin DROP POLICY (modo paranoico bloquea DROP POLICY).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'audit_log'
      AND policyname = 'audit_log_select_admin'
  ) THEN
    CREATE POLICY "audit_log_select_admin" ON public.audit_log FOR SELECT
      TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.authorized_users au
        WHERE lower(au.email) = lower(auth.email())
          AND au.active = true
          AND au.role = 'admin'
      ));
  END IF;
END$$;

-- Sin políticas de INSERT/UPDATE/DELETE para usuarios autenticados → solo
-- service role (createAdminClient) escribe. Esto evita que un consultor
-- pueda fabricar entradas falsas.
