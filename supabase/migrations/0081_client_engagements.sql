-- 0081: Tabla client_engagements
-- Reemplaza el campo services[] de clients con un registro por engagement,
-- incluyendo año y alcance geográfico por servicio contratado.
-- clients.services[] se mantiene como cache denormalizado (sincronizado por API).

CREATE TABLE public.client_engagements (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  uuid        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  service_key text       NOT NULL CHECK (char_length(service_key) <= 80),
  year        integer    CHECK (year >= 2010 AND year <= 2035),
  alcance     text       CHECK (char_length(alcance) <= 300),
  status      text       NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active', 'completed')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.client_engagements             IS 'Un engagement por servicio contratado al cliente. Incluye año y alcance geográfico.';
COMMENT ON COLUMN public.client_engagements.service_key IS 'Clave del catálogo services (ej: doble-materialidad)';
COMMENT ON COLUMN public.client_engagements.year        IS 'Año de inicio del engagement';
COMMENT ON COLUMN public.client_engagements.alcance     IS 'Alcance geográfico del proyecto (ej: México — Bajío y Centro-Norte)';
COMMENT ON COLUMN public.client_engagements.status      IS 'active = en curso, completed = entregado';

-- RLS
ALTER TABLE public.client_engagements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all" ON public.client_engagements
  FOR ALL TO authenticated
  USING (auth.role() = 'authenticated');

-- Índices
CREATE INDEX idx_client_engagements_client_id   ON public.client_engagements(client_id);
CREATE INDEX idx_client_engagements_service_key ON public.client_engagements(service_key);

-- Trigger updated_at
CREATE TRIGGER set_updated_at_client_engagements
  BEFORE UPDATE ON public.client_engagements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
