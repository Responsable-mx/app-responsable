// Tipos para la etapa "Referentes de Sostenibilidad" en DM-IA.

export type ReferenteFramework = {
  id: string;           // e.g. "SASB", "GRI", "ESRS", "IPIECA", "GCCA", "PRI"
  name: string;
  description: string;
  url?: string | null;
  sector_note?: string | null;  // por qué aplica a este sector
};

export type TopicRaw = {
  tema: string;
  subtema?: string | null;
  descripcion: string;
  referente: string;    // framework name
};

export type TopicGrouped = {
  tema_consolidado: string;
  descripcion_consolidada: string;
  referentes: string[];  // array of framework names
};

export type FrameworksStatus  = "idle" | "generating" | "done" | "failed";
export type TopicsStatus      = "idle" | "generating" | "done" | "failed";
export type SectorIrosStatus  = "idle" | "generating" | "done" | "failed";

export type SectorIro = {
  n_iro:        number;
  descripcion:  string;
  tipo:         "impacto_positivo" | "impacto_negativo" | "riesgo" | "oportunidad";
  tema_asociado?: string | null;
  horizonte:    "corto" | "mediano" | "largo";
  cadena:       "upstream" | "operacion" | "downstream";
  referentes:   string[];  // IDs de frameworks que lo respaldan
};

export type ReferentesData = {
  id?: string;
  proposed_frameworks: ReferenteFramework[];
  enabled_frameworks: string[];       // IDs of validated frameworks
  frameworks_status: FrameworksStatus;
  coverage_score?: number | null;
  coverage_note?: string | null;
  topics_raw: TopicRaw[];
  topics_grouped: TopicGrouped[];
  topics_status: TopicsStatus;
  topics_batch_id?: string | null;
  sector_iros: SectorIro[];
  sector_iros_status: SectorIrosStatus;
};
