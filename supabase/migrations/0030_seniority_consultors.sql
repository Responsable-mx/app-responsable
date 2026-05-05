-- ─────────────────────────────────────────────────────────────
-- 0030 — Seniority levels + client_consultors
--
-- Aditiva. Segura para producción.
-- 1. Seed seniority_levels en catalog_items
-- 2. Columna seniority_level en authorized_users
-- 3. Tabla client_consultors (asignación M2M con seniority override)
-- ─────────────────────────────────────────────────────────────

-- ── 1. Seniority levels (catálogo editable desde /configuracion) ──
INSERT INTO public.catalog_items (category, value, label, sort_order, is_system) VALUES
  ('seniority_levels', 'junior',    'Junior',              10, true),
  ('seniority_levels', 'consultor', 'Consultor',           20, true),
  ('seniority_levels', 'senior',    'Senior',              30, true),
  ('seniority_levels', 'gerente',   'Gerente de proyecto', 40, true),
  ('seniority_levels', 'director',  'Director',            50, true)
  ON CONFLICT (category, value) DO NOTHING;

-- ── 2. Seniority default en authorized_users ─────────────────
-- Nullable: un usuario sin nivel asignado muestra "—" en UI.
ALTER TABLE public.authorized_users
  ADD COLUMN IF NOT EXISTS seniority_level text;

-- ── 3. Tabla client_consultors ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_consultors (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_email      text        NOT NULL REFERENCES public.authorized_users(email) ON DELETE CASCADE,
  -- Override de seniority por proyecto. Null = usar el default del usuario.
  seniority_level text,
  assigned_at     timestamptz NOT NULL DEFAULT now(),
  assigned_by     text,
  UNIQUE(client_id, user_email)
);

COMMENT ON TABLE public.client_consultors IS
  'Asignación M2M de consultores a clientes. seniority_level es override por proyecto.';

CREATE INDEX IF NOT EXISTS idx_client_consultors_client
  ON public.client_consultors (client_id);

CREATE INDEX IF NOT EXISTS idx_client_consultors_user
  ON public.client_consultors (user_email);

ALTER TABLE public.client_consultors ENABLE ROW LEVEL SECURITY;

-- SELECT: todos los usuarios activos en la whitelist pueden ver el equipo
DROP POLICY IF EXISTS "client_consultors_select_whitelist" ON public.client_consultors;
CREATE POLICY "client_consultors_select_whitelist" ON public.client_consultors FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email())
      AND au.active = true
  ));

-- INSERT/UPDATE/DELETE: solo service role (vía admin client en API).
-- requireAdmin() en los endpoints protege el acceso.
