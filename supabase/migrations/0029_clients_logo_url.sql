-- Migración 0029: agregar columna logo_url a clients.
--
-- Antes: ClientAvatar siempre renderiza monogram de iniciales (ej "DA"). Look
-- ResponSable ≠ Big4 que muestra logos reales de cliente.
--
-- Después: si logo_url está poblado, ClientAvatar renderiza <img>. Fallback a
-- monogram si null/error. Schema listo para UI upload futura (Storage bucket).

alter table public.clients
  add column if not exists logo_url text;

comment on column public.clients.logo_url is
  'URL pública del logo del cliente. Null = render monogram fallback. Se populará via UI upload (storage bucket) o paste URL manual.';
