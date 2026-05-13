-- Cache DB-backed para extract-profile (D-147)
-- Reemplaza Map<> in-memory que se reinicia en cada deploy / instancia serverless.
-- Clave: hash SHA-256 de la URL normalizada. TTL: 30 min (controlado por la app).
-- Acceso solo via service_role (createAdminClient). Sin acceso authenticated.

CREATE TABLE IF NOT EXISTS profile_url_cache (
  url_hash   TEXT        PRIMARY KEY,
  result     JSONB       NOT NULL,
  cached_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_profile_url_cache_expires
  ON profile_url_cache (expires_at);

ALTER TABLE profile_url_cache ENABLE ROW LEVEL SECURITY;
-- Sin políticas = solo service_role puede leer/escribir (correcto: acceso solo desde servidor)
