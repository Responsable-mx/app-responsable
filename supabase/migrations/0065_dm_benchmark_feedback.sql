-- Sprint DM-4 — Feedback loop enriquecido en benchmark
-- A: rejection_reason cuando consultor descarta empresa
-- B: reports_publicly para señalar si la empresa tiene reporte ESG verificado

alter table public.dm_benchmark_companies
  add column if not exists rejection_reason text
    check (rejection_reason in (
      'sector_diferente',
      'tamano_incomparable',
      'sin_reporte',
      'ya_es_cliente',
      'otro'
    )),
  add column if not exists reports_publicly boolean;

comment on column public.dm_benchmark_companies.rejection_reason
  is 'Motivo por el que el consultor descartó esta empresa al regenerar la lista';
comment on column public.dm_benchmark_companies.reports_publicly
  is 'true = empresa tiene reporte ESG público verificado (GRI/CSRD/TCFD/SASB)';
