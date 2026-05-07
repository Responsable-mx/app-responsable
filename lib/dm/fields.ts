import type { DmIroConfig } from "@/lib/dm/iros";

/**
 * Campos de comparación para el benchmark de Doble Materialidad IA.
 * Los campos dinámicos vienen de dm_iro_config (IROs ESRS).
 * BENCHMARK_FIELDS se conserva para compatibilidad con resultados históricos.
 */
export type BenchmarkField = {
  key: string;
  label: string;
  description?: string;
};

export const BENCHMARK_FIELDS: BenchmarkField[] = [
  {
    key: "emisiones_ghg",
    label: "Emisiones GHG (Scope 1, 2 y 3)",
    description: "Nivel de medición, reporte y compromisos de reducción de emisiones de gases de efecto invernadero en los tres alcances",
  },
  {
    key: "gestion_agua",
    label: "Gestión del agua",
    description: "Consumo hídrico, eficiencia en uso, operaciones en zonas de estrés hídrico y metas de reducción",
  },
  {
    key: "biodiversidad",
    label: "Biodiversidad y ecosistemas",
    description: "Impacto en áreas naturales, política de no-deforestación, uso de suelo y compromisos de restauración",
  },
  {
    key: "derechos_laborales_cadena_valor",
    label: "Derechos laborales y cadena de valor",
    description: "Due diligence en derechos humanos, política de proveedores, prohibición de trabajo forzado e infantil, auditorías de cadena de suministro",
  },
  {
    key: "gobierno_anticorrupcion",
    label: "Gobierno corporativo y anticorrupción",
    description: "Estructura del consejo, política anticorrupción publicada, mecanismo de denuncia, transparencia fiscal y remuneración ejecutiva vinculada a ESG",
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

/**
 * Convierte IROs activos a BenchmarkFields para almacenar en fields_snapshot.
 * Cada estándar ESRS genera 2 campos: impacto + riesgo/oportunidad.
 */
export function irosToBenchmarkFields(iros: DmIroConfig[]): BenchmarkField[] {
  return iros.flatMap((iro) => [
    {
      key:         `${iro.esrs_standard}_impact`,
      label:       `${iro.label} — Impacto`,
      description: iro.impact_desc,
    },
    {
      key:         `${iro.esrs_standard}_risk_opp`,
      label:       `${iro.label} — Riesgo / Oportunidad`,
      description: `${iro.risk_desc} | ${iro.opportunity_desc}`,
    },
  ]);
}
