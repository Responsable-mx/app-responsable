-- ─────────────────────────────────────────────────────────────
-- 0017 — Campo services[] en clients.
-- Permite asignar qué servicios ResponSable se están prestando al cliente
-- (doble materialidad, ESR, informe de sostenibilidad, etc).
-- Aditiva.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS services text[];

CREATE INDEX IF NOT EXISTS idx_clients_services
  ON public.clients USING GIN (services);

COMMENT ON COLUMN public.clients.services IS
  'Servicios ResponSable contratados. Valores canónicos de catalog_items.value donde category=services.';
