-- Ampliar escala de scores IRO de 1-3 a 1-5
-- Aditiva: solo cambia CHECK constraints.

ALTER TABLE public.client_iro_inventory
  DROP CONSTRAINT IF EXISTS client_iro_inventory_score_impacto_check,
  DROP CONSTRAINT IF EXISTS client_iro_inventory_score_financiero_check;

ALTER TABLE public.client_iro_inventory
  ADD CONSTRAINT client_iro_inventory_score_impacto_check    CHECK (score_impacto    BETWEEN 1 AND 5),
  ADD CONSTRAINT client_iro_inventory_score_financiero_check CHECK (score_financiero BETWEEN 1 AND 5);
