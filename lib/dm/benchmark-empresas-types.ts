// Tipos para la etapa "Benchmark de empresas" en DM-IA.

export type BenchmarkEmpresaCriterio =
  | "competidores_directos"
  | "sp_yearbook"
  | "internacionales"
  | "conglomerados"
  | "b2b";

export const CRITERIO_LABELS: Record<BenchmarkEmpresaCriterio, string> = {
  competidores_directos: "C1 — Competidores directos con informe de sostenibilidad",
  sp_yearbook:           "C2 — Empresas del sector en el S&P Sustainability Yearbook",
  internacionales:       "C3 — Empresas internacionales del sector",
  conglomerados:         "C4 — Grupos empresariales con sectores compartidos",
  b2b:                   "C5 — Clientes / proveedores con informe de sostenibilidad",
};

export const CRITERIO_ORDER: BenchmarkEmpresaCriterio[] = [
  "competidores_directos",
  "sp_yearbook",
  "internacionales",
  "conglomerados",
  "b2b",
];

export type BenchmarkEmpresa = {
  id: string;              // short unique id, e.g. "c1_pemex"
  nombre: string;
  pais: string;
  reporte_url?: string | null;
  metodologia: string[];   // e.g. ["GRI", "SASB", "TCFD", "CSRD"]
  criterio: BenchmarkEmpresaCriterio;
  subsector?: string | null;
  justificacion?: string | null;
  recommendation_score?: number | null; // 1-10 basado en 4 criterios de relevancia
};

export type BenchmarkEmpresasGenerationStatus = "idle" | "generating" | "done" | "failed";

export type BenchmarkEmpresasData = {
  id?: string;
  proposed_companies: BenchmarkEmpresa[];
  enabled_companies: string[];              // company IDs validated by consultant
  omitted_criteria: BenchmarkEmpresaCriterio[];
  generation_status: BenchmarkEmpresasGenerationStatus;
};
