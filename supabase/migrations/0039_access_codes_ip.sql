-- D-70: IP rate limiting en send-code
-- Agrega ip_address a access_codes para contar requests por IP en ventana de 5 min.

ALTER TABLE access_codes ADD COLUMN IF NOT EXISTS ip_address TEXT;
