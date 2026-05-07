-- Migración 0050: tabla rate_limit_hits
-- Rate limiting genérico para endpoints no-IA (GET /api/clients, etc.)
-- Separado de ai_calls para no mezclar métricas de uso IA con control de tráfico.
--
-- Patrón: insert-on-request + count en ventana.
-- Limpieza automática: filas > 24h eliminadas por cron (o manualmente).
-- RLS: solo service_role puede leer/escribir (via admin client).

CREATE TABLE IF NOT EXISTS rate_limit_hits (
  id          BIGSERIAL PRIMARY KEY,
  key         TEXT        NOT NULL,          -- formato: "METHOD:/ruta:email"
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice compuesto para lookup rápido por key en ventana temporal
CREATE INDEX IF NOT EXISTS idx_rate_limit_hits_key_ts
  ON rate_limit_hits(key, created_at DESC);

-- RLS: tabla solo accesible via service_role (admin client)
ALTER TABLE rate_limit_hits ENABLE ROW LEVEL SECURITY;

-- Sin políticas públicas — todo acceso vía createAdminClient()
-- (service_role bypassa RLS automáticamente)

-- Función de limpieza: eliminar filas > 1 hora (llamada por cron o manualmente)
CREATE OR REPLACE FUNCTION cleanup_rate_limit_hits()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  DELETE FROM rate_limit_hits WHERE created_at < now() - INTERVAL '1 hour';
$$;

COMMENT ON TABLE rate_limit_hits IS
  'Rate limiting genérico para endpoints HTTP. Limpieza via cleanup_rate_limit_hits().';
