-- ─────────────────────────────────────────────────────────────
-- 0051 — clients: poblar services para clientes existentes
--        que tenían el valor en el cuestionario (formato viejo).
--
-- Estado pre-migración:
--   • Altamira  → services = ["Doble Materialidad"]  (label viejo)
--   • EPH       → services = null (tenía cuestionario con "Estudio…")
--   • Accor     → services = null (tenía cuestionario con "Estudio…")
--   • Nuvoil    → services = ["doble_materialidad_ia"] ✓ ya correcto
--
-- Mapeo: "Estudio de Doble Materialidad" / "Doble Materialidad"
--        → "doble_materialidad" (clave de catálogo actual)
--
-- No toca Nuvoil (ya tiene valor correcto).
-- No auto-asigna "doble_materialidad_ia" — eso requiere decisión
-- explícita del admin en el perfil del cliente.
-- ─────────────────────────────────────────────────────────────

-- 1. Clientes cuyo cuestionario tenía "Estudio de Doble Materialidad"
--    y que aún tienen services = null o vacío.
UPDATE public.clients c
SET services   = ARRAY['doble_materialidad']::text[],
    updated_at = now()
FROM public.questionnaire_responses qr
WHERE qr.client_id = c.id
  AND qr.service_key = 'doble-materialidad'
  AND (
    qr.responses -> 'informacion-base' -> 'servicio_contratado' -> 'value'
  ) @> '["Estudio de Doble Materialidad"]'::jsonb
  AND (c.services IS NULL OR c.services = '{}');

-- 2. Altamira: tiene ["Doble Materialidad"] (label, no clave) → normalizar.
UPDATE public.clients
SET services   = ARRAY['doble_materialidad']::text[],
    updated_at = now()
WHERE services @> ARRAY['Doble Materialidad']::text[]
  AND NOT (services @> ARRAY['doble_materialidad']::text[]);
