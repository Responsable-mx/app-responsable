-- Detección de duplicados de documentos por hash MD5 del contenido binario.
-- Aditiva e idempotente. Hash se computa server-side al ingest (POST /documents
-- y POST /ingest-report). Permite warn al usuario cuando un upload tiene mismo
-- hash que un doc existente del mismo cliente — evita inflar contexto IA con
-- duplicados (costo + ruido en respuestas).

-- 1. Columna nullable (backfill futuro opcional, no bloquea ingest existentes)
ALTER TABLE client_documents
  ADD COLUMN IF NOT EXISTS content_hash text;

-- 2. Índice compuesto (client_id, content_hash) — query típica:
--    "¿este cliente ya tiene un doc con este hash?". client_id primero porque
--    es el filtro selectivo (RLS + scope natural).
CREATE INDEX IF NOT EXISTS client_documents_client_hash_idx
  ON client_documents (client_id, content_hash)
  WHERE content_hash IS NOT NULL;

-- 3. Comment para audit/onboarding
COMMENT ON COLUMN client_documents.content_hash IS
  'MD5 hex del buffer original. Detección de duplicados por cliente. NULL en docs pre-migración.';
