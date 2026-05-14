-- 0096 — audit trail (prompt_hash en ai_calls) + citations (page_number en document_chunks)
--
-- prompt_hash: huella SHA-256 del system prompt estático (rol + contexto cliente).
--   Permite auditar qué instrucciones tenía la IA al generar cada respuesta.
--   Requerimiento de empresas CSRD-obligadas con auditorías externas.
--
-- page_number: página del PDF de origen del fragmento.
--   Habilita citas con número de página en respuestas de Aurora.
--   Solo docs nuevos post-mig — chunks existentes quedan NULL (sin re-ingest).

ALTER TABLE ai_calls
  ADD COLUMN IF NOT EXISTS prompt_hash TEXT;

ALTER TABLE document_chunks
  ADD COLUMN IF NOT EXISTS page_number INTEGER;

CREATE INDEX IF NOT EXISTS idx_ai_calls_prompt_hash ON ai_calls (prompt_hash)
  WHERE prompt_hash IS NOT NULL;
