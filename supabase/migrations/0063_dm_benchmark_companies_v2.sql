-- 0063: dm_benchmark_companies — website + justification + validated tracking

-- 1. Nuevas columnas
alter table public.dm_benchmark_companies
  add column if not exists website       text,
  add column if not exists justification text;

comment on column public.dm_benchmark_companies.website is
  'URL del sitio web corporativo propuesto por la IA (nullable si no disponible).';
comment on column public.dm_benchmark_companies.justification is
  'Justificación de la IA para incluir esta empresa en el benchmark.';

-- 2. validated ahora puede actualizarse por el consultor al ejecutar comparación.
--    La columna ya existe — solo aseguramos el índice para queries de feedback.
create index if not exists dm_benchmark_companies_validated_idx
  on public.dm_benchmark_companies(client_id, validated, proposed_by);
