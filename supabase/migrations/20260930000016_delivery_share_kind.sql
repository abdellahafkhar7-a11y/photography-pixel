-- 20260930000016_delivery_share_kind.sql
-- Photography Pixel — Phase 5A separation:
--   OWNER CLIENT DELIVERY   vs   COORDINATOR TEMPORARY SHARE
--
-- These are two different products that happened to share one table:
--
--   client_delivery  The Owner-managed Client Delivery workflow on PC
--                    (/admin/clients -> /admin/deliveries -> /p/<token>).
--                    Full featured: client, videos, versioning, client
--                    confirmation, release, original download, activity
--                    history, and its OWN existing expiry semantics.
--
--   temporary_share  A throwaway Coordinator link built on a phone from the
--                    portfolio ("الأعمال -> اختر فيديو -> إنشاء رابط"). No
--                    client, no record, no management: view-only and valid
--                    for exactly 24 hours, then dead automatically.
--
-- `deliveries.source_type` already means "where the bytes come from"
-- (portfolio CDN vs private R2) and cannot express purpose. Rather than
-- guessing purpose from columns like client_label (fragile UI data), an
-- explicit purpose column is added and every Owner-facing query filters on it.
--
-- Additive and non-destructive:
--   * every pre-existing row becomes 'client_delivery' (the default), so no
--     Owner delivery changes meaning, expiry or visibility;
--   * no table is dropped or rewritten;
--   * the 24 hour rule applies ONLY to temporary_share rows — the Owner
--     delivery expiry semantics are untouched;
--   * a temporary share can never be attached to a managed client (enforced by
--     a CHECK constraint), which is what keeps the two workflows from ever
--     bleeding into each other.
--
-- Access model is unchanged: RLS enabled with zero policies, everything through
-- the service_role client.

begin;

--===========================================================================
-- 1. Explicit purpose enum
--===========================================================================

create type public.delivery_share_kind as enum (
    'client_delivery',
    'temporary_share'
);

grant usage on type public.delivery_share_kind to service_role;
revoke usage on type public.delivery_share_kind from anon, authenticated;

--===========================================================================
-- 2. The purpose column
--===========================================================================

alter table public.deliveries
    add column share_kind public.delivery_share_kind not null default 'client_delivery';

comment on column public.deliveries.share_kind is
    'Purpose of the row: client_delivery = Owner-managed Client Delivery; '
    'temporary_share = throwaway Coordinator link (no client, view-only, 24h).';

--===========================================================================
-- 3. Backfill shares created by the Phase 5A mobile flow before this column
--    existed. Stored columns only (no UI data): client-less + public portfolio
--    + view-only + a hard link lifetime. Everything else stays a client
--    delivery, which is the safe direction to err in.
--===========================================================================

update public.deliveries
   set share_kind = 'temporary_share'
 where share_kind = 'client_delivery'
   and client_id is null
   and source_type = 'portfolio'
   and delivery_mode = 'VIEW_ONLY'
   and token_expires_at is not null;

--===========================================================================
-- 4. Invariants — the separation is enforced by the database, not by the UI
--===========================================================================

-- A temporary share is never a managed client delivery, and it can never be
-- attached to a client record.
alter table public.deliveries
    add constraint deliveries_temporary_share_has_no_client
    check (share_kind <> 'temporary_share' or client_id is null);

-- A temporary share is always view-only (no original is ever released for it).
alter table public.deliveries
    add constraint deliveries_temporary_share_is_view_only
    check (share_kind <> 'temporary_share' or delivery_mode = 'VIEW_ONLY');

-- A temporary share always carries a hard 24h lifetime so it dies on its own
-- without any coordinator cleanup.
alter table public.deliveries
    add constraint deliveries_temporary_share_has_expiry
    check (share_kind <> 'temporary_share' or token_expires_at is not null);

--===========================================================================
-- 5. Indexes for the two separate read paths
--===========================================================================

-- Owner Client Delivery listing / counts / statistics.
create index deliveries_client_delivery_idx
    on public.deliveries (created_at desc)
    where share_kind = 'client_delivery';

-- Automatic expiry sweep for temporary shares (token_expires_at is the gate the
-- /p, /preview, /thumb and /download endpoints already enforce).
create index deliveries_temporary_share_expiry_idx
    on public.deliveries (token_expires_at)
    where share_kind = 'temporary_share';

commit;
