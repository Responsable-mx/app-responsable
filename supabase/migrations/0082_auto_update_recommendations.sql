-- ──────────────────────────────────────────────────────────────
-- Migración 0082 — Frecuencia recomendada + justificación
--
-- Cada tarea tiene una frecuencia sugerida con razón de negocio.
-- El admin puede usarla tal cual o ajustar según su criterio.
-- ──────────────────────────────────────────────────────────────

alter table public.auto_update_config
  add column if not exists recommended_frequency_days integer
    check (recommended_frequency_days is null or (recommended_frequency_days >= 1 and recommended_frequency_days <= 365)),
  add column if not exists recommendation_reason text;

-- Reportes de competidores: 90 días
update public.auto_update_config
set recommended_frequency_days = 90,
    recommendation_reason = 'Los reportes de sustentabilidad se publican cada 12 meses. Revisar cada 3 meses balancea: detectas el reporte nuevo del competidor en cuanto sale, pero no consumes ancho de banda re-descargando lo mismo. Si bajas a 30 días, gastas Voyage API innecesariamente. Si subes a 180 días, pierdes hasta 6 meses de información nueva.'
where resource_key = 'competitor_reports';

-- Documentos del cliente: 180 días
update public.auto_update_config
set recommended_frequency_days = 180,
    recommendation_reason = 'Los documentos del cliente no cambian solos — son archivos estáticos. Solo conviene reprocesar si mejoramos la herramienta de extracción de texto. 180 días es prudente: cubre 2 ciclos de mejoras del parser por año sin abusar.'
where resource_key = 'client_documents';

-- Benchmarks: 180 días
update public.auto_update_config
set recommended_frequency_days = 180,
    recommendation_reason = 'Un benchmark refleja el estado de los competidores el día que se ejecutó. Después de 6 meses, los competidores publicaron datos nuevos y el contexto regulatorio puede haber cambiado. Esta tarea no regenera — solo avisa al consultor para que decida re-ejecutar.'
where resource_key = 'dm_benchmark_refresh';

-- Memoria IA: 365 días
update public.auto_update_config
set recommended_frequency_days = 365,
    recommendation_reason = 'Solo hace falta cuando actualizamos el modelo de IA que genera la huella numérica (raro: 1-2 veces al año). Frecuencia mayor desperdicia llamadas a Voyage AI sin beneficio. Si Voyage saca modelo nuevo significativamente mejor, conviene bajarlo a 30 días por un mes y luego volver a 365.'
where resource_key = 'embeddings_recompute';

-- Perfil cliente: 180 días
update public.auto_update_config
set recommended_frequency_days = 180,
    recommendation_reason = 'Los datos básicos del cliente (CEO, productos, países, sector) cambian gradualmente. 6 meses captura cambios reales sin saturar al cliente con preguntas redundantes. Si tu cliente está en transformación activa (M&A, expansión), bájalo a 90 días temporalmente.'
where resource_key = 'client_profile_extract';

comment on column public.auto_update_config.recommended_frequency_days is
  'Frecuencia sugerida por el equipo de producto. Visible en UI como badge. Admin puede ignorar y configurar lo que quiera.';

comment on column public.auto_update_config.recommendation_reason is
  'Justificación de negocio de la frecuencia recomendada. Tooltip en UI.';
