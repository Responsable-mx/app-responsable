create table public.dm_resumenes (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references public.clients(id) on delete cascade not null,
  content text,
  status text default 'idle' check (status in ('idle','pending','done','failed')),
  error_msg text,
  created_by text,
  created_at timestamptz default now()
);
create index on public.dm_resumenes(client_id, created_at desc);
alter table public.dm_resumenes enable row level security;
create policy "consultor_access" on public.dm_resumenes
  for all using (true) with check (true);
