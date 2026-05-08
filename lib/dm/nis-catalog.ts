/**
 * Catálogo estático de indicadores IBSO de alta prevalencia.
 * Fuente: Anexo Metodológico DM Ágil + NIS B-1 CINIF (mayo 2026).
 *
 * Uso: getIbsoForSector(sector) devuelve los indicadores más relevantes
 * para el sector del cliente (7-10 items ordenados por relevancia).
 */

export type NisCatalogItem = {
  key: string;
  label: string;
  categoria: "ambiental" | "social" | "gobernanza";
  /** Sectores donde este indicador tiene alta relevancia */
  sectores: string[]; // "manufactura" | "retail" | "servicios" | "todos"
  sort_order: number;
};

export const NIS_CATALOG: NisCatalogItem[] = [
  // ── Ambiental ────────────────────────────────────────────────
  {
    key: "emisiones_ghg",
    label: "Emisiones de GEI (alcance 1, 2 y 3)",
    categoria: "ambiental",
    sectores: ["todos"],
    sort_order: 1,
  },
  {
    key: "consumo_energia",
    label: "Consumo de energía y fuentes",
    categoria: "ambiental",
    sectores: ["todos"],
    sort_order: 2,
  },
  {
    key: "consumo_agua",
    label: "Consumo y descarga de agua",
    categoria: "ambiental",
    sectores: ["manufactura", "retail"],
    sort_order: 3,
  },
  {
    key: "residuos",
    label: "Generación y manejo de residuos",
    categoria: "ambiental",
    sectores: ["manufactura", "retail"],
    sort_order: 4,
  },
  {
    key: "cumplimiento_ambiental",
    label: "Cumplimiento regulatorio ambiental",
    categoria: "ambiental",
    sectores: ["manufactura"],
    sort_order: 5,
  },
  // ── Social ───────────────────────────────────────────────────
  {
    key: "seguridad_laboral",
    label: "Seguridad y salud en el trabajo",
    categoria: "social",
    sectores: ["manufactura", "retail"],
    sort_order: 6,
  },
  {
    key: "capacitacion",
    label: "Capacitación y desarrollo de personas",
    categoria: "social",
    sectores: ["todos"],
    sort_order: 7,
  },
  {
    key: "condiciones_laborales",
    label: "Condiciones laborales y derechos",
    categoria: "social",
    sectores: ["manufactura", "retail"],
    sort_order: 8,
  },
  {
    key: "cadena_suministro",
    label: "Prácticas en cadena de suministro",
    categoria: "social",
    sectores: ["manufactura", "retail"],
    sort_order: 9,
  },
  {
    key: "privacidad_datos",
    label: "Privacidad y seguridad de datos",
    categoria: "social",
    sectores: ["servicios", "retail"],
    sort_order: 10,
  },
  // ── Gobernanza ───────────────────────────────────────────────
  {
    key: "etica_anticorrupcion",
    label: "Ética empresarial y anticorrupción",
    categoria: "gobernanza",
    sectores: ["todos"],
    sort_order: 11,
  },
  {
    key: "gestion_riesgos_esg",
    label: "Gobernanza y gestión de riesgos ESG",
    categoria: "gobernanza",
    sectores: ["todos"],
    sort_order: 12,
  },
];

/** Sectores que mapean a cada tag interno */
const SECTOR_MAP: Record<string, string[]> = {
  manufactura:    ["manufactura", "industrial", "fabricación", "producción", "químico", "alimentos"],
  retail:         ["retail", "comercio", "distribución", "tiendas", "consumo"],
  servicios:      ["servicios", "tecnología", "finanzas", "consultoría", "salud", "educación", "software"],
};

function normalizeSector(sector: string | null | undefined): string {
  if (!sector) return "todos";
  const s = sector.toLowerCase();
  for (const [tag, keywords] of Object.entries(SECTOR_MAP)) {
    if (keywords.some((k) => s.includes(k))) return tag;
  }
  return "servicios"; // default para sectores desconocidos
}

/**
 * Devuelve los IBSO relevantes para el sector del cliente.
 * Siempre incluye los universales ("todos") + los específicos del sector.
 */
export function getIbsoForSector(sector: string | null | undefined): NisCatalogItem[] {
  const tag = normalizeSector(sector);
  return NIS_CATALOG
    .filter((item) => item.sectores.includes("todos") || item.sectores.includes(tag))
    .sort((a, b) => a.sort_order - b.sort_order);
}
