--===========================================================================
-- 14. PHASE 4R FIX — flat unique on notifications.dedupe_key
--
--   The original 00013 migration created a PARTIAL unique index on
--   notifications(dedupe_key) WHERE dedupe_key IS NOT NULL. PostgREST's
--   `on_conflict` upsert can only infer a conflict target against a plain
--   unique (non-partial) constraint, so every notification insert failed
--   silently (createNotification ignores the error). This replaces the
--   partial index with a full unique index: PostgreSQL already permits
--   multiple NULL rows in a unique index, so event-driven notifications
--   (NULL dedupe_key) remain unlimited while reminder sweeps stay
--   idempotent via `upsert … ignoreDuplicates`.
--===========================================================================

drop index if exists public.notifications_dedupe_key_idx;

create unique index if not exists notifications_dedupe_key_uniq
    on public.notifications (dedupe_key);