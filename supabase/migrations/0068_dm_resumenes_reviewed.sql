alter table public.dm_resumenes
  add column if not exists reviewed_at timestamptz;
