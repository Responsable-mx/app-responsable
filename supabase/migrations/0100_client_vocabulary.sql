-- Vocabulario específico por cliente — términos propios de cada empresa
CREATE TABLE IF NOT EXISTS client_vocabulary (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  client_term      TEXT        NOT NULL,
  responsable_term TEXT        NOT NULL,
  active           BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, client_term)
);

CREATE INDEX IF NOT EXISTS idx_client_vocabulary_client
  ON client_vocabulary(client_id, active);

ALTER TABLE client_vocabulary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cv_authenticated_read" ON client_vocabulary
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "cv_service_write" ON client_vocabulary
  FOR ALL TO service_role USING (true);
