-- ──────────────────────────────────────────────────────────────
-- Migración 0080 — Auto-update config (Wave 7+)
--
-- Centralizar qué recursos se auto-refrescan + frecuencia.
-- Admin edita desde /configuracion/auto-update.
-- Cron orchestrator único itera config diariamente y dispara los que tocan.
--
-- Cada recurso: enabled (bool) + frequency_days (int) + last_run_at (timestamptz)
-- Cron evalúa: si enabled AND (last_run_at IS NULL OR last_run_at < now() - freq_days)
-- → dispara handler correspondiente.
-- ──────────────────────────────────────────────────────────────

create table if not exists public.auto_update_config (
  resource_key      text primary key,
  label             text not null,
  description       text,
  enabled           boolean not null default false,
  frequency_days    integer not null default 30 check (frequency_days >= 1 and frequency_days <= 365),
  last_run_at       timestamptz,
  last_status       text check (last_status is null or last_status in ('ok', 'partial', 'failed')),
  last_error        text,
  last_run_summary  jsonb,
  updated_by        text,
  updated_at        timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

alter table public.auto_update_config enable row level security;

-- SELECT: admin activo
create policy auto_update_config_select_admin on public.auto_update_config
  for select to authenticated
  using (
    exists (
      select 1 from authorized_users au
      where au.email = (select auth.jwt() ->> 'email')
        and au.role = 'admin'
        and au.active = true
    )
  );

-- UPDATE: admin activo
create policy auto_update_config_update_admin on public.auto_update_config
  for update to authenticated
  using (
    exists (
      select 1 from authorized_users au
      where au.email = (select auth.jwt() ->> 'email')
        and au.role = 'admin'
        and au.active = true
    )
  )
  with check (
    exists (
      select 1 from authorized_users au
      where au.email = (select auth.jwt() ->> 'email')
        and au.role = 'admin'
        and au.active = true
    )
  );

-- INSERT/DELETE bloqueado para todos los roles vía RLS (solo service_role en seed).

-- Seed inicial: 5 recursos comunes con defaults sensatos
insert into public.auto_update_config (resource_key, label, description, enabled, frequency_days)
values
  (
    'competitor_reports',
    'Reportes de competidores',
    'Refresca reportes de competidores embeddidos. Re-descarga y re-embeddea reportes con más de N días desde su última ingestión.',
    false,
    90
  ),
  (
    'client_documents',
    'Documentos del cliente',
    'Re-procesa documentos del cliente sin cambios (re-parse + re-chunk). Útil si el parser mejoró. NO re-descarga: solo re-procesa el contenido ya guardado.',
    false,
    180
  ),
  (
    'dm_benchmark_refresh',
    'Benchmarks con datos antiguos',
    'Marca benchmarks con resultados >N días como "obsoletos" para que el consultor sepa re-ejecutar. NO regenera automáticamente.',
    false,
    180
  ),
  (
    'embeddings_recompute',
    'Recalcular embeddings',
    'Re-embeddea chunks con embeddings antiguos (modelo Voyage actualizado o detección de calidad baja). NO crea chunks nuevos.',
    false,
    365
  ),
  (
    'client_profile_extract',
    'Perfil del cliente (web)',
    'Re-ejecuta extract-profile desde URL del sitio del cliente. Útil si el sitio cambió (nuevo CEO, productos, países).',
    false,
    180
  )
on conflict (resource_key) do nothing;

comment on table public.auto_update_config is
  'Wave 7+: configuración por recurso de qué auto-refrescar y cada cuántos días. Cron orchestrator diario evalúa y ejecuta.';
