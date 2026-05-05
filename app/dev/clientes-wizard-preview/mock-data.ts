// Datos mock para el wizard preview — cliente ficticio Distribuidora Altamira.
// Sin backend, sin Supabase. Solo representación estática del cuestionario lleno.

export type SourceType = "public" | "interpretation" | "consultor_only";

export type MockSource = {
  url: string;
  title: string;
  date: string; // ISO YYYY-MM-DD
};

export type MockField = {
  key: string;
  label: string;
  value: string | null;
  type?: "text" | "multiselect";
  options?: string[];
  sourceType: SourceType;
  sources?: MockSource[];
  validated?: boolean;
  stale?: boolean; // fuente > 2 años desde hoy (2026-05-04)
  hint?: string;
};

export type MockStep = {
  step: number;
  title: string;
  subtitle: string;
  slideRef: number;
  onlyDoubleMaterialidad?: boolean;
  fields: MockField[];
  aiCanFill: boolean;
};

export const MOCK_CLIENT = {
  name: "Distribuidora Altamira S.A. de C.V.",
  id: "mock-uuid-001",
  country: "México",
};

export const MOCK_STEPS: MockStep[] = [
  // ── Paso 1 — Información base ───────────────────────────────
  {
    step: 1,
    title: "Información base",
    subtitle: "Capturar al crear el cliente. Todos los campos son del asesor.",
    slideRef: 2,
    aiCanFill: false,
    fields: [
      {
        key: "nombre_empresa",
        label: "Nombre de la empresa",
        value: "Distribuidora Altamira S.A. de C.V.",
        sourceType: "consultor_only",
        validated: true,
      },
      {
        key: "servicio_contratado",
        label: "Servicio contratado",
        value: "Estudio de Doble Materialidad",
        type: "multiselect",
        options: [
          "Estudio de Doble Materialidad",
          "Materialidad simple",
          "Reporte GRI",
          "Diagnóstico RSE",
          "Carbono y huella climática",
          "Estrategia de sustentabilidad",
        ],
        sourceType: "consultor_only",
        validated: true,
      },
      {
        key: "alcance_geografico",
        label: "Alcance geográfico del proyecto",
        value: "México — Bajío y Centro-Norte",
        sourceType: "consultor_only",
        validated: true,
      },
      {
        key: "propuesta_comercial_url",
        label: "Propuesta comercial",
        value: "https://drive.google.com/file/d/propuesta_altamira_doble_materialidad_2024",
        sourceType: "consultor_only",
        validated: true,
        hint: "URL a Google Drive o Supabase Storage",
      },
      {
        key: "relacion_empresas",
        label: "Relación con otras empresas del sistema",
        value: "Empresa independiente — sin matriz ni filiales en el sistema ResponSable",
        sourceType: "consultor_only",
        validated: true,
        hint: "Madre / hija / hermana — si aplica",
      },
    ],
  },

  // ── Paso 2 — Información general ───────────────────────────
  {
    step: 2,
    title: "Información general",
    subtitle: "Contexto público de la empresa. La IA puede llenar el 80%.",
    slideRef: 3,
    aiCanFill: true,
    fields: [
      {
        key: "sector",
        label: "Sector",
        value: "Alimentos y Bebidas",
        sourceType: "public",
        validated: true,
        sources: [
          { url: "https://www.linkedin.com/company/altamira", title: "LinkedIn — Altamira", date: "2024-11-15" },
          { url: "https://sat.gob.mx/consultas/cif", title: "SAT — Actividad fiscal", date: "2024-03-01" },
        ],
      },
      {
        key: "subsector",
        label: "Subsector",
        value: "Distribución alimentaria (cadena de frío)",
        sourceType: "public",
        validated: true,
        sources: [
          { url: "https://www.linkedin.com/company/altamira", title: "LinkedIn — Altamira", date: "2024-11-15" },
        ],
      },
      {
        key: "productos_servicios",
        label: "Principales productos y servicios",
        value:
          "Distribución refrigerada de alimentos (cárnicos, lácteos, congelados, bebidas). Almacenamiento en cámaras de frío. Cross-docking para e-commerce alimentario. Logística de última milla B2B en 12 estados.",
        sourceType: "public",
        validated: true,
        sources: [
          { url: "https://altamira.com.mx/servicios", title: "Altamira — Servicios", date: "2024-09-01" },
        ],
      },
      {
        key: "descripcion_negocio",
        label: "Descripción del negocio (5 líneas)",
        value:
          "Opera una red de distribución alimentaria en frío con presencia en 12 estados del Bajío y Centro-Norte de México. Atiende a más de 1,800 puntos de venta B2B. Diferenciador: cadena de frío certificada BRC y tiempos de entrega menores a 24 h.",
        sourceType: "interpretation",
        validated: false,
        sources: [
          { url: "https://altamira.com.mx/nosotros", title: "Altamira — Quiénes somos", date: "2024-09-01" },
          { url: "https://www.linkedin.com/company/altamira", title: "LinkedIn — About", date: "2024-11-15" },
        ],
        hint: "Basado en información pública — sujeto a validación del asesor.",
      },
      {
        key: "descripcion_sostenibilidad",
        label: "Descripción de sostenibilidad (5 líneas)",
        value:
          "Sin estrategia formal publicada. Página de sostenibilidad corporativa sin contenido. Indicios de gestión operativa vía certificaciones BRC, CTPAT y ESR 2022. No se identifican pilares, ejes ni compromisos ambientales o sociales formalizados.",
        sourceType: "interpretation",
        validated: false,
        sources: [
          { url: "https://altamira.com.mx/sostenibilidad", title: "Altamira — Sostenibilidad (sin contenido)", date: "2024-09-01" },
          { url: "https://www.cemefi.org/esr/empresas", title: "CEMEFI — ESR Altamira 2022", date: "2023-12-01" },
        ],
        hint: "Basado en ausencia de reporte público. Sujeto a validación.",
      },
      {
        key: "empleados",
        label: "Número de empleados",
        value: "3,400",
        sourceType: "public",
        validated: true,
        sources: [
          { url: "https://www.linkedin.com/company/altamira", title: "LinkedIn — Datos empresa", date: "2024-11-15" },
        ],
      },
      {
        key: "ingresos",
        label: "Ingresos anuales (MXN)",
        value: "~$4,200 MDP (estimado por benchmark sectorial)",
        sourceType: "interpretation",
        validated: false,
        sources: [
          { url: "https://sectorial.mx/distribucion-alimentos-mx", title: "AMDA — Benchmark distribución 2023", date: "2023-05-10" },
        ],
        hint: "Estimado. Sujeto a validación del asesor.",
        stale: true,
      },
      {
        key: "unidades_negocio",
        label: "Unidades de negocio y sectores",
        value:
          "Una unidad de negocio principal: logística y distribución alimentaria en frío. Sin divisiones diferenciadas documentadas públicamente. Operaciones integradas verticalmente (almacenamiento + distribución).",
        sourceType: "interpretation",
        validated: false,
        sources: [
          { url: "https://altamira.com.mx/nosotros", title: "Altamira — Quiénes somos", date: "2024-09-01" },
        ],
        hint: "Inferido de información corporativa. Confirmar si existen divisiones internas.",
      },
      {
        key: "paises",
        label: "Países donde opera",
        value: "México",
        sourceType: "public",
        validated: true,
        sources: [
          { url: "https://altamira.com.mx/cobertura", title: "Altamira — Mapa de cobertura", date: "2024-09-01" },
        ],
      },
      {
        key: "ops_por_pais",
        label: "Operaciones en países del proyecto",
        value: "MX: 12 CEDIS, 1 corporativo CDMX, 3 almacenes cross-dock",
        sourceType: "public",
        validated: true,
        sources: [
          { url: "https://altamira.com.mx/cobertura", title: "Altamira — Sucursales", date: "2024-09-01" },
        ],
      },
      {
        key: "tipo_clientes",
        label: "Principales clientes",
        value: "B2B: Walmart (≈28%), OXXO/FEMSA (≈22%), Costco, La Comer, canal HoReCa",
        sourceType: "interpretation",
        validated: false,
        sources: [
          { url: "https://altamira.com.mx/clientes", title: "Altamira — Clientes referencia", date: "2024-08-01" },
        ],
        hint: "Porcentajes estimados — sujeto a validación.",
      },
      {
        key: "competidores",
        label: "Principales competidores",
        value: "Grupo HAVI, SYSCO México, Fanasa, Martin-Brower",
        sourceType: "public",
        validated: true,
        sources: [
          { url: "https://www.havigroup.com/es", title: "HAVI Group México", date: "2024-06-01" },
          { url: "https://www.sysco.com.mx", title: "SYSCO México", date: "2024-06-01" },
        ],
      },
      {
        key: "cotiza_bolsa",
        label: "¿Cotiza en bolsa?",
        value: "No",
        sourceType: "public",
        validated: true,
        sources: [
          { url: "https://www.bmv.com.mx/es/emisoras/listado", title: "BMV — Listado de emisoras", date: "2024-11-01" },
        ],
      },
    ],
  },

  // ── Paso 3 — Estrategia y madurez ──────────────────────────
  {
    step: 3,
    title: "Estrategia y madurez",
    subtitle: "Modelo de sostenibilidad, materialidad, informe, certificaciones.",
    slideRef: 4,
    aiCanFill: true,
    fields: [
      {
        key: "modelo_sostenibilidad",
        label: "Modelo de sostenibilidad",
        value: "No documentado públicamente. Página de sostenibilidad en sitio corporativo sin contenido.",
        sourceType: "interpretation",
        validated: false,
        sources: [
          { url: "https://altamira.com.mx/sostenibilidad", title: "Altamira — Sostenibilidad (página vacía)", date: "2024-09-01" },
        ],
        hint: "No se encontró modelo formal publicado. Sujeto a validación.",
      },
      {
        key: "descripcion_modelo_pilares",
        label: "Descripción de pilares, ejes y temas del modelo",
        value:
          "No documentado. Indicios de 3 ejes operativos implícitos: inocuidad alimentaria (BRC/ISO), cumplimiento laboral (IMSS/LFT) y eficiencia operativa. Sin pilares formalizados ni comunicados al exterior.",
        sourceType: "interpretation",
        validated: false,
        sources: [
          { url: "https://altamira.com.mx/certificaciones", title: "Altamira — Certificaciones", date: "2024-09-01" },
        ],
        hint: "Inferido de certificaciones activas. Confirmar con cliente.",
      },
      {
        key: "grafica_modelo_url",
        label: "Representación gráfica del modelo (upload)",
        value: "https://drive.google.com/file/d/modelo_sostenibilidad_altamira_diagrama_2024.pdf",
        sourceType: "consultor_only",
        validated: true,
        hint: "Subir imagen o PDF — requiere documento interno del cliente",
      },
      {
        key: "analisis_critico_modelo",
        label: "Análisis crítico del modelo",
        value:
          "El modelo carece de formalización pública. Ausencia notable de: cambio climático, gestión de cadena de suministro sostenible y derechos humanos en proveedores — temas clave para una distribuidora con flotilla diésel intensiva y choferes subcontratados.",
        sourceType: "interpretation",
        validated: false,
        sources: [
          { url: "https://www.globalreporting.org/standards/sector-program/food-beverage/", title: "GRI — Sector Food & Beverage estándares", date: "2024-03-01" },
        ],
        hint: "Análisis comparativo con GRI sector. Sujeto a validación.",
      },
      {
        key: "objetivos_metas_sostenibilidad",
        label: "Objetivos y metas de sostenibilidad",
        value:
          "Meta 2025: renovar certificación ESR®. Meta 2026: reducir consumo diésel 15% vía piloto electrificación (10 unidades). Meta 2027: sustituir 100% refrigerantes HFC en CEDIS Querétaro. (Fuente: declaración directiva dic-2024)",
        sourceType: "consultor_only",
        validated: true,
        hint: "Requiere sesión con cliente — no publicados",
      },
      {
        key: "materialidad_anterior",
        label: "Año del último estudio de materialidad",
        value: "No aplica — primer estudio de materialidad",
        sourceType: "consultor_only",
        validated: true,
        hint: "Requiere input directo del cliente",
      },
      {
        key: "tipo_materialidad_anterior",
        label: "Tipo de estudio anterior (impacto vs. doble materialidad)",
        value: "No aplica — primer estudio",
        sourceType: "consultor_only",
        validated: true,
        hint: "Materialidad de impacto (GRI) o doble materialidad (ESRS/CSRD) — requiere input del cliente",
      },
      {
        key: "grupos_interes_estudio_anterior",
        label: "Grupos de interés consultados en estudio anterior",
        value: "No aplica — primer estudio",
        sourceType: "consultor_only",
        validated: true,
        hint: "Requiere input directo del cliente",
      },
      {
        key: "temas_materiales_anterior",
        label: "Temas materiales del estudio anterior",
        value: "No aplica — primer estudio",
        sourceType: "consultor_only",
        validated: true,
        hint: "Listado de temas — requiere informe previo del cliente",
      },
      {
        key: "certificaciones",
        label: "Certificaciones y reconocimientos",
        value: "ISO 14001:2015 (Planta Querétaro), ESR® CEMEFI 2022, CTPAT certificado",
        sourceType: "public",
        validated: true,
        stale: true,
        sources: [
          { url: "https://www.cemefi.org/esr/empresas", title: "CEMEFI — Directorio ESR", date: "2023-12-01" },
          { url: "https://altamira.com.mx/certificaciones", title: "Altamira — Certificaciones", date: "2024-09-01" },
        ],
      },
      {
        key: "tiene_informe",
        label: "¿Publica informe de sostenibilidad?",
        value: "No (solo informe interno, no público)",
        sourceType: "public",
        validated: true,
        sources: [
          { url: "https://www.globalreporting.org/search/?query=altamira", title: "GRI — Búsqueda reportes (0 resultados)", date: "2024-11-01" },
        ],
      },
      {
        key: "informe_publico",
        label: "¿El informe es interno o público?",
        value: "Interno — no disponible públicamente",
        sourceType: "public",
        validated: true,
        sources: [
          { url: "https://www.globalreporting.org/search/?query=altamira", title: "GRI — Búsqueda reportes (0 resultados)", date: "2024-11-01" },
        ],
      },
      {
        key: "tipo_informe_alcance",
        label: "Tipo de informe: global / regional / local",
        value: "No aplica — sin informe publicado",
        sourceType: "public",
        validated: true,
        sources: [
          { url: "https://www.globalreporting.org/search/?query=altamira", title: "GRI — Búsqueda reportes (0 resultados)", date: "2024-11-01" },
        ],
      },
      {
        key: "link_informe",
        label: "Link del informe de sostenibilidad",
        value: "No aplica — informe interno no público",
        sourceType: "consultor_only",
        validated: true,
        hint: "Solo aplica si el informe es público — adjuntar URL",
      },
      {
        key: "informe_interno_url",
        label: "Informe de sostenibilidad interno (upload)",
        value: "https://drive.google.com/file/d/informe_sostenibilidad_altamira_interno_2023.pdf",
        sourceType: "consultor_only",
        validated: true,
        hint: "Subir PDF si el informe es interno — no público",
      },
      {
        key: "periodo_informe",
        label: "Período o año reportado",
        value: "Enero – Diciembre 2023",
        sourceType: "consultor_only",
        validated: true,
        hint: "Requiere informe — no disponible públicamente",
      },
      {
        key: "frameworks",
        label: "Estándares de reporte",
        value: "Sin estándar formal. Informe interno con estructura propia basada en criterios ESR® CEMEFI.",
        sourceType: "consultor_only",
        validated: true,
        hint: "GRI, SASB, TCFD, CDP, NIIF S1/S2 — requiere informe interno del cliente",
      },
      {
        key: "informe_auditado",
        label: "¿El informe está auditado externamente?",
        value: "No — sin verificación externa",
        sourceType: "consultor_only",
        validated: true,
        hint: "Sí / No / Verificación limitada — requiere informe del cliente",
      },
      {
        key: "kpis_medidos",
        label: "¿Qué se mide hoy de forma sistemática?",
        value:
          "Sistemático: consumo diésel por km, accidentalidad vial (tasa/100 unidades), rotación de personal operativo, temperatura cadena de frío por ruta. No medido: agua, residuos totales, emisiones GHG Scope 1 y 2.",
        sourceType: "consultor_only",
        validated: true,
        hint: "Emisiones, agua, energía, residuos, rotación… — requiere input del cliente",
      },
    ],
  },

  // ── Paso 4 — Regulación y sector ───────────────────────────
  {
    step: 4,
    title: "Regulación y sector",
    subtitle: "Fuerzas externas, tendencias y benchmark de competidores.",
    slideRef: 5,
    aiCanFill: true,
    fields: [
      {
        key: "regulaciones",
        label: "Regulaciones aplicables",
        value:
          "NOM-001-STPS-2023 (seguridad laboral), LGPGIR (residuos), NOM-SSA (inocuidad), SEMARNAT COA, LFT, obligaciones IMSS",
        sourceType: "public",
        validated: true,
        sources: [
          { url: "https://www.dof.gob.mx/nota_detalle.php?codigo=5680237", title: "DOF — NOM-001-STPS-2023", date: "2023-03-08" },
          { url: "https://www.semarnat.gob.mx/tramites/coa", title: "SEMARNAT — COA obligatorio", date: "2024-01-01" },
        ],
      },
      {
        key: "referentes_sector",
        label: "Referentes de sostenibilidad del sector",
        value:
          "GRI Standards Food & Beverage Sector, SASB Road Transportation (TR-RO), ISO 14001:2015, NOM-001-STPS-2023, CTPAT (seguridad cadena de suministro), BRC Global Standard (inocuidad).",
        sourceType: "public",
        validated: true,
        sources: [
          { url: "https://www.globalreporting.org/standards/sector-program/food-beverage/", title: "GRI — Sector Food & Beverage", date: "2024-03-01" },
          { url: "https://sasb.org/standards/transportation/road-transportation/", title: "SASB — Road Transportation Standard", date: "2023-10-01" },
        ],
      },
      {
        key: "madurez_sector",
        label: "Nivel de madurez del sector",
        value:
          "Intermedio-bajo. HAVI y SYSCO reportan GRI completo; distribuidoras locales sin reporte formal.",
        sourceType: "interpretation",
        validated: false,
        sources: [
          { url: "https://www.havigroup.com/es/sostenibilidad/reporte-2023", title: "HAVI — Reporte sostenibilidad 2023", date: "2023-12-01" },
          { url: "https://www.sysco.com/sustainability", title: "SYSCO — Sustainability", date: "2024-06-01" },
        ],
        hint: "Análisis comparativo basado en informes públicos. Sujeto a validación.",
        stale: true,
      },
      {
        key: "competidores_reportan",
        label: "Competidores que publican informe",
        value:
          "HAVI: sí (GRI + TCFD)\nSYSCO México: sí (GRI Core)\nFanasa: no\nMartin-Brower: sí (informe global, sin local MX)",
        sourceType: "public",
        validated: true,
        sources: [
          { url: "https://www.havigroup.com/es/sostenibilidad/reporte-2023", title: "HAVI — Reporte 2023 GRI", date: "2023-12-01" },
          { url: "https://www.sysco.com.mx/sostenibilidad", title: "SYSCO México — Sostenibilidad", date: "2024-05-01" },
        ],
      },
      {
        key: "estandares_competidores",
        label: "Estándares usados por competidores",
        value:
          "HAVI: GRI Core + TCFD + CDP Climate; SYSCO México: GRI Core; Martin-Brower: GRI (global); Fanasa: sin estándar formal publicado.",
        sourceType: "public",
        validated: true,
        sources: [
          { url: "https://www.havigroup.com/es/sostenibilidad/reporte-2023", title: "HAVI — Reporte 2023", date: "2023-12-01" },
          { url: "https://www.sysco.com.mx/sostenibilidad", title: "SYSCO México — Estándares", date: "2024-05-01" },
        ],
      },
      {
        key: "temas_materiales_competidores",
        label: "Temas recurrentes en informes de competidores",
        value:
          "1. Emisiones Scope 1 y 2 (flotillas y refrigeración)\n2. Inocuidad alimentaria y reducción de desperdicio\n3. Condiciones laborales y seguridad vial",
        sourceType: "interpretation",
        validated: false,
        sources: [
          { url: "https://www.havigroup.com/es/sostenibilidad/reporte-2023", title: "HAVI — Temas materiales 2023", date: "2023-12-01" },
          { url: "https://www.sysco.com.mx/sostenibilidad", title: "SYSCO — Temas materiales", date: "2024-05-01" },
        ],
        hint: "Inferido de análisis comparativo de informes públicos. Sujeto a validación.",
        stale: true,
      },
      {
        key: "tendencias_sector",
        label: "Top 3 tendencias de sostenibilidad del sector",
        value:
          "1. Descarbonización de cadena de frío (electrificación de flotillas)\n2. Reducción de desperdicio alimentario (Ley FMCN 2025)\n3. Economía circular en envases y embalaje (acuerdo APEAM)",
        sourceType: "public",
        validated: true,
        sources: [
          { url: "https://www.gob.mx/cms/ley-fmcn.pdf", title: "Ley FMCN 2025 — Residuos alimentarios", date: "2024-10-01" },
          { url: "https://www.apeam.org.mx/economia-circular", title: "APEAM — Economía circular", date: "2024-07-01" },
        ],
      },
    ],
  },

  // ── Paso 5 — Modelo de negocio: estructura ─────────────────
  {
    step: 5,
    title: "Modelo de negocio: estructura",
    subtitle: "Cambios recientes, concentración por unidad, validación de alcance.",
    slideRef: 6,
    onlyDoubleMaterialidad: true,
    aiCanFill: true,
    fields: [
      {
        key: "cambios_estructurales",
        label: "Cambios estructurales recientes (2021–2024)",
        value:
          "Adquisición de Distribuidora Norteña Frío S.A. (2022, Monterrey). Apertura CEDIS Guadalajara (oct-2023).",
        sourceType: "public",
        validated: false,
        sources: [
          { url: "https://expansion.mx/empresas/2022/altamira-adquisicion", title: "Expansión — Adquisición Norteña Frío", date: "2022-07-15" },
        ],
        stale: true,
      },
      {
        key: "concentracion_unidades",
        label: "Concentración por unidad de negocio (% ingresos)",
        value: "Distribución refrigerada 100% — operación integrada sin divisiones formales de negocio",
        sourceType: "consultor_only",
        validated: true,
        hint: "Requiere PyL interno por línea de negocio",
      },
      {
        key: "alcance_validacion",
        label: "Validación de unidades en el alcance del proyecto",
        value:
          "En el alcance: operación completa en México (12 CEDIS + corporativo CDMX). Excluido: proveedores logísticos tercerizados no consolidados.",
        sourceType: "consultor_only",
        validated: true,
        hint: "Confirmar qué unidades entran al estudio",
      },
      {
        key: "unidades_distintas",
        label: "¿Las unidades son materialmente distintas entre sí?",
        value:
          "No — operación homogénea. Un solo modelo de negocio, misma cadena de valor y perfil de riesgo en todos los CEDIS.",
        sourceType: "consultor_only",
        validated: true,
        hint: "Diferentes cadenas de valor o perfiles de riesgo",
      },
    ],
  },

  // ── Paso 6 — Modelo de negocio: detalle ────────────────────
  {
    step: 6,
    title: "Modelo de negocio: detalle",
    subtitle: "Propuesta de valor, costos, dependencias, factores de volatilidad.",
    slideRef: 7,
    onlyDoubleMaterialidad: true,
    aiCanFill: true,
    fields: [
      {
        key: "concentracion_clientes",
        label: "Concentración por cliente (>10% ingresos)",
        value:
          "Walmart ≈28%, FEMSA/OXXO ≈22%. Top 2 clientes = ≈50% de ingresos. Riesgo de concentración alto.",
        sourceType: "consultor_only",
        validated: true,
        hint: "Requiere PyL — no disponible públicamente",
      },
      {
        key: "modelos_ingresos",
        label: "Cómo genera ingresos",
        value:
          "Contratos recurrentes B2B anuales + órdenes spot. Tarifa por km + tarifa por pallet (modelo mixto).",
        sourceType: "interpretation",
        validated: false,
        sources: [
          { url: "https://altamira.com.mx/servicios", title: "Altamira — Servicios y tarifas", date: "2024-09-01" },
        ],
        hint: "Inferido del sitio corporativo. Sujeto a validación.",
      },
      {
        key: "factores_volatilidad",
        label: "Factores de volatilidad de ingresos",
        value:
          "Alta dependencia de precio diésel (≈30% costos op.), FX dólar en insumos de cadena fría, estacionalidad navideña (pico nov-dic ≈40% vol. adicional).",
        sourceType: "interpretation",
        validated: false,
        sources: [
          { url: "https://canacar.com.mx/publicaciones/reporte-costos-2024", title: "CANACAR — Costos transporte 2024", date: "2024-06-01" },
        ],
        hint: "Basado en benchmarks CANACAR. Sujeto a validación.",
      },
      {
        key: "propuesta_valor",
        label: "Propuesta de valor diferencial",
        value:
          "Cadena de frío certificada BRC + trazabilidad RFID por pallet + entrega <24h en 12 estados. Único distribuidor en Bajío con CTPAT completo.",
        sourceType: "public",
        validated: false,
        sources: [
          { url: "https://altamira.com.mx/nosotros", title: "Altamira — Diferenciadores", date: "2024-09-01" },
        ],
      },
      {
        key: "costos_operativos",
        label: "Principales costos operativos",
        value:
          "Diésel y combustibles (~30-35% costos op.), personal chofer-refrigeracionista (~25%), mantenimiento flotilla y equipos de frío (~15%), arrendamiento de unidades (~10%), gastos corporativos (~15-20%).",
        sourceType: "interpretation",
        validated: false,
        sources: [
          { url: "https://canacar.com.mx/publicaciones/reporte-costos-2024", title: "CANACAR — Estructura costos 2024", date: "2024-06-01" },
        ],
        hint: "Estimado con benchmarks CANACAR. Validar con estados financieros internos.",
      },
      {
        key: "capex_relevante",
        label: "CAPEX relevante",
        value:
          "Flotilla refrigerada (arrendamiento financiero + unidades propias), equipos de frío en CEDIS (cuartos fríos, túneles), sistema WMS/TMS. Estimado: ~5-8% de ingresos anuales por expansión de CEDIS.",
        sourceType: "interpretation",
        validated: false,
        sources: [
          { url: "https://expansion.mx/empresas/2022/altamira-adquisicion", title: "Expansión — Adquisición e inversión 2022", date: "2022-07-15" },
        ],
        hint: "Inferido de expansiones documentadas. Confirmar con cliente.",
        stale: true,
      },
      {
        key: "dependencias_criticas",
        label: "Dependencias críticas",
        value:
          "1. Precio diésel (PEMEX/mercado)\n2. Refrigerantes HFC (Honeywell — regulación 2026)\n3. Talento operador-refrigeracionista (escasez nacional)\n4. Concentración en 2 clientes principales (>50% ingresos estimado)",
        sourceType: "interpretation",
        validated: false,
        sources: [
          { url: "https://www.gob.mx/sener/refrigerantes-hfc", title: "SENER — Transición refrigerantes HFC", date: "2024-04-01" },
        ],
        hint: "Inferido de benchmarks sectoriales. Sujeto a validación.",
      },
    ],
  },

  // ── Paso 7 — Cadena de valor ────────────────────────────────
  {
    step: 7,
    title: "Cadena de valor",
    subtitle: "Upstream, operación propia y downstream.",
    slideRef: 8,
    onlyDoubleMaterialidad: true,
    aiCanFill: true,
    fields: [
      // ── Upstream ──
      {
        key: "insumos_principales",
        label: "Principales insumos",
        value: "Diésel, refrigerantes HFC, embalaje secundario, flotillas (arrendadas y propias)",
        sourceType: "public",
        validated: false,
        sources: [
          { url: "https://altamira.com.mx/operaciones", title: "Altamira — Operaciones", date: "2024-09-01" },
        ],
      },
      {
        key: "origen_geografico_insumos",
        label: "Origen geográfico de insumos (regiones de alto riesgo)",
        value:
          "Diésel: PEMEX, nacional (riesgo bajo). Refrigerantes HFC: importados — Honeywell/Chemours EE.UU. y Asia-Pacífico (riesgo regulatorio alto — restricción Kigali 2026). Embalaje secundario: proveedores locales MX (riesgo bajo).",
        sourceType: "public",
        validated: false,
        sources: [
          { url: "https://www.gob.mx/sener/refrigerantes-hfc", title: "SENER — Transición refrigerantes HFC", date: "2024-04-01" },
        ],
      },
      {
        key: "proveedores_top5",
        label: "Top 5 proveedores críticos",
        value:
          "1. PEMEX (diésel — nacional)\n2. Honeywell México (refrigerantes HFC)\n3. Kofre (arrendamiento flotilla refrigerada)\n4. Ranpak (embalaje secundario)\n5. SAP México (ERP + WMS)",
        sourceType: "consultor_only",
        validated: true,
        hint: "Requiere información interna — no pública",
      },
      {
        key: "riesgos_proveedores",
        label: "Riesgos conocidos en proveedores",
        value:
          "DDHH/Laboral: choferes subcontratados en jornada extensa y exposición a temperaturas extremas. Ambiental: refrigerantes HFC con alto GWP — regulación Kigali obliga sustitución a 2026. Regulatorio: proveedores de flotilla deben mantener CTPAT vigente.",
        sourceType: "interpretation",
        validated: false,
        sources: [
          { url: "https://www.gob.mx/sener/refrigerantes-hfc", title: "SENER — Transición HFC", date: "2024-04-01" },
          { url: "https://www.dof.gob.mx/nota_detalle.php?codigo=5680237", title: "DOF — NOM-001-STPS-2023", date: "2023-03-08" },
        ],
        hint: "Análisis sectorial. Confirmar con lista real de proveedores.",
      },
      {
        key: "criterios_sostenibilidad_proveedores",
        label: "¿Existen criterios de sostenibilidad para proveedores?",
        value:
          "Sin política formal escrita. Requisito informal: CTPAT vigente para transportistas subcontratados. Sin código de conducta de proveedores publicado ni auditorías SMETA.",
        sourceType: "consultor_only",
        validated: true,
        hint: "Código de conducta, auditorías SMETA, CTPAT, etc. — requiere input del cliente",
      },
      // ── Operación propia ──
      {
        key: "procesos_clave",
        label: "Procesos clave (3-5 más intensivos en recursos o riesgo)",
        value:
          "1. Almacenamiento en frío (mayor consumo energético, riesgo ruptura cadena de frío)\n2. Distribución en ruta (mayor consumo diésel, riesgo vial y laboral)\n3. Mantenimiento flotilla y equipos de frío (riesgo HFC)\n4. Picking y preparación de pedidos (intensivo en mano de obra)\n5. Gestión de devoluciones y merma",
        sourceType: "interpretation",
        validated: false,
        sources: [
          { url: "https://altamira.com.mx/operaciones", title: "Altamira — Operaciones", date: "2024-09-01" },
        ],
        hint: "Inferido de modelo operativo público. Sujeto a validación.",
      },
      {
        key: "ubicacion_operaciones",
        label: "Ubicación de operaciones (plantas, CEDIS, oficinas)",
        value:
          "12 CEDIS: Querétaro (corporativo), CDMX-Vallejo, Guadalajara, Monterrey, Aguascalientes, León, San Luis Potosí, Torreón, Tijuana, Puebla, Mérida, Tampico. 3 almacenes cross-dock.",
        sourceType: "public",
        validated: false,
        sources: [
          { url: "https://altamira.com.mx/cobertura", title: "Altamira — Sucursales y CEDIS", date: "2024-09-01" },
        ],
      },
      {
        key: "energia_operacion",
        label: "Uso de energía en operación",
        value:
          "No medido sistemáticamente. Estimado sectorial: flotillas diésel ~70%, instalaciones frío ~25%, resto ~5%.",
        sourceType: "interpretation",
        validated: false,
        sources: [
          { url: "https://canacar.com.mx/publicaciones/reporte-costos-2024", title: "CANACAR — Estructura costos energéticos", date: "2024-06-01" },
        ],
        hint: "Estimado sectorial. Confirmar si tienen medición interna.",
      },
      {
        key: "uso_agua",
        label: "Uso de agua",
        value:
          "No medido sistemáticamente. Consumo concentrado en limpieza de CEDIS y unidades. Riesgo hídrico medio en ubicaciones Bajío (zona de estrés hídrico según CONAGUA).",
        sourceType: "interpretation",
        validated: false,
        sources: [
          { url: "https://www.conagua.gob.mx/atlas-agua", title: "CONAGUA — Atlas del Agua México 2024", date: "2024-02-01" },
        ],
        hint: "Estimado sectorial. Confirmar si tienen medición interna.",
      },
      {
        key: "residuos",
        label: "Generación de residuos",
        value:
          "Residuos no peligrosos: embalajes secundarios (cartón, plástico, tarimas), merma de alimentos rechazados. Residuos peligrosos: lubricantes de motor, refrigerantes HFC. Sin sistema de reporte sistemático.",
        sourceType: "interpretation",
        validated: false,
        sources: [
          { url: "https://www.gob.mx/semarnat/lgpgir", title: "SEMARNAT — LGPGIR marco legal residuos", date: "2024-01-01" },
        ],
        hint: "Inferido del modelo operativo. Confirmar volúmenes con cliente.",
      },
      {
        key: "condiciones_laborales",
        label: "Condiciones laborales",
        value:
          "Rotación operativa: 28%/año (vs. benchmark sector 18%). Accidentalidad: 4.2 accidentes/100 trabajadores/año. Sin programa formal D&I. 12% mujeres en plantilla total, 3% en operaciones de campo.",
        sourceType: "consultor_only",
        validated: true,
        hint: "Rotación, seguridad, D&I — requiere datos de RRHH",
      },
      {
        key: "relacion_comunidades",
        label: "Relación con comunidades cercanas",
        value:
          "Sin programa formal documentado. Impactos potenciales: ruido de flotillas, emisiones, tráfico pesado cerca de CEDIS. Proceso de permiso para CEDIS Querétaro indica interacción con autoridades locales.",
        sourceType: "interpretation",
        validated: false,
        sources: [
          { url: "https://queretaro.gob.mx/permisos/altamira-cedis", title: "Gobierno QRO — Permiso CEDIS en trámite", date: "2024-08-01" },
        ],
        hint: "Basado en información pública. Confirmar si hay programas comunitarios activos.",
      },
      // ── Downstream ──
      {
        key: "canales_distribucion",
        label: "Canales de distribución",
        value:
          "Entrega directa a CEDIS grandes cadenas, entrega a tienda en rutas propias (canal independiente), cross-docking para e-commerce alimentario.",
        sourceType: "public",
        validated: true,
        sources: [
          { url: "https://altamira.com.mx/servicios/distribucion", title: "Altamira — Canales", date: "2024-09-01" },
        ],
      },
      {
        key: "exigencia_clientes_esg",
        label: "Nivel de exigencia ESG de clientes clave",
        value:
          "Alta: Walmart MX exige CDP Score mínimo C + CTPAT desde 2023. FEMSA/OXXO exige política ambiental documentada. Costco requiere SMETA social audit.",
        sourceType: "public",
        validated: false,
        sources: [
          { url: "https://www.walmartmexico.com/sostenibilidad/cadena-de-valor", title: "Walmart MX — Requisitos ESG proveedores 2023", date: "2023-08-01" },
          { url: "https://www.femsa.com/es/nuestro-compromiso/cadena-de-suministro", title: "FEMSA — Política ESG proveedores", date: "2024-03-01" },
        ],
      },
      {
        key: "problemas_clientes",
        label: "Problemas reportados por clientes (últimos 3-5 años)",
        value:
          "Sin quejas formales públicas identificadas. Paro técnico Monterrey (ago-2022) implicó incumplimiento de entregas ~4 días. Sin retiros de producto documentados ni sanciones COFEPRIS.",
        sourceType: "public",
        validated: false,
        sources: [
          { url: "https://www.elfinanciero.com.mx/2022/altamira-paro", title: "El Financiero — Paro técnico 2022", date: "2022-08-15" },
          { url: "https://www.cofepris.gob.mx/retiros", title: "COFEPRIS — Retiros de producto (sin resultados Altamira)", date: "2024-11-01" },
        ],
        stale: true,
      },
      {
        key: "riesgos_producto",
        label: "Riesgos potenciales por naturaleza del producto/servicio",
        value:
          "Riesgo principal: ruptura de cadena de frío → contaminación alimentaria → responsabilidad por inocuidad (NOM-SSA). Riesgo vial: accidentes con unidades de carga refrigerada. Riesgo bajo de exclusión de usuarios por naturaleza B2B.",
        sourceType: "interpretation",
        validated: false,
        sources: [
          { url: "https://www.cofepris.gob.mx/normas-inocuidad", title: "COFEPRIS — Normas inocuidad alimentaria", date: "2024-01-01" },
        ],
        hint: "Análisis de riesgos inherentes al sector. Sujeto a validación.",
      },
      {
        key: "percepciones_negativas",
        label: "Percepciones negativas en mercado",
        value:
          "3 menciones negativas en LinkedIn 2024 por impacto ambiental de flotilla diésel. Discusión en foros de camioneros sobre condiciones de choferes subcontratados. Sin crisis reputacional mayor documentada.",
        sourceType: "public",
        validated: false,
        sources: [
          { url: "https://www.linkedin.com/search?q=altamira+diesel", title: "LinkedIn — Menciones Altamira 2024", date: "2024-10-01" },
        ],
      },
      {
        key: "fin_vida_producto",
        label: "Fin de vida del producto/servicio",
        value:
          "No aplica directamente (distribuidora, no fabricante). Responsabilidad sobre embalaje secundario: cajas, tarimas, stretch wrap. Sin programa de recuperación o economía circular documentado. Oportunidad: devolución de tarimas con clientes clave.",
        sourceType: "interpretation",
        validated: false,
        sources: [
          { url: "https://apeam.org.mx/economia-circular", title: "APEAM — Economía circular en logística", date: "2024-07-01" },
        ],
        hint: "Basado en operativa del sector. Validar con cliente.",
      },
    ],
  },

  // ── Paso 8 — Riesgos y oportunidades ───────────────────────
  {
    step: 8,
    title: "Riesgos y oportunidades",
    subtitle: "Incidentes, riesgos discriminados, oportunidades de crecimiento.",
    slideRef: 9,
    onlyDoubleMaterialidad: true,
    aiCanFill: true,
    fields: [
      {
        key: "incidentes_materializados",
        label: "Incidentes materializados (2019–2024)",
        value:
          "2021: Multa SEMARNAT QRO por derrame refrigerante ($180K MXN, resuelta). 2022: Paro técnico Monterrey por ola de calor — pérdida ~$2.4 MDP en producto.",
        sourceType: "public",
        validated: false,
        stale: true,
        sources: [
          { url: "https://www.semarnat.gob.mx/sanciones/2021", title: "SEMARNAT — Sanciones 2021", date: "2022-01-10" },
          { url: "https://www.elfinanciero.com.mx/2022/altamira-paro", title: "El Financiero — Paro técnico 2022", date: "2022-08-15" },
        ],
      },
      {
        key: "riesgos_operativos",
        label: "Riesgos operativos",
        value:
          "Falla sistémica de cadena de frío por evento climático extremo. Escasez de refrigerantes HFC (regulación 2026). Dependencia de 2 proveedores de flotilla. ERP legado sin soporte.",
        sourceType: "interpretation",
        validated: false,
        sources: [
          { url: "https://www.ipcc.ch/report/ar6/wg2/", title: "IPCC AR6 — Riesgos climáticos México", date: "2022-02-01" },
        ],
        hint: "Inferido. Sujeto a validación con el cliente.",
        stale: true,
      },
      {
        key: "riesgos_financieros",
        label: "Riesgos financieros",
        value:
          "Multa potencial SEMARNAT por inventario HFC no declarado. Riesgo de pérdida de línea de crédito verde (BBVA sostenible) si no cumple métricas ESG comprometidas. Costo estimado de transición refrigerantes 2026: $8-12 MDP.",
        sourceType: "consultor_only",
        validated: true,
        hint: "Multas regulatorias, acceso a crédito verde — requiere sesión con cliente",
      },
      {
        key: "riesgos_reputacionales",
        label: "Riesgos reputacionales",
        value:
          "Percepción de impacto ambiental por flotilla diésel (3 menciones negativas LinkedIn 2024). Cuestionamientos IMSS por outsourcing de choferes (resuelta 2023).",
        sourceType: "public",
        validated: false,
        sources: [
          { url: "https://www.linkedin.com/search?q=altamira+diesel", title: "LinkedIn — Menciones Altamira 2024", date: "2024-10-01" },
        ],
      },
      {
        key: "oportunidades",
        label: "Oportunidades de crecimiento",
        value:
          "Nearshoring: nuevas plantas industriales Norte/Bajío requieren distribución especializada. Electrificación flotilla (subsidio SENER 2025). Distribución farmacéutica cold chain (segmento adyacente).",
        sourceType: "interpretation",
        validated: false,
        sources: [
          { url: "https://promexico.mx/nearshoring-2024", title: "ProMéxico — Nearshoring 2024", date: "2024-07-01" },
        ],
        hint: "Basado en tendencias públicas. Sujeto a validación estratégica.",
      },
      {
        key: "planes_expansion",
        label: "Planes de expansión",
        value:
          "Corto (2025): apertura CEDIS Monterrey-Sur. Mediano (2026-2027): piloto distribución farmacéutica cold chain. Largo (2028+): expansión Guatemala y Colombia siguiendo clientes actuales.",
        sourceType: "consultor_only",
        validated: true,
        hint: "Corto/mediano/largo plazo — requiere información estratégica del cliente",
      },
    ],
  },

  // ── Paso 9 — Stakeholders ──────────────────────────────────
  {
    step: 9,
    title: "Stakeholders",
    subtitle: "Grupos clave, influencia, dependencia, canales y conflictos activos.",
    slideRef: 9,
    onlyDoubleMaterialidad: true,
    aiCanFill: false,
    fields: [
      {
        key: "grupos_clave",
        label: "Grupos de interés clave",
        value:
          "Empleados directos (3,400), choferes subcontratados (~800), clientes B2B (Walmart/FEMSA/Costco), proveedores refrigerantes, comunidades entorno a CEDIS (12 ubicaciones), SEMARNAT/IMSS/SAT, inversionistas privados.",
        sourceType: "interpretation",
        validated: false,
        sources: [
          { url: "https://altamira.com.mx/responsabilidad-social", title: "Altamira — RSE", date: "2024-09-01" },
        ],
        hint: "Lista sugerida — validar con cliente si faltan grupos internos.",
      },
      {
        key: "influencia_dependencia",
        label: "Nivel de influencia y dependencia por grupo",
        value:
          "Empleados directos: influencia alta, dependencia alta. Clientes B2B (Walmart/FEMSA): influencia muy alta, dependencia alta. Reguladores (SEMARNAT/IMSS/SAT): influencia alta, dependencia media. Inversionistas: influencia media, dependencia alta. Comunidades: influencia media, dependencia baja.",
        sourceType: "consultor_only",
        validated: true,
        hint: "Alta / media / baja — requiere sesión de mapeo con cliente",
      },
      {
        key: "canales_relacion",
        label: "Canales actuales de relación",
        value:
          "Empleados: reuniones mensuales por CEDIS, encuesta clima anual. Clientes: ejecutivo de cuenta dedicado, NPS trimestral. Reguladores: cumplimiento normativo, COA anual SEMARNAT. Comunidades: sin canal formal establecido.",
        sourceType: "consultor_only",
        validated: true,
        hint: "Encuestas, mesas, comités, redes… — requiere sesión con cliente",
      },
      {
        key: "expectativas",
        label: "Principales expectativas por grupo",
        value:
          "Empleados: condiciones laborales dignas, estabilidad y desarrollo. Clientes: entrega on-time, cadena de frío garantizada, trazabilidad. Reguladores: cumplimiento NOM-SSA/STPS/COA SEMARNAT. Inversionistas: rentabilidad y crecimiento. Comunidades: operación limpia, empleo local.",
        sourceType: "consultor_only",
        validated: true,
        hint: "Requiere entrevistas o encuestas con stakeholders",
      },
      {
        key: "conflictos_activos",
        label: "Conflictos o tensiones activas",
        value:
          "Sin conflictos públicos activos. El tema de outsourcing de choferes (2023) fue resuelto. Posibles tensiones por ampliación CEDIS Querétaro (permisos en proceso).",
        sourceType: "interpretation",
        validated: false,
        sources: [
          { url: "https://www.elfinanciero.com.mx/2023/altamira-outsourcing", title: "El Financiero — Outsourcing resuelto 2023", date: "2023-11-01" },
          { url: "https://queretaro.gob.mx/permisos/altamira-cedis", title: "Gobierno QRO — Permiso CEDIS en trámite", date: "2024-08-01" },
        ],
        hint: "Basado en información pública. Sujeto a validación con el cliente.",
        stale: true,
      },
    ],
  },
];

// Helpers de completitud
export function countFilledFields(step: MockStep): number {
  return step.fields.filter((f) => f.value !== null).length;
}

export function countPublicFields(step: MockStep): number {
  return step.fields.filter(
    (f) => f.sourceType === "public" || f.sourceType === "interpretation"
  ).length;
}

export function globalCompleteness(steps: MockStep[], hasDoubleMaterialidad: boolean) {
  const activeSteps = steps.filter(
    (s) => !s.onlyDoubleMaterialidad || hasDoubleMaterialidad
  );
  const total = activeSteps.reduce((n, s) => n + s.fields.length, 0);
  const filled = activeSteps.reduce((n, s) => n + countFilledFields(s), 0);
  return { total, filled, pct: total > 0 ? Math.round((filled / total) * 100) : 0 };
}
