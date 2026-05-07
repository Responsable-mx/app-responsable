import { z } from "zod";

export const DOCUMENT_KIND_SCHEMA = z.enum([
  "general",
  "sustainability_report",
  "financial_report",
]);

export type DocumentKind = z.infer<typeof DOCUMENT_KIND_SCHEMA>;

export const KIND_LABEL: Record<DocumentKind, string> = {
  general: "General",
  sustainability_report: "Informe sust.",
  financial_report: "Informe fin.",
};
