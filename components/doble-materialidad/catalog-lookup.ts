import { CATALOG_SEEDS } from "@/lib/catalogs/seeds";

const _CATALOG_MAP = (() => {
  const m: Record<string, Record<string, string>> = {};
  for (const s of CATALOG_SEEDS) {
    if (!m[s.category]) m[s.category] = {};
    m[s.category]![s.value] = s.label;
  }
  return m;
})();

/** Resuelve label legible desde una category/value del catálogo seed. Fallback: value crudo. */
export function catalogLabel(category: string, value: string): string {
  return _CATALOG_MAP[category]?.[value] ?? value;
}
