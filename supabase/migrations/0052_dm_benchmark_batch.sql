-- Agrega batch_id a dm_benchmark_results para soporte de Anthropic Batch API.
-- El batch_id permite que el GET handler verifique el estado asíncrono del
-- procesamiento y actualice el resultado cuando Anthropic termina (~1-5 min).

ALTER TABLE dm_benchmark_results
  ADD COLUMN IF NOT EXISTS batch_id text;

COMMENT ON COLUMN dm_benchmark_results.batch_id IS
  'ID del batch de Anthropic Batch API. NULL en modo síncrono (legacy). '
  'Cuando está presente y status=pending, el GET handler verifica el estado '
  'del batch y actualiza la fila cuando processing_status=ended.';
