-- TTFT (Time To First Token): tiempo desde request hasta primer token del stream.
-- Complementa latency_ms (total) para distinguir latencia de cola vs generación.
ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS ttft_ms INTEGER;
CREATE INDEX IF NOT EXISTS idx_ai_calls_ttft ON ai_calls (ttft_ms) WHERE ttft_ms IS NOT NULL;
