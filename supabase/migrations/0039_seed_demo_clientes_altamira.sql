-- ─────────────────────────────────────────────────────────────
-- 0039 — Demo clientes Altamira para Nicolás, Gwenaelle y Elian.
-- Plus-alias → llega al inbox real de cada usuario.
-- ─────────────────────────────────────────────────────────────

INSERT INTO public.authorized_users (email, role, full_name, active, client_id, invited_by)
SELECT v.email, 'cliente', v.full_name, true, c.id, 'nblondel@s-peak.com'
FROM (VALUES
  ('nblondel+altamira@s-peak.com',      'Demo Altamira (Nicolás)'),
  ('gwenaelle+altamira@responsable.net', 'Demo Altamira (Gwenaelle)'),
  ('elian+altamira@responsable.net',     'Demo Altamira (Elian)')
) AS v(email, full_name)
CROSS JOIN (
  SELECT id FROM public.clients
  WHERE lower(name) ILIKE '%altamira%'
  ORDER BY created_at ASC
  LIMIT 1
) c
ON CONFLICT (email) DO UPDATE SET
  role       = EXCLUDED.role,
  full_name  = EXCLUDED.full_name,
  client_id  = EXCLUDED.client_id,
  active     = EXCLUDED.active,
  invited_by = EXCLUDED.invited_by,
  updated_at = now();
