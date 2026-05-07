-- ─────────────────────────────────────────────────────────────
-- 0044 — authorized_users: columna is_test_account
--
-- Permite marcar cuentas demo/prueba para excluirlas de métricas
-- de carga de equipo y del listado de consultores reales.
-- Aditiva. Default false = sin impacto en usuarios existentes.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.authorized_users
  ADD COLUMN IF NOT EXISTS is_test_account boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.authorized_users.is_test_account IS
  'true = cuenta demo/prueba. Se excluye de métricas de equipo por default.';

-- Marcar todas las cuentas de dominio demo (@demo-responsable.net)
UPDATE public.authorized_users
  SET is_test_account = true
  WHERE email LIKE '%@demo-responsable.net';
