-- 20260924000002_grant_service_role_admin_privileges.sql
-- Photography Pixel — corrective grants for the server-side (service_role) client.
--
-- On real Supabase projects, tables created via `supabase db push` only receive
-- the non-DML object grants (REFERENCES/TRIGGER/TRUNCATE) automatically, so the
-- service_role client hit "permission denied for table roles" when the admin
-- routes/bootstrap tried to read or write the RBAC tables.
--
-- The service_role key is used exclusively by server-side code (Cloudflare Pages
-- Functions and scripts) and is never exposed to the browser. RLS still protects
-- the authenticated/anon access paths.

grant all privileges on table public.roles     to service_role;
grant all privileges on table public.app_users to service_role;