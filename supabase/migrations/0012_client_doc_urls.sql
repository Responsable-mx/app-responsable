-- ─────────────────────────────────────────────────────────────
-- 0012 — URLs de documentos de sostenibilidad clave del cliente.
-- Aditiva. Los URLs son opcionales y aplican solo si el booleano
-- correspondiente es true.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS sustainability_strategy_url text,
  ADD COLUMN IF NOT EXISTS sustainability_report_url   text,
  ADD COLUMN IF NOT EXISTS double_materiality_url      text;

COMMENT ON COLUMN public.clients.sustainability_strategy_url IS
  'URL pública del documento de estrategia de sostenibilidad (PDF, página web, Drive, etc.).';
COMMENT ON COLUMN public.clients.sustainability_report_url IS
  'URL del último reporte de sostenibilidad publicado.';
COMMENT ON COLUMN public.clients.double_materiality_url IS
  'URL del estudio de doble materialidad.';
