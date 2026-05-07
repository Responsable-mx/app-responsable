-- Módulo IROs ESRS para Doble Materialidad IA.
-- Reemplaza los 5 campos estáticos de benchmark por los 10 estándares ESRS
-- con 2 dimensiones cada uno: impacto (interno→externo) y riesgo/oportunidad (externo→interno).

-- ── Tabla de configuración de IROs ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.dm_iro_config (
  id                      uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  esrs_standard           text         NOT NULL UNIQUE,  -- E1, E2, E3, E4, E5, S1, S2, S3, S4, G1
  label                   text         NOT NULL,
  category                text         NOT NULL CHECK (category IN ('ambiental', 'social', 'gobernanza')),
  impact_desc             text         NOT NULL DEFAULT '',  -- Impacto: Interno → Externo
  risk_desc               text         NOT NULL DEFAULT '',  -- Riesgo:  Externo → Interno
  opportunity_desc        text         NOT NULL DEFAULT '',  -- Oportunidad: Externo → Interno
  questionnaire_field_keys text[]      NOT NULL DEFAULT '{}',
  is_active               boolean      NOT NULL DEFAULT true,
  sort_order              int          NOT NULL DEFAULT 0,
  updated_by              text         REFERENCES public.authorized_users(email) ON DELETE SET NULL,
  updated_at              timestamptz  NOT NULL DEFAULT now()
);

-- RLS: lectura para todos los autenticados, escritura vía service role (API admin)
ALTER TABLE public.dm_iro_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY dm_iro_config_select ON public.dm_iro_config FOR SELECT TO authenticated USING (true);

-- ── Reset datos anteriores (benchmarks con los 5 campos viejos) ──────────────
-- Los campos keys cambian de emisiones_ghg/gestion_agua/... → E1/E2/...
-- Los resultados históricos son incompatibles → limpiar.
TRUNCATE public.dm_benchmark_results CASCADE;
TRUNCATE public.dm_benchmark_companies CASCADE;

-- ── Seed: 10 estándares ESRS ─────────────────────────────────────────────────

INSERT INTO public.dm_iro_config
  (esrs_standard, label, category, impact_desc, risk_desc, opportunity_desc, sort_order)
VALUES
(
  'E1', 'Cambio Climático', 'ambiental',
  'Emisiones de gases de efecto invernadero (Scope 1, 2 y 3) derivadas de las operaciones, transporte y cadena de valor. Contribución al calentamiento global y eventos climáticos extremos.',
  'Aumento de costos operativos por impuestos al carbono, regulaciones de emisiones y eventos climáticos extremos que interrumpen la cadena de suministro.',
  'Reducción de costos energéticos por transición a renovables; acceso a financiamiento verde, bonos sostenibles e incentivos fiscales por descarbonización.',
  10
),
(
  'E2', 'Contaminación', 'ambiental',
  'Vertidos accidentales o crónicos de sustancias químicas al suelo, agua o aire. Generación de residuos peligrosos y emisiones de contaminantes locales.',
  'Multas regulatorias, litigios por daño ambiental y daño reputacional que impacta ventas y relaciones con inversionistas.',
  'Desarrollo de productos libres de sustancias tóxicas que abren nuevos mercados; certificaciones que facilitan acceso a licitaciones públicas.',
  20
),
(
  'E3', 'Agua y Mar', 'ambiental',
  'Alto consumo de agua en zonas de estrés hídrico. Descarga de aguas residuales que afectan ecosistemas acuáticos locales.',
  'Interrupción de operaciones por escasez de agua o restricciones regulatorias de uso. Incremento de tarifas en cuencas sobreexplotadas.',
  'Mejora de la eficiencia hídrica que reduce costos directos; diferenciación en mercados que valoran la gestión responsable del agua.',
  30
),
(
  'E4', 'Biodiversidad y Ecosistemas', 'ambiental',
  'Destrucción o degradación de hábitats por expansión de instalaciones, uso de suelo o extracción de recursos naturales.',
  'Pérdida de licencia social para operar. Nuevas regulaciones de "no-net-loss" que encarecen proyectos de expansión.',
  'Acceso a bonos de biodiversidad, mercados de créditos naturales y programas de compensación ambiental con valor económico.',
  40
),
(
  'E5', 'Economía Circular', 'ambiental',
  'Generación de residuos no reciclables o no valorizables. Diseño de productos con obsolescencia programada y alto contenido de materias vírgenes.',
  'Mayor costo de materias primas vírgenes ante escasez de recursos. Regulaciones de responsabilidad extendida del productor.',
  'Ingresos por venta de subproductos ("residuo a recurso"); reducción de costos de aprovisionamiento mediante material reciclado.',
  50
),
(
  'S1', 'Personal Propio', 'social',
  'Brecha salarial de género, condiciones laborales precarias, accidentes laborales o incumplimiento de estándares de salud y seguridad.',
  'Huelgas, alta rotación o dificultad para retener talento clave que incrementa costos de reclutamiento y capacitación.',
  'Mayor productividad y retención de talento por programas de bienestar, equidad y desarrollo profesional.',
  60
),
(
  'S2', 'Trabajadores en la Cadena de Valor', 'social',
  'Trabajo forzoso, infantil o condiciones laborales degradantes identificados en proveedores directos o indirectos.',
  'Prohibición de importación o exclusión de cadenas de suministro globales por incumplimiento de estándares de due diligence.',
  'Relaciones a largo plazo y precios preferenciales con proveedores certificados que reducen riesgo operativo.',
  70
),
(
  'S3', 'Comunidades Afectadas', 'social',
  'Contaminación acústica, visual o del aire que afecta a comunidades vecinas. Desplazamiento poblacional o pérdida de medios de vida locales.',
  'Litigios legales, protestas o bloqueos operativos por grupos comunitarios que generan costos y retrasos.',
  'Colaboraciones y acuerdos locales que facilitan nuevos permisos de operación y reducen tiempos de aprobación.',
  80
),
(
  'S4', 'Consumidores y Usuarios Finales', 'social',
  'Incidentes de seguridad del producto, privacidad de datos o prácticas comerciales engañosas que dañan a los consumidores.',
  'Sanciones regulatorias por leyes de protección de datos (GDPR, Ley Olimpia) y demandas colectivas de consumidores.',
  'Fidelización y premium de precio por transparencia, seguridad de datos y responsabilidad en el marketing.',
  90
),
(
  'G1', 'Conducta Empresarial', 'gobernanza',
  'Prácticas de corrupción, sobornos, evasión fiscal o falta de transparencia en la cadena de suministro.',
  'Inhabilitación para contratos públicos, sanciones regulatorias y pérdida de acceso a financiamiento institucional.',
  'Atracción de inversores institucionales ESG gracias a un gobierno corporativo sólido y reportes de transparencia.',
  100
);
