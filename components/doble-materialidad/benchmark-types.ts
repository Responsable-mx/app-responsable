import type { CompanyRelation } from "@/lib/dm/fields";

export type RejectionReason =
  | "sector_diferente"
  | "tamano_incomparable"
  | "sin_reporte"
  | "ya_es_cliente"
  | "otro";

export type BenchmarkCompany = {
  id: string;
  client_id: string;
  name: string;
  country: string | null;
  sector: string | null;
  website: string | null;
  sustainability_report_url?: string | null;
  /** Wave 7 C: si tiene chunks embeddidos persistidos para reuso en benchmarks */
  has_embedded_report?: boolean;
  justification: string | null;
  relation: CompanyRelation;
  proposed_by: "ia" | "consultor";
  validated: boolean;
  rejection_reason: RejectionReason | null;
  reports_publicly: boolean | null;
  created_at: string;
};

export type BenchmarkResult = {
  id: string;
  companies_snapshot: Array<{ name: string; relation: string }>;
  fields_snapshot: Array<{ key: string; label: string }>;
  comparison: Record<string, Record<string, string>>;
  narrative: string;
  status: "pending" | "done" | "failed";
  created_at: string;
};

export type BenchmarkData = {
  companies: BenchmarkCompany[];
  latest_result: BenchmarkResult | null;
};
