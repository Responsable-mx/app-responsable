-- Etapa "Referentes de Sostenibilidad" en DM-IA
-- Almacena frameworks validados + tabla de temas raw + temas agrupados por cliente.

CREATE TABLE public.dm_referentes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,

  -- Step 1: frameworks propuestos por IA + validados por consultor
  proposed_frameworks jsonb NOT NULL DEFAULT '[]',
  enabled_frameworks  jsonb NOT NULL DEFAULT '[]',
  frameworks_status   text NOT NULL DEFAULT 'idle'
    CHECK (frameworks_status IN ('idle','generating','done','failed')),

  -- Step 2+3: tabla de temas (raw + agrupados) — generada vía Batch API
  coverage_score  numeric(3,1),
  coverage_note   text,
  topics_raw      jsonb NOT NULL DEFAULT '[]',
  topics_grouped  jsonb NOT NULL DEFAULT '[]',
  topics_status   text NOT NULL DEFAULT 'idle'
    CHECK (topics_status IN ('idle','generating','done','failed')),
  topics_batch_id text,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE(client_id)
);

CREATE INDEX ON public.dm_referentes(client_id);

ALTER TABLE public.dm_referentes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read dm_referentes"  ON public.dm_referentes FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write dm_referentes" ON public.dm_referentes FOR ALL    TO authenticated USING (true);
