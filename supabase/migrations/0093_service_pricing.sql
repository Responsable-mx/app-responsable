-- ─── 0093_service_pricing.sql ────────────────────────────────────────────────
-- Costo base por tipo de servicio (configurable por admin) + campos de costo
-- y estado piloto en cada entrega de servicio por cliente.

-- ─── 1. Tabla de configuración de precios base ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.service_pricing_config (
  service_key   TEXT        PRIMARY KEY,
  base_cost     NUMERIC(10, 2),
  notes         TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by    TEXT
);

ALTER TABLE public.service_pricing_config ENABLE ROW LEVEL SECURITY;

-- Consultores autenticados pueden ver costos de referencia
CREATE POLICY "pricing_select" ON public.service_pricing_config
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.authorized_users
      WHERE email = auth.email() AND active = true
    )
  );

-- Escritura solo vía service_role (endpoints admin con requireAdmin)
CREATE POLICY "pricing_insert_sr" ON public.service_pricing_config
  FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "pricing_update_sr" ON public.service_pricing_config
  FOR UPDATE TO service_role USING (true);

-- ─── 2. Columnas de costo/piloto en client_services ───────────────────────────
ALTER TABLE public.client_services
  ADD COLUMN IF NOT EXISTS is_pilot    BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS actual_cost NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS sale_price  NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS cost_notes  TEXT;
