-- ─────────────────────────────────────────────────────────────
-- 0056 — wizard step 3 (estrategia-y-madurez):
--        • Mejora etiquetas e hints de campos de informe de sostenibilidad
--          para que la IA reconozca variantes de nombre
--          (reporte, informe, memoria, ESG, GRI, CDP…)
--        • Agrega 3 campos nuevos para informe financiero / memoria anual
--          (también lleva variantes: memoria anual, reporte anual,
--           estados financieros, integrated report, reporte 20-F…)
--
-- Step index: 2 (0-indexed). Field indexes en el paso original:
--   10 → tiene_informe
--   13 → link_informe
-- Los 3 campos financieros se anexan al final del array.
-- Aditiva — no toca questionnaire_responses.
-- ─────────────────────────────────────────────────────────────

-- 1. Actualizar label + hint de tiene_informe (step 2, field 10)
UPDATE public.questionnaire_templates
SET schema = jsonb_set(
  schema,
  '{steps,2,fields,10}',
  '{
    "key": "tiene_informe",
    "label": "¿Publica informe / reporte / memoria de sostenibilidad?",
    "type": "text",
    "hint": "Busca por todas las variantes: Informe de Sostenibilidad, Reporte de Sustentabilidad, Memoria de Sostenibilidad, Reporte ESG, Reporte GRI, Reporte Integrado, Reporte de RSE, Reporte de Desarrollo Sostenible, CDP Disclosure, Sustainability Report, ESG Report. Indica Sí (público), Sí (solo interno) o No publica."
  }'::jsonb
)
WHERE service_key = 'doble-materialidad'
  AND (schema -> 'steps' -> 2 -> 'fields' -> 10 ->> 'key') = 'tiene_informe';

-- 2. Actualizar label + hint de link_informe (step 2, field 13)
UPDATE public.questionnaire_templates
SET schema = jsonb_set(
  schema,
  '{steps,2,fields,13}',
  '{
    "key": "link_informe",
    "label": "URL del informe / reporte / memoria de sostenibilidad",
    "type": "text",
    "hint": "URL directa al documento público. Busca en: sitio web corporativo (sección Sostenibilidad / RSE), GRI Sustainability Disclosure Database (database.globalreporting.org), CDP, CEMEFI, SEC Edgar (si cotiza en bolsa), LinkedIn — sección Compromisos."
  }'::jsonb
)
WHERE service_key = 'doble-materialidad'
  AND (schema -> 'steps' -> 2 -> 'fields' -> 13 ->> 'key') = 'link_informe';

-- 3. Agregar 3 campos de informe financiero al final del paso 3
UPDATE public.questionnaire_templates
SET schema = jsonb_set(
  schema,
  '{steps,2,fields}',
  (schema -> 'steps' -> 2 -> 'fields')
  || '[
    {
      "key": "tiene_informe_financiero",
      "label": "¿Publica informe financiero o memoria anual?",
      "type": "select",
      "options": [
        "Sí — público (disponible en web)",
        "Sí — solo para accionistas (no público)",
        "No publica",
        "No se encontró información"
      ],
      "hint": "Busca por variantes: Memoria Anual, Reporte Anual, Informe Anual de Resultados, Estados Financieros Auditados, Informe de Gestión, Reporte Integrado, Integrated Report, Annual Report, Reporte a Inversionistas, Dictamen Financiero, Reporte 20-F / 10-K (si cotiza en SEC), Informe Bursátil (si cotiza en BMV)"
    },
    {
      "key": "link_informe_financiero",
      "label": "URL del informe financiero / memoria anual",
      "type": "text",
      "hint": "URL directa al documento público. Busca en: sitio web (sección Inversionistas o Relación con Inversionistas), CNBV / BMV (si cotiza en México), SEC Edgar (si cotiza en NYSE/NASDAQ), repositorio de la empresa."
    },
    {
      "key": "periodo_informe_financiero",
      "label": "Período del informe financiero",
      "type": "text",
      "hint": "Ej. Ejercicio fiscal 2023 (enero–diciembre). Puede diferir del período del informe de sostenibilidad."
    }
  ]'::jsonb
)
WHERE service_key = 'doble-materialidad';
