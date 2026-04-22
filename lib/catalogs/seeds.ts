/**
 * Seeds de catálogos — fuente de verdad para dev mode (sin Supabase) y
 * fallback cuando la DB responde vacía. Idéntico al seed de la migración
 * 0005_catalogs.sql.
 *
 * Los admins pueden editar en /configuracion; aquí solo es snapshot.
 */

export type CatalogCategory =
  | "business_segments"
  | "frameworks"
  | "applicable_regulations"
  | "policies"
  | "certifications"
  | "material_topics"
  | "maturity_levels"
  | "sectors"
  | "countries"
  | "revenue_models";

// Orden alfabético por label (es-MX).
export const CATALOG_CATEGORIES: Array<{
  key: CatalogCategory;
  label: string;
  description: string;
  hasSearch: boolean;   // si el dropdown muestra buscador (catálogos ≥10)
  hasGroups: boolean;   // si se agrupa por group_name en el dropdown
}> = [
  { key: "certifications",          label: "Certificaciones",         description: "Certificaciones ISO, B Corp, EcoVadis, etc.",           hasSearch: true,  hasGroups: true },
  { key: "frameworks",              label: "Marcos ESG",              description: "GRI, SASB, ISSB, CSRD y similares.",                    hasSearch: true,  hasGroups: true },
  { key: "revenue_models",          label: "Modelos de ingresos",     description: "Cómo el cliente genera ingresos (B2B contratos, suscripción, etc.).", hasSearch: false, hasGroups: false },
  { key: "maturity_levels",         label: "Niveles de madurez",      description: "Escala de madurez ESG del cliente.",                    hasSearch: false, hasGroups: false },
  { key: "countries",               label: "Países",                  description: "Países donde operan los clientes.",                     hasSearch: true,  hasGroups: true },
  { key: "policies",                label: "Políticas corporativas",  description: "Políticas internas que el cliente puede tener formalizadas.", hasSearch: false, hasGroups: false },
  { key: "applicable_regulations",  label: "Regulaciones aplicables", description: "Regulaciones ESG por jurisdicción.",                    hasSearch: true,  hasGroups: true },
  { key: "sectors",                 label: "Sectores",                description: "Taxonomía de industrias que los clientes pueden elegir.", hasSearch: true,  hasGroups: true },
  { key: "business_segments",       label: "Segmentos de negocio",    description: "B2B, B2C, gobierno, etc.",                              hasSearch: false, hasGroups: false },
  { key: "material_topics",         label: "Temas materiales",        description: "Temas ESG priorizables en materialidad (basado en GRI).", hasSearch: true,  hasGroups: true },
];

export type CatalogSeedItem = {
  category: CatalogCategory;
  value: string;
  label: string;
  group_name?: string;
  sort_order: number;
};

// Mantenido en sincronía con 0005_catalogs.sql. Si agregas ítems ahí, agrega aquí.
export const CATALOG_SEEDS: CatalogSeedItem[] = [
  // business_segments
  { category: "business_segments", value: "b2b",       label: "B2B",            sort_order: 10 },
  { category: "business_segments", value: "b2c",       label: "B2C",            sort_order: 20 },
  { category: "business_segments", value: "b2g",       label: "B2G (gobierno)", sort_order: 30 },
  { category: "business_segments", value: "d2c",       label: "D2C",            sort_order: 40 },
  { category: "business_segments", value: "b2b2c",     label: "B2B2C",          sort_order: 50 },
  { category: "business_segments", value: "wholesale", label: "Mayorista",      sort_order: 60 },
  { category: "business_segments", value: "franchise", label: "Franquicia",     sort_order: 70 },

  // frameworks
  { category: "frameworks", value: "gri",           label: "GRI Standards",     group_name: "ESG",    sort_order: 10 },
  { category: "frameworks", value: "sasb",          label: "SASB",              group_name: "ESG",    sort_order: 20 },
  { category: "frameworks", value: "issb",          label: "ISSB",              group_name: "ESG",    sort_order: 30 },
  { category: "frameworks", value: "csrd",          label: "CSRD (UE)",         group_name: "ESG",    sort_order: 40 },
  { category: "frameworks", value: "tcfd",          label: "TCFD",              group_name: "Clima",  sort_order: 50 },
  { category: "frameworks", value: "cdp",           label: "CDP",               group_name: "Clima",  sort_order: 60 },
  { category: "frameworks", value: "sbti",          label: "SBTi",              group_name: "Clima",  sort_order: 70 },
  { category: "frameworks", value: "esr_cemefi",    label: "ESR CEMEFI",        group_name: "Social", sort_order: 80 },
  { category: "frameworks", value: "un_global_compact", label: "UN Global Compact", group_name: "Social", sort_order: 90 },
  { category: "frameworks", value: "ilo",           label: "ILO",               group_name: "Social", sort_order: 100 },
  { category: "frameworks", value: "oecd",          label: "OECD Guidelines",   group_name: "Social", sort_order: 110 },

  // applicable_regulations
  { category: "applicable_regulations", value: "csrd_ue",              label: "CSRD (Unión Europea)",    group_name: "ESG",    sort_order: 10 },
  { category: "applicable_regulations", value: "issb_global",          label: "ISSB (global)",           group_name: "ESG",    sort_order: 20 },
  { category: "applicable_regulations", value: "sec_climate_us",       label: "SEC Climate Disclosure (US)", group_name: "ESG", sort_order: 30 },
  { category: "applicable_regulations", value: "nis_mx",               label: "NIS (México)",            group_name: "México", sort_order: 40 },
  { category: "applicable_regulations", value: "ley_cambio_climatico_mx", label: "Ley Cambio Climático (MX)", group_name: "México", sort_order: 50 },
  { category: "applicable_regulations", value: "cnbv_sustentabilidad_mx", label: "CNBV Sustentabilidad (MX)", group_name: "México", sort_order: 60 },
  { category: "applicable_regulations", value: "nom_035_mx",           label: "NOM-035 (MX)",            group_name: "México", sort_order: 70 },
  { category: "applicable_regulations", value: "lfpiorpi_mx",          label: "LFPIORPI (MX)",           group_name: "México", sort_order: 80 },
  { category: "applicable_regulations", value: "ley_olimpia_mx",       label: "Ley Olimpia (MX)",        group_name: "México", sort_order: 90 },

  // policies
  { category: "policies", value: "etica",           label: "Ética",                  sort_order: 10 },
  { category: "policies", value: "ddhh",            label: "Derechos humanos",       sort_order: 20 },
  { category: "policies", value: "ambiental",       label: "Ambiental",              sort_order: 30 },
  { category: "policies", value: "codigo_conducta", label: "Código de conducta",     sort_order: 40 },
  { category: "policies", value: "proveedores",     label: "Proveedores",            sort_order: 50 },
  { category: "policies", value: "sostenibilidad",  label: "Sostenibilidad",         sort_order: 60 },
  { category: "policies", value: "diversidad",      label: "Diversidad e inclusión", sort_order: 70 },
  { category: "policies", value: "anticorrupcion",  label: "Anticorrupción",         sort_order: 80 },
  { category: "policies", value: "salud_seguridad", label: "Salud y seguridad",      sort_order: 90 },

  // certifications
  { category: "certifications", value: "iso_14001",  label: "ISO 14001",             group_name: "Ambiental", sort_order: 10 },
  { category: "certifications", value: "iso_45001",  label: "ISO 45001",             group_name: "Laboral",   sort_order: 20 },
  { category: "certifications", value: "iso_26000",  label: "ISO 26000",             group_name: "Social",    sort_order: 30 },
  { category: "certifications", value: "b_corp",     label: "B Corp",                group_name: "Integral",  sort_order: 40 },
  { category: "certifications", value: "ecovadis",   label: "EcoVadis",              group_name: "Integral",  sort_order: 50 },
  { category: "certifications", value: "esr_cemefi", label: "ESR CEMEFI",            group_name: "Social",    sort_order: 60 },
  { category: "certifications", value: "gptw",       label: "Great Place to Work",   group_name: "Laboral",   sort_order: 70 },
  { category: "certifications", value: "fsc",        label: "FSC",                   group_name: "Ambiental", sort_order: 80 },
  { category: "certifications", value: "fair_trade", label: "Fair Trade",            group_name: "Social",    sort_order: 90 },
  { category: "certifications", value: "leed",       label: "LEED",                  group_name: "Ambiental", sort_order: 100 },

  // material_topics
  { category: "material_topics", value: "cambio_climatico",  label: "Cambio climático",       group_name: "Ambiental",  sort_order: 10 },
  { category: "material_topics", value: "agua",              label: "Agua",                   group_name: "Ambiental",  sort_order: 20 },
  { category: "material_topics", value: "biodiversidad",     label: "Biodiversidad",          group_name: "Ambiental",  sort_order: 30 },
  { category: "material_topics", value: "residuos",          label: "Residuos",               group_name: "Ambiental",  sort_order: 40 },
  { category: "material_topics", value: "economia_circular", label: "Economía circular",      group_name: "Ambiental",  sort_order: 50 },
  { category: "material_topics", value: "ddhh",              label: "Derechos humanos",       group_name: "Social",     sort_order: 60 },
  { category: "material_topics", value: "diversidad",        label: "Diversidad e inclusión", group_name: "Social",     sort_order: 70 },
  { category: "material_topics", value: "salud_seguridad",   label: "Salud y seguridad",      group_name: "Social",     sort_order: 80 },
  { category: "material_topics", value: "cadena_suministro", label: "Cadena de suministro",   group_name: "Social",     sort_order: 90 },
  { category: "material_topics", value: "etica",             label: "Ética y anticorrupción", group_name: "Gobernanza", sort_order: 100 },
  { category: "material_topics", value: "privacidad",        label: "Privacidad de datos",    group_name: "Gobernanza", sort_order: 110 },
  { category: "material_topics", value: "impuestos",         label: "Fiscalidad responsable", group_name: "Gobernanza", sort_order: 120 },

  // maturity_levels
  { category: "maturity_levels", value: "inicial",    label: "Inicial",    sort_order: 10 },
  { category: "maturity_levels", value: "gestionado", label: "Gestionado", sort_order: 20 },
  { category: "maturity_levels", value: "avanzado",   label: "Avanzado",   sort_order: 30 },
  { category: "maturity_levels", value: "lider",      label: "Líder",      sort_order: 40 },

  // sectors
  { category: "sectors", value: "bebidas",         label: "Bebidas",                 group_name: "Consumo",    sort_order: 10 },
  { category: "sectors", value: "alimentos",       label: "Alimentos",               group_name: "Consumo",    sort_order: 20 },
  { category: "sectors", value: "retail",          label: "Retail",                  group_name: "Consumo",    sort_order: 30 },
  { category: "sectors", value: "consumo_masivo",  label: "Consumo masivo",          group_name: "Consumo",    sort_order: 40 },
  { category: "sectors", value: "farmaceutico",    label: "Farmacéutico",            group_name: "Salud",      sort_order: 50 },
  { category: "sectors", value: "servicios_salud", label: "Servicios de salud",      group_name: "Salud",      sort_order: 60 },
  { category: "sectors", value: "banca",           label: "Banca",                   group_name: "Financiero", sort_order: 70 },
  { category: "sectors", value: "seguros",         label: "Seguros",                 group_name: "Financiero", sort_order: 80 },
  { category: "sectors", value: "fintech",         label: "Fintech",                 group_name: "Financiero", sort_order: 90 },
  { category: "sectors", value: "manufactura",     label: "Manufactura",             group_name: "Industrial", sort_order: 100 },
  { category: "sectors", value: "construccion",    label: "Construcción",            group_name: "Industrial", sort_order: 110 },
  { category: "sectors", value: "energia",         label: "Energía",                 group_name: "Industrial", sort_order: 120 },
  { category: "sectors", value: "mineria",         label: "Minería",                 group_name: "Industrial", sort_order: 130 },
  { category: "sectors", value: "transporte",      label: "Transporte y logística",  group_name: "Industrial", sort_order: 140 },
  { category: "sectors", value: "telecom",         label: "Telecomunicaciones",      group_name: "TMT",        sort_order: 150 },
  { category: "sectors", value: "tecnologia",      label: "Tecnología / Software",   group_name: "TMT",        sort_order: 160 },
  { category: "sectors", value: "medios",          label: "Medios",                  group_name: "TMT",        sort_order: 170 },
  { category: "sectors", value: "educacion",       label: "Educación",               group_name: "Servicios",  sort_order: 180 },
  { category: "sectors", value: "consultoria",     label: "Consultoría profesional", group_name: "Servicios",  sort_order: 190 },
  { category: "sectors", value: "hospitalidad",    label: "Hospitalidad y turismo",  group_name: "Servicios",  sort_order: 200 },
  { category: "sectors", value: "inmobiliario",    label: "Inmobiliario",            group_name: "Servicios",  sort_order: 210 },
  { category: "sectors", value: "agropecuario",    label: "Agropecuario",            group_name: "Primario",   sort_order: 220 },

  // countries — México primero, resto alfabético (es-MX)
  { category: "countries", value: "mx", label: "México",              group_name: "LATAM",        sort_order: 10 },
  { category: "countries", value: "de", label: "Alemania",            group_name: "Europa",       sort_order: 20 },
  { category: "countries", value: "ar", label: "Argentina",           group_name: "LATAM",        sort_order: 30 },
  { category: "countries", value: "br", label: "Brasil",              group_name: "LATAM",        sort_order: 40 },
  { category: "countries", value: "ca", label: "Canadá",              group_name: "Norteamérica", sort_order: 50 },
  { category: "countries", value: "cl", label: "Chile",               group_name: "LATAM",        sort_order: 60 },
  { category: "countries", value: "co", label: "Colombia",            group_name: "LATAM",        sort_order: 70 },
  { category: "countries", value: "cr", label: "Costa Rica",          group_name: "LATAM",        sort_order: 80 },
  { category: "countries", value: "es", label: "España",              group_name: "Europa",       sort_order: 90 },
  { category: "countries", value: "us", label: "Estados Unidos",      group_name: "Norteamérica", sort_order: 100 },
  { category: "countries", value: "fr", label: "Francia",             group_name: "Europa",       sort_order: 110 },
  { category: "countries", value: "gt", label: "Guatemala",           group_name: "LATAM",        sort_order: 120 },
  { category: "countries", value: "nl", label: "Países Bajos",        group_name: "Europa",       sort_order: 130 },
  { category: "countries", value: "pa", label: "Panamá",              group_name: "LATAM",        sort_order: 140 },
  { category: "countries", value: "pe", label: "Perú",                group_name: "LATAM",        sort_order: 150 },
  { category: "countries", value: "uk", label: "Reino Unido",         group_name: "Europa",       sort_order: 160 },
  { category: "countries", value: "do", label: "República Dominicana",group_name: "LATAM",        sort_order: 170 },

  // revenue_models
  { category: "revenue_models", value: "venta_directa",      label: "Venta directa",           sort_order: 10 },
  { category: "revenue_models", value: "venta_mayorista",    label: "Venta mayorista",         sort_order: 20 },
  { category: "revenue_models", value: "suscripcion",        label: "Suscripción",             sort_order: 30 },
  { category: "revenue_models", value: "contratos",          label: "Contratos recurrentes",   sort_order: 40 },
  { category: "revenue_models", value: "licenciamiento",     label: "Licenciamiento",          sort_order: 50 },
  { category: "revenue_models", value: "franquicia",         label: "Franquicia",              sort_order: 60 },
  { category: "revenue_models", value: "marketplace",        label: "Marketplace / comisión",  sort_order: 70 },
  { category: "revenue_models", value: "publicidad",         label: "Publicidad",              sort_order: 80 },
  { category: "revenue_models", value: "servicios_proyecto", label: "Servicios por proyecto",  sort_order: 90 },
  { category: "revenue_models", value: "servicios_hora",     label: "Servicios por hora",      sort_order: 100 },
];
