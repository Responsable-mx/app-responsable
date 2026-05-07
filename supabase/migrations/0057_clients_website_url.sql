-- 0057 — Agrega website_url a clients para que la IA use el sitio corporativo
-- como fuente primaria. Aditiva, sin DEFAULT, nullable — no rompe filas existentes.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS website_url text;
