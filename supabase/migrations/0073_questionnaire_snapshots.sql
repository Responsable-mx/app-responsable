-- 0073: snapshots del cuestionario antes de operaciones destructivas (bulk AI fill, overwrite manual)
-- Permite restaurar 72h sin necesidad de undo per-campo.

create table if not exists public.questionnaire_snapshots (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  service_key text not null,
  -- payload = snapshot completo de responses (jsonb) capturado antes de la operación
  payload jsonb not null,
  -- trigger: identifica qué disparó el snapshot — usado para UI y métricas
  trigger text not null check (trigger in (
    'pre_bulk_ai_fill',
    'pre_per_step_ai_fill',
    'pre_manual_overwrite'
  )),
  -- scope = 'empty' | 'non_validated' | 'all' | 'step:<key>' (free-form para UI)
  scope text,
  created_by text references public.authorized_users(email) on delete set null,
  created_at timestamptz not null default now(),
  -- Auto-expira a 72h; un cron puede limpiar (no obligatorio para el piloto).
  expires_at timestamptz not null default (now() + interval '72 hours')
);

create index if not exists questionnaire_snapshots_client_id_idx
  on public.questionnaire_snapshots(client_id, created_at desc);

create index if not exists questionnaire_snapshots_expires_idx
  on public.questionnaire_snapshots(expires_at)
  where expires_at > now();

comment on table public.questionnaire_snapshots is
  'Snapshot del cuestionario antes de operaciones destructivas (bulk AI fill, sobrescritura manual). Restaurable 72h.';

comment on column public.questionnaire_snapshots.trigger is
  'Qué disparó el snapshot: pre_bulk_ai_fill | pre_per_step_ai_fill | pre_manual_overwrite';

comment on column public.questionnaire_snapshots.scope is
  'Alcance opcional: empty | non_validated | all | step:<key>. Free-form para UI.';

-- RLS — mismo patrón que client_documents (auth lee/escribe; sin DELETE público).
alter table public.questionnaire_snapshots enable row level security;

create policy questionnaire_snapshots_select on public.questionnaire_snapshots
  for select to authenticated using (true);

create policy questionnaire_snapshots_insert on public.questionnaire_snapshots
  for insert to authenticated with check (true);

-- Sin policy de UPDATE/DELETE → snapshots son inmutables para el usuario.
-- Cleanup post-72h vía service role/cron, no por la app.
