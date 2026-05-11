-- ─────────────────────────────────────────────────────────────
-- 0072 — Hints precisos para paises + ops_por_pais
-- ─────────────────────────────────────────────────────────────
-- Restringe el llenado IA a operación física (excluye alianzas
-- comerciales, distribuidores externos y proyectos puntuales).
-- Caso real: Nuvoil — AI mezclaba MX/CO (operación) con alianzas
-- Holanda/Alemania/China/Corea/Dubái en el campo paises.
-- ─────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_schema    jsonb;
  v_new_steps jsonb := '[]'::jsonb;
  v_step      jsonb;
  v_new_fields jsonb;
  v_field     jsonb;
  v_hint_paises text := 'Solo países con operación física propia (oficinas, plantas, sucursales, CEDIS, filiales). EXCLUIR alianzas comerciales, socios distribuidores y proyectos puntuales — esos van en otros campos. Lista corta y limpia. Ej. correcto: "México, Colombia". Ej. incorrecto: "México (principal), Colombia; alianzas comerciales con Alemania, China, Corea...".';
  v_hint_ops  text := 'Desglose por país de la operación física: número de oficinas/plantas/CEDIS/sucursales + ciudad principal. Ej. "MX: 12 CEDIS + 1 corporativo CDMX; CO: 1 oficina Bogotá". NO incluir alianzas comerciales ni proyectos puntuales.';
BEGIN
  SELECT schema INTO v_schema
  FROM public.questionnaire_templates
  WHERE service_key = 'doble-materialidad';

  IF v_schema IS NULL THEN
    RAISE NOTICE 'Template doble-materialidad no encontrado — skip.';
    RETURN;
  END IF;

  FOR v_step IN SELECT value FROM jsonb_array_elements(v_schema->'steps')
  LOOP
    IF v_step->>'key' = 'informacion-general' THEN
      v_new_fields := '[]'::jsonb;
      FOR v_field IN SELECT value FROM jsonb_array_elements(v_step->'fields')
      LOOP
        IF v_field->>'key' = 'paises' THEN
          v_field := v_field || jsonb_build_object('hint', v_hint_paises);
        ELSIF v_field->>'key' = 'ops_por_pais' THEN
          v_field := v_field || jsonb_build_object('hint', v_hint_ops);
        END IF;
        v_new_fields := v_new_fields || jsonb_build_array(v_field);
      END LOOP;
      v_step := jsonb_set(v_step, '{fields}', v_new_fields);
    END IF;
    v_new_steps := v_new_steps || jsonb_build_array(v_step);
  END LOOP;

  v_schema := jsonb_set(v_schema, '{steps}', v_new_steps);

  UPDATE public.questionnaire_templates
  SET schema = v_schema, updated_at = now()
  WHERE service_key = 'doble-materialidad';
END $$;
