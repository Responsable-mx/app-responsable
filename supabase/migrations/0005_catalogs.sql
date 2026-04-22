-- ─────────────────────────────────────────────────────────────
-- 0005 — Tabla catalog_items (single-table pattern para 10 categorías).
--
-- Categorías: business_segments, frameworks, applicable_regulations,
-- policies, certifications, material_topics, maturity_levels,
-- sectors, countries.
--
-- 'tamaños' permanece como enum en código (no cambia con frecuencia).
-- Aditiva. Con seeds idempotentes (ON CONFLICT DO NOTHING).
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.catalog_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category      text NOT NULL,
  value         text NOT NULL,   -- canónico, va a clients.<col>[]
  label         text NOT NULL,   -- lo que ve el usuario
  description   text,            -- tooltip
  group_name    text,            -- agrupa en dropdown (ESG/Clima/Social)
  sort_order    integer NOT NULL DEFAULT 100,
  is_active     boolean NOT NULL DEFAULT true,
  is_system     boolean NOT NULL DEFAULT false,
  metadata      jsonb,
  created_by    text,
  updated_by    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(category, value)
);

COMMENT ON TABLE public.catalog_items IS
  'Catálogos editables desde /configuracion. Consumidos por /clientes para chips
   multi-select. is_system=true → seed, no eliminable pero editable/desactivable.';

CREATE INDEX IF NOT EXISTS idx_catalog_items_lookup
  ON public.catalog_items (category, is_active, sort_order, label);

ALTER TABLE public.catalog_items ENABLE ROW LEVEL SECURITY;
-- Solo service role (admin client) toca esta tabla. Sin policies.

DROP TRIGGER IF EXISTS trg_catalog_items_updated_at ON public.catalog_items;
CREATE TRIGGER trg_catalog_items_updated_at
  BEFORE UPDATE ON public.catalog_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════
-- SEEDS idempotentes (ON CONFLICT DO NOTHING)
-- ═══════════════════════════════════════════════════════════════

-- ── business_segments ───────────────────────────────────────
INSERT INTO public.catalog_items (category, value, label, sort_order, is_system) VALUES
  ('business_segments', 'b2b',       'B2B',        10, true),
  ('business_segments', 'b2c',       'B2C',        20, true),
  ('business_segments', 'b2g',       'B2G (gobierno)', 30, true),
  ('business_segments', 'd2c',       'D2C',        40, true),
  ('business_segments', 'b2b2c',     'B2B2C',      50, true),
  ('business_segments', 'wholesale', 'Mayorista',  60, true),
  ('business_segments', 'franchise', 'Franquicia', 70, true)
  ON CONFLICT (category, value) DO NOTHING;

-- ── frameworks (marcos de reporte ESG) ──────────────────────
INSERT INTO public.catalog_items (category, value, label, group_name, sort_order, is_system) VALUES
  ('frameworks', 'gri',           'GRI Standards',     'ESG',     10, true),
  ('frameworks', 'sasb',          'SASB',              'ESG',     20, true),
  ('frameworks', 'issb',          'ISSB',              'ESG',     30, true),
  ('frameworks', 'csrd',          'CSRD (UE)',         'ESG',     40, true),
  ('frameworks', 'tcfd',          'TCFD',              'Clima',   50, true),
  ('frameworks', 'cdp',           'CDP',               'Clima',   60, true),
  ('frameworks', 'sbti',          'SBTi',              'Clima',   70, true),
  ('frameworks', 'esr_cemefi',    'ESR CEMEFI',        'Social',  80, true),
  ('frameworks', 'un_global_compact', 'UN Global Compact', 'Social', 90, true),
  ('frameworks', 'ilo',           'ILO',               'Social', 100, true),
  ('frameworks', 'oecd',          'OECD Guidelines',   'Social', 110, true)
  ON CONFLICT (category, value) DO NOTHING;

-- ── applicable_regulations ──────────────────────────────────
INSERT INTO public.catalog_items (category, value, label, group_name, sort_order, is_system) VALUES
  ('applicable_regulations', 'csrd_ue',           'CSRD (Unión Europea)',        'ESG',       10, true),
  ('applicable_regulations', 'issb_global',       'ISSB (global)',               'ESG',       20, true),
  ('applicable_regulations', 'sec_climate_us',    'SEC Climate Disclosure (US)', 'ESG',       30, true),
  ('applicable_regulations', 'nis_mx',            'NIS (México)',                'México',    40, true),
  ('applicable_regulations', 'ley_cambio_climatico_mx', 'Ley Cambio Climático (MX)', 'México', 50, true),
  ('applicable_regulations', 'cnbv_sustentabilidad_mx', 'CNBV Sustentabilidad (MX)', 'México', 60, true),
  ('applicable_regulations', 'nom_035_mx',        'NOM-035 (MX)',                'México',    70, true),
  ('applicable_regulations', 'lfpiorpi_mx',       'LFPIORPI (MX)',               'México',    80, true),
  ('applicable_regulations', 'ley_olimpia_mx',    'Ley Olimpia (MX)',            'México',    90, true)
  ON CONFLICT (category, value) DO NOTHING;

-- ── policies ────────────────────────────────────────────────
INSERT INTO public.catalog_items (category, value, label, sort_order, is_system) VALUES
  ('policies', 'etica',              'Ética',                  10, true),
  ('policies', 'ddhh',               'Derechos humanos',       20, true),
  ('policies', 'ambiental',          'Ambiental',              30, true),
  ('policies', 'codigo_conducta',    'Código de conducta',     40, true),
  ('policies', 'proveedores',        'Proveedores',            50, true),
  ('policies', 'sostenibilidad',     'Sostenibilidad',         60, true),
  ('policies', 'diversidad',         'Diversidad e inclusión', 70, true),
  ('policies', 'anticorrupcion',     'Anticorrupción',         80, true),
  ('policies', 'salud_seguridad',    'Salud y seguridad',      90, true)
  ON CONFLICT (category, value) DO NOTHING;

-- ── certifications ──────────────────────────────────────────
INSERT INTO public.catalog_items (category, value, label, group_name, sort_order, is_system) VALUES
  ('certifications', 'iso_14001',  'ISO 14001',   'Ambiental', 10, true),
  ('certifications', 'iso_45001',  'ISO 45001',   'Laboral',   20, true),
  ('certifications', 'iso_26000',  'ISO 26000',   'Social',    30, true),
  ('certifications', 'b_corp',     'B Corp',      'Integral',  40, true),
  ('certifications', 'ecovadis',   'EcoVadis',    'Integral',  50, true),
  ('certifications', 'esr_cemefi', 'ESR CEMEFI',  'Social',    60, true),
  ('certifications', 'gptw',       'Great Place to Work', 'Laboral', 70, true),
  ('certifications', 'fsc',        'FSC',         'Ambiental', 80, true),
  ('certifications', 'fair_trade', 'Fair Trade',  'Social',    90, true),
  ('certifications', 'leed',       'LEED',        'Ambiental',100, true)
  ON CONFLICT (category, value) DO NOTHING;

-- ── material_topics (basado en GRI Topic List resumido) ─────
INSERT INTO public.catalog_items (category, value, label, group_name, sort_order, is_system) VALUES
  ('material_topics', 'cambio_climatico',    'Cambio climático',        'Ambiental', 10, true),
  ('material_topics', 'agua',                'Agua',                    'Ambiental', 20, true),
  ('material_topics', 'biodiversidad',       'Biodiversidad',           'Ambiental', 30, true),
  ('material_topics', 'residuos',            'Residuos',                'Ambiental', 40, true),
  ('material_topics', 'economia_circular',   'Economía circular',       'Ambiental', 50, true),
  ('material_topics', 'ddhh',                'Derechos humanos',        'Social',    60, true),
  ('material_topics', 'diversidad',          'Diversidad e inclusión',  'Social',    70, true),
  ('material_topics', 'salud_seguridad',     'Salud y seguridad',       'Social',    80, true),
  ('material_topics', 'cadena_suministro',   'Cadena de suministro',    'Social',    90, true),
  ('material_topics', 'etica',               'Ética y anticorrupción',  'Gobernanza',100, true),
  ('material_topics', 'privacidad',          'Privacidad de datos',     'Gobernanza',110, true),
  ('material_topics', 'impuestos',           'Fiscalidad responsable',  'Gobernanza',120, true)
  ON CONFLICT (category, value) DO NOTHING;

-- ── maturity_levels ─────────────────────────────────────────
INSERT INTO public.catalog_items (category, value, label, sort_order, is_system) VALUES
  ('maturity_levels', 'inicial',    'Inicial',    10, true),
  ('maturity_levels', 'gestionado', 'Gestionado', 20, true),
  ('maturity_levels', 'avanzado',   'Avanzado',   30, true),
  ('maturity_levels', 'lider',      'Líder',      40, true)
  ON CONFLICT (category, value) DO NOTHING;

-- ── sectors (taxonomía simple, ampliable por admin) ─────────
INSERT INTO public.catalog_items (category, value, label, group_name, sort_order, is_system) VALUES
  ('sectors', 'bebidas',          'Bebidas',                    'Consumo',    10, true),
  ('sectors', 'alimentos',        'Alimentos',                  'Consumo',    20, true),
  ('sectors', 'retail',           'Retail',                     'Consumo',    30, true),
  ('sectors', 'consumo_masivo',   'Consumo masivo',             'Consumo',    40, true),
  ('sectors', 'farmaceutico',     'Farmacéutico',               'Salud',      50, true),
  ('sectors', 'servicios_salud',  'Servicios de salud',         'Salud',      60, true),
  ('sectors', 'banca',            'Banca',                      'Financiero', 70, true),
  ('sectors', 'seguros',          'Seguros',                    'Financiero', 80, true),
  ('sectors', 'fintech',          'Fintech',                    'Financiero', 90, true),
  ('sectors', 'manufactura',      'Manufactura',                'Industrial',100, true),
  ('sectors', 'construccion',     'Construcción',               'Industrial',110, true),
  ('sectors', 'energia',          'Energía',                    'Industrial',120, true),
  ('sectors', 'mineria',          'Minería',                    'Industrial',130, true),
  ('sectors', 'transporte',       'Transporte y logística',     'Industrial',140, true),
  ('sectors', 'telecom',          'Telecomunicaciones',         'TMT',       150, true),
  ('sectors', 'tecnologia',       'Tecnología / Software',      'TMT',       160, true),
  ('sectors', 'medios',           'Medios',                     'TMT',       170, true),
  ('sectors', 'educacion',        'Educación',                  'Servicios', 180, true),
  ('sectors', 'consultoria',      'Consultoría profesional',    'Servicios', 190, true),
  ('sectors', 'hospitalidad',     'Hospitalidad y turismo',     'Servicios', 200, true),
  ('sectors', 'inmobiliario',     'Inmobiliario',               'Servicios', 210, true),
  ('sectors', 'agropecuario',     'Agropecuario',               'Primario',  220, true)
  ON CONFLICT (category, value) DO NOTHING;

-- ── countries (foco LATAM + mercados relevantes) ────────────
INSERT INTO public.catalog_items (category, value, label, group_name, sort_order, is_system) VALUES
  ('countries', 'mx', 'México',              'LATAM',     10, true),
  ('countries', 'gt', 'Guatemala',           'LATAM',     20, true),
  ('countries', 'cr', 'Costa Rica',          'LATAM',     30, true),
  ('countries', 'pa', 'Panamá',              'LATAM',     40, true),
  ('countries', 'co', 'Colombia',            'LATAM',     50, true),
  ('countries', 'pe', 'Perú',                'LATAM',     60, true),
  ('countries', 'cl', 'Chile',               'LATAM',     70, true),
  ('countries', 'ar', 'Argentina',           'LATAM',     80, true),
  ('countries', 'br', 'Brasil',              'LATAM',     90, true),
  ('countries', 'do', 'República Dominicana','LATAM',    100, true),
  ('countries', 'us', 'Estados Unidos',      'Norteamérica', 110, true),
  ('countries', 'ca', 'Canadá',              'Norteamérica', 120, true),
  ('countries', 'es', 'España',              'Europa',   130, true),
  ('countries', 'de', 'Alemania',            'Europa',   140, true),
  ('countries', 'fr', 'Francia',             'Europa',   150, true),
  ('countries', 'uk', 'Reino Unido',         'Europa',   160, true),
  ('countries', 'nl', 'Países Bajos',        'Europa',   170, true)
  ON CONFLICT (category, value) DO NOTHING;
