-- ─────────────────────────────────────────────────────────────
-- 0016 — Nuevo catálogo `services` (servicios ResponSable) + rename
-- group_name de 'ESG' a 'Sostenibilidad' en frameworks y
-- applicable_regulations (convención: usar "sostenibilidad" en toda la app).
--
-- Aditiva para el catálogo. UPDATE de group_name (destructivo bajo modo
-- paranoico). Requiere --confirm-destructive en prod.
-- ─────────────────────────────────────────────────────────────

-- ── Seed catálogo services ──────────────────────────────────
INSERT INTO public.catalog_items (category, value, label, sort_order, is_system) VALUES
  ('services', 'doble_materialidad',    'Doble materialidad',       10, true),
  ('services', 'esr_cemefi',             'ESR (CEMEFI)',             20, true),
  ('services', 'informe_sostenibilidad', 'Informe de sostenibilidad',30, true)
  ON CONFLICT (category, value) DO NOTHING;

-- ── Rename group_name ESG → Sostenibilidad ──────────────────
UPDATE public.catalog_items
  SET group_name = 'Sostenibilidad'
  WHERE group_name = 'ESG';
