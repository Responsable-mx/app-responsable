// Mapa de colores por sector para glance scanning entre clientes.
// Cada sector → clase Tailwind con bg + text. Tonos suaves (chip neutral)
// para no competir con badges activos del strip.
//
// Si llega un sector no mapeado → cae a slate neutral.

const SECTOR_COLORS: Record<string, string> = {
  // Energía / hidrocarburos
  energia: "bg-amber-50 text-amber-800 ring-1 ring-amber-200/60",
  energia_hidrocarburos: "bg-amber-50 text-amber-800 ring-1 ring-amber-200/60",
  petroleo: "bg-amber-50 text-amber-800 ring-1 ring-amber-200/60",
  gas: "bg-amber-50 text-amber-800 ring-1 ring-amber-200/60",
  renovables: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/60",

  // Financiero
  banca: "bg-indigo-50 text-indigo-800 ring-1 ring-indigo-200/60",
  financiero: "bg-indigo-50 text-indigo-800 ring-1 ring-indigo-200/60",
  seguros: "bg-indigo-50 text-indigo-800 ring-1 ring-indigo-200/60",
  fintech: "bg-indigo-50 text-indigo-800 ring-1 ring-indigo-200/60",

  // Manufactura / industrial
  manufactura: "bg-slate-100 text-slate-800 ring-1 ring-slate-300/60",
  industrial: "bg-slate-100 text-slate-800 ring-1 ring-slate-300/60",
  automotriz: "bg-slate-100 text-slate-800 ring-1 ring-slate-300/60",
  construccion: "bg-stone-100 text-stone-800 ring-1 ring-stone-300/60",

  // Retail / consumo
  retail: "bg-pink-50 text-pink-800 ring-1 ring-pink-200/60",
  consumo: "bg-pink-50 text-pink-800 ring-1 ring-pink-200/60",
  alimentos: "bg-pink-50 text-pink-800 ring-1 ring-pink-200/60",
  bebidas: "bg-pink-50 text-pink-800 ring-1 ring-pink-200/60",

  // Tecnología / servicios
  tecnologia: "bg-violet-50 text-violet-800 ring-1 ring-violet-200/60",
  software: "bg-violet-50 text-violet-800 ring-1 ring-violet-200/60",
  saas: "bg-violet-50 text-violet-800 ring-1 ring-violet-200/60",
  servicios: "bg-cyan-50 text-cyan-800 ring-1 ring-cyan-200/60",
  consultoria: "bg-cyan-50 text-cyan-800 ring-1 ring-cyan-200/60",

  // Salud / pharma
  salud: "bg-rose-50 text-rose-800 ring-1 ring-rose-200/60",
  farmaceutica: "bg-rose-50 text-rose-800 ring-1 ring-rose-200/60",
  pharma: "bg-rose-50 text-rose-800 ring-1 ring-rose-200/60",

  // Agro / forestal
  agro: "bg-lime-50 text-lime-800 ring-1 ring-lime-200/60",
  agricultura: "bg-lime-50 text-lime-800 ring-1 ring-lime-200/60",
  forestal: "bg-lime-50 text-lime-800 ring-1 ring-lime-200/60",

  // Educación
  educacion: "bg-sky-50 text-sky-800 ring-1 ring-sky-200/60",
};

const DEFAULT_CLS = "bg-slate-100 text-slate-700 ring-1 ring-slate-200/60";

/**
 * Devuelve clases Tailwind para un sector. Normaliza:
 * - lowercase
 * - reemplaza espacios/acentos → busca match parcial
 * - fallback a slate neutral
 */
export function sectorPillClasses(sector: string | null | undefined): string {
  if (!sector) return DEFAULT_CLS;
  const key = sector
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove accents
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
  const exact = SECTOR_COLORS[key];
  if (exact) return exact;
  // Match parcial (ej "energia_y_petroleo" → "energia")
  for (const k of Object.keys(SECTOR_COLORS)) {
    if (key.includes(k) || k.includes(key)) {
      const partial = SECTOR_COLORS[k];
      if (partial) return partial;
    }
  }
  return DEFAULT_CLS;
}
