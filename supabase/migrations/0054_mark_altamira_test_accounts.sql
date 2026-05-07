-- Marcar cuentas +altamira@* como is_test_account = true.
-- La migración 0044 solo cubrió @demo-responsable.net; estas cuentas demo usan
-- el patrón +altamira@ y aparecían en los filtros de equipo/ocupación.
UPDATE authorized_users
SET is_test_account = true
WHERE email LIKE '%+altamira%'
  AND (is_test_account = false OR is_test_account IS NULL);
