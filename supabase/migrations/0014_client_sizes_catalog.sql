-- ─────────────────────────────────────────────────────────────
-- 0014 — Nuevo catálogo client_sizes.
-- Hoy el size del cliente es un enum hardcoded en código que se renderiza
-- con un <select> nativo (fuente distinta al resto de selectores custom).
-- Al moverlo a catalog_items, el formulario usa MultiSelectCombobox con
-- fuente consistente, y un admin puede renombrar los labels si quiere.
-- Orden lógico por tamaño (NO alfabético), igual que maturity_levels.
-- Aditiva.
-- ─────────────────────────────────────────────────────────────

INSERT INTO public.catalog_items (category, value, label, sort_order, is_system) VALUES
  ('client_sizes', 'micro',       'Micro',        10, true),
  ('client_sizes', 'pyme',        'PyME',         20, true),
  ('client_sizes', 'mediana',     'Mediana',      30, true),
  ('client_sizes', 'grande',      'Grande',       40, true),
  ('client_sizes', 'corporativo', 'Corporativo',  50, true)
  ON CONFLICT (category, value) DO NOTHING;
