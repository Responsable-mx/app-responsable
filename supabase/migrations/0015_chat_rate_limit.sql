-- ─────────────────────────────────────────────────────────────
-- 0015 — Tabla chat_requests para rate limit de /api/chat.
-- Cada llamada registra email + timestamp. Rate limit = 30 msgs / 5 min
-- por usuario. Evita que un loop accidental o uso malicioso queme crédito
-- de Anthropic.
-- Aditiva.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chat_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email  text NOT NULL,
  role        text NOT NULL,
  client_id   uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.chat_requests IS
  'Registro liviano de cada mensaje al chat para rate limit. Se purga mensualmente (no se conserva). Tokens/errores van a ai_calls.';

CREATE INDEX IF NOT EXISTS idx_chat_requests_user_time
  ON public.chat_requests (user_email, created_at DESC);

ALTER TABLE public.chat_requests ENABLE ROW LEVEL SECURITY;
-- Solo service role.
