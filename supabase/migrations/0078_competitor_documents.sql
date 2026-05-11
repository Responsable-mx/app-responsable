-- ──────────────────────────────────────────────────────────────
-- Migración 0078 — Reportes de competidores embeddidos (Wave 7 C)
--
-- Persistir reports de empresas competidoras (benchmark) como
-- client_documents kind='competitor_report' linked via benchmark_company_id.
--
-- Beneficio:
-- - Reusar pipeline existente: parse → chunks → embedding (cron embed-chunks)
-- - Reutilizar embeddings entre benchmarks distintos del mismo competidor
-- - Búsqueda semántica por dimensión ESRS → -85% input tokens en compare
--
-- Reglas:
-- - benchmark_company_id NULLABLE → docs normales del cliente no lo usan
-- - kind='competitor_report' DEBE tener benchmark_company_id NOT NULL
-- - Cron embed-chunks no requiere cambios — procesa todos los kinds igual
-- - UI cliente filtra kind != 'competitor_report' (no contaminar lista)
-- ──────────────────────────────────────────────────────────────

-- 1. Ampliar CHECK kind para incluir competitor_report
alter table public.client_documents
  drop constraint if exists client_documents_kind_check;

alter table public.client_documents
  add constraint client_documents_kind_check
  check (kind in (
    'general',
    'sustainability_report',
    'financial_report',
    'dm_report',
    'proposal',
    'competitor_report'
  ));

-- 2. Agregar FK opcional a dm_benchmark_companies
alter table public.client_documents
  add column if not exists benchmark_company_id uuid
  references public.dm_benchmark_companies(id) on delete cascade;

-- 3. CHECK: competitor_report requiere benchmark_company_id
alter table public.client_documents
  drop constraint if exists client_documents_competitor_fk_check;

alter table public.client_documents
  add constraint client_documents_competitor_fk_check
  check (
    (kind = 'competitor_report' and benchmark_company_id is not null) or
    (kind != 'competitor_report' and benchmark_company_id is null)
  );

-- 4. Índice para lookup competitor → docs
create index if not exists idx_client_documents_competitor
  on public.client_documents (benchmark_company_id)
  where benchmark_company_id is not null;

-- 5. Asegurar que document_chunks hereda client_id correctamente del padre
-- (ya en place por migración 0076, sin cambios necesarios).

comment on column public.client_documents.benchmark_company_id is
  'Wave 7 C: si kind=competitor_report, ID de la empresa competidora en dm_benchmark_companies. Permite reusar reportes entre benchmarks del mismo competidor.';
