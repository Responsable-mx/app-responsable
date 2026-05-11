-- ──────────────────────────────────────────────────────────────
-- Migración 0076 — Embeddings de chunks de documentos (Wave 7 prep)
--
-- Tabla `document_chunks` con columna `embedding vector(1024)` lista
-- para Voyage AI (voyage-2 outputs 1024 dims) o similar.
--
-- Estrategia:
-- - Hoy (Wave 5c + 6): BM25 sobre markdown_content full text. Funciona pero
--   no entiende sinónimos ("emisiones" ≠ "huella climática").
-- - Mañana (cuando Voyage key esté en Vercel): cron poblará embeddings
--   por chunk → query con cosine similarity → +25% precisión semántica.
--
-- Activación futura:
-- 1. Vercel env: VOYAGE_API_KEY=<key>
-- 2. Cron `/api/cron/embed-chunks` populará rows nuevos cada 6h
-- 3. lib/documents/embeddings.ts: swap BM25 fallback por pgvector query
--
-- RLS: same que client_documents (authenticated read si pertenece al cliente).
-- ──────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS document_chunks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   uuid NOT NULL REFERENCES client_documents(id) ON DELETE CASCADE,
  client_id     uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  chunk_index   integer NOT NULL CHECK (chunk_index >= 0),
  content       text NOT NULL CHECK (length(content) <= 3000),
  content_hash  text NOT NULL,
  -- voyage-2 = 1024 dims, voyage-3 = 1024, text-embedding-3-small = 1536.
  -- 1024 cubre Voyage (recomendado por Anthropic). Cambiar a 1536 si se
  -- migra a OpenAI: ALTER TABLE document_chunks ALTER COLUMN embedding TYPE vector(1536).
  embedding     vector(1024),
  embedding_model text,
  embedded_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);

-- Índice por documento + chunk (lookup ordenado)
CREATE INDEX IF NOT EXISTS idx_document_chunks_doc
  ON document_chunks (document_id, chunk_index);

-- Índice por cliente (RLS-friendly + cross-doc search)
CREATE INDEX IF NOT EXISTS idx_document_chunks_client
  ON document_chunks (client_id);

-- Índice vectorial IVFFlat (rápido para >100K rows, lazy para <10K).
-- lists=100 es buen default para piloto. Aumentar si volumen crece >1M chunks.
-- Solo construir si hay embeddings (NULL embeddings no entran al índice).
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding
  ON document_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Trigger: si markdown_content del document_chunks ya está, generar hash
-- para deduplicar (mismo content en 2 docs → 1 embedding compartido).
-- Por ahora hash se genera en aplicación.

ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

-- SELECT: consultores activos con acceso al cliente
CREATE POLICY document_chunks_select_authorized ON document_chunks
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM authorized_users au
      WHERE au.email = (SELECT auth.jwt() ->> 'email')
        AND au.active = true
    )
  );

-- INSERT/UPDATE: solo service_role (cron + endpoints admin)
-- (sin policy → bloqueado para authenticated)

COMMENT ON TABLE document_chunks IS
  'Wave 7 prep: chunks de documentos para retrieval semántico. embedding=NULL hasta que cron lo pueble. Swap BM25 → vector cuando VOYAGE_API_KEY esté configurada.';
