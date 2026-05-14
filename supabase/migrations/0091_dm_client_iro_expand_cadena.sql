-- Etapa 6: ampliar cadena en client_iro_inventory para aceptar los 6 valores del benchmark
-- Mantiene ops_propia por compatibilidad con IROs ya generados por IA (3-valor legacy)
-- Agrega: operacion, sociedad_comunidad, clientes_consumidores, medio_ambiente
-- Agrega columna fuente para distinguir origen del IRO

ALTER TABLE public.client_iro_inventory
  DROP CONSTRAINT IF EXISTS client_iro_inventory_cadena_check;

ALTER TABLE public.client_iro_inventory
  ADD CONSTRAINT client_iro_inventory_cadena_check
  CHECK (cadena IN (
    'upstream',
    'ops_propia',
    'operacion',
    'downstream',
    'sociedad_comunidad',
    'clientes_consumidores',
    'medio_ambiente'
  ));

ALTER TABLE public.client_iro_inventory
  ADD COLUMN IF NOT EXISTS fuente text NOT NULL DEFAULT 'ia_generado'
  CHECK (fuente IN ('ia_generado', 'adaptado_benchmark', 'manual'));
