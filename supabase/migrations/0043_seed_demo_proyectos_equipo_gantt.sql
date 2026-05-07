-- ─────────────────────────────────────────────────────────────────────────────
-- 0043 — Columnas Gantt faltantes + 6 proyectos DEMO para evaluar
--         módulo Equipo y herramientas Gantt / Timeline
--
-- Problemas simulados (etiqueta para referencia en pruebas):
--   P01 Sobrecarga          — Ana en 4 proyectos, actividades paralelas
--   P02 Subutilización      — Marco asignado a 2 proyectos, 1 actividad real
--   P03 Solapamiento fechas — mismo consultor, tareas paralelas entre clientes
--   P04 Hito vencido        — is_milestone=true, planned_end pasado, sin cierre
--   P05 Dependencia violada — B inició antes de que A terminara (finish-to-start)
--   P06 Actividad estancada — actual_start set, progreso=0 tras varias semanas
--   P07 Sin asignado        — actividades sin assignee_email
--   P08 Bloqueada           — blocker_note + sin avance
--   P09 Etapa huérfana      — service_stage sin actividades definidas
--   P10 Sin fechas          — planned_start/end NULL (nunca planificada)
--   P11 Sin seniority       — consultor sin nivel en authorized_users
--   P12 Equipo sobredimensionado — 7 personas para proyecto de 3 actividades
--   P13 Desviación baseline — actual_end > baseline_end (retraso medible)
--   P14 Actividad fuera de scope — Director haciendo trabajo junior
--   P15 Fechas imposibles   — planned_start = planned_end, non-milestone
--
-- REVERSIBLE: DELETE FROM public.clients WHERE name ILIKE 'DEMO_%' CASCADE;
--             DELETE FROM public.authorized_users WHERE email LIKE '%@demo-responsable.net';
-- ─────────────────────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════════════════════
-- PARTE 1 — Agregar columnas Gantt que aún no existen en stage_activities
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.stage_activities
  ADD COLUMN IF NOT EXISTS actual_progress integer
    CHECK (actual_progress IS NULL OR (actual_progress >= 0 AND actual_progress <= 100));

ALTER TABLE public.stage_activities
  ADD COLUMN IF NOT EXISTS baseline_start date;

ALTER TABLE public.stage_activities
  ADD COLUMN IF NOT EXISTS baseline_end date;

COMMENT ON COLUMN public.stage_activities.actual_progress IS
  'Avance reportado por el consultor (0–100). NULL = no iniciada o sin reporte.';

COMMENT ON COLUMN public.stage_activities.baseline_start IS
  'Snapshot de fecha inicio al arrancar el proyecto. Contrasta con planned_start que puede moverse.';

COMMENT ON COLUMN public.stage_activities.baseline_end IS
  'Snapshot de fecha fin original. planned_end - baseline_end mide la desviación acumulada.';

-- ════════════════════════════════════════════════════════════════════════════
-- PARTE 2 — Seed de datos DEMO
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  -- ── Emails consultores dummy ───────────────────────────────────────────
  v_ana     text := 'ana.ruiz@demo-responsable.net';
  v_marco   text := 'marco.silva@demo-responsable.net';
  v_lucia   text := 'lucia.torres@demo-responsable.net';
  v_roberto text := 'roberto.garcia@demo-responsable.net';
  v_sofia   text := 'sofia.mendez@demo-responsable.net';
  v_carlos  text := 'carlos.vega@demo-responsable.net';

  -- ── IDs clientes ──────────────────────────────────────────────────────
  c1 uuid; -- Cementera Azteca    (control, bien gestionado)
  c2 uuid; -- Banco del Norte     (P01 sobrecarga + P04 hito + P05 dependencia + P08 bloqueado)
  c3 uuid; -- Tiendas del Sol     (P02 subutilización + P07 sin asignado)
  c4 uuid; -- Petroquímica Veracruz (P03 solapamiento)
  c5 uuid; -- Farmacéutico Mex    (P04 hito + P05 dep + P06 estancado + P13 baseline)
  c6 uuid; -- Inmobiliaria Torres  (P09 huérfana + P10 sin fechas + P11 seniority + P12 sobredim)

  -- ── IDs servicios ─────────────────────────────────────────────────────
  svc1 uuid; svc2 uuid; svc3 uuid; svc4 uuid; svc5 uuid; svc6 uuid;

  -- ── IDs etapas ────────────────────────────────────────────────────────
  -- C1
  st1a uuid; st1b uuid; st1c uuid;
  -- C2
  st2a uuid; st2b uuid; st2c uuid;
  -- C3
  st3a uuid; st3b uuid; st3c uuid;
  -- C4
  st4a uuid; st4b uuid;
  -- C5
  st5a uuid; st5b uuid; st5c uuid;
  -- C6
  st6a uuid; st6b uuid; st6_huerfana uuid;

  -- ── IDs actividades para dependencias ─────────────────────────────────
  -- C2
  a2_reg     uuid;  -- análisis regulatorio (bloqueada)
  a2_entrev  uuid;  -- entrevistas (depende de a2_reg)
  a2_hito1   uuid;  -- hito cierre etapa 1 (vencido)
  a2_mapeo   uuid;  -- mapeo cadena valor (depende de hito que nunca cerró)
  -- C5
  a5_diseno  uuid;  -- diseño metodología
  a5_hito1   uuid;  -- hito aprobación (vencido, bloquea todo)
  a5_enc_int uuid;  -- encuesta interna (inició sin aprobación → dep violada)
  a5_enc_ext uuid;  -- encuesta externa (dep violada)
  a5_scoring uuid;  -- scoring (estancado 0%)

BEGIN

-- ════════════════════════════════════════════════════════════════════════════
-- CONSULTORES DUMMY
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.authorized_users
  (email, role, full_name, seniority_level, active, invited_by)
VALUES
  -- P01: Ana carga todo — sobrecargada
  (v_ana,     'consultor', 'Ana Ruiz',        'senior',    true, 'gwenaelle@responsable.net'),
  -- P02: Marco asignado pero sin actividades — subutilizado
  (v_marco,   'consultor', 'Marco Silva',      'consultor', true, 'gwenaelle@responsable.net'),
  -- P11: Lucia sin seniority definido
  (v_lucia,   'consultor', 'Lucía Torres',     NULL,        true, 'gwenaelle@responsable.net'),
  -- P03: Roberto solapado entre C1 y C4
  (v_roberto, 'consultor', 'Roberto García',   'gerente',   true, 'gwenaelle@responsable.net'),
  -- P14: Sofía (Director) haciendo trabajo junior en C5
  (v_sofia,   'consultor', 'Sofía Méndez',     'director',  true, 'gwenaelle@responsable.net'),
  (v_carlos,  'consultor', 'Carlos Vega',      'senior',    true, 'gwenaelle@responsable.net')
ON CONFLICT (email) DO UPDATE SET
  full_name       = EXCLUDED.full_name,
  seniority_level = EXCLUDED.seniority_level,
  active          = EXCLUDED.active,
  updated_at      = now();

-- ════════════════════════════════════════════════════════════════════════════
-- CLIENTES
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.clients (name, sector, size, created_by, updated_by)
VALUES ('DEMO_Cementera Azteca', 'industrial', 'corporativo', v_roberto, v_roberto)
RETURNING id INTO c1;

INSERT INTO public.clients (name, sector, size, created_by, updated_by)
VALUES ('DEMO_Banco Regional del Norte', 'financiero', 'grande', v_ana, v_ana)
RETURNING id INTO c2;

INSERT INTO public.clients (name, sector, size, created_by, updated_by)
VALUES ('DEMO_Tiendas del Sol', 'consumo', 'corporativo', v_sofia, v_sofia)
RETURNING id INTO c3;

INSERT INTO public.clients (name, sector, size, created_by, updated_by)
VALUES ('DEMO_Petroquímica Veracruz', 'industrial', 'grande', v_roberto, v_roberto)
RETURNING id INTO c4;

INSERT INTO public.clients (name, sector, size, created_by, updated_by)
VALUES ('DEMO_Grupo Farmacéutico Mex', 'salud', 'corporativo', v_carlos, v_carlos)
RETURNING id INTO c5;

INSERT INTO public.clients (name, sector, size, created_by, updated_by)
VALUES ('DEMO_Inmobiliaria Torres', 'servicios', 'mediana', v_lucia, v_lucia)
RETURNING id INTO c6;

-- ════════════════════════════════════════════════════════════════════════════
-- ASIGNACIÓN DE EQUIPO (client_consultors)
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.client_consultors (client_id, user_email, seniority_level, assigned_by)
VALUES
  -- ── C1: Cementera (equipo balanceado, control) ─────────────────────────
  (c1, v_roberto, 'gerente',   'gwenaelle@responsable.net'),
  (c1, v_carlos,  'senior',    'gwenaelle@responsable.net'),
  (c1, v_ana,     'senior',    'gwenaelle@responsable.net'),

  -- ── C2: Banco (P01 Ana hace todo; P02 Marco sin actividades) ──────────
  (c2, v_ana,     'senior',    'gwenaelle@responsable.net'),
  (c2, v_marco,   'consultor', 'gwenaelle@responsable.net'),

  -- ── C3: Tiendas del Sol (P12 5 personas, mayoría sin actividades) ──────
  (c3, v_sofia,   'director',  'gwenaelle@responsable.net'),
  (c3, v_marco,   'consultor', 'gwenaelle@responsable.net'),  -- P02 subutilizado
  (c3, v_lucia,   NULL,        'gwenaelle@responsable.net'),  -- P11 sin seniority
  (c3, v_roberto, 'gerente',   'gwenaelle@responsable.net'),
  (c3, v_carlos,  'senior',    'gwenaelle@responsable.net'),
  (c3, v_ana,     'senior',    'gwenaelle@responsable.net'),  -- P01 también aquí

  -- ── C4: Petroquímica (P03 Roberto y Ana solapan con C1+C2) ────────────
  (c4, v_roberto, 'gerente',   'gwenaelle@responsable.net'),
  (c4, v_ana,     'senior',    'gwenaelle@responsable.net'),
  (c4, v_carlos,  'senior',    'gwenaelle@responsable.net'),

  -- ── C5: Farmacéutico (P14 Sofía-Director en actividad junior) ──────────
  (c5, v_carlos,  'senior',    'gwenaelle@responsable.net'),
  (c5, v_lucia,   'junior',    'gwenaelle@responsable.net'),
  (c5, v_sofia,   'director',  'gwenaelle@responsable.net'),

  -- ── C6: Inmobiliaria (P12 7 personas para proyecto de 6 actividades) ───
  (c6, v_lucia,   NULL,        'gwenaelle@responsable.net'),  -- P11
  (c6, v_marco,   'consultor', 'gwenaelle@responsable.net'),
  (c6, v_ana,     'senior',    'gwenaelle@responsable.net'),  -- P01
  (c6, v_roberto, 'gerente',   'gwenaelle@responsable.net'),
  (c6, v_carlos,  'senior',    'gwenaelle@responsable.net'),
  (c6, v_sofia,   'director',  'gwenaelle@responsable.net'),
  (c6, 'gwenaelle@responsable.net', 'director', 'gwenaelle@responsable.net'),
  (c6, 'elian@responsable.net',     'consultor', 'gwenaelle@responsable.net')
ON CONFLICT (client_id, user_email) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- SERVICIOS
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.client_services (client_id, service, created_by, updated_by)
VALUES (c1, 'doble_materialidad',   v_roberto, v_roberto) RETURNING id INTO svc1;

INSERT INTO public.client_services (client_id, service, created_by, updated_by)
VALUES (c2, 'doble_materialidad',   v_ana,     v_ana)     RETURNING id INTO svc2;

INSERT INTO public.client_services (client_id, service, created_by, updated_by)
VALUES (c3, 'informe_sostenibilidad', v_sofia,  v_sofia)  RETURNING id INTO svc3;

INSERT INTO public.client_services (client_id, service, created_by, updated_by)
VALUES (c4, 'esr',                  v_roberto, v_roberto) RETURNING id INTO svc4;

INSERT INTO public.client_services (client_id, service, created_by, updated_by)
VALUES (c5, 'doble_materialidad',   v_carlos,  v_carlos)  RETURNING id INTO svc5;

-- C6: dos servicios (caos multi-servicio sin coordinación)
INSERT INTO public.client_services (client_id, service, created_by, updated_by)
VALUES (c6, 'doble_materialidad',   v_lucia,   v_lucia)   RETURNING id INTO svc6;

INSERT INTO public.client_services (client_id, service, created_by, updated_by)
VALUES (c6, 'esr',                  v_lucia,   v_lucia);  -- segundo servicio huérfano

-- ════════════════════════════════════════════════════════════════════════════
-- C1: CEMENTERA AZTECA — Proyecto control (bien gestionado, sin problemas)
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.service_stages (client_service_id, name, order_index)
VALUES (svc1, 'Diagnóstico y contexto',    0) RETURNING id INTO st1a;
INSERT INTO public.service_stages (client_service_id, name, order_index)
VALUES (svc1, 'Análisis de materialidad',  1) RETURNING id INTO st1b;
INSERT INTO public.service_stages (client_service_id, name, order_index)
VALUES (svc1, 'Validación y entregable',   2) RETURNING id INTO st1c;

INSERT INTO public.stage_activities
  (stage_id, name, order_index,
   planned_start, planned_end, actual_start, actual_end,
   baseline_start, baseline_end,
   assignee_email, actual_progress, estimated_days, is_milestone)
VALUES
  -- Diagnóstico (completado, en tiempo)
  (st1a, 'Kick-off y onboarding cliente', 0,
   '2026-02-10', '2026-02-14', '2026-02-10', '2026-02-13',
   '2026-02-10', '2026-02-14',
   v_roberto, 100, 5, false),

  (st1a, 'Recopilación de información baseline', 1,
   '2026-02-17', '2026-02-28', '2026-02-17', '2026-02-27',
   '2026-02-17', '2026-02-28',
   v_carlos, 100, 10, false),

  (st1a, 'Hito: cierre diagnóstico', 2,
   '2026-03-03', '2026-03-03', '2026-03-03', '2026-03-03',
   '2026-03-03', '2026-03-03',
   v_roberto, 100, 1, true),

  -- Análisis (en curso, buen ritmo)
  (st1b, 'Encuestas a grupos de interés', 0,
   '2026-03-04', '2026-03-28', '2026-03-04', NULL,
   '2026-03-04', '2026-03-28',
   v_carlos, 80, 18, false),

  (st1b, 'Taller interno priorización', 1,
   '2026-04-01', '2026-04-03', '2026-04-01', '2026-04-02',
   '2026-04-01', '2026-04-03',
   v_roberto, 100, 3, false),

  (st1b, 'Matriz doble materialidad v1', 2,
   '2026-04-07', '2026-04-18', '2026-04-07', NULL,
   '2026-04-07', '2026-04-18',
   v_ana, 65, 8, false),

  -- Validación (futuro, bien planificado)
  (st1c, 'Revisión con dirección sustentabilidad', 0,
   '2026-05-11', '2026-05-15', NULL, NULL,
   '2026-05-11', '2026-05-15',
   v_roberto, NULL, 5, false),

  (st1c, 'Hito: entrega final', 1,
   '2026-05-22', '2026-05-22', NULL, NULL,
   '2026-05-22', '2026-05-22',
   v_roberto, NULL, 1, true);

-- ════════════════════════════════════════════════════════════════════════════
-- C2: BANCO REGIONAL DEL NORTE
-- P01 Ana hace todo · P04 hito vencido · P05 dep violada · P08 bloqueada · P07 sin asignado
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.service_stages (client_service_id, name, order_index)
VALUES (svc2, 'Contexto regulatorio',         0) RETURNING id INTO st2a;
INSERT INTO public.service_stages (client_service_id, name, order_index)
VALUES (svc2, 'Identificación de impactos',   1) RETURNING id INTO st2b;
INSERT INTO public.service_stages (client_service_id, name, order_index)
VALUES (svc2, 'Evaluación y priorización',    2) RETURNING id INTO st2c;

-- Etapa 1 — bloqueada desde semana 3
INSERT INTO public.stage_activities
  (stage_id, name, order_index,
   planned_start, planned_end, actual_start, actual_end,
   baseline_start, baseline_end,
   assignee_email, actual_progress, estimated_days, blocker_note, is_milestone)
VALUES
  (st2a, 'Análisis marco regulatorio CNBV', 0,          -- P08 bloqueada
   '2026-02-02', '2026-02-20', '2026-02-02', NULL,
   '2026-02-02', '2026-02-13',
   v_ana, 40, 15,
   'Cliente no entregó acceso a reportes internos 2025. Solicitud enviada 3 veces desde feb-10. Sin respuesta.',
   false)
RETURNING id INTO a2_reg;

INSERT INTO public.stage_activities
  (stage_id, name, order_index,
   planned_start, planned_end, actual_start, actual_end,
   baseline_start, baseline_end,
   assignee_email, actual_progress, estimated_days, blocker_note, is_milestone,
   depends_on_activity_id)
VALUES
  (st2a, 'Entrevistas comité de riesgos ESG', 1,        -- P05 dep: espera a a2_reg; P08 bloqueada
   '2026-02-23', '2026-03-13', NULL, NULL,
   '2026-02-23', '2026-03-06',
   v_ana, 0, 12,
   'Pendiente cierre análisis regulatorio. Entrevistas reprogramadas 3 veces.',
   false,
   a2_reg)
RETURNING id INTO a2_entrev;

INSERT INTO public.stage_activities
  (stage_id, name, order_index,
   planned_start, planned_end, actual_start, actual_end,
   baseline_start, baseline_end,
   assignee_email, actual_progress, estimated_days, is_milestone)
VALUES
  (st2a, 'Hito: cierre contexto regulatorio', 2,        -- P04 hito vencido
   '2026-03-16', '2026-03-16', NULL, NULL,
   '2026-03-16', '2026-03-16',
   v_ana, 0, 1, true)
RETURNING id INTO a2_hito1;

-- Etapa 2 — inició sin cerrar etapa 1 (P05 dependencia violada)
INSERT INTO public.stage_activities
  (stage_id, name, order_index,
   planned_start, planned_end, actual_start, actual_end,
   baseline_start, baseline_end,
   assignee_email, actual_progress, estimated_days, is_milestone,
   depends_on_activity_id)
VALUES
  (st2b, 'Mapeo cadena de valor financiero', 0,          -- P05 inició antes de que a2_hito1 cerrara
   '2026-03-17', '2026-04-10', '2026-03-18', NULL,
   '2026-03-17', '2026-04-03',
   v_ana, 25, 18, false,
   a2_hito1)
RETURNING id INTO a2_mapeo;

INSERT INTO public.stage_activities
  (stage_id, name, order_index,
   planned_start, planned_end, actual_start, actual_end,
   baseline_start, baseline_end,
   assignee_email, actual_progress, estimated_days, blocker_note, is_milestone)
VALUES
  (st2b, 'Análisis impactos físicos y transición', 1,   -- P08 bloqueada esperando anterior
   '2026-04-13', '2026-04-30', '2026-04-14', NULL,
   '2026-04-06', '2026-04-24',
   v_ana, 10, 15,
   'No puede avanzar hasta que mapeo cadena de valor llegue a 80%+ (actualmente 25%).',
   false),

  (st2b, 'Taller stakeholders internos', 2,              -- P02 Marco asignado aquí, única actividad
   '2026-04-14', '2026-04-16', NULL, NULL,
   '2026-04-14', '2026-04-16',
   v_marco, 0, 3, NULL, false),

-- Etapa 3 — todo sin asignado (P07)
  (st2c, 'Scoring de materialidad doble', 0,             -- P07
   '2026-05-04', '2026-05-15', NULL, NULL,
   '2026-05-04', '2026-05-15',
   NULL, NULL, 10, NULL, false),

  (st2c, 'Revisión con Alta Dirección', 1,               -- P07
   '2026-05-18', '2026-05-19', NULL, NULL,
   '2026-05-18', '2026-05-19',
   NULL, NULL, 2, NULL, false),

  (st2c, 'Hito: entrega informe preliminar', 2,          -- P07 milestone sin asignado
   '2026-05-22', '2026-05-22', NULL, NULL,
   '2026-05-22', '2026-05-22',
   NULL, NULL, 1, NULL, true);

-- (dependencias C2 inyectadas directamente en los INSERT anteriores)

-- ════════════════════════════════════════════════════════════════════════════
-- C3: TIENDAS DEL SOL
-- P02 subutilización · P07 sin asignado · P12 equipo sobredimensionado
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.service_stages (client_service_id, name, order_index)
VALUES (svc3, 'Levantamiento de información', 0) RETURNING id INTO st3a;
INSERT INTO public.service_stages (client_service_id, name, order_index)
VALUES (svc3, 'Elaboración del informe',      1) RETURNING id INTO st3b;
INSERT INTO public.service_stages (client_service_id, name, order_index)
VALUES (svc3, 'Revisión y publicación',       2) RETURNING id INTO st3c;

INSERT INTO public.stage_activities
  (stage_id, name, order_index,
   planned_start, planned_end, actual_start, actual_end,
   assignee_email, actual_progress, estimated_days, is_milestone)
VALUES
  -- Solo Sofía activa, Marco y 4 más en equipo pero sin nada
  (st3a, 'Inventario de indicadores GRI disponibles', 0,
   '2026-01-12', '2026-02-06', '2026-01-12', '2026-02-05',
   v_sofia, 100, 20, false),

  (st3a, 'Recolección de datos operativos', 1,          -- P02 Marco en equipo pero sin actividades
   '2026-02-09', '2026-03-06', '2026-02-09', NULL,
   v_sofia, 70, 20, false),

  (st3a, 'Validación datos con áreas internas', 2,      -- P07 nadie asignado (6 personas en equipo)
   '2026-03-09', '2026-03-27', NULL, NULL,
   NULL, NULL, 15, false),

  -- Etapa elaboración: nadie (P07)
  (st3b, 'Redacción capítulos ambientales', 0,           -- P07
   '2026-03-30', '2026-04-24', NULL, NULL,
   NULL, NULL, 20, false),

  (st3b, 'Redacción capítulos sociales y gobernanza', 1, -- P07 mismas fechas que anterior (solapamiento interno)
   '2026-03-30', '2026-04-24', NULL, NULL,
   NULL, NULL, 20, false),

  (st3b, 'Revisión interna equipo', 2,                   -- P07
   '2026-04-27', '2026-05-08', NULL, NULL,
   NULL, NULL, 10, false),

  -- Revisión y publicación (futuro)
  (st3c, 'Revisión Dirección General', 0,
   '2026-05-11', '2026-05-15', NULL, NULL,
   NULL, NULL, 5, false),

  (st3c, 'Diseño y maquetación informe', 1,
   '2026-05-18', '2026-06-05', NULL, NULL,
   NULL, NULL, 15, false),

  (st3c, 'Hito: publicación y divulgación', 2,
   '2026-06-08', '2026-06-08', NULL, NULL,
   NULL, NULL, 1, true);

-- ════════════════════════════════════════════════════════════════════════════
-- C4: PETROQUÍMICA VERACRUZ
-- P03 solapamiento — Roberto y Ana tienen actividades paralelas a C1 y C2
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.service_stages (client_service_id, name, order_index)
VALUES (svc4, 'Diagnóstico ESR',              0) RETURNING id INTO st4a;
INSERT INTO public.service_stages (client_service_id, name, order_index)
VALUES (svc4, 'Plan de acción y certificación', 1) RETURNING id INTO st4b;

INSERT INTO public.stage_activities
  (stage_id, name, order_index,
   planned_start, planned_end, actual_start, actual_end,
   assignee_email, actual_progress, estimated_days, is_milestone)
VALUES
  -- Roberto: P03 solapa con C1 (C1/st1b taller 01-abr – 03-abr, aquí también abr)
  (st4a, 'Diagnóstico inicial ESR Cemefi', 0,
   '2026-03-16', '2026-04-10', '2026-03-16', NULL,
   v_roberto, 50, 18, false),

  -- Ana: P03 solapa con C2 (Ana ya tiene 4 actividades activas en C2 mismo período)
  (st4a, 'Análisis indicadores responsabilidad social', 1,
   '2026-03-23', '2026-04-17', '2026-03-23', NULL,
   v_ana, 35, 20, false),

  -- Roberto P03 solapamiento interno (taller mismo rango que diagnóstico)
  (st4a, 'Taller liderazgo y ética empresarial', 2,
   '2026-04-06', '2026-04-10', NULL, NULL,
   v_roberto, NULL, 5, false),

  -- Plan de acción (Roberto y Ana ya comprometidos en C1/C2 en mismas fechas)
  (st4b, 'Diseño plan de acción ESR', 0,
   '2026-04-20', '2026-05-15', NULL, NULL,
   v_roberto, NULL, 20, false),

  (st4b, 'Preparación expediente Cemefi', 1,
   '2026-05-18', '2026-06-12', NULL, NULL,
   v_ana, NULL, 20, false),

  (st4b, 'Hito: presentación a consejo directivo', 2,
   '2026-06-15', '2026-06-15', NULL, NULL,
   v_roberto, NULL, 1, true);

-- ════════════════════════════════════════════════════════════════════════════
-- C5: GRUPO FARMACÉUTICO MEX
-- P04 hito vencido · P05 dep violada · P06 estancada · P13 desviación baseline · P14 Sofía-Director tarea junior
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.service_stages (client_service_id, name, order_index)
VALUES (svc5, 'Preparación metodológica', 0) RETURNING id INTO st5a;
INSERT INTO public.service_stages (client_service_id, name, order_index)
VALUES (svc5, 'Recolección y análisis',   1) RETURNING id INTO st5b;
INSERT INTO public.service_stages (client_service_id, name, order_index)
VALUES (svc5, 'Síntesis y entrega',       2) RETURNING id INTO st5c;

-- Etapa 1
INSERT INTO public.stage_activities
  (stage_id, name, order_index,
   planned_start, planned_end, actual_start, actual_end,
   baseline_start, baseline_end,
   assignee_email, actual_progress, estimated_days, is_milestone)
VALUES
  -- P13 terminó tarde: actual_end > baseline_end
  (st5a, 'Diseño metodología doble materialidad', 0,
   '2026-01-19', '2026-02-13', '2026-01-19', '2026-02-20',  -- actual_end 7 días tarde
   '2026-01-19', '2026-02-06',                               -- baseline era más corto aún
   v_carlos, 100, 20, false)
RETURNING id INTO a5_diseno;

INSERT INTO public.stage_activities
  (stage_id, name, order_index,
   planned_start, planned_end, actual_start, actual_end,
   baseline_start, baseline_end,
   assignee_email, actual_progress, estimated_days, blocker_note, is_milestone)
VALUES
  -- P04 hito vencido (feb-13, sin actual_end); P14 Sofía Director aprobando metodología — nivel correcto pero tarea administrativa
  (st5a, 'Hito: aprobación metodología por dirección', 1,
   '2026-02-13', '2026-02-13', NULL, NULL,
   '2026-02-13', '2026-02-13',
   v_sofia, 0, 1,
   'Directora de Sustentabilidad en licencia médica desde feb-10. Sin sustituto designado para firma.',
   true)
RETURNING id INTO a5_hito1;

-- Etapa 2 — inició sin cerrar hito (P05 dependencia violada)
INSERT INTO public.stage_activities
  (stage_id, name, order_index,
   planned_start, planned_end, actual_start, actual_end,
   baseline_start, baseline_end,
   assignee_email, actual_progress, estimated_days, blocker_note, is_milestone,
   depends_on_activity_id)
VALUES
  -- P05 violación: inició feb-23 aunque a5_hito1 nunca se completó
  -- P14 Lucía (junior) hace encuestas sin metodología aprobada
  (st5b, 'Encuesta a grupos de interés internos', 0,
   '2026-02-16', '2026-03-13', '2026-02-23', NULL,
   '2026-02-16', '2026-03-06',
   v_lucia, 15, 20,
   'Instrumento no aprobado formalmente. Respuestas llegan pero validez metodológica en duda.',
   false,
   a5_hito1)
RETURNING id INTO a5_enc_int;

INSERT INTO public.stage_activities
  (stage_id, name, order_index,
   planned_start, planned_end, actual_start, actual_end,
   baseline_start, baseline_end,
   assignee_email, actual_progress, estimated_days, blocker_note, is_milestone,
   depends_on_activity_id)
VALUES
  -- P05 violación encadenada; P14 Sofía-Director aplicando encuestas (tarea junior)
  (st5b, 'Encuesta a grupos de interés externos', 1,
   '2026-02-16', '2026-03-27', '2026-03-01', NULL,
   '2026-02-16', '2026-03-13',
   v_sofia, 8, 30,
   'Base de datos stakeholders externos incompleta: 40 de 200 contactados. Sin avance desde mar-20.',
   false,
   a5_enc_int)
RETURNING id INTO a5_enc_ext;

INSERT INTO public.stage_activities
  (stage_id, name, order_index,
   planned_start, planned_end, actual_start, actual_end,
   baseline_start, baseline_end,
   assignee_email, actual_progress, estimated_days, blocker_note, is_milestone,
   depends_on_activity_id)
VALUES
  -- P06 estancada: inició mar-18, progreso=0 después de 7 semanas
  (st5b, 'Análisis y scoring de impactos', 2,
   '2026-03-16', '2026-04-17', '2026-03-18', NULL,
   '2026-03-09', '2026-03-27',
   v_carlos, 0, 25,
   'No puede avanzar: encuestas internas al 15% y externas al 8%. Equipo en círculo de dependencias.',
   false,
   a5_enc_ext)
RETURNING id INTO a5_scoring;

-- Etapa 3 — fechas ya vencidas, nadie iniciado
INSERT INTO public.stage_activities
  (stage_id, name, order_index,
   planned_start, planned_end, actual_start, actual_end,
   assignee_email, actual_progress, estimated_days, is_milestone)
VALUES
  (st5c, 'Síntesis narrativa y recomendaciones', 0,     -- debería haber iniciado abr-20
   '2026-04-20', '2026-05-08', NULL, NULL,
   v_carlos, NULL, 15, false),

  (st5c, 'Validación interna y ajustes', 1,
   '2026-05-11', '2026-05-22', NULL, NULL,
   v_sofia, NULL, 10, false),

  (st5c, 'Hito: entrega final estudio DM', 2,
   '2026-05-29', '2026-05-29', NULL, NULL,
   v_sofia, NULL, 1, true);

-- (dependencias C5 inyectadas directamente en los INSERT anteriores)

-- ════════════════════════════════════════════════════════════════════════════
-- C6: INMOBILIARIA TORRES — Caos total (todos los problemas menores)
-- P09 etapa huérfana · P10 sin fechas · P11 Lucía sin seniority · P12 sobredimensionado · P15 fechas imposibles
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.service_stages (client_service_id, name, order_index)
VALUES (svc6, 'Contexto y alcance',         0) RETURNING id INTO st6a;
INSERT INTO public.service_stages (client_service_id, name, order_index)
VALUES (svc6, 'Análisis de materialidad',   1) RETURNING id INTO st6b;

-- P09: etapa huérfana — sin actividades (se queda vacía intencionalmente)
INSERT INTO public.service_stages (client_service_id, name, order_index)
VALUES (svc6, 'Entrega — pendiente definir actividades', 2) RETURNING id INTO st6_huerfana;

INSERT INTO public.stage_activities
  (stage_id, name, order_index,
   planned_start, planned_end, actual_start, actual_end,
   assignee_email, actual_progress, estimated_days, blocker_note, is_milestone)
VALUES
  -- Única actividad completada (8 personas en equipo, solo Lucía hizo algo)
  (st6a, 'Primera reunión de alcance', 0,
   '2026-04-06', '2026-04-07', '2026-04-06', '2026-04-07',
   v_lucia, 100, 2, NULL, false),

  -- Vencida, Lucía bloqueada sin acceso
  (st6a, 'Recopilación de documentos societarios', 1,
   '2026-04-08', '2026-04-22', NULL, NULL,
   v_lucia, 0, 10,
   'Sin acceso al sistema documental del cliente. Solicitud enviada 08-abr, sin respuesta a la fecha.',
   false),

  -- P15 fechas imposibles: end = start, non-milestone (0 días laborables)
  (st6a, 'Revisión marco legal inmobiliario', 2,
   '2026-04-14', '2026-04-14', NULL, NULL,              -- un solo día, no es hito
   v_marco, 0, 1, NULL, false),

  -- P07 + P10: sin asignado Y ya vencida
  (st6b, 'Identificación temas materiales sector', 0,
   '2026-04-23', '2026-05-08', NULL, NULL,
   NULL, NULL, 12, NULL, false),

  -- Solapamiento de fechas con actividad anterior
  (st6b, 'Priorización con matriz X/Y', 1,
   '2026-05-04', '2026-05-15', NULL, NULL,
   NULL, NULL, 10, NULL, false),

  -- P10: sin fechas, nunca planificada formalmente
  (st6b, 'Revisión borrador metodología', 2,
   NULL, NULL, NULL, NULL,
   v_ana, NULL, NULL,
   'Agregada en comentario de reunión. Nunca ingresada al plan formal.',
   false);

-- st6_huerfana queda sin actividades — etapa P09

END $$;
