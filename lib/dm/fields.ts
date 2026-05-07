/**
 * Campos de comparación para el benchmark de Doble Materialidad IA.
 * Agregar/quitar campos aquí — sin migración de DB (se guardan en JSONB).
 */
export type BenchmarkField = {
  key: string;
  label: string;
  description?: string;
};

export const BENCHMARK_FIELDS: BenchmarkField[] = [
  {
    key: "politica_sostenibilidad",
    label: "Política de sostenibilidad",
    description: "Existencia y alcance de política formal de sostenibilidad o RSE publicada",
  },
  {
    key: "divulgacion_esg",
    label: "Divulgación ESG",
    description: "Estándar de reporte utilizado (GRI, SASB, TCFD, CSRD, ninguno)",
  },
];

export type CompanyRelation =
  | "competitor_nacional"
  | "competitor_internacional"
  | "sector"
  | "cadena_valor";

export const RELATION_LABELS: Record<CompanyRelation, string> = {
  competitor_nacional:      "Competidor nacional",
  competitor_internacional: "Competidor internacional",
  sector:                   "Empresa del sector",
  cadena_valor:             "Cadena de valor",
};
