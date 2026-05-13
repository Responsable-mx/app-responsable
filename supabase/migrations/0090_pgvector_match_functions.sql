-- Migration 0090: funciones SQL para cosine similarity en pgvector
-- Reemplaza el cálculo JS en Node (traía hasta 500 filas × 8KB = 4MB por búsqueda)
-- con cálculo en Postgres usando operador <=> (cosine distance). 0=idéntico, 2=opuesto.

-- ── Búsqueda en documentos del cliente ──────────────────────────────────────
CREATE OR REPLACE FUNCTION match_document_chunks(
  query_vec    vector(1024),
  p_client_id  uuid,
  k            integer DEFAULT 10
)
RETURNS TABLE (
  id             uuid,
  document_id    uuid,
  client_id      uuid,
  chunk_index    integer,
  content        text,
  content_hash   text,
  score          float
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    dc.id,
    dc.document_id,
    dc.client_id,
    dc.chunk_index,
    dc.content,
    dc.content_hash,
    1 - (dc.embedding <=> query_vec) AS score
  FROM document_chunks dc
  WHERE dc.client_id = p_client_id
    AND dc.embedding IS NOT NULL
  ORDER BY dc.embedding <=> query_vec
  LIMIT k;
$$;

-- ── Búsqueda en chunks de competidores (por document_ids) ───────────────────
CREATE OR REPLACE FUNCTION match_competitor_chunks(
  query_vec   vector(1024),
  p_doc_ids   uuid[],
  k           integer DEFAULT 10
)
RETURNS TABLE (
  content  text,
  score    float
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    dc.content,
    1 - (dc.embedding <=> query_vec) AS score
  FROM document_chunks dc
  WHERE dc.document_id = ANY(p_doc_ids)
    AND dc.embedding IS NOT NULL
  ORDER BY dc.embedding <=> query_vec
  LIMIT k;
$$;

-- Permisos: solo service_role puede ejecutar (los callers usan adminClient)
GRANT EXECUTE ON FUNCTION match_document_chunks TO service_role;
GRANT EXECUTE ON FUNCTION match_competitor_chunks TO service_role;
