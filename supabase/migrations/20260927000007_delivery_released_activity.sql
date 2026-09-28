-- ============================================================================
-- Phase 4K/4L E2E follow-up — audit event for the owner's formal release.
-- Appends a new value to the existing enum (same pattern as 000006).
-- ============================================================================

alter type public.delivery_activity_type add value if not exists 'delivery_released';