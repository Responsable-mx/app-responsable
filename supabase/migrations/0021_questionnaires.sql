-- ─────────────────────────────────────────────────────────────
-- 0021 — Cuestionarios por cliente (Fase 2 MVP).
-- Dos tablas:
--   questionnaire_templates: schema JSONB del cuestionario por servicio
--                            (1 fila por service_key, ej: 'doble-materialidad')
--   questionnaire_responses: respuestas por cliente+servicio
--                            (1 fila única por (client_id, service_key))
-- Aditiva. RLS whitelist authorized_users.active.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.questionnaire_templates (
  service_key text PRIMARY KEY,        -- canónico: catalog_items (category=services).value
  label       text NOT NULL,
  schema      jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- schema shape:
  --   { "sections": [ { "key", "label", "description"?, "fields": [
  --       { "key", "label", "type": "text"|"textarea"|"number"|"boolean"|"select"|"multiselect",
  --         "required"?, "options"?: [{value,label}], "placeholder"?, "helper"? } ] } ] }
  version     int NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.questionnaire_templates IS
  'Schema de preguntas por servicio. Editable por admin. responses lo consume vía service_key.';

CREATE TABLE IF NOT EXISTS public.questionnaire_responses (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  service_key         text NOT NULL,                            -- match con questionnaire_templates.service_key
  responses           jsonb NOT NULL DEFAULT '{}'::jsonb,       -- { [section_key]: { [field_key]: value } }
  completed_sections  text[] NOT NULL DEFAULT '{}',
  created_by          text,
  updated_by          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id, service_key)
);

COMMENT ON TABLE public.questionnaire_responses IS
  'Respuestas del cuestionario por cliente+servicio. responses JSONB key-value, completed_sections marca progreso.';

CREATE INDEX IF NOT EXISTS idx_questionnaire_responses_client
  ON public.questionnaire_responses (client_id);
CREATE INDEX IF NOT EXISTS idx_questionnaire_responses_service
  ON public.questionnaire_responses (service_key);

ALTER TABLE public.questionnaire_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questionnaire_responses ENABLE ROW LEVEL SECURITY;

-- RLS templates: lectura para todo consultor autenticado, escritura solo service_role (admin via API).
DROP POLICY IF EXISTS "questionnaire_templates_select_authenticated" ON public.questionnaire_templates;
CREATE POLICY "questionnaire_templates_select_authenticated"
  ON public.questionnaire_templates FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email())
      AND au.active = true
  ));

-- RLS responses: whitelist patrón — mismo que clients/client_services.
DROP POLICY IF EXISTS "questionnaire_responses_select_whitelist" ON public.questionnaire_responses;
CREATE POLICY "questionnaire_responses_select_whitelist"
  ON public.questionnaire_responses FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email())
      AND au.active = true
  ));

DROP POLICY IF EXISTS "questionnaire_responses_insert_whitelist" ON public.questionnaire_responses;
CREATE POLICY "questionnaire_responses_insert_whitelist"
  ON public.questionnaire_responses FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email())
      AND au.active = true
  ));

DROP POLICY IF EXISTS "questionnaire_responses_update_whitelist" ON public.questionnaire_responses;
CREATE POLICY "questionnaire_responses_update_whitelist"
  ON public.questionnaire_responses FOR UPDATE
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

DROP POLICY IF EXISTS "questionnaire_responses_delete_whitelist" ON public.questionnaire_responses;
CREATE POLICY "questionnaire_responses_delete_whitelist"
  ON public.questionnaire_responses FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.authorized_users au
    WHERE lower(au.email) = lower(auth.email())
      AND au.active = true
  ));

DROP TRIGGER IF EXISTS trg_questionnaire_templates_updated_at ON public.questionnaire_templates;
CREATE TRIGGER trg_questionnaire_templates_updated_at
  BEFORE UPDATE ON public.questionnaire_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_questionnaire_responses_updated_at ON public.questionnaire_responses;
CREATE TRIGGER trg_questionnaire_responses_updated_at
  BEFORE UPDATE ON public.questionnaire_responses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Seed: template inicial 'doble-materialidad' con 5 secciones.
-- Editable por el equipo de metodología via configuración.
-- ─────────────────────────────────────────────────────────────

INSERT INTO public.questionnaire_templates (service_key, label, schema, version)
VALUES (
  'doble-materialidad',
  'Doble Materialidad',
  jsonb_build_object(
    'sections', jsonb_build_array(
      jsonb_build_object(
        'key', 'informacion-base',
        'label', 'Información base',
        'description', 'Datos generales, giro, ubicación, tamaño',
        'fields', jsonb_build_array(
          jsonb_build_object('key', 'razon_social', 'label', 'Razón social', 'type', 'text', 'required', true),
          jsonb_build_object('key', 'rfc', 'label', 'RFC', 'type', 'text'),
          jsonb_build_object('key', 'empleados', 'label', 'Empleados directos', 'type', 'number'),
          jsonb_build_object('key', 'ingresos_anuales', 'label', 'Ingresos anuales (MDP)', 'type', 'number'),
          jsonb_build_object('key', 'pagina_web', 'label', 'Página web', 'type', 'text', 'placeholder', 'https://')
        )
      ),
      jsonb_build_object(
        'key', 'contexto-general',
        'label', 'Contexto general',
        'description', 'Operaciones, mercados, líneas de negocio',
        'fields', jsonb_build_array(
          jsonb_build_object('key', 'operaciones', 'label', 'Operaciones e instalaciones', 'type', 'textarea'),
          jsonb_build_object('key', 'clientes_clave', 'label', 'Clientes clave', 'type', 'textarea'),
          jsonb_build_object('key', 'lineas_negocio', 'label', 'Líneas de negocio', 'type', 'textarea'),
          jsonb_build_object('key', 'mercados', 'label', 'Mercados que atiende', 'type', 'textarea')
        )
      ),
      jsonb_build_object(
        'key', 'contexto-sostenibilidad',
        'label', 'Contexto de sostenibilidad',
        'description', 'Compromisos, política y madurez ESG',
        'fields', jsonb_build_array(
          jsonb_build_object('key', 'madurez_esg', 'label', 'Madurez ESG', 'type', 'select', 'options', jsonb_build_array(
            jsonb_build_object('value', 'inicial', 'label', 'Inicial (1/5)'),
            jsonb_build_object('value', 'reactivo', 'label', 'Reactivo (2/5)'),
            jsonb_build_object('value', 'gestionado', 'label', 'Gestionado (3/5)'),
            jsonb_build_object('value', 'optimizado', 'label', 'Optimizado (4/5)'),
            jsonb_build_object('value', 'lider', 'label', 'Líder (5/5)')
          )),
          jsonb_build_object('key', 'reporte_publicado', 'label', '¿Publica reporte de sostenibilidad?', 'type', 'boolean'),
          jsonb_build_object('key', 'certificaciones', 'label', 'Certificaciones activas', 'type', 'textarea'),
          jsonb_build_object('key', 'meta_co2', 'label', 'Meta de reducción de CO₂', 'type', 'textarea')
        )
      ),
      jsonb_build_object(
        'key', 'regulatorio',
        'label', 'Marco regulatorio',
        'description', 'Regulaciones aplicables, antecedentes y compliance',
        'fields', jsonb_build_array(
          jsonb_build_object('key', 'regulaciones_aplicables', 'label', 'Regulaciones aplicables', 'type', 'textarea'),
          jsonb_build_object('key', 'antecedentes_compliance', 'label', 'Antecedentes de compliance (multas, observaciones)', 'type', 'textarea'),
          jsonb_build_object('key', 'frameworks_meta', 'label', 'Frameworks meta (GRI, SASB, TCFD, ISSB)', 'type', 'textarea')
        )
      ),
      jsonb_build_object(
        'key', 'modelo-negocio',
        'label', 'Modelo de negocio',
        'description', 'Cadena de valor, dependencias críticas, stakeholders',
        'fields', jsonb_build_array(
          jsonb_build_object('key', 'cadena_valor', 'label', 'Cadena de valor', 'type', 'textarea'),
          jsonb_build_object('key', 'dependencias_criticas', 'label', 'Dependencias críticas (insumos, proveedores)', 'type', 'textarea'),
          jsonb_build_object('key', 'stakeholders_clave', 'label', 'Stakeholders clave', 'type', 'textarea'),
          jsonb_build_object('key', 'riesgos_principales', 'label', 'Riesgos principales identificados', 'type', 'textarea')
        )
      )
    )
  ),
  1
)
ON CONFLICT (service_key) DO NOTHING;
