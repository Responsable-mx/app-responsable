-- ──────────────────────────────────────────────────────────────
-- Migración 0081 — Humanizar descripciones de auto_update_config
--
-- Reemplaza jerga técnica (chunks, embeddings, re-parse) por lenguaje
-- de negocio que el admin entiende sin background técnico.
-- ──────────────────────────────────────────────────────────────

update public.auto_update_config
set label = 'Reportes de competidores',
    description = 'Vuelve a descargar el reporte de sustentabilidad de los competidores cuando lleva más de los días configurados desde la última descarga. Útil para benchmarks que usan datos del año anterior y necesitan refrescarse al reporte nuevo del competidor.'
where resource_key = 'competitor_reports';

update public.auto_update_config
set label = 'Documentos del cliente',
    description = 'Vuelve a procesar el contenido de los documentos del cliente (PDF, Word, Excel) que ya están cargados. Útil cuando mejoramos la herramienta que extrae texto de los archivos. No vuelve a descargar nada — solo re-lee lo que ya tienes.'
where resource_key = 'client_documents';

update public.auto_update_config
set label = 'Benchmarks con datos antiguos',
    description = 'Identifica los benchmarks que tienen resultados con más días de los configurados. Los marca como "datos antiguos" para que el consultor sepa que conviene volver a ejecutarlos. No regenera automáticamente — solo avisa.'
where resource_key = 'dm_benchmark_refresh';

update public.auto_update_config
set label = 'Memoria IA de documentos',
    description = 'Vuelve a indexar los documentos para la búsqueda inteligente. La IA usa una "huella numérica" de cada párrafo para encontrar lo relevante en preguntas. Si actualizamos el modelo que genera esa huella, esta tarea recalcula las huellas antiguas para que sigan funcionando bien.'
where resource_key = 'embeddings_recompute';

update public.auto_update_config
set label = 'Perfil del cliente desde su sitio web',
    description = 'Vuelve a leer el sitio web del cliente para actualizar datos básicos del perfil (sector, número de empleados, países, productos). Útil cuando el cliente cambió de CEO, lanzó productos nuevos o abrió mercado nuevo, y tu cuestionario quedó desactualizado.'
where resource_key = 'client_profile_extract';
