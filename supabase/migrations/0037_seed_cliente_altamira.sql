-- ─────────────────────────────────────────────────────────────
-- 0037 — Seed: usuario cliente demo para Altamira.
-- Busca el cliente por nombre (ILIKE) para no hardcodear UUID.
-- Si el email ya existe lo reactiva y actualiza client_id.
-- ─────────────────────────────────────────────────────────────

INSERT INTO public.authorized_users (
  email,
  role,
  full_name,
  active,
  client_id,
  invited_by
)
SELECT
  'demo@altamira.mx',
  'cliente',
  'Demo Altamira',
  true,
  c.id,
  'nblondel@s-peak.com'
FROM public.clients c
WHERE lower(c.name) ILIKE '%altamira%'
ORDER BY c.created_at ASC
LIMIT 1
ON CONFLICT (email) DO UPDATE SET
  role       = EXCLUDED.role,
  client_id  = EXCLUDED.client_id,
  active     = EXCLUDED.active,
  full_name  = EXCLUDED.full_name,
  updated_at = now();
