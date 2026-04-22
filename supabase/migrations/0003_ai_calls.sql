-- ─────────────────────────────────────────────────────────────
-- 0003 — Tabla ai_calls para observabilidad de costos IA.
-- Registra cada llamada a Claude: tokens, cache, latencia, errores.
-- Fija G1 y habilita G2 (métricas derivadas).
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_calls (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email              text NOT NULL,
  role                    text NOT NULL,               -- aurora|rebeca|elena|valeria
  client_id               uuid,                        -- null si chat general
  model                   text NOT NULL,
  input_tokens            integer,
  output_tokens           integer,
  cache_creation_tokens   integer,
  cache_read_tokens       integer,
  stop_reason             text,
  latency_ms              integer,
  error                   text,
  created_at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_calls IS
  'Log de llamadas a Claude API. Sirve para costo, debugging, métricas G2.';

CREATE INDEX IF NOT EXISTS idx_ai_calls_created_at ON public.ai_calls (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_calls_user ON public.ai_calls (user_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_calls_client ON public.ai_calls (client_id, created_at DESC);

ALTER TABLE public.ai_calls ENABLE ROW LEVEL SECURITY;
-- Solo service role. Sin políticas.

-- ── Vista métricas por rol/día (G2) ──────────────────────────
CREATE OR REPLACE VIEW public.ai_calls_daily_by_role AS
SELECT
  date_trunc('day', created_at) AS day,
  role,
  count(*)                               AS calls,
  sum(input_tokens)                      AS total_input_tokens,
  sum(output_tokens)                     AS total_output_tokens,
  sum(cache_read_tokens)                 AS total_cache_hits,
  sum(coalesce(cache_creation_tokens,0)) AS total_cache_writes,
  round(avg(latency_ms))                 AS avg_latency_ms,
  sum(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END) AS errors
FROM public.ai_calls
GROUP BY 1, 2
ORDER BY 1 DESC, 2;

CREATE OR REPLACE VIEW public.ai_calls_daily_by_client AS
SELECT
  date_trunc('day', created_at) AS day,
  client_id,
  count(*) AS calls,
  sum(input_tokens + output_tokens) AS total_tokens,
  round(avg(latency_ms)) AS avg_latency_ms
FROM public.ai_calls
WHERE client_id IS NOT NULL
GROUP BY 1, 2
ORDER BY 1 DESC, 3 DESC;
