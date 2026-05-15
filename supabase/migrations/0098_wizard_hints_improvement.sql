-- ─────────────────────────────────────────────────────────────────────────────
-- 0098 — Mejora de hints del cuestionario de Doble Materialidad
--
-- PROBLEMA: Los hints anteriores eran disclaimers genéricos ("Sujeto a
-- validación", "Inferido de...") que no guían al LLM sobre QUÉ extraer,
-- DÓNDE buscarlo ni en QUÉ FORMATO devolverlo. Resultado: extracción
-- imprecisa (caso Nuvoil — modelo sostenibilidad se describió en términos
-- de ISO en lugar de los pilares del modelo visual publicado).
--
-- SOLUCIÓN: Hints accionables que especifican:
--   1. Qué información buscar (no el disclaimer de la respuesta)
--   2. Fuente prioritaria donde encontrarla
--   3. Formato esperado de la respuesta
--   4. Qué escribir si no hay datos públicos
--
-- Afecta solo campos con ai_can_fill=true (pasos 2-8).
-- Campos consultor_only (paso 1, stakeholders) no se modifican.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_schema jsonb;
  v_steps  jsonb;
  v_step   jsonb;
  v_fields jsonb;
  v_field  jsonb;
  v_si     int;
  v_fi     int;
  v_step_key text;
  v_field_key text;
  v_new_hint  text;

  -- Mapa step_key → field_key → hint mejorado
  hints jsonb := $hints${
    "informacion-general": {
      "sector": "Sector principal de la empresa. Ej: 'Energía - Petróleo y Gas', 'Manufactura - Alimentos'. Fuente: LinkedIn empresa o sitio corporativo.",
      "subsector": "Subsector específico dentro del sector. Ej: 'Distribución alimentaria refrigerada', 'Extracción de crudo'. Fuente: sitio corporativo.",
      "productos_servicios": "Lista de 3-5 productos o servicios principales. Formato: bullet points breves. Sin jerga técnica. Fuente: página 'Productos' o 'Servicios' del sitio corporativo.",
      "descripcion_negocio": "Párrafo de 3-4 oraciones: qué hace la empresa, a quién sirve (B2B/B2C), dónde opera, diferenciador clave. Fuente: sitio corporativo sección 'Nosotros' o 'Quiénes somos'.",
      "descripcion_sostenibilidad": "Párrafo sobre la estrategia de sostenibilidad publicada. Buscar en: sección 'Sustentabilidad' del sitio corporativo, LinkedIn, GRI database. Si no hay info pública: escribir 'No publicado — confirmar con cliente'.",
      "empleados": "Número aproximado de empleados. Fuente prioritaria: LinkedIn sección 'Tamaño de empresa'. Alternativa: informe anual. Formato: solo el número, sin unidades. Ej: '3400'.",
      "ingresos": "Ingresos anuales estimados en MXN. Fuente: BMV, informe anual, prensa financiera (Expansión, El Economista). Si no está disponible públicamente: escribir 'No publicado'. No inventar cifras.",
      "unidades_negocio": "Divisiones o unidades de negocio de la empresa. Fuente: organigrama del sitio corporativo, informe anual. Si opera como unidad única: 'Operación integrada — sin divisiones formales reportadas'.",
      "paises": "Lista de países donde tiene presencia operativa. Formato: país1, país2. Fuente: sitio corporativo sección 'Cobertura' o LinkedIn.",
      "ops_por_pais": "Tipo de presencia por país: planta, CEDIS, oficina comercial, etc. Formato: 'País: tipo de operación'. Fuente: sitio corporativo sección 'Sucursales' o 'Operaciones'.",
      "tipo_clientes": "Tipo de clientes (B2B / B2C / Gobierno) y principales compradores si son datos públicos. Ej: 'B2B: Walmart (~30%), sector retail — porcentaje estimado'. Solo incluir % si hay fuente verificable.",
      "competidores": "3-5 principales competidores directos en el mismo mercado y geografía. Fuente: prensa sectorial (Expansión, El Economista), informes de industria.",
      "cotiza_bolsa": "Sí o No. Buscar en: BMV (Bolsa Mexicana de Valores), NYSE, NASDAQ, S&P. Si no hay confirmación pública: 'No identificado en bolsas consultadas'."
    },
    "estrategia-y-madurez": {
      "modelo_sostenibilidad": "Nombre y estructura del modelo de sostenibilidad publicado. Buscar en: sección 'Sustentabilidad' del sitio corporativo, informe de sostenibilidad, LinkedIn. FORMATO ESPERADO: nombre del modelo + pilares principales. Ej: 'Modelo circular — 3 pilares: Personas, Planeta, Social' o 'Modelo ESG — 4 ejes: Ambiental, Social, Gobernanza, Innovación'. Si no hay modelo formal publicado: 'No publicado — confirmar con cliente'. NO inferir estructura del modelo a partir de certificaciones ISO.",
      "descripcion_modelo_pilares": "Para cada pilar del modelo: nombre del pilar + temas que cubre + grupos de interés asociados. FORMATO: lista de pilares con sub-temas. Ej: 'Pilar Personas: temas capacitación, salud y seguridad, diversidad; grupos: colaboradores, proveedores'. Solo describir si hay información explícita publicada (sitio o informe). Si no hay: 'No documentado públicamente — confirmar con cliente'.",
      "analisis_critico_modelo": "Brechas del modelo publicado vs. mejores prácticas del sector (GRI Standards sectorial, SASB): ¿qué temas ESG relevantes para el sector faltan en el modelo? Formato: 2-4 bullets '[Tema faltante] — [por qué es relevante para el sector]'.",
      "certificaciones": "Lista de certificaciones y reconocimientos activos. Formato: 'Nombre certificación (Organismo — año vigente)'. Fuente: sitio corporativo sección 'Certificaciones', CEMEFI directorio ESR, GRI database, LinkedIn.",
      "tiene_informe": "Sí / No / Parcial. Buscar en: GRI Sustainability Disclosure Database (database.globalreporting.org), CDP disclosure, sitio corporativo.",
      "informe_publico": "Público / Interno / No aplica. Si es público: confirmar que hay URL descargable del PDF.",
      "tipo_informe_alcance": "Global / Regional / Local — según lo declarado en la portada o alcance del informe.",
      "link_informe": "URL directa al PDF o página del informe de sostenibilidad más reciente. Buscar primero en el sitio corporativo, luego en GRI database. Si no existe: 'No disponible públicamente'.",
      "frameworks": "Lista de estándares de reporte usados. Buscar en: portada del informe, índice de contenidos GRI, registro CDP. Formato: 'GRI Standards (Core)', 'TCFD', 'CDP Climate'. Si no hay informe: 'Sin estándar formal reportado'.",
      "informe_auditado": "Sí / No / Verificación limitada. Buscar carta de verificación al final del informe. Si no hay informe: 'No aplica'.",
      "kpis_medidos": "Indicadores que la empresa mide y reporta sistemáticamente. Formato: 'Medido: [lista]. No medido o no reportado: [lista]'. Fuente: informe de sostenibilidad o tabla de indicadores GRI."
    },
    "regulacion-y-sector": {
      "regulaciones": "Lista de regulaciones aplicables al sector y geografía de operación. Formato: 'Nombre norma (Organismo — materia)'. Incluir: normas sectoriales, ambientales (SEMARNAT/PROFEPA), laborales (STPS/IMSS), fiscales relevantes. Fuente: DOF, sitios de reguladores.",
      "referentes_sector": "3-5 empresas con mejor desempeño ESG en el mismo sector + estándar sectorial aplicable. Formato: 'Empresa (País) — estándar usado — año'. Fuente: GRI database (database.globalreporting.org), S&P ESG Yearbook, SASB Industry Research.",
      "madurez_sector": "Nivel de madurez ESG del sector: Alto / Medio / Bajo. Justificación en 1-2 oraciones: % aproximado de empresas del sector que reportan formalmente, estándar dominante. Fuente: informes públicos de competidores + GRI database.",
      "competidores_reportan": "Lista de competidores que publican informe ESG formal. Formato: 'Empresa: estándar (año del último informe)'. Buscar en GRI database y CDP disclosure.",
      "estandares_competidores": "Estándar(es) que usa cada competidor que reporta. Formato: 'Empresa: GRI Core + TCFD'. Fuente: informe público de cada empresa o GRI database.",
      "temas_materiales_competidores": "Top 3-5 temas que aparecen más frecuentemente en los informes de los competidores consultados. Formato: '1. [Tema] — presente en [N] de [X] competidores analizados'.",
      "tendencias_sector": "Top 3 tendencias de sostenibilidad más relevantes para el sector, con regulación o evento que las impulsa. Formato: '1. [Tendencia] — impulsada por [regulación/driver]'."
    },
    "modelo-de-negocio-estructura": {
      "cambios_estructurales": "Adquisiciones, fusiones, aperturas, cierres o reorganizaciones significativas 2021-2024. Formato: '[Año]: [descripción del cambio]'. Fuente: prensa (Expansión, El Economista), sitio corporativo, BMV.",
      "unidades_distintas": "Sí o No + justificación breve: ¿las unidades de negocio tienen cadenas de valor o perfiles de riesgo materialmente distintos entre sí? Formato: 'Sí/No — [razón en 1-2 oraciones]'."
    },
    "modelo-de-negocio-detalle": {
      "modelos_ingresos": "Cómo genera ingresos: modelo de precios (tarifa fija, variable, comisión, suscripción), si es recurrente o spot, B2B/B2C/gobierno. Fuente: sitio corporativo sección servicios, prensa financiera.",
      "factores_volatilidad": "3-5 factores que hacen variables los ingresos: precios de insumos clave, estacionalidad, tipo de cambio, concentración en pocos clientes. Basado en benchmarks del sector.",
      "propuesta_valor": "Diferenciadores clave vs. competidores en 2-3 oraciones. Fuente: sitio corporativo sección '¿Por qué elegirnos?', 'Diferenciadores' o 'Ventajas competitivas'.",
      "costos_operativos": "Estructura de costos estimada: principales rubros y % aproximado. Siempre indicar al inicio: 'Estimado con benchmarks sectoriales — validar con cliente'. Basado en benchmarks del sector disponibles.",
      "capex_relevante": "Inversiones significativas en infraestructura, equipo o tecnología: monto o % sobre ingresos si disponible. Fuente: prensa, BMV, informe anual.",
      "dependencias_criticas": "Lista numerada de dependencias críticas para la operación: materias primas escasas, proveedores únicos, tecnología o regulaciones clave. Formato: '1. [Dependencia] — riesgo asociado: [tipo]'."
    },
    "cadena-de-valor": {
      "insumos_principales": "Lista de 3-5 principales insumos o materiales para la operación. Fuente: sitio corporativo, informe de sostenibilidad, informes sectoriales.",
      "origen_geografico_insumos": "País o región de origen de cada insumo clave + nivel de riesgo (alto/medio/bajo). Señalar si hay zonas de conflicto, estrés hídrico o riesgo laboral. Fuente: CONAGUA atlas hídrico, informes de trazabilidad.",
      "riesgos_proveedores": "Principales riesgos en cadena de suministro: laborales (condiciones de trabajo), ambientales (contaminación, agua), regulatorios (CTPAT, NOM). Formato: '[Tipo de riesgo]: [descripción]'.",
      "procesos_clave": "3-5 procesos más intensivos en recursos naturales o con mayor riesgo ESG. Formato: '[Proceso] — riesgo principal: [tipo de riesgo ESG]'. Fuente: modelo operativo publicado.",
      "ubicacion_operaciones": "Plantas, CEDIS, almacenes y oficinas principales con ubicación geográfica. Fuente: sitio corporativo sección 'Cobertura', 'Sucursales' o 'Dónde estamos'.",
      "energia_operacion": "Tipo de energía usada (electricidad, gas natural, diésel, solar), si tienen medición sistemática, % de renovables si aplica. Fuente: informe de sostenibilidad o estimado sectorial si no hay reporte.",
      "uso_agua": "Uso de agua en operaciones: fuentes (red municipal, pozo, reciclada), si hay zonas de estrés hídrico (verificar CONAGUA atlas), si tienen medición. Fuente: informe o estimado sectorial.",
      "residuos": "Tipos de residuos: no peligrosos (embalaje, orgánicos) y peligrosos (solventes, aceites, refrigerantes). Si existe sistema formal de reporte o gestión.",
      "relacion_comunidades": "Impactos en comunidades cercanas a operaciones: positivos (empleo local, programas sociales) y negativos (ruido, emisiones, tráfico). Programas comunitarios formales si los hay.",
      "canales_distribucion": "Cómo llega el producto o servicio al cliente: canales propios, distribuidores, e-commerce, franquicias. Fuente: sitio corporativo.",
      "exigencia_clientes_esg": "Nivel de exigencia ESG que los clientes clave imponen al proveedor: certificaciones requeridas, códigos de conducta, auditorías. Fuente: portales de sostenibilidad de proveedores de los clientes clave.",
      "problemas_clientes": "Quejas, incidentes o retiros de producto documentados públicamente 2019-2024. Fuente: COFEPRIS, PROFECO, prensa, registros regulatorios.",
      "riesgos_producto": "Riesgos inherentes al producto o servicio: seguridad para el usuario, inocuidad alimentaria, impacto ambiental, exclusión de usuarios vulnerables.",
      "percepciones_negativas": "Menciones negativas en prensa, redes sociales o foros sectoriales en los últimos 3 años. Formato: '[Fuente]: [tema de la mención negativa — año]'. Fuente: búsqueda web.",
      "fin_vida_producto": "Qué ocurre al final de la vida útil del producto o servicio: reciclaje, disposición final, devolución, reutilización. Oportunidades de economía circular identificadas."
    },
    "riesgos-y-oportunidades": {
      "incidentes_materializados": "Incidentes ESG materializados 2019-2024: sanciones regulatorias, accidentes, controversias públicas. Formato: '[Año]: [incidente] — fuente: [organismo o medio]'. Fuente: SEMARNAT, PROFEPA, STPS, prensa, DOF.",
      "riesgos_operativos": "3-5 riesgos que podrían interrumpir o dañar la operación. Formato: '[Riesgo] — probabilidad: alta/media/baja — base: [razonamiento]'. Basado en sector y geografía de operación.",
      "riesgos_reputacionales": "Riesgos de imagen identificados: temas sensibles del sector, menciones negativas activas, litigios públicos, percepciones en redes sociales.",
      "oportunidades": "3-5 oportunidades de crecimiento o posicionamiento ESG. Formato numerado: '1. [Oportunidad] — [driver o tendencia que la impulsa]'. Incluir: nuevos mercados, subsidios disponibles, clientes que valoran ESG.",
      "planes_expansion": "Planes de expansión de corto (1-2 años), mediano (3-5) y largo plazo (5+). Fuente: prensa, informe anual, comunicados corporativos. Si no hay info pública: 'No publicado — confirmar con cliente'."
    }
  }$hints$::jsonb;

BEGIN
  -- Leer schema actual
  SELECT schema INTO v_schema
  FROM public.questionnaire_templates
  WHERE service_key = 'doble-materialidad';

  IF v_schema IS NULL THEN
    RAISE EXCEPTION 'Template doble-materialidad no encontrado';
  END IF;

  v_steps := v_schema -> 'steps';

  -- Iterar pasos
  FOR v_si IN 0 .. jsonb_array_length(v_steps) - 1 LOOP
    v_step     := v_steps -> v_si;
    v_step_key := v_step ->> 'key';

    -- Solo procesar pasos que tienen hints en el mapa
    CONTINUE WHEN NOT (hints ? v_step_key);

    v_fields := v_step -> 'fields';

    -- Iterar campos
    FOR v_fi IN 0 .. jsonb_array_length(v_fields) - 1 LOOP
      v_field     := v_fields -> v_fi;
      v_field_key := v_field ->> 'key';

      -- Solo campos que tienen hint nuevo
      CONTINUE WHEN NOT (hints -> v_step_key ? v_field_key);

      v_new_hint := hints -> v_step_key ->> v_field_key;

      -- Actualizar hint en el campo
      v_fields := jsonb_set(
        v_fields,
        ARRAY[v_fi::text, 'hint'],
        to_jsonb(v_new_hint)
      );
    END LOOP;

    -- Escribir campos actualizados en el paso
    v_step  := jsonb_set(v_step, '{fields}', v_fields);
    v_steps := jsonb_set(v_steps, ARRAY[v_si::text], v_step);
  END LOOP;

  -- Escribir steps actualizados en el schema
  v_schema := jsonb_set(v_schema, '{steps}', v_steps);

  UPDATE public.questionnaire_templates
  SET    schema     = v_schema,
         updated_at = now()
  WHERE  service_key = 'doble-materialidad';

  RAISE NOTICE 'Hints actualizados en template doble-materialidad';
END $$;
