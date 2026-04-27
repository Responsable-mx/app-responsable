-- ─────────────────────────────────────────────────────────────
-- 0019 — Tabla client_services (una fila por instancia de servicio).
-- Relación N:1 con clients; un cliente puede tener múltiples
-- instancias del mismo servicio (ej: Informe 2024 + Informe 2025).
-- Campos específicos del entregable viven en JSONB data.
-- Assets compartidos (stakeholders, KPIs, materialidad) viven en
-- clients.*_json — los servicios referencian, no duplican.
-- Aditiva.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_services (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  service     text NOT NULL,            -- canónico: catalog_items.value (category=services)
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by  text,
  updated_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.client_services IS
  'Instancias de servicios contratados por un cliente. Campos específicos del servicio en data JSONB (schema en lib/services/service-schemas.ts). No duplica assets del cliente.';

CREATE INDEX IF NOT EXISTS idx_client_services_client
  ON public.client_services (client_id);
CREATE INDEX IF NOT EXISTS idx_client_services_type
  ON public.client_services (service);

ALTER TABLE public.client_services ENABLE ROW LEVEL SECURITY;

-- RLS: mismo patrón que clients — whitelist authorized_users.active.
DROP POLICY IF EXISTS "client_services_select_whitelist" ON public.client_services;
CREATE POLICY "client_services_select_whitelist" ON public.client_services FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email())
      AND au.active = true
  ));

DROP POLICY IF EXISTS "client_services_insert_whitelist" ON public.client_services;
CREATE POLICY "client_services_insert_whitelist" ON public.client_services FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email())
      AND au.active = true
  ));

DROP POLICY IF EXISTS "client_services_update_whitelist" ON public.client_services;
CREATE POLICY "client_services_update_whitelist" ON public.client_services FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email())
      AND au.active = true
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email())
      AND au.active = true
  ));

DROP POLICY IF EXISTS "client_services_delete_whitelist" ON public.client_services;
CREATE POLICY "client_services_delete_whitelist" ON public.client_services FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email())
      AND au.active = true
  ));

DROP TRIGGER IF EXISTS trg_client_services_updated_at ON public.client_services;
CREATE TRIGGER trg_client_services_updated_at
  BEFORE UPDATE ON public.client_services
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
