-- Sprint DM-IA: tablas para benchmark y resultados de Doble Materialidad IA

-- 1) Añadir dm_report al kind check de client_documents
alter table public.client_documents
  drop constraint if exists client_documents_kind_check;
alter table public.client_documents
  add constraint client_documents_kind_check
  check (kind in ('general', 'sustainability_report', 'financial_report', 'dm_report'));

-- 2) Empresas propuestas/validadas para benchmark DM
create table if not exists public.dm_benchmark_companies (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  name        text not null,
  country     text,
  sector      text,
  -- tipo de relación con el cliente
  relation    text not null check (relation in (
    'competitor_nacional',
    'competitor_internacional',
    'sector',
    'cadena_valor'
  )),
  proposed_by text not null default 'ia' check (proposed_by in ('ia', 'consultor')),
  validated   boolean not null default false,
  created_by  text references public.authorized_users(email) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists dm_benchmark_companies_client_idx
  on public.dm_benchmark_companies(client_id);

comment on table public.dm_benchmark_companies is
  'Empresas propuestas por IA o consultor para benchmark de Doble Materialidad. validated=true = aprobada por consultor para ejecutar comparación.';

-- 3) Resultados de comparación benchmark (JSONB para campos flexibles sin migración)
create table if not exists public.dm_benchmark_results (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid not null references public.clients(id) on delete cascade,
  companies_snapshot jsonb not null default '[]',
  fields_snapshot    jsonb not null default '[]',
  -- { field_key: { "Empresa A": "valor/score", "Cliente": "valor/score" } }
  comparison         jsonb not null default '{}',
  narrative          text,
  status             text not null default 'pending'
    check (status in ('pending', 'done', 'failed')),
  error_message      text,
  created_by         text references public.authorized_users(email) on delete set null,
  created_at         timestamptz not null default now()
);

create index if not exists dm_benchmark_results_client_idx
  on public.dm_benchmark_results(client_id, created_at desc);

comment on table public.dm_benchmark_results is
  'Resultados de comparación benchmark de Doble Materialidad. JSONB para campos flexibles — sin migración al cambiar benchmark fields.';

-- 4) RLS — mismo patrón que clients (todos los autenticados leen/escriben)
alter table public.dm_benchmark_companies enable row level security;
alter table public.dm_benchmark_results   enable row level security;

create policy "auth select dm_benchmark_companies"
  on public.dm_benchmark_companies for select to authenticated using (true);
create policy "auth insert dm_benchmark_companies"
  on public.dm_benchmark_companies for insert to authenticated with check (true);
create policy "auth update dm_benchmark_companies"
  on public.dm_benchmark_companies for update to authenticated using (true) with check (true);
create policy "auth delete dm_benchmark_companies"
  on public.dm_benchmark_companies for delete to authenticated using (true);

create policy "auth select dm_benchmark_results"
  on public.dm_benchmark_results for select to authenticated using (true);
create policy "auth insert dm_benchmark_results"
  on public.dm_benchmark_results for insert to authenticated with check (true);
create policy "auth update dm_benchmark_results"
  on public.dm_benchmark_results for update to authenticated using (true) with check (true);
