-- Dummy data para Altamira: aplica plantilla Doble Materialidad estándar
-- + fechas reales realistas + assignees rotando entre 3 consultores.
-- Fecha base = 2026-04-15 (hace 20 días). Today = 2026-05-05 → día 20 del proyecto.
-- Estados resultantes:
--  - Diagnóstico (0-10d): completed
--  - Mapeo stakeholders (10-20d): completed/in_progress
--  - Identificación temas (15-30d): in_progress
--  - Consulta (25-50d): in_progress (algunas delayed)
--  - Análisis (45-65d): pending
--  - Reporte (60-80d): pending

DO $$
DECLARE
  cs_id uuid := 'aaaaaaaa-1111-1111-1111-111111111111';
  base_date date := '2026-04-01';
  today date := CURRENT_DATE;
  s_id uuid;
  a_id uuid;
  -- Cycle 3 assignees
  consultors text[] := ARRAY['gwenaelle@responsable.net', 'nblondel@s-peak.com', 'elian@responsable.net'];
BEGIN
  -- Limpiar previo (idempotente)
  DELETE FROM public.stage_activities sa
    USING public.service_stages ss
    WHERE sa.stage_id = ss.id AND ss.client_service_id = cs_id;
  DELETE FROM public.service_stages WHERE client_service_id = cs_id;

  -- Etapa 1: Diagnóstico inicial (0-10) — TODAS completed
  INSERT INTO service_stages(client_service_id, name, order_index) VALUES (cs_id, 'Diagnóstico inicial', 0) RETURNING id INTO s_id;

  INSERT INTO stage_activities(stage_id, name, order_index, planned_start, planned_end, actual_start, actual_end, assignee_email)
  VALUES
    (s_id, 'Kickoff con cliente y alineación de alcance', 0, base_date, base_date + 1, base_date, base_date + 1, consultors[1]),
    (s_id, 'Recopilación documental inicial', 1, base_date + 1, base_date + 7, base_date + 1, base_date + 6, consultors[2]),
    (s_id, 'Análisis del contexto del negocio', 2, base_date + 5, base_date + 10, base_date + 5, base_date + 9, consultors[3]),
    (s_id, 'Identificación preliminar de stakeholders', 3, base_date + 7, base_date + 10, base_date + 7, base_date + 11, consultors[1]);

  -- Etapa 2: Mapeo stakeholders (10-20) — completed
  INSERT INTO service_stages(client_service_id, name, order_index) VALUES (cs_id, 'Mapeo de stakeholders', 1) RETURNING id INTO s_id;
  INSERT INTO stage_activities(stage_id, name, order_index, planned_start, planned_end, actual_start, actual_end, assignee_email)
  VALUES
    (s_id, 'Categorización de stakeholders', 0, base_date + 10, base_date + 14, base_date + 10, base_date + 14, consultors[2]),
    (s_id, 'Priorización para consulta', 1, base_date + 14, base_date + 16, base_date + 14, base_date + 17, consultors[3]),
    (s_id, 'Diseño del plan de consulta', 2, base_date + 16, base_date + 20, base_date + 16, base_date + 20, consultors[1]);

  -- Etapa 3: Identificación temas (15-30) — mix completed/delayed/in_progress
  INSERT INTO service_stages(client_service_id, name, order_index) VALUES (cs_id, 'Identificación de temas materiales', 2) RETURNING id INTO s_id;
  INSERT INTO stage_activities(stage_id, name, order_index, planned_start, planned_end, actual_start, actual_end, assignee_email)
  VALUES
    -- completada
    (s_id, 'Benchmark sectorial', 0, base_date + 15, base_date + 22, base_date + 15, base_date + 21, consultors[2]),
    -- completada con retraso pero ya terminada
    (s_id, 'Análisis de marcos de referencia', 1, base_date + 18, base_date + 25, base_date + 18, base_date + 28, consultors[3]),
    -- DELAYED — planned_end ya pasó, sin actual_end (today = day 34, planned_end = day 27)
    (s_id, 'Long-list de temas candidatos', 2, base_date + 22, base_date + 27, base_date + 22, NULL, consultors[1]),
    -- DELAYED — sin arrancar siquiera
    (s_id, 'Mapeo de IROs (impactos, riesgos, oportunidades)', 3, base_date + 25, base_date + 30, NULL, NULL, consultors[2]);

  -- Etapa 4: Consulta stakeholders (25-50) — in_progress + delayed
  INSERT INTO service_stages(client_service_id, name, order_index) VALUES (cs_id, 'Consulta a stakeholders', 3) RETURNING id INTO s_id;
  INSERT INTO stage_activities(stage_id, name, order_index, planned_start, planned_end, actual_start, actual_end, assignee_email)
  VALUES
    -- in_progress
    (s_id, 'Diseño de instrumentos de consulta', 0, base_date + 25, base_date + 30, base_date + 25, NULL, consultors[3]),
    -- pending
    (s_id, 'Ejecución de entrevistas profundas', 1, base_date + 30, base_date + 42, NULL, NULL, consultors[1]),
    (s_id, 'Aplicación de encuesta cuantitativa', 2, base_date + 32, base_date + 45, NULL, NULL, consultors[2]),
    (s_id, 'Workshops grupales (opcional)', 3, base_date + 38, base_date + 48, NULL, NULL, consultors[3]),
    (s_id, 'Sistematización de hallazgos', 4, base_date + 45, base_date + 50, NULL, NULL, consultors[1]);

  -- Etapa 5: Análisis y priorización (45-65) — pending
  INSERT INTO service_stages(client_service_id, name, order_index) VALUES (cs_id, 'Análisis y priorización', 4) RETURNING id INTO s_id;
  INSERT INTO stage_activities(stage_id, name, order_index, planned_start, planned_end, actual_start, actual_end, assignee_email)
  VALUES
    (s_id, 'Evaluación de materialidad de impacto', 0, base_date + 45, base_date + 55, NULL, NULL, consultors[2]),
    (s_id, 'Evaluación de materialidad financiera', 1, base_date + 48, base_date + 58, NULL, NULL, consultors[3]),
    (s_id, 'Construcción de matriz doble materialidad', 2, base_date + 55, base_date + 60, NULL, NULL, consultors[1]),
    (s_id, 'Validación interna con management', 3, base_date + 58, base_date + 65, NULL, NULL, consultors[2]);

  -- Etapa 6: Reporte y entrega (60-80) — pending
  INSERT INTO service_stages(client_service_id, name, order_index) VALUES (cs_id, 'Reporte y entrega', 5) RETURNING id INTO s_id;
  INSERT INTO stage_activities(stage_id, name, order_index, planned_start, planned_end, actual_start, actual_end, assignee_email)
  VALUES
    (s_id, 'Redacción del informe completo', 0, base_date + 60, base_date + 72, NULL, NULL, consultors[1]),
    (s_id, 'Diseño visual de la matriz', 1, base_date + 65, base_date + 72, NULL, NULL, consultors[3]),
    (s_id, 'Revisión con cliente (round 1)', 2, base_date + 72, base_date + 76, NULL, NULL, consultors[2]),
    (s_id, 'Ajustes finales', 3, base_date + 75, base_date + 78, NULL, NULL, consultors[1]),
    (s_id, 'Presentación ejecutiva final', 4, base_date + 78, base_date + 80, NULL, NULL, consultors[2]),
    (s_id, 'Entrega de documento + assets', 5, base_date + 80, base_date + 80, NULL, NULL, consultors[3]);

  -- Asignar consultores al cliente para que aparezcan en /equipo
  INSERT INTO client_consultors(client_id, user_email, seniority_level)
  SELECT '11111111-1111-1111-1111-111111111111', email, NULL
  FROM unnest(consultors) email
  ON CONFLICT (client_id, user_email) DO NOTHING;

  RAISE NOTICE 'Seed Altamira completado: 6 etapas, 26 actividades, 3 consultores asignados';
END $$;
