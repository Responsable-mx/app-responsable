-- Migración 0031: eliminar política RLS de DELETE en chat_sessions.
--
-- D-32: La migración 0028 creó una política RLS que permite hard-DELETE de filas
-- de chat_sessions a usuarios autenticados vía cliente Supabase directo.
-- El app solo usa soft-archive (PATCH archived_at). El hard-DELETE bypassa el
-- audit trail y permite que un usuario borre sesiones usando el cliente JS de
-- Supabase en devtools, sin pasar por la API.
--
-- Fix: eliminar la política DELETE. Solo el service role (backend) puede hard-delete,
-- lo que requiere pasar por /api/chat-sessions/[id] que siempre usa archivado.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'chat_sessions'
      AND policyname = 'chat_sessions_owner_delete'
  ) THEN
    DROP POLICY chat_sessions_owner_delete ON public.chat_sessions;
  END IF;
END
$$;
