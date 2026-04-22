-- ─────────────────────────────────────────────────────────────
-- 0011 — Reordena catálogo countries: México primero, resto alfabético
-- (es-MX). Idempotente.
-- Operación: UPDATE sort_order sin cambiar labels ni values.
-- ─────────────────────────────────────────────────────────────

UPDATE public.catalog_items SET sort_order = 10  WHERE category = 'countries' AND value = 'mx';
UPDATE public.catalog_items SET sort_order = 20  WHERE category = 'countries' AND value = 'de';
UPDATE public.catalog_items SET sort_order = 30  WHERE category = 'countries' AND value = 'ar';
UPDATE public.catalog_items SET sort_order = 40  WHERE category = 'countries' AND value = 'br';
UPDATE public.catalog_items SET sort_order = 50  WHERE category = 'countries' AND value = 'ca';
UPDATE public.catalog_items SET sort_order = 60  WHERE category = 'countries' AND value = 'cl';
UPDATE public.catalog_items SET sort_order = 70  WHERE category = 'countries' AND value = 'co';
UPDATE public.catalog_items SET sort_order = 80  WHERE category = 'countries' AND value = 'cr';
UPDATE public.catalog_items SET sort_order = 90  WHERE category = 'countries' AND value = 'es';
UPDATE public.catalog_items SET sort_order = 100 WHERE category = 'countries' AND value = 'us';
UPDATE public.catalog_items SET sort_order = 110 WHERE category = 'countries' AND value = 'fr';
UPDATE public.catalog_items SET sort_order = 120 WHERE category = 'countries' AND value = 'gt';
UPDATE public.catalog_items SET sort_order = 130 WHERE category = 'countries' AND value = 'nl';
UPDATE public.catalog_items SET sort_order = 140 WHERE category = 'countries' AND value = 'pa';
UPDATE public.catalog_items SET sort_order = 150 WHERE category = 'countries' AND value = 'pe';
UPDATE public.catalog_items SET sort_order = 160 WHERE category = 'countries' AND value = 'uk';
UPDATE public.catalog_items SET sort_order = 170 WHERE category = 'countries' AND value = 'do';
