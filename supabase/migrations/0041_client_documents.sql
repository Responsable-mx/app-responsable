-- Sprint B1: documentos por cliente con extracción a Markdown
-- Tabla client_documents + columna financial_report_url + bucket Storage privado

-- 1) Columna financial_report_url en clients (sustainability_report_url ya existe en 0012)
alter table public.clients
  add column if not exists financial_report_url text;

comment on column public.clients.financial_report_url is
  'URL pública del último informe financiero/anual del cliente. La IA puede investigar y poblar este campo.';

-- 2) Tabla client_documents
create table if not exists public.client_documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  uploaded_by text references public.authorized_users(email) on delete set null,
  -- 'general' = subido manual; 'sustainability_report' / 'financial_report' = informes clave detectados/descargados por IA
  kind text not null default 'general' check (kind in ('general', 'sustainability_report', 'financial_report')),
  file_name text not null,
  file_type text not null check (file_type in ('pdf', 'docx', 'pptx', 'xlsx', 'txt', 'md')),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 26214400), -- max 25MB
  storage_path text not null unique, -- path en bucket client-documents
  markdown_content text, -- nullable hasta que el parser termine
  source_url text, -- si vino de web research IA
  parse_status text not null default 'pending' check (parse_status in ('pending', 'ok', 'failed')),
  parse_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_documents_client_id_idx on public.client_documents(client_id);
create index if not exists client_documents_kind_idx on public.client_documents(client_id, kind);
create index if not exists client_documents_created_at_idx on public.client_documents(created_at desc);

comment on table public.client_documents is
  'Documentos por cliente convertidos a Markdown como contexto persistente para IA (cuestionario doc-fill, ai-fill, chat).';

-- 3) RLS — mismo patrón que clients (todos los autenticados leen/escriben)
alter table public.client_documents enable row level security;

create policy client_documents_select on public.client_documents
  for select to authenticated using (true);

create policy client_documents_insert on public.client_documents
  for insert to authenticated with check (true);

create policy client_documents_update on public.client_documents
  for update to authenticated using (true) with check (true);

-- DELETE solo via service role (mismo patrón de chat_sessions hard-delete)
-- Sin policy de DELETE para authenticated → solo service role puede borrar.

-- 4) Trigger updated_at
create or replace function public.client_documents_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger client_documents_updated_at
  before update on public.client_documents
  for each row execute function public.client_documents_set_updated_at();

-- 5) Bucket de Storage privado
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'client-documents',
  'client-documents',
  false,
  26214400, -- 25MB
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.ms-powerpoint',
    'application/vnd.ms-excel',
    'text/plain',
    'text/markdown'
  ]
)
on conflict (id) do nothing;

-- 6) RLS Storage — solo service role puede leer/escribir el bucket privado
-- Las APIs Next.js usan createAdminClient (service role) → bypassa RLS y maneja autorización en código.
-- Nada de policies para authenticated en storage.objects para este bucket.
