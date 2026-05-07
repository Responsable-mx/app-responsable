-- Vincula cada estándar ESRS con las claves del cuestionario de Doble Materialidad.
-- Cuando el cliente tiene respuesta en esos campos, se inyectan como contexto
-- en el prompt del benchmark (getIroQuestionnaireContext).
-- Keys tomadas del wizard template 'doble-materialidad' (migración 0023 y sucesivas).

UPDATE public.dm_iro_config
SET questionnaire_field_keys = ARRAY['energia_operacion', 'kpis_medidos']
WHERE esrs_standard = 'E1';

UPDATE public.dm_iro_config
SET questionnaire_field_keys = ARRAY['residuos', 'incidentes_materializados', 'riesgos_operativos']
WHERE esrs_standard = 'E2';

UPDATE public.dm_iro_config
SET questionnaire_field_keys = ARRAY['uso_agua']
WHERE esrs_standard = 'E3';

UPDATE public.dm_iro_config
SET questionnaire_field_keys = ARRAY['ubicacion_operaciones', 'origen_geografico_insumos']
WHERE esrs_standard = 'E4';

UPDATE public.dm_iro_config
SET questionnaire_field_keys = ARRAY['residuos', 'fin_vida_producto', 'insumos_principales']
WHERE esrs_standard = 'E5';

UPDATE public.dm_iro_config
SET questionnaire_field_keys = ARRAY['condiciones_laborales', 'empleados']
WHERE esrs_standard = 'S1';

UPDATE public.dm_iro_config
SET questionnaire_field_keys = ARRAY['proveedores_top5', 'riesgos_proveedores', 'criterios_sostenibilidad_proveedores']
WHERE esrs_standard = 'S2';

UPDATE public.dm_iro_config
SET questionnaire_field_keys = ARRAY['relacion_comunidades', 'ubicacion_operaciones']
WHERE esrs_standard = 'S3';

UPDATE public.dm_iro_config
SET questionnaire_field_keys = ARRAY['problemas_clientes', 'riesgos_producto', 'percepciones_negativas', 'exigencia_clientes_esg']
WHERE esrs_standard = 'S4';

UPDATE public.dm_iro_config
SET questionnaire_field_keys = ARRAY['certificaciones', 'frameworks', 'riesgos_reputacionales']
WHERE esrs_standard = 'G1';
