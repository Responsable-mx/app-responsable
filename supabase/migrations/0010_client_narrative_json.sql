-- ─────────────────────────────────────────────────────────────
-- 0010 — Narrativa estructurada por sub-campos (JSONB).
--
-- Cambia cada bloque narrativo de text → jsonb con schema propio (schema
-- definido en lib/clients/narrative-schemas.ts). Los 6 campos text legacy
-- permanecen; el consultor puede migrar su contenido al notas del json.
--
-- También agrega el catálogo revenue_models para el bloque 2.
-- Aditiva.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS info_general_json            jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS business_model_json          jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS impacts_json                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS regulatory_context_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS sustainability_strategy_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS stakeholders_json            jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.clients.sustainability_strategy_json IS
  'Schema: {pilares[], objetivos[{pilar,meta,deadline}], kpis[{metrica,valor_actual,unidad,target,base_year}], reportes_publicados[{ano,marco,url}], materialidad_metodologia, materialidad_ano, materialidad_proximo_refresh, notas}';

-- ── Seed catálogo revenue_models (nueva categoría) ──────────
INSERT INTO public.catalog_items (category, value, label, sort_order, is_system) VALUES
  ('revenue_models', 'venta_directa',       'Venta directa',              10, true),
  ('revenue_models', 'venta_mayorista',     'Venta mayorista',            20, true),
  ('revenue_models', 'suscripcion',         'Suscripción',                30, true),
  ('revenue_models', 'contratos',           'Contratos recurrentes',      40, true),
  ('revenue_models', 'licenciamiento',      'Licenciamiento',             50, true),
  ('revenue_models', 'franquicia',          'Franquicia',                 60, true),
  ('revenue_models', 'marketplace',         'Marketplace / comisión',     70, true),
  ('revenue_models', 'publicidad',          'Publicidad',                 80, true),
  ('revenue_models', 'servicios_proyecto',  'Servicios por proyecto',     90, true),
  ('revenue_models', 'servicios_hora',      'Servicios por hora',        100, true)
  ON CONFLICT (category, value) DO NOTHING;
