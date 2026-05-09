-- Validación con el cliente: registro de la junta de presentación,
-- decisiones por IRO y acuerdos antes de emitir el reporte final.

create table public.dm_validaciones (
  id           uuid default gen_random_uuid() primary key,
  client_id    uuid references public.clients(id) on delete cascade not null unique,
  fecha_junta  date,
  modalidad    text default 'presencial' check (modalidad in ('presencial', 'virtual')),
  -- [{nombre: string, cargo: string}]
  asistentes   jsonb default '[]'::jsonb not null,
  -- {[iro_id: string]: {decision: 'aceptar'|'ajustar'|'excluir'|null, notas?: string}}
  iro_decisions jsonb default '{}'::jsonb not null,
  notas        text,
  created_by   text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create index on public.dm_validaciones(client_id);

alter table public.dm_validaciones enable row level security;

create policy "consultor_access" on public.dm_validaciones
  for all using (true) with check (true);
