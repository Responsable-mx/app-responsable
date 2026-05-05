-- ─────────────────────────────────────────────────────────────
-- 0022 — Matriz de doble materialidad por cliente (Fase 3 MVP).
-- Una fila por tema material en la matriz X/Y (financiera × impacto).
-- 20 temas típicos por estudio, configurables por cliente.
-- Aditiva. RLS whitelist authorized_users.active.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.materiality_topics (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  service_key     text NOT NULL DEFAULT 'doble-materialidad',
  topic_key       text NOT NULL,                 -- slug estable, ej: 'emisiones-ghg'
  label           text NOT NULL,
  x_pos           numeric(5,2) NOT NULL DEFAULT 50.0,   -- 0-100 (materialidad financiera)
  y_pos           numeric(5,2) NOT NULL DEFAULT 50.0,   -- 0-100 (impacto, 0=arriba 100=abajo en CSS)
  color           text NOT NULL DEFAULT 'slate',         -- rose | amber | teal | slate
  size            text NOT NULL DEFAULT 'md',            -- sm | md | lg
  section_key     text,                                  -- referencia a questionnaire_templates section
  position_index  int NOT NULL DEFAULT 0,                -- orden de visualización
  notes           text,
  created_by      text,
  updated_by      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id, service_key, topic_key)
);

COMMENT ON TABLE public.materiality_topics IS
  'Temas de doble materialidad por cliente. x_pos=financiera, y_pos=impacto (invertido CSS). color=cuadrante (rose=doble, amber=impacto, teal=financiera, slate=seguimiento).';

CREATE INDEX IF NOT EXISTS idx_materiality_topics_client
  ON public.materiality_topics (client_id);
CREATE INDEX IF NOT EXISTS idx_materiality_topics_color
  ON public.materiality_topics (color);

ALTER TABLE public.materiality_topics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "materiality_topics_select_whitelist" ON public.materiality_topics;
CREATE POLICY "materiality_topics_select_whitelist"
  ON public.materiality_topics FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email())
      AND au.active = true
  ));

DROP POLICY IF EXISTS "materiality_topics_insert_whitelist" ON public.materiality_topics;
CREATE POLICY "materiality_topics_insert_whitelist"
  ON public.materiality_topics FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email())
      AND au.active = true
  ));

DROP POLICY IF EXISTS "materiality_topics_update_whitelist" ON public.materiality_topics;
CREATE POLICY "materiality_topics_update_whitelist"
  ON public.materiality_topics FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email())
      AND au.active = true
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email())
      AND au.active = true
  ));

DROP POLICY IF EXISTS "materiality_topics_delete_whitelist" ON public.materiality_topics;
CREATE POLICY "materiality_topics_delete_whitelist"
  ON public.materiality_topics FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email())
      AND au.active = true
  ));

DROP TRIGGER IF EXISTS trg_materiality_topics_updated_at ON public.materiality_topics;
CREATE TRIGGER trg_materiality_topics_updated_at
  BEFORE UPDATE ON public.materiality_topics
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
