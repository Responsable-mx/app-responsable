-- Etapa "Benchmark de empresas" en DM-IA
-- Almacena empresas propuestas por IA agrupadas por criterio + selección del consultor.

CREATE TABLE public.dm_benchmark_empresas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,

  -- Empresas propuestas por IA (array de objetos por criterio)
  proposed_companies jsonb NOT NULL DEFAULT '[]',
  -- IDs de las empresas validadas por el consultor
  enabled_companies  jsonb NOT NULL DEFAULT '[]',
  -- Criterios que la IA identificó como no aplicables al cliente
  omitted_criteria   jsonb NOT NULL DEFAULT '[]',

  generation_status  text NOT NULL DEFAULT 'idle'
    CHECK (generation_status IN ('idle','generating','done','failed')),

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE(client_id)
);

CREATE INDEX ON public.dm_benchmark_empresas(client_id);

ALTER TABLE public.dm_benchmark_empresas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read dm_benchmark_empresas"  ON public.dm_benchmark_empresas FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write dm_benchmark_empresas" ON public.dm_benchmark_empresas FOR ALL    TO authenticated USING (true);
