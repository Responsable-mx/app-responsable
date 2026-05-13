-- Sprint DM-IROs-Benchmark: IROs identificados por empresa del benchmark
-- Una tabla de tracking de batches + tabla de IROs (una fila por IRO por empresa).
-- cadena tiene 6 valores (vs 3 en client_iro_inventory) para cubrir todos los
-- eslabones de la cadena de valor + sociedad + clientes + medio ambiente.

-- ── dm_benchmark_iro_batches: tracking de jobs Batch API por empresa ──────────
CREATE TABLE public.dm_benchmark_iro_batches (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  benchmark_company_id  uuid NOT NULL REFERENCES public.dm_benchmark_companies(id) ON DELETE CASCADE,
  batch_id              text,                          -- Anthropic Batch ID
  status                text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','done','failed')),
  error_msg             text,
  created_by            text NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (benchmark_company_id)                        -- 1 batch activo por empresa
);
CREATE INDEX ON public.dm_benchmark_iro_batches(client_id);
ALTER TABLE public.dm_benchmark_iro_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read bm_iro_batches"  ON public.dm_benchmark_iro_batches FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write bm_iro_batches" ON public.dm_benchmark_iro_batches FOR ALL    TO authenticated USING (true);

-- ── dm_benchmark_company_iros: inventario de IROs por empresa benchmark ───────
CREATE TABLE public.dm_benchmark_company_iros (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  benchmark_company_id  uuid NOT NULL REFERENCES public.dm_benchmark_companies(id) ON DELETE CASCADE,
  n_iro                 smallint NOT NULL,              -- número secuencial (1-N) dentro de la empresa
  descripcion           text NOT NULL,                  -- causa → consecuencia (formulación técnica)
  tipo                  text NOT NULL
                        CHECK (tipo IN ('impacto_positivo','impacto_negativo','riesgo','oportunidad')),
  cadena                text NOT NULL
                        CHECK (cadena IN (
                          'operacion',
                          'upstream',
                          'downstream',
                          'sociedad_comunidad',
                          'clientes_consumidores',
                          'medio_ambiente'
                        )),
  horizonte             text NOT NULL
                        CHECK (horizonte IN ('corto','mediano','largo')),
  tema_asociado         text,                           -- tema material o estratégico de la empresa
  fuente_tipo           text NOT NULL DEFAULT 'interpretacion_ia'
                        CHECK (fuente_tipo IN ('reporte','sitio_web','interpretacion_ia')),
  confianza             text NOT NULL DEFAULT 'medio'
                        CHECK (confianza IN ('alto','medio','bajo')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.dm_benchmark_company_iros(client_id);
CREATE INDEX ON public.dm_benchmark_company_iros(benchmark_company_id);
ALTER TABLE public.dm_benchmark_company_iros ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read bm_iros"  ON public.dm_benchmark_company_iros FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write bm_iros" ON public.dm_benchmark_company_iros FOR ALL    TO authenticated USING (true);
