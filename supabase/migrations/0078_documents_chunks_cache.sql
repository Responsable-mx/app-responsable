-- Chunks pre-calculados para BM25 en ai-fill (elimina re-chunking por request).
-- Se llena al parsear; NULL = docs pre-migración o parse fallido.
ALTER TABLE client_documents
  ADD COLUMN IF NOT EXISTS chunks_cache jsonb,
  ADD COLUMN IF NOT EXISTS chunks_computed_at timestamptz;

COMMENT ON COLUMN client_documents.chunks_cache IS
  'Array JSON de strings (chunks markdown 1200 chars, overlap 150). Pre-calculado al parsear.';
COMMENT ON COLUMN client_documents.chunks_computed_at IS
  'Timestamp del último cálculo de chunks. NULL = no calculado aún.';
