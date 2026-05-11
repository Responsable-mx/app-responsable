-- 0074_dm_iro_pos_override.sql
-- Agrega coordenadas X/Y editables para la matriz de doble materialidad.
-- Permite al consultor reposicionar manualmente un IRO sin alterar su score 1-3
-- (que vive en `score_impacto` / `score_financiero` para preservar la rúbrica
-- ESRS de severidad/probabilidad). Rango 0-10 alineado al render visual.
--
-- Aditiva — sin defaults destructivos, sin backfill obligatorio.
-- Cuando pos_x/pos_y son NULL, la matriz deriva la coordenada del score:
--   coord = ((score - 1) / 2) * 10  → 1=0, 2=5, 3=10
--
-- pos_override = true cuando el consultor capturó valores manualmente — usado
-- para mostrar la chip "⚠ Ajustada" en el popover (pattern mockup-v7).

ALTER TABLE client_iro_inventory
  ADD COLUMN IF NOT EXISTS pos_x        numeric(4,2) CHECK (pos_x        IS NULL OR (pos_x        BETWEEN 0 AND 10)),
  ADD COLUMN IF NOT EXISTS pos_y        numeric(4,2) CHECK (pos_y        IS NULL OR (pos_y        BETWEEN 0 AND 10)),
  ADD COLUMN IF NOT EXISTS pos_override boolean NOT NULL DEFAULT false;
