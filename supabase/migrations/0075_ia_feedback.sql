-- ──────────────────────────────────────────────────────────────
-- Migración 0075 — IA Feedback Memory (Wave 3c — D)
--
-- Captura feedback explícito de consultores sobre respuestas IA.
-- Objetivo: cuando el consultor da 👎 (rating=down) + razón, se guarda
-- como ejemplo "a evitar" para inyectar en futuros prompts del mismo rol.
--
-- Reglas:
-- - Solo authenticated puede INSERT (su propio user_email).
-- - Lectura por todos los consultores activos (para que cualquiera
--   pueda re-usar la memoria al chatear).
-- - DELETE solo admins (via API).
--
-- Aditiva: CREATE TABLE + index + RLS. Sin riesgo destructivo.
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ia_feedback (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email      text NOT NULL,
  role            text NOT NULL CHECK (role IN ('aurora', 'rebeca', 'elena', 'valeria')),
  client_id       uuid REFERENCES clients(id) ON DELETE SET NULL,
  session_id      uuid REFERENCES chat_sessions(id) ON DELETE SET NULL,
  message_excerpt text NOT NULL CHECK (length(message_excerpt) <= 500),
  rating          text NOT NULL CHECK (rating IN ('up', 'down')),
  reason_code     text CHECK (reason_code IS NULL OR reason_code IN (
    'factually_wrong',
    'sector_off',
    'bad_format',
    'language',
    'too_generic',
    'missed_context',
    'other'
  )),
  reason_text     text CHECK (reason_text IS NULL OR length(reason_text) <= 500),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Índices: consulta típica = "últimos N feedbacks negativos de rol X sobre cliente Y"
CREATE INDEX IF NOT EXISTS idx_ia_feedback_role_client_rating
  ON ia_feedback (role, client_id, rating, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ia_feedback_user
  ON ia_feedback (user_email, created_at DESC);

-- RLS
ALTER TABLE ia_feedback ENABLE ROW LEVEL SECURITY;

-- INSERT: authenticated guarda su propio feedback
CREATE POLICY ia_feedback_insert_own ON ia_feedback
  FOR INSERT TO authenticated
  WITH CHECK (
    user_email = (SELECT auth.jwt() ->> 'email')
  );

-- SELECT: consultores activos leen todo (memoria compartida)
CREATE POLICY ia_feedback_select_active ON ia_feedback
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM authorized_users au
      WHERE au.email = (SELECT auth.jwt() ->> 'email')
        AND au.active = true
    )
  );

-- DELETE: solo admins (via API service_role, no RLS desde frontend)
-- (sin policy DELETE → bloqueado para todos los roles)

COMMENT ON TABLE ia_feedback IS
  'Wave 3c (D): feedback explícito de consultores sobre respuestas IA. Negativos se inyectan como ejemplos "a evitar" en futuros system prompts del mismo rol.';
