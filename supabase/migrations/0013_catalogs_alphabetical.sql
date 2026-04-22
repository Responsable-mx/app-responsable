-- ─────────────────────────────────────────────────────────────
-- 0013 — Reordena catálogos alfabéticamente (es-MX), respetando grupos
-- donde aplique. Excepciones preservadas:
--  - maturity_levels: escala lógica (inicial<gestionado<avanzado<líder).
--  - countries: México primero, resto alfabético (ya en 0011).
--
-- Destructivo (UPDATE) bajo el modo paranoico. Aplicar con
-- `node scripts/apply-sql.mjs supabase/migrations/0013_catalogs_alphabetical.sql --confirm-destructive`.
-- Idempotente — correr N veces da el mismo resultado.
-- ─────────────────────────────────────────────────────────────

-- ── business_segments ───────────────────────────────────────
UPDATE public.catalog_items SET sort_order = 10 WHERE category = 'business_segments' AND value = 'b2b';
UPDATE public.catalog_items SET sort_order = 20 WHERE category = 'business_segments' AND value = 'b2b2c';
UPDATE public.catalog_items SET sort_order = 30 WHERE category = 'business_segments' AND value = 'b2c';
UPDATE public.catalog_items SET sort_order = 40 WHERE category = 'business_segments' AND value = 'b2g';
UPDATE public.catalog_items SET sort_order = 50 WHERE category = 'business_segments' AND value = 'd2c';
UPDATE public.catalog_items SET sort_order = 60 WHERE category = 'business_segments' AND value = 'franchise';
UPDATE public.catalog_items SET sort_order = 70 WHERE category = 'business_segments' AND value = 'wholesale';

-- ── frameworks ──────────────────────────────────────────────
UPDATE public.catalog_items SET sort_order =  10 WHERE category = 'frameworks' AND value = 'cdp';
UPDATE public.catalog_items SET sort_order =  20 WHERE category = 'frameworks' AND value = 'sbti';
UPDATE public.catalog_items SET sort_order =  30 WHERE category = 'frameworks' AND value = 'tcfd';
UPDATE public.catalog_items SET sort_order =  40 WHERE category = 'frameworks' AND value = 'csrd';
UPDATE public.catalog_items SET sort_order =  50 WHERE category = 'frameworks' AND value = 'gri';
UPDATE public.catalog_items SET sort_order =  60 WHERE category = 'frameworks' AND value = 'issb';
UPDATE public.catalog_items SET sort_order =  70 WHERE category = 'frameworks' AND value = 'sasb';
UPDATE public.catalog_items SET sort_order =  80 WHERE category = 'frameworks' AND value = 'esr_cemefi';
UPDATE public.catalog_items SET sort_order =  90 WHERE category = 'frameworks' AND value = 'ilo';
UPDATE public.catalog_items SET sort_order = 100 WHERE category = 'frameworks' AND value = 'oecd';
UPDATE public.catalog_items SET sort_order = 110 WHERE category = 'frameworks' AND value = 'un_global_compact';

-- ── applicable_regulations ──────────────────────────────────
UPDATE public.catalog_items SET sort_order = 10 WHERE category = 'applicable_regulations' AND value = 'csrd_ue';
UPDATE public.catalog_items SET sort_order = 20 WHERE category = 'applicable_regulations' AND value = 'issb_global';
UPDATE public.catalog_items SET sort_order = 30 WHERE category = 'applicable_regulations' AND value = 'sec_climate_us';
UPDATE public.catalog_items SET sort_order = 40 WHERE category = 'applicable_regulations' AND value = 'cnbv_sustentabilidad_mx';
UPDATE public.catalog_items SET sort_order = 50 WHERE category = 'applicable_regulations' AND value = 'ley_cambio_climatico_mx';
UPDATE public.catalog_items SET sort_order = 60 WHERE category = 'applicable_regulations' AND value = 'ley_olimpia_mx';
UPDATE public.catalog_items SET sort_order = 70 WHERE category = 'applicable_regulations' AND value = 'lfpiorpi_mx';
UPDATE public.catalog_items SET sort_order = 80 WHERE category = 'applicable_regulations' AND value = 'nis_mx';
UPDATE public.catalog_items SET sort_order = 90 WHERE category = 'applicable_regulations' AND value = 'nom_035_mx';

-- ── policies ────────────────────────────────────────────────
UPDATE public.catalog_items SET sort_order = 10 WHERE category = 'policies' AND value = 'ambiental';
UPDATE public.catalog_items SET sort_order = 20 WHERE category = 'policies' AND value = 'anticorrupcion';
UPDATE public.catalog_items SET sort_order = 30 WHERE category = 'policies' AND value = 'codigo_conducta';
UPDATE public.catalog_items SET sort_order = 40 WHERE category = 'policies' AND value = 'ddhh';
UPDATE public.catalog_items SET sort_order = 50 WHERE category = 'policies' AND value = 'diversidad';
UPDATE public.catalog_items SET sort_order = 60 WHERE category = 'policies' AND value = 'etica';
UPDATE public.catalog_items SET sort_order = 70 WHERE category = 'policies' AND value = 'proveedores';
UPDATE public.catalog_items SET sort_order = 80 WHERE category = 'policies' AND value = 'salud_seguridad';
UPDATE public.catalog_items SET sort_order = 90 WHERE category = 'policies' AND value = 'sostenibilidad';

-- ── certifications ──────────────────────────────────────────
UPDATE public.catalog_items SET sort_order =  10 WHERE category = 'certifications' AND value = 'fsc';
UPDATE public.catalog_items SET sort_order =  20 WHERE category = 'certifications' AND value = 'iso_14001';
UPDATE public.catalog_items SET sort_order =  30 WHERE category = 'certifications' AND value = 'leed';
UPDATE public.catalog_items SET sort_order =  40 WHERE category = 'certifications' AND value = 'b_corp';
UPDATE public.catalog_items SET sort_order =  50 WHERE category = 'certifications' AND value = 'ecovadis';
UPDATE public.catalog_items SET sort_order =  60 WHERE category = 'certifications' AND value = 'gptw';
UPDATE public.catalog_items SET sort_order =  70 WHERE category = 'certifications' AND value = 'iso_45001';
UPDATE public.catalog_items SET sort_order =  80 WHERE category = 'certifications' AND value = 'esr_cemefi';
UPDATE public.catalog_items SET sort_order =  90 WHERE category = 'certifications' AND value = 'fair_trade';
UPDATE public.catalog_items SET sort_order = 100 WHERE category = 'certifications' AND value = 'iso_26000';

-- ── material_topics ─────────────────────────────────────────
UPDATE public.catalog_items SET sort_order =  10 WHERE category = 'material_topics' AND value = 'agua';
UPDATE public.catalog_items SET sort_order =  20 WHERE category = 'material_topics' AND value = 'biodiversidad';
UPDATE public.catalog_items SET sort_order =  30 WHERE category = 'material_topics' AND value = 'cambio_climatico';
UPDATE public.catalog_items SET sort_order =  40 WHERE category = 'material_topics' AND value = 'economia_circular';
UPDATE public.catalog_items SET sort_order =  50 WHERE category = 'material_topics' AND value = 'residuos';
UPDATE public.catalog_items SET sort_order =  60 WHERE category = 'material_topics' AND value = 'etica';
UPDATE public.catalog_items SET sort_order =  70 WHERE category = 'material_topics' AND value = 'impuestos';
UPDATE public.catalog_items SET sort_order =  80 WHERE category = 'material_topics' AND value = 'privacidad';
UPDATE public.catalog_items SET sort_order =  90 WHERE category = 'material_topics' AND value = 'cadena_suministro';
UPDATE public.catalog_items SET sort_order = 100 WHERE category = 'material_topics' AND value = 'ddhh';
UPDATE public.catalog_items SET sort_order = 110 WHERE category = 'material_topics' AND value = 'diversidad';
UPDATE public.catalog_items SET sort_order = 120 WHERE category = 'material_topics' AND value = 'salud_seguridad';

-- ── sectors ─────────────────────────────────────────────────
UPDATE public.catalog_items SET sort_order =  10 WHERE category = 'sectors' AND value = 'alimentos';
UPDATE public.catalog_items SET sort_order =  20 WHERE category = 'sectors' AND value = 'bebidas';
UPDATE public.catalog_items SET sort_order =  30 WHERE category = 'sectors' AND value = 'consumo_masivo';
UPDATE public.catalog_items SET sort_order =  40 WHERE category = 'sectors' AND value = 'retail';
UPDATE public.catalog_items SET sort_order =  50 WHERE category = 'sectors' AND value = 'banca';
UPDATE public.catalog_items SET sort_order =  60 WHERE category = 'sectors' AND value = 'fintech';
UPDATE public.catalog_items SET sort_order =  70 WHERE category = 'sectors' AND value = 'seguros';
UPDATE public.catalog_items SET sort_order =  80 WHERE category = 'sectors' AND value = 'construccion';
UPDATE public.catalog_items SET sort_order =  90 WHERE category = 'sectors' AND value = 'energia';
UPDATE public.catalog_items SET sort_order = 100 WHERE category = 'sectors' AND value = 'manufactura';
UPDATE public.catalog_items SET sort_order = 110 WHERE category = 'sectors' AND value = 'mineria';
UPDATE public.catalog_items SET sort_order = 120 WHERE category = 'sectors' AND value = 'transporte';
UPDATE public.catalog_items SET sort_order = 130 WHERE category = 'sectors' AND value = 'agropecuario';
UPDATE public.catalog_items SET sort_order = 140 WHERE category = 'sectors' AND value = 'farmaceutico';
UPDATE public.catalog_items SET sort_order = 150 WHERE category = 'sectors' AND value = 'servicios_salud';
UPDATE public.catalog_items SET sort_order = 160 WHERE category = 'sectors' AND value = 'consultoria';
UPDATE public.catalog_items SET sort_order = 170 WHERE category = 'sectors' AND value = 'educacion';
UPDATE public.catalog_items SET sort_order = 180 WHERE category = 'sectors' AND value = 'hospitalidad';
UPDATE public.catalog_items SET sort_order = 190 WHERE category = 'sectors' AND value = 'inmobiliario';
UPDATE public.catalog_items SET sort_order = 200 WHERE category = 'sectors' AND value = 'medios';
UPDATE public.catalog_items SET sort_order = 210 WHERE category = 'sectors' AND value = 'tecnologia';
UPDATE public.catalog_items SET sort_order = 220 WHERE category = 'sectors' AND value = 'telecom';

-- ── revenue_models ──────────────────────────────────────────
UPDATE public.catalog_items SET sort_order =  10 WHERE category = 'revenue_models' AND value = 'contratos';
UPDATE public.catalog_items SET sort_order =  20 WHERE category = 'revenue_models' AND value = 'franquicia';
UPDATE public.catalog_items SET sort_order =  30 WHERE category = 'revenue_models' AND value = 'licenciamiento';
UPDATE public.catalog_items SET sort_order =  40 WHERE category = 'revenue_models' AND value = 'marketplace';
UPDATE public.catalog_items SET sort_order =  50 WHERE category = 'revenue_models' AND value = 'publicidad';
UPDATE public.catalog_items SET sort_order =  60 WHERE category = 'revenue_models' AND value = 'servicios_hora';
UPDATE public.catalog_items SET sort_order =  70 WHERE category = 'revenue_models' AND value = 'servicios_proyecto';
UPDATE public.catalog_items SET sort_order =  80 WHERE category = 'revenue_models' AND value = 'suscripcion';
UPDATE public.catalog_items SET sort_order =  90 WHERE category = 'revenue_models' AND value = 'venta_directa';
UPDATE public.catalog_items SET sort_order = 100 WHERE category = 'revenue_models' AND value = 'venta_mayorista';
