-- ─────────────────────────────────────────────────────────────
-- 0009 — Tabla app_settings (key/value JSONB).
--
-- Un solo storage para configuraciones globales simples: tour_version,
-- feature flags, umbrales, etc. Defaults en código, DB override cuando
-- existe.
--
-- Aditiva. Seed: tour_version=1.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.app_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  description text,
  updated_by  text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.app_settings IS
  'Configuración global de la app en formato key/value. Leída por todos,
   escrita solo por service role.';

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Lectura abierta a cualquier autenticado (para que el cliente pueda
-- comparar su tour_version con el remoto).
DROP POLICY IF EXISTS "app_settings_select_authenticated" ON public.app_settings;
CREATE POLICY "app_settings_select_authenticated" ON public.app_settings FOR SELECT
  TO authenticated
  USING (true);

DROP TRIGGER IF EXISTS trg_app_settings_updated_at ON public.app_settings;
CREATE TRIGGER trg_app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Seed: tour_version inicial ───────────────────────────────
INSERT INTO public.app_settings (key, value, description) VALUES
  (
    'tour_version',
    '1'::jsonb,
    'Incrementar este número fuerza que todos los usuarios vean el tour de nuevo en su próxima visita a /chat.'
  )
  ON CONFLICT (key) DO NOTHING;
