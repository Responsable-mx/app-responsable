export type DocMeta = {
  id: string;
  client_id: string;
  uploaded_by: string | null;
  kind: "general" | "sustainability_report" | "financial_report" | "dm_report" | "proposal";
  file_name: string;
  file_type: "pdf" | "docx" | "pptx" | "xlsx" | "txt" | "md";
  mime_type: string;
  size_bytes: number;
  source_url: string | null;
  parse_status: "pending" | "ok" | "failed";
  parse_error: string | null;
  has_content: boolean;
  service_ids: string[];
  content_hash: string | null;
  created_at: string;
  updated_at: string;
};

export type ServiceOption = { id: string; label: string };
