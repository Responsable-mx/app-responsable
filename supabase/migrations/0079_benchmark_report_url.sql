-- ──────────────────────────────────────────────────────────────
-- Migración 0079 — sustainability_report_url en benchmark companies
--
-- IA propone competidores con URL del reporte oficial cuando lo encuentra
-- vía web_search. Backend auto-dispara persistCompetitorReport con esa URL.
--
-- Resultado: cuando consultor ejecuta "Proponer empresas con IA", al día
-- siguiente los chunks Voyage ya están embeddidos sin acción extra.
-- ──────────────────────────────────────────────────────────────

alter table public.dm_benchmark_companies
  add column if not exists sustainability_report_url text;

comment on column public.dm_benchmark_companies.sustainability_report_url is
  'Wave 7 C auto-ingest: URL del reporte de sustentabilidad oficial del competidor (PDF/HTML). Si presente al insert, auto-dispara persistCompetitorReport en background.';
