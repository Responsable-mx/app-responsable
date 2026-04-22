-- ─────────────────────────────────────────────────────────────
-- 0002 — Tabla otp_attempts para rate-limit de intentos fallidos.
-- Aditiva. Fija el bug A1 (brute-force al OTP de 6 dígitos).
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.otp_attempts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL,
  success     boolean NOT NULL,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.otp_attempts IS
  'Registra cada intento de verificar OTP (éxito o fallo). Se usa para
   rate-limitar fuerza bruta. TTL operativo: 24h, limpieza opcional.';

CREATE INDEX IF NOT EXISTS idx_otp_attempts_email_time
  ON public.otp_attempts (email, created_at DESC);

-- RLS: solo service role. Sin políticas.
ALTER TABLE public.otp_attempts ENABLE ROW LEVEL SECURITY;
