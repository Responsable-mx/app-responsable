-- ─────────────────────────────────────────────────────────────
-- 0049 — authorized_users: feature_flags JSONB
--
-- Permite al admin controlar qué módulos ve cada usuario
-- independientemente de su rol. Semántica:
--   - key ausente → usa el default del rol
--   - key = false → acceso denegado aunque el rol lo permita
--   - key = true  → acceso concedido (util para dar equipo a consultor)
--
-- Keys actuales:
--   chat_ia     — puede usar Chat IA
--   equipo      — puede ver /equipo
--
-- Aditiva — no rompe nada existente.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.authorized_users
  ADD COLUMN IF NOT EXISTS feature_flags JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.authorized_users.feature_flags IS
  'Overrides de acceso por módulo. {} = usar defaults del rol.';
