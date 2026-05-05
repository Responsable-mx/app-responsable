-- ─────────────────────────────────────────────────────────────
-- 0025 — Cumplimiento 100% Cuestionario_Contexto_Negocio.md
-- Ajustes:
--   1. Step 2: agregar campo "operaciones" genérico (separado de ops_por_pais)
--   2. Step 9: separar "influencia_dependencia" en dos campos: nivel_influencia + nivel_dependencia
-- ─────────────────────────────────────────────────────────────

-- Patch del schema: agrega operaciones en informacion-general, separa stakeholders
UPDATE public.questionnaire_templates
SET schema = jsonb_set(
  jsonb_set(
    schema,
    '{steps,1,fields}',
    -- Insertar "operaciones" después de "empleados" (índice 5 en step 2 = informacion-general)
    -- Los fields originales: 0:sector,1:subsector,2:productos_servicios,3:descripcion_negocio,
    -- 4:descripcion_sostenibilidad,5:empleados,6:ingresos,7:unidades_negocio,8:paises,
    -- 9:ops_por_pais,10:tipo_clientes,11:competidores,12:cotiza_bolsa
    -- Nuevo: insertar "operaciones" en posición 9 (antes de ops_por_pais)
    (
      SELECT jsonb_agg(elem ORDER BY ord)
      FROM (
        SELECT elem, ord FROM jsonb_array_elements(schema->'steps'->1->'fields') WITH ORDINALITY AS x(elem, ord) WHERE ord <= 9
        UNION ALL
        SELECT jsonb_build_object(
          'key', 'operaciones',
          'label', 'Operaciones (descripción general)',
          'type', 'textarea',
          'hint', 'Resumen de operaciones globales: plantas, CEDIS, oficinas, sucursales totales'
        ), 9.5
        UNION ALL
        SELECT elem, ord FROM jsonb_array_elements(schema->'steps'->1->'fields') WITH ORDINALITY AS y(elem, ord) WHERE ord > 9
      ) sub
    )
  ),
  '{steps,8,fields}',
  -- Step 9 (índice 8) = stakeholders: reemplazar "influencia_dependencia" por dos campos
  (
    SELECT jsonb_agg(
      CASE
        WHEN elem->>'key' = 'influencia_dependencia' THEN
          jsonb_build_object(
            'key','nivel_influencia',
            'label','Nivel de influencia por grupo',
            'type','textarea',
            'hint','Alta / media / baja — capacidad del grupo de afectar al negocio'
          )
        ELSE elem
      END
      ORDER BY ord
    )
    FROM jsonb_array_elements(schema->'steps'->8->'fields') WITH ORDINALITY AS x(elem, ord)
  )
),
    version = 4,
    updated_at = now()
WHERE service_key = 'doble-materialidad';

-- Insertar "nivel_dependencia" después de "nivel_influencia" en step 9
UPDATE public.questionnaire_templates
SET schema = jsonb_set(
  schema,
  '{steps,8,fields}',
  (
    SELECT jsonb_agg(elem ORDER BY ord)
    FROM (
      SELECT elem, ord
      FROM jsonb_array_elements(schema->'steps'->8->'fields') WITH ORDINALITY AS x(elem, ord)
      WHERE elem->>'key' != 'nivel_dependencia'
      UNION ALL
      SELECT
        jsonb_build_object(
          'key','nivel_dependencia',
          'label','Nivel de dependencia por grupo',
          'type','textarea',
          'hint','Alta / media / baja — qué tanto el negocio depende del grupo'
        ),
        (
          SELECT ord + 0.5
          FROM jsonb_array_elements(schema->'steps'->8->'fields') WITH ORDINALITY AS y(elem, ord)
          WHERE elem->>'key' = 'nivel_influencia'
        )
    ) sub
  ),
    updated_at = now()
)
WHERE service_key = 'doble-materialidad';

-- Re-seed Altamira: agregar "operaciones" + separar influencia/dependencia en responses
UPDATE public.questionnaire_responses
SET responses = jsonb_set(
  jsonb_set(
    jsonb_set(
      responses,
      '{informacion-general,operaciones}',
      jsonb_build_object(
        'value', 'Red nacional de logística refrigerada: 12 CEDIS, 1 corporativo CDMX, 3 almacenes cross-dock. Cobertura en 12 estados del Bajío y Centro-Norte. Flotilla refrigerada propia. Cadena de frío certificada BRC.',
        'source_type', 'public',
        'sources', jsonb_build_array(jsonb_build_object('url','https://altamira.com.mx/cobertura','title','Altamira — Cobertura','date','2024-09-01','type','web')),
        'validated', true,
        'updated_at', to_char(now(),'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      )
    ),
    '{stakeholders,nivel_influencia}',
    jsonb_build_object(
      'value', 'Walmart/FEMSA/OXXO: alta (clientes top con poder de compra). Reguladores SEMARNAT/SENER: alta. BBVA: alta (financiador con condicionamientos ESG). Sindicato CTM: media. Comunidades cercanas: baja-media.',
      'source_type', 'interpretation',
      'sources', '[]'::jsonb,
      'validated', false,
      'updated_at', to_char(now(),'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )
  ),
  '{stakeholders,nivel_dependencia}',
  jsonb_build_object(
    'value', 'Proveedores únicos (Honeywell HFC, Pemex Diésel): alta. Walmart/FEMSA: alta-media. Sindicato CTM: media. Reguladores: media (cumplimiento). Comunidades: baja.',
    'source_type', 'interpretation',
    'sources', '[]'::jsonb,
    'validated', false,
    'updated_at', to_char(now(),'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  )
),
    updated_by = 'seed@responsable.net',
    updated_at = now()
WHERE client_id = '11111111-1111-1111-1111-111111111111'::uuid
  AND service_key = 'doble-materialidad';

-- Quitar el campo viejo "influencia_dependencia" de Altamira si existe
UPDATE public.questionnaire_responses
SET responses = responses #- '{stakeholders,influencia_dependencia}'
WHERE client_id = '11111111-1111-1111-1111-111111111111'::uuid
  AND service_key = 'doble-materialidad';
