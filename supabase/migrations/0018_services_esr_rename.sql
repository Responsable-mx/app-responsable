-- ─────────────────────────────────────────────────────────────
-- 0018 — Renombra ESR (CEMEFI) → ESR en catálogo services.
-- El certificado mantiene 'esr_cemefi' en catálogo 'certifications'
-- (no se toca). Aquí solo el servicio que presta ResponSable.
-- Destructivo bajo modo paranoico. Aplicar con --confirm-destructive.
-- ─────────────────────────────────────────────────────────────

UPDATE public.catalog_items
  SET value = 'esr', label = 'ESR'
  WHERE category = 'services' AND value = 'esr_cemefi';
