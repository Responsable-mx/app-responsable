-- Agrega batch_id a client_documents para soporte de Anthropic Batch API.
-- Usado por dm-report para generar reportes con Opus de forma asíncrona,
-- desacoplando la generación del límite de 60s de Vercel Hobby.
-- parse_status='pending' + batch_id → GET handler verifica y procesa cuando ended.

ALTER TABLE client_documents
  ADD COLUMN IF NOT EXISTS batch_id text;

COMMENT ON COLUMN client_documents.batch_id IS
  'ID del batch de Anthropic Batch API para generación asíncrona (dm-report). '
  'Cuando parse_status=pending y batch_id IS NOT NULL, el GET handler verifica '
  'el estado del batch y actualiza markdown_content cuando processing_status=ended.';
