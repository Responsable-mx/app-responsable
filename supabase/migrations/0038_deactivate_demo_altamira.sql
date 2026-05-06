UPDATE public.authorized_users
SET active = false, updated_at = now()
WHERE email = 'demo@altamira.mx';
