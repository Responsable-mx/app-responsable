-- 0064: horizontes temporales configurables por cliente para el estudio DM

alter table public.clients
  add column if not exists dm_horizons jsonb;

comment on column public.clients.dm_horizons is
  'Horizontes temporales acordados con el cliente para el estudio de Doble Materialidad.
   Estructura: {"corto_year": 2027, "mediano_year": 2030, "largo_year": 2040}
   Null = usar valores por defecto (2027 / 2030 / 2040).';
