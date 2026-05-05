-- Migración 0028: tabla de sesiones de chat persistentes.
--
-- Antes: cada vez que el consultor cierra Chat IA, la conversación se pierde.
-- Cero historial. Forzaba a copiar manualmente texto importante.
--
-- Después: cada conversación se guarda con role + cliente + messages + título
-- inferido. UI muestra sidebar de hilos retomable.

create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  client_id uuid null references public.clients(id) on delete set null,
  role text not null check (role in ('aurora', 'rebeca', 'elena', 'valeria')),
  title text not null,
  -- messages: array de { role: "user"|"assistant", content: string, ts?: number, roleId?: string }
  messages jsonb not null default '[]'::jsonb,
  message_count int not null default 0,
  archived_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index para listar sesiones del usuario por recencia (sidebar).
create index if not exists chat_sessions_user_recent_idx
  on public.chat_sessions (user_email, archived_at, updated_at desc);

-- Index para filtrar por cliente (Chat tab dentro del cliente).
create index if not exists chat_sessions_client_idx
  on public.chat_sessions (client_id, updated_at desc) where archived_at is null;

-- Trigger updated_at via función reusable. No DROPS — usar OR REPLACE.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Crear trigger solo si no existe (sin DROP destructivo).
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'chat_sessions_touch'
      and tgrelid = 'public.chat_sessions'::regclass
  ) then
    create trigger chat_sessions_touch
      before update on public.chat_sessions
      for each row execute function public.touch_updated_at();
  end if;
end $$;

-- RLS: cada usuario ve solo sus sesiones. Admins ven todo via service role.
alter table public.chat_sessions enable row level security;

-- Crear policies sin DROP previo. Si ya existen, do-block las salta.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'chat_sessions'
      and policyname = 'chat_sessions_owner_select'
  ) then
    create policy chat_sessions_owner_select on public.chat_sessions
      for select using (user_email = auth.jwt() ->> 'email');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'chat_sessions'
      and policyname = 'chat_sessions_owner_insert'
  ) then
    create policy chat_sessions_owner_insert on public.chat_sessions
      for insert with check (user_email = auth.jwt() ->> 'email');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'chat_sessions'
      and policyname = 'chat_sessions_owner_update'
  ) then
    create policy chat_sessions_owner_update on public.chat_sessions
      for update using (user_email = auth.jwt() ->> 'email');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'chat_sessions'
      and policyname = 'chat_sessions_owner_delete'
  ) then
    create policy chat_sessions_owner_delete on public.chat_sessions
      for delete using (user_email = auth.jwt() ->> 'email');
  end if;
end $$;

comment on table public.chat_sessions is
  'Sesiones de chat IA persistentes. Una fila por conversación, messages como JSONB. Usuario ve sus propias vía RLS.';
