import type { RejectionReason } from "./benchmark-types";

export const REJECTION_OPTIONS: { value: RejectionReason; label: string }[] = [
  { value: "sector_diferente",    label: "Sector diferente" },
  { value: "tamano_incomparable", label: "Tamaño incomparable" },
  { value: "sin_reporte",         label: "Sin reporte público" },
  { value: "ya_es_cliente",       label: "Ya es cliente" },
  { value: "otro",                label: "Otro motivo" },
];

export function lookupComparisonValue(
  comparison: Record<string, Record<string, string>>,
  fieldKey: string,
  companyName: string,
): string {
  const fieldMap = comparison[fieldKey] ?? {};
  return (
    fieldMap[companyName] ??
    Object.entries(fieldMap).find(
      ([k]) => companyName.startsWith(k) || k.startsWith(companyName.split(" ")[0]!)
    )?.[1] ??
    "—"
  );
}

export function abbrevCompanyName(name: string): string {
  // Strip parenthetical content (ej. "(AGD)") antes de abreviar para evitar duplicar la sigla
  const clean = name.replace(/\s*\([^)]*\)/g, "").trim() || name;
  if (clean.length <= 16) return clean;
  const words = clean.split(/[\s/]+/).filter((w) => w.length > 1);
  const caps = words.filter((w) => /^[A-ZÁÉÍÓÚÑ]/.test(w));
  if (caps.length >= 3) return caps.map((w) => w[0]).join("").slice(0, 6);
  if (caps.length === 2) return `${caps[0]!.slice(0, 6)} ${caps[1]!.slice(0, 5)}`;
  return clean.slice(0, 14) + "…";
}
