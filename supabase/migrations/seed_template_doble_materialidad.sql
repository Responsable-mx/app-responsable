-- Seed: plantilla "Doble Materialidad estándar" — metodología CSRD/GRI/ESRS
-- Idempotente: solo inserta si no existe ya una con el mismo nombre.

INSERT INTO public.stage_templates (name, description, service, data, created_by)
SELECT
  'Doble Materialidad estándar',
  'Metodología completa de evaluación de doble materialidad alineada a CSRD, GRI 3 y ESRS. 6 etapas secuenciales con superposiciones, ~80 días totales. Ajusta offsets si el alcance del cliente lo requiere.',
  'doble_materialidad',
  $json$
{
  "stages": [
    {
      "name": "Diagnóstico inicial",
      "order_index": 0,
      "activities": [
        { "name": "Kickoff con cliente y alineación de alcance", "description": "Reunión inicial: confirmar objetivo, marco de referencia (CSRD/GRI), entregables, calendario, equipo del cliente y nuestro.", "order_index": 0, "offset_start_days": 0, "offset_end_days": 1 },
        { "name": "Recopilación documental inicial", "description": "Reportes anuales, código de ética, política de sostenibilidad, organigrama, estados financieros, certificaciones, notas regulatorias.", "order_index": 1, "offset_start_days": 1, "offset_end_days": 7 },
        { "name": "Análisis del contexto del negocio", "description": "Modelo de negocio, cadena de valor, principales productos/servicios, mercados, geografías, clientes B2B/B2C.", "order_index": 2, "offset_start_days": 5, "offset_end_days": 10 },
        { "name": "Identificación preliminar de stakeholders", "description": "Long-list inicial sin priorizar: empleados, clientes, proveedores, comunidad, inversionistas, reguladores, ONGs, sindicatos.", "order_index": 3, "offset_start_days": 7, "offset_end_days": 10 }
      ]
    },
    {
      "name": "Mapeo de stakeholders",
      "order_index": 1,
      "activities": [
        { "name": "Categorización de stakeholders", "description": "Clasificación por tipo (interno/externo), influencia, dependencia, urgencia. Matriz Mendelow o similar.", "order_index": 0, "offset_start_days": 10, "offset_end_days": 14 },
        { "name": "Priorización para consulta", "description": "Selección de stakeholders clave a consultar (típicamente 8-15 grupos representativos).", "order_index": 1, "offset_start_days": 14, "offset_end_days": 16 },
        { "name": "Diseño del plan de consulta", "description": "Mix de instrumentos: entrevistas profundas (5-10), encuesta amplia (50-200), workshops (1-2). Calendario y responsables.", "order_index": 2, "offset_start_days": 16, "offset_end_days": 20 }
      ]
    },
    {
      "name": "Identificación de temas materiales",
      "order_index": 2,
      "activities": [
        { "name": "Benchmark sectorial", "description": "Análisis de 5-10 empresas peer del sector: temas materiales reportados, frameworks aplicados, brechas vs cliente.", "order_index": 0, "offset_start_days": 15, "offset_end_days": 22 },
        { "name": "Análisis de marcos de referencia", "description": "Mapeo de temas relevantes en GRI Standards, ESRS topics, SASB sectorial, TCFD, ODS aplicables.", "order_index": 1, "offset_start_days": 18, "offset_end_days": 25 },
        { "name": "Long-list de temas candidatos", "description": "Consolidación de 30-50 temas potencialmente materiales con definiciones operativas claras.", "order_index": 2, "offset_start_days": 22, "offset_end_days": 27 },
        { "name": "Mapeo de IROs (impactos, riesgos, oportunidades)", "description": "Para cada tema: identificación de impactos positivos/negativos, riesgos financieros, oportunidades de negocio. Tabla IRO completa.", "order_index": 3, "offset_start_days": 25, "offset_end_days": 30 }
      ]
    },
    {
      "name": "Consulta a stakeholders",
      "order_index": 3,
      "activities": [
        { "name": "Diseño de instrumentos de consulta", "description": "Guion de entrevistas, cuestionario online, agenda de workshops. Validación con cliente antes de campo.", "order_index": 0, "offset_start_days": 25, "offset_end_days": 30 },
        { "name": "Ejecución de entrevistas profundas", "description": "5-10 entrevistas 1-1 con stakeholders clave (60-90 min). Notas estructuradas + grabación si hay consentimiento.", "order_index": 1, "offset_start_days": 30, "offset_end_days": 42 },
        { "name": "Aplicación de encuesta cuantitativa", "description": "Lanzamiento online a base ampliada. Recordatorios día 3 y 7. Meta: 50+ respuestas con representatividad por grupo.", "order_index": 2, "offset_start_days": 32, "offset_end_days": 45 },
        { "name": "Workshops grupales (opcional)", "description": "1-2 sesiones de 2h con grupos focales (empleados, comunidad). Priorización colaborativa de temas.", "order_index": 3, "offset_start_days": 38, "offset_end_days": 48 },
        { "name": "Sistematización de hallazgos", "description": "Codificación de entrevistas, análisis estadístico de encuesta, síntesis cualitativa de workshops.", "order_index": 4, "offset_start_days": 45, "offset_end_days": 50 }
      ]
    },
    {
      "name": "Análisis y priorización",
      "order_index": 4,
      "activities": [
        { "name": "Evaluación de materialidad de impacto", "description": "Por cada tema: severidad, escala, alcance, irremediabilidad, probabilidad. Score 0-10 según ESRS.", "order_index": 0, "offset_start_days": 45, "offset_end_days": 55 },
        { "name": "Evaluación de materialidad financiera", "description": "Por cada tema: magnitud financiera del riesgo/oportunidad, probabilidad, horizonte temporal. Score 0-10.", "order_index": 1, "offset_start_days": 48, "offset_end_days": 58 },
        { "name": "Construcción de matriz doble materialidad", "description": "Plot de los 30-50 temas en plano X (financiera) × Y (impacto). Definición de umbral de materialidad.", "order_index": 2, "offset_start_days": 55, "offset_end_days": 60 },
        { "name": "Validación interna con management", "description": "Sesión con CEO/Sostenibilidad/CFO. Ajustes finales. Cierre de la lista de temas materiales (típicamente 12-20).", "order_index": 3, "offset_start_days": 58, "offset_end_days": 65 }
      ]
    },
    {
      "name": "Reporte y entrega",
      "order_index": 5,
      "activities": [
        { "name": "Redacción del informe completo", "description": "Documento entregable: metodología, mapeo stakeholders, IROs, matriz, temas materiales priorizados, recomendaciones.", "order_index": 0, "offset_start_days": 60, "offset_end_days": 72 },
        { "name": "Diseño visual de la matriz", "description": "Versión gráfica final para portada/comunicación. Incluye encoding de cuadrantes y leyenda accesible (daltónicos).", "order_index": 1, "offset_start_days": 65, "offset_end_days": 72 },
        { "name": "Revisión con cliente (round 1)", "description": "Envío de borrador, sesión de comentarios, recolección de feedback estructurado.", "order_index": 2, "offset_start_days": 72, "offset_end_days": 76 },
        { "name": "Ajustes finales", "description": "Incorporación de comentarios, validación cruzada, QA editorial.", "order_index": 3, "offset_start_days": 75, "offset_end_days": 78 },
        { "name": "Presentación ejecutiva final", "description": "Sesión 1h con board/CEO: hallazgos clave, matriz, próximos pasos sugeridos.", "order_index": 4, "offset_start_days": 78, "offset_end_days": 80 },
        { "name": "Entrega de documento + assets", "description": "PDF final, matriz vectorial editable, dataset de respuestas anonimizadas, presentación.", "order_index": 5, "offset_start_days": 80, "offset_end_days": 80 }
      ]
    }
  ]
}
$json$::jsonb,
  'system-seed'
WHERE NOT EXISTS (
  SELECT 1 FROM public.stage_templates
  WHERE name = 'Doble Materialidad estándar'
);
