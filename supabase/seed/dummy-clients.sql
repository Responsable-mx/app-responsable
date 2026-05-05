-- ─────────────────────────────────────────────────────────────
-- SEED dummy: 4 clientes para demos
--   1. Distribuidora Altamira S.A. de C.V. (completo: ctx + cuestionario + materialidad)
--   2. Grupo Industrial Norteño S.A. (45% contexto, sin cuestionario/materialidad)
--   3. Textiles del Bajío S.A. de C.V. (5% contexto)
--   4. Energía Renovable Centro S.A.P.I. (sin iniciar)
-- Idempotente: usa ON CONFLICT/DELETE before INSERT donde aplique.
-- ─────────────────────────────────────────────────────────────

-- IDs estables para que dependencias (questionnaire/materiality) referencien
-- al mismo cliente al re-aplicar el seed.

-- ── 1. Distribuidora Altamira (cliente completo) ─────────────────────
INSERT INTO public.clients (
  id, name, sector, subsector, countries, size,
  business_segments, services, frameworks, applicable_regulations,
  policies_in_place, certifications, material_topics, maturity_level,
  has_double_materiality, has_sustainability_report, has_sustainability_strategy,
  sustainability_strategy_url, sustainability_report_url, double_materiality_url,
  info_general, business_model, impacts, regulatory_context, sustainability_strategy, stakeholders,
  info_general_json, business_model_json, impacts_json, regulatory_context_json,
  sustainability_strategy_json, stakeholders_json,
  created_by, updated_by
)
VALUES (
  '11111111-1111-1111-1111-111111111111'::uuid,
  'Distribuidora Altamira S.A. de C.V.',
  'Alimentos · Distribución',
  'Distribución de alimentos refrigerados',
  ARRAY['MX'],
  'Mediana',
  ARRAY['Distribución fría','Distribución seca','Cross-docking'],
  ARRAY['Doble Materialidad'],
  ARRAY['GRI Standards','SASB','TCFD'],
  ARRAY['NOM-251-SSA1','NOM-051-SCFI/SSA1','SEMARNAT-LGPGIR'],
  ARRAY['Política ambiental','Código de ética','Política de proveedores'],
  ARRAY[]::text[],
  ARRAY['Emisiones GHG','Refrigerantes HFC','Cadena de frío','Seguridad alimentaria'],
  'gestionado',
  true, false, true,
  NULL, NULL, NULL,
  E'Distribuidora Altamira opera 12 CEDIS en 8 estados con flotilla refrigerada. ~850 empleados directos. Ingresos $1,200 MDP (2024).',
  E'B2B retail y mayoreo. Clientes clave: Walmart, FEMSA, OXXO. Líneas: distribución fría, seca, cross-docking.',
  E'Principales impactos ambientales: emisiones GHG de flotilla, refrigerantes HFC, residuos de empaque. Sociales: condiciones laborales en CEDIS, salud/seguridad.',
  E'Aplica NOM-251 manejo alimentos, Protocolo de Kigali (HFC), LGPGIR residuos. SEMARNAT registró derrame 2021 — multa pagada.',
  E'En exploración meta -15% CO₂ a 2027. Sin reporte público todavía. Línea de crédito verde BBVA condicionada a métricas ESG.',
  E'Clientes: Walmart, FEMSA, OXXO (CDP Score mín. C). Reguladores: SEMARNAT, SENER. Financiadores: BBVA. Proveedor único: Honeywell México (HFC).',
  '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
  'seed@responsable.net', 'seed@responsable.net'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  sector = EXCLUDED.sector,
  subsector = EXCLUDED.subsector,
  countries = EXCLUDED.countries,
  size = EXCLUDED.size,
  business_segments = EXCLUDED.business_segments,
  services = EXCLUDED.services,
  frameworks = EXCLUDED.frameworks,
  applicable_regulations = EXCLUDED.applicable_regulations,
  policies_in_place = EXCLUDED.policies_in_place,
  material_topics = EXCLUDED.material_topics,
  maturity_level = EXCLUDED.maturity_level,
  has_double_materiality = EXCLUDED.has_double_materiality,
  has_sustainability_report = EXCLUDED.has_sustainability_report,
  has_sustainability_strategy = EXCLUDED.has_sustainability_strategy,
  info_general = EXCLUDED.info_general,
  business_model = EXCLUDED.business_model,
  impacts = EXCLUDED.impacts,
  regulatory_context = EXCLUDED.regulatory_context,
  sustainability_strategy = EXCLUDED.sustainability_strategy,
  stakeholders = EXCLUDED.stakeholders,
  updated_by = EXCLUDED.updated_by;

-- ── 2. Grupo Industrial Norteño (45% contexto) ───────────────────────
INSERT INTO public.clients (
  id, name, sector, subsector, countries, size,
  frameworks, certifications, maturity_level,
  has_double_materiality, has_sustainability_report,
  info_general, business_model,
  info_general_json, business_model_json, impacts_json, regulatory_context_json,
  sustainability_strategy_json, stakeholders_json,
  created_by, updated_by
)
VALUES (
  '22222222-2222-2222-2222-222222222222'::uuid,
  'Grupo Industrial Norteño S.A.',
  'Manufactura · Metalmecánica',
  'Componentes automotrices',
  ARRAY['MX'],
  'Grande',
  ARRAY['ISO 14001'],
  ARRAY['ISO 9001'],
  'reactivo',
  false, false,
  E'Manufactura metalmecánica para sector automotriz. 4 plantas en Nuevo León y Coahuila.',
  E'B2B Tier 2. Clientes: GM, Ford, Stellantis. Producción de componentes estructurales.',
  '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
  'seed@responsable.net', 'seed@responsable.net'
)
ON CONFLICT (id) DO NOTHING;

-- ── 3. Textiles del Bajío (5% contexto) ──────────────────────────────
INSERT INTO public.clients (
  id, name, sector, subsector, countries, size,
  maturity_level,
  info_general,
  info_general_json, business_model_json, impacts_json, regulatory_context_json,
  sustainability_strategy_json, stakeholders_json,
  created_by, updated_by
)
VALUES (
  '33333333-3333-3333-3333-333333333333'::uuid,
  'Textiles del Bajío S.A. de C.V.',
  'Manufactura · Textil',
  'Tejidos industriales',
  ARRAY['MX'],
  'Mediana',
  'inicial',
  E'Empresa textil con planta en Guanajuato.',
  '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
  'seed@responsable.net', 'seed@responsable.net'
)
ON CONFLICT (id) DO NOTHING;

-- ── 4. Energía Renovable Centro (sin iniciar) ────────────────────────
INSERT INTO public.clients (
  id, name, sector, subsector, countries, size,
  info_general_json, business_model_json, impacts_json, regulatory_context_json,
  sustainability_strategy_json, stakeholders_json,
  created_by, updated_by
)
VALUES (
  '44444444-4444-4444-4444-444444444444'::uuid,
  'Energía Renovable Centro S.A.P.I.',
  'Energía · Renovables',
  NULL,
  ARRAY['MX'],
  NULL,
  '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
  'seed@responsable.net', 'seed@responsable.net'
)
ON CONFLICT (id) DO NOTHING;

-- ── client_services para Altamira (servicio activo) ──────────────────
INSERT INTO public.client_services (
  id, client_id, service, data, created_by, updated_by
)
VALUES (
  'aaaaaaaa-1111-1111-1111-111111111111'::uuid,
  '11111111-1111-1111-1111-111111111111'::uuid,
  'doble_materialidad',
  jsonb_build_object('year', 2025, 'phase', 'analisis'),
  'seed@responsable.net',
  'seed@responsable.net'
)
ON CONFLICT (id) DO NOTHING;

-- ── Cuestionario Altamira: 20 respuestas (100% completo) ─────────────
INSERT INTO public.questionnaire_responses (
  client_id, service_key, responses, completed_sections, created_by, updated_by
)
VALUES (
  '11111111-1111-1111-1111-111111111111'::uuid,
  'doble-materialidad',
  jsonb_build_object(
    'informacion-base', jsonb_build_object(
      'razon_social', 'Distribuidora Altamira S.A. de C.V.',
      'rfc', 'DASC890214SP3',
      'empleados', 850,
      'ingresos_anuales', 1200,
      'pagina_web', 'https://altamira.mx'
    ),
    'contexto-general', jsonb_build_object(
      'operaciones', E'12 CEDIS en 8 estados (CDMX, Estado de México, Jalisco, Guanajuato, Querétaro, Nuevo León, Veracruz, Yucatán). Flotilla refrigerada de 240 unidades.',
      'clientes_clave', E'Walmart (38% ingresos), FEMSA / OXXO (22%), Soriana (12%), Chedraui (8%), HEB (6%). Resto: 14% canal mayorista regional.',
      'lineas_negocio', E'Distribución fría (60% volumen): lácteos, cárnicos, congelados. Distribución seca (28%): abarrotes. Cross-docking 24h (12%): perecederos premium.',
      'mercados', E'Nacional B2B retail y mayoreo. Sin operaciones B2C ni exportación.'
    ),
    'contexto-sostenibilidad', jsonb_build_object(
      'madurez_esg', 'gestionado',
      'reporte_publicado', false,
      'certificaciones', E'ISO 9001 (2019, recertificada 2024). Distintivo H (todos los CEDIS). Sin certificaciones ESG activas.',
      'meta_co2', E'Meta interna en exploración: -15% emisiones de alcance 1+2 a 2027 vs línea base 2023. Aún no comunicada externamente.'
    ),
    'regulatorio', jsonb_build_object(
      'regulaciones_aplicables', E'NOM-251-SSA1 (manejo de alimentos), NOM-051-SCFI/SSA1 (etiquetado), Protocolo de Kigali (refrigerantes HFC), LGPGIR (residuos), LFT (laboral).',
      'antecedentes_compliance', E'2021: multa SEMARNAT por derrame de refrigerante en CEDIS Toluca ($420K MXN, pagada). Sin observaciones desde entonces.',
      'frameworks_meta', E'GRI Standards (target 2026), SASB Food & Beverage, TCFD para reporting climático financiero. Evaluando ISSB.'
    ),
    'modelo-negocio', jsonb_build_object(
      'cadena_valor', E'Proveedores → CEDIS centrales (Toluca, Apodaca) → CEDIS regionales → última milla refrigerada → puntos de venta cliente.',
      'dependencias_criticas', E'Honeywell México (proveedor único de refrigerantes HFC). Pemex Diésel (combustible flotilla). BBVA (línea de crédito verde).',
      'stakeholders_clave', E'Reguladores (SEMARNAT, SENER, COFEPRIS). Clientes (Walmart, FEMSA exigen CDP Score). Financiadores (BBVA crédito verde). Sindicato CTM.',
      'riesgos_principales', E'Transición HFC (regulatorio + proveedor único). Eventos climáticos (interrupción cadena de frío). Volatilidad diésel. Multas LGPGIR si recurrencia.'
    )
  ),
  ARRAY['informacion-base','contexto-general','contexto-sostenibilidad','regulatorio','modelo-negocio'],
  'seed@responsable.net',
  'seed@responsable.net'
)
ON CONFLICT (client_id, service_key) DO UPDATE SET
  responses = EXCLUDED.responses,
  completed_sections = EXCLUDED.completed_sections,
  updated_by = EXCLUDED.updated_by;

-- ── Materialidad Altamira: 20 temas pre-clasificados ─────────────────
-- Si ya existen del init API, no duplicar.
DELETE FROM public.materiality_topics
  WHERE client_id = '11111111-1111-1111-1111-111111111111'::uuid
    AND service_key = 'doble-materialidad';

INSERT INTO public.materiality_topics (
  client_id, service_key, topic_key, label, x_pos, y_pos, color, size, section_key, position_index, created_by, updated_by
) VALUES
  ('11111111-1111-1111-1111-111111111111','doble-materialidad','emisiones-ghg',         'Emisiones GHG',          72, 15, 'rose',  'lg', 'contexto-sostenibilidad', 0,  'seed@responsable.net','seed@responsable.net'),
  ('11111111-1111-1111-1111-111111111111','doble-materialidad','refrigerantes-hfc',    'Refrigerantes HFC',      80,  9, 'rose',  'lg', 'regulatorio',             1,  'seed@responsable.net','seed@responsable.net'),
  ('11111111-1111-1111-1111-111111111111','doble-materialidad','transicion-energetica','Transición energética',  63, 20, 'rose',  'lg', 'contexto-sostenibilidad', 2,  'seed@responsable.net','seed@responsable.net'),
  ('11111111-1111-1111-1111-111111111111','doble-materialidad','seguridad-alimentaria','Seguridad alimentaria',  70, 26, 'rose',  'md', 'modelo-negocio',          3,  'seed@responsable.net','seed@responsable.net'),
  ('11111111-1111-1111-1111-111111111111','doble-materialidad','gestion-cadena-frio',  'Gestión cadena de frío', 76, 33, 'rose',  'md', 'modelo-negocio',          4,  'seed@responsable.net','seed@responsable.net'),
  ('11111111-1111-1111-1111-111111111111','doble-materialidad','agua-efluentes',       'Agua y efluentes',       28, 18, 'amber', 'md', 'contexto-sostenibilidad', 5,  'seed@responsable.net','seed@responsable.net'),
  ('11111111-1111-1111-1111-111111111111','doble-materialidad','residuos-peligrosos',  'Residuos peligrosos',    38, 28, 'amber', 'md', 'regulatorio',             6,  'seed@responsable.net','seed@responsable.net'),
  ('11111111-1111-1111-1111-111111111111','doble-materialidad','biodiversidad',        'Biodiversidad',          22, 32, 'amber', 'sm', 'contexto-sostenibilidad', 7,  'seed@responsable.net','seed@responsable.net'),
  ('11111111-1111-1111-1111-111111111111','doble-materialidad','diversidad-inclusion', 'Diversidad e inclusión', 18, 42, 'amber', 'sm', 'contexto-general',        8,  'seed@responsable.net','seed@responsable.net'),
  ('11111111-1111-1111-1111-111111111111','doble-materialidad','bienestar-animal',     'Bienestar animal',       14, 25, 'amber', 'sm', 'modelo-negocio',          9,  'seed@responsable.net','seed@responsable.net'),
  ('11111111-1111-1111-1111-111111111111','doble-materialidad','salud-seguridad',      'Salud y seguridad',      58, 54, 'teal',  'md', 'contexto-general',        10, 'seed@responsable.net','seed@responsable.net'),
  ('11111111-1111-1111-1111-111111111111','doble-materialidad','cadena-suministro',    'Cadena de suministro',   68, 60, 'teal',  'md', 'modelo-negocio',          11, 'seed@responsable.net','seed@responsable.net'),
  ('11111111-1111-1111-1111-111111111111','doble-materialidad','acceso-financiamiento','Acceso a financiamiento',82, 63, 'teal',  'md', 'modelo-negocio',          12, 'seed@responsable.net','seed@responsable.net'),
  ('11111111-1111-1111-1111-111111111111','doble-materialidad','gobernanza-etica',     'Gobernanza ética',       72, 70, 'teal',  'sm', 'informacion-base',        13, 'seed@responsable.net','seed@responsable.net'),
  ('11111111-1111-1111-1111-111111111111','doble-materialidad','practicas-laborales',  'Prácticas laborales',    62, 67, 'teal',  'sm', 'contexto-general',        14, 'seed@responsable.net','seed@responsable.net'),
  ('11111111-1111-1111-1111-111111111111','doble-materialidad','derechos-humanos',     'Derechos humanos',       24, 60, 'slate', 'sm', 'contexto-general',        15, 'seed@responsable.net','seed@responsable.net'),
  ('11111111-1111-1111-1111-111111111111','doble-materialidad','reputacion-marca',     'Reputación y marca',     40, 74, 'slate', 'sm', 'contexto-general',        16, 'seed@responsable.net','seed@responsable.net'),
  ('11111111-1111-1111-1111-111111111111','doble-materialidad','formacion-desarrollo', 'Formación y desarrollo', 18, 70, 'slate', 'sm', 'contexto-general',        17, 'seed@responsable.net','seed@responsable.net'),
  ('11111111-1111-1111-1111-111111111111','doble-materialidad','transparencia-fiscal', 'Transparencia fiscal',   35, 65, 'slate', 'sm', 'regulatorio',             18, 'seed@responsable.net','seed@responsable.net'),
  ('11111111-1111-1111-1111-111111111111','doble-materialidad','comunidades-locales',  'Comunidades locales',    14, 58, 'slate', 'sm', 'contexto-sostenibilidad', 19, 'seed@responsable.net','seed@responsable.net');
