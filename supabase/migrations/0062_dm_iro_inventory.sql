-- Sprint DM-2: IRO Inventory per cliente + NIS/IBSO assessment
-- Tres tablas nuevas, aditivas, sin tocar schema existente.

-- ── dm_iro_batches: tracking de jobs Batch API para generación de IROs ───────
CREATE TABLE public.dm_iro_batches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  batch_id    text,                            -- Anthropic Batch ID
  status      text NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','done','failed')),
  error_msg   text,
  created_by  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.dm_iro_batches(client_id);
ALTER TABLE public.dm_iro_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read dm_iro_batches"  ON public.dm_iro_batches FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write dm_iro_batches" ON public.dm_iro_batches FOR ALL    TO authenticated USING (true);

-- ── client_iro_inventory: inventario de IROs per cliente ────────────────────
CREATE TABLE public.client_iro_inventory (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  n_iro            smallint NOT NULL,           -- número secuencial (1-N)
  tema_esg         text NOT NULL,               -- categoría temática
  descripcion      text NOT NULL,               -- causa → efecto concreto
  tipo             text NOT NULL
                   CHECK (tipo IN ('impacto_positivo','impacto_negativo','riesgo','oportunidad')),
  estado           text NOT NULL DEFAULT 'potencial'
                   CHECK (estado IN ('actual','potencial','emergente','en_observacion')),
  cadena           text NOT NULL
                   CHECK (cadena IN ('upstream','ops_propia','downstream')),
  horizonte        text NOT NULL
                   CHECK (horizonte IN ('corto','mediano','largo')),
  evidencia        text,                        -- fuente de identificación
  confianza        text NOT NULL DEFAULT 'medio'
                   CHECK (confianza IN ('alto','medio','bajo')),
  score_impacto    smallint CHECK (score_impacto BETWEEN 1 AND 3),
  score_financiero smallint CHECK (score_financiero BETWEEN 1 AND 3),
  incluido         boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.client_iro_inventory(client_id);
ALTER TABLE public.client_iro_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read iro_inv"  ON public.client_iro_inventory FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write iro_inv" ON public.client_iro_inventory FOR ALL    TO authenticated USING (true);

-- ── client_nis_assessment: mapa de brechas NIS/IBSO por cliente ─────────────
CREATE TABLE public.client_nis_assessment (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  ibso_key     text NOT NULL,
  ibso_label   text NOT NULL,
  categoria    text NOT NULL
               CHECK (categoria IN ('ambiental','social','gobernanza')),
  estado       text NOT NULL DEFAULT 'no_identificado'
               CHECK (estado IN ('no_identificado','parcial','disponible')),
  calidad_dato text NOT NULL DEFAULT 'baja'
               CHECK (calidad_dato IN ('baja','media','alta')),
  accion       text,
  sort_order   smallint NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id, ibso_key)
);
CREATE INDEX ON public.client_nis_assessment(client_id);
ALTER TABLE public.client_nis_assessment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read nis"  ON public.client_nis_assessment FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write nis" ON public.client_nis_assessment FOR ALL    TO authenticated USING (true);
