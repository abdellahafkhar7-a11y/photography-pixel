-- 20260927000008_profile_settings.sql
-- Photography Pixel — admin profile avatar support.
-- Adds a single nullable column to app_users: avatar_key.
--
-- Display name reuses the existing app_users.full_name column (no new column).
-- The avatar is stored in the existing private R2 bucket under:
--
--     avatars/{user-id}/profile.{jpg|png|webp}
--
-- and served only through the authenticated /admin/avatar route. Only the
-- R2 object key is persisted here (never bytes, never a public URL).

alter table public.app_users
    add column if not exists avatar_key text;