-- ============================================================================
-- Phase 4L follow-up — audit events for client/version management actions.
-- Appends new values to the existing enum (Postgres allows non-concurrent
-- ALTER TYPE ADD VALUE; the lexer emits it in the same tx).
-- ============================================================================

alter type public.delivery_activity_type add value if not exists 'delivery_archived';
alter type public.delivery_activity_type add value if not exists 'delivery_unarchived';
alter type public.delivery_activity_type add value if not exists 'version_archived';
alter type public.delivery_activity_type add value if not exists 'version_deleted';
alter type public.delivery_activity_type add value if not exists 'delivery_mode_changed';