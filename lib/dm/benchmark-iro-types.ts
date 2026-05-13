import { z } from "zod";

export type BenchmarkIroTipo =
  | "impacto_positivo"
  | "impacto_negativo"
  | "riesgo"
  | "oportunidad";

export type BenchmarkIroCadena =
  | "operacion"
  | "upstream"
  | "downstream"
  | "sociedad_comunidad"
  | "clientes_consumidores"
  | "medio_ambiente";

export type BenchmarkIroHorizonte = "corto" | "mediano" | "largo";
export type BenchmarkIroFuente = "reporte" | "sitio_web" | "interpretacion_ia";
export type BenchmarkIroConfianza = "alto" | "medio" | "bajo";

export interface BenchmarkCompanyIro {
  id: string;
  client_id: string;
  benchmark_company_id: string;
  n_iro: number;
  descripcion: string;
  tipo: BenchmarkIroTipo;
  cadena: BenchmarkIroCadena;
  horizonte: BenchmarkIroHorizonte;
  tema_asociado: string | null;
  fuente_tipo: BenchmarkIroFuente;
  confianza: BenchmarkIroConfianza;
  created_at: string;
  updated_at: string;
}

export interface BenchmarkIroBatch {
  id: string;
  client_id: string;
  benchmark_company_id: string;
  batch_id: string | null;
  status: "pending" | "done" | "failed";
  error_msg: string | null;
  created_by: string;
  created_at: string;
}

// ── Zod schema para validar el JSON que devuelve el LLM ───────────────────────

export const BenchmarkIroItemSchema = z.object({
  n_iro: z.number().int().positive(),
  descripcion: z.string().min(10),
  tipo: z.enum(["impacto_positivo", "impacto_negativo", "riesgo", "oportunidad"]),
  cadena: z.enum([
    "operacion",
    "upstream",
    "downstream",
    "sociedad_comunidad",
    "clientes_consumidores",
    "medio_ambiente",
  ]),
  horizonte: z.enum(["corto", "mediano", "largo"]),
  tema_asociado: z.string().nullable().optional(),
  fuente_tipo: z.enum(["reporte", "sitio_web", "interpretacion_ia"]),
  confianza: z.enum(["alto", "medio", "bajo"]),
});

export const BenchmarkIroResultSchema = z.object({
  iros: z.array(BenchmarkIroItemSchema).min(1).max(30),
});

export type BenchmarkIroItem = z.infer<typeof BenchmarkIroItemSchema>;

// ── Labels para UI ─────────────────────────────────────────────────────────────

export const TIPO_LABELS: Record<BenchmarkIroTipo, string> = {
  impacto_positivo: "Impacto positivo",
  impacto_negativo: "Impacto negativo",
  riesgo:           "Riesgo",
  oportunidad:      "Oportunidad",
};

export const TIPO_BADGE: Record<BenchmarkIroTipo, string> = {
  impacto_positivo: "bg-emerald-50 text-emerald-700 border-emerald-200",
  impacto_negativo: "bg-rose-50 text-rose-700 border-rose-200",
  riesgo:           "bg-amber-50 text-amber-700 border-amber-200",
  oportunidad:      "bg-blue-50 text-blue-700 border-blue-200",
};

export const CADENA_LABELS: Record<BenchmarkIroCadena, string> = {
  operacion:             "Operación",
  upstream:              "Upstream",
  downstream:            "Downstream",
  sociedad_comunidad:    "Sociedad / Comunidad",
  clientes_consumidores: "Clientes / Consumidores",
  medio_ambiente:        "Medio ambiente",
};

export const HORIZONTE_LABELS: Record<BenchmarkIroHorizonte, string> = {
  corto:   "Corto",
  mediano: "Mediano",
  largo:   "Largo",
};

export const FUENTE_LABELS: Record<BenchmarkIroFuente, string> = {
  reporte:          "Reporte",
  sitio_web:        "Sitio web",
  interpretacion_ia: "Interpretación IA",
};

export const FUENTE_BADGE: Record<BenchmarkIroFuente, string> = {
  reporte:           "bg-emerald-50 text-emerald-700 border-emerald-200",
  sitio_web:         "bg-blue-50 text-blue-700 border-blue-200",
  interpretacion_ia: "bg-slate-50 text-slate-600 border-slate-200",
};

export const CONFIANZA_LABELS: Record<BenchmarkIroConfianza, string> = {
  alto:  "Alto",
  medio: "Medio",
  bajo:  "Bajo",
};

export const CONFIANZA_BADGE: Record<BenchmarkIroConfianza, string> = {
  alto:  "bg-emerald-50 text-emerald-700 border-emerald-200",
  medio: "bg-amber-50 text-amber-700 border-amber-200",
  bajo:  "bg-rose-50 text-rose-700 border-rose-200",
};
