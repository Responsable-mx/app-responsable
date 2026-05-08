/**
 * Clasifica un tema_esg en la categoría ESG (E/S/G) usando matching de palabras clave.
 * Los temas vienen del inventario IRO (campo libre texto generado por IA).
 */
export type EsgCategory = "E" | "S" | "G";

const E_KEYWORDS = ["emisi", "ghg", "carbono", "co2", "agua", "hidric", "biodiversidad", "ecosistem",
  "circular", "residuo", "reciclaj", "energ", "contaminac", "suelo", "deforest", "bosque", "clima",
  "atmosfer", "ozono", "vertido", "ruido", "ambiental", "natural", "recurso natural"];

const S_KEYWORDS = ["laboral", "trabajo", "trabajador", "emplead", "comunidad", "consumidor",
  "derechos human", "diversidad", "inclusión", "salud", "seguridad", "acceso", "indígena",
  "género", "mujer", "discriminac", "social", "cadena de valor", "proveedor", "cliente"];

const G_KEYWORDS = ["gobierno", "gobernanza", "corrupción", "ética", "transparencia",
  "consejo", "remuneración", "impuesto", "compliance", "anticorrupción", "lobby", "directivo",
  "accionista", "auditoría", "riesgo institucional", "regulatorio"];

export function classifyEsg(temaEsg: string): EsgCategory {
  const lower = temaEsg.toLowerCase();
  const score = (keywords: string[]) => keywords.filter((k) => lower.includes(k)).length;
  const eScore = score(E_KEYWORDS);
  const sScore = score(S_KEYWORDS);
  const gScore = score(G_KEYWORDS);
  if (eScore > sScore && eScore > gScore) return "E";
  if (sScore > eScore && sScore > gScore) return "S";
  if (gScore > eScore && gScore > sScore) return "G";
  // Empate → usar posición de primera letra
  if (lower.startsWith("e")) return "E";
  if (lower.startsWith("s")) return "S";
  if (lower.startsWith("g")) return "G";
  return "E"; // default ambiental
}

export const ESG_BADGE: Record<EsgCategory, string> = {
  E: "bg-emerald-100 text-emerald-700",
  S: "bg-sky-100 text-sky-700",
  G: "bg-violet-100 text-violet-700",
};

export const ESG_LABEL: Record<EsgCategory, string> = {
  E: "Ambiental",
  S: "Social",
  G: "Gobernanza",
};
