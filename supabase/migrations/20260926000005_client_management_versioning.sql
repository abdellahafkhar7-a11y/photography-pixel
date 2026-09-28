-- 20260926000005_client_management_versioning.sql
-- Photography Pixel — Phase 4L: Client Management + Delivery Versioning + Stable Client Links.
--
-- Additive migration only: nothing is dropped, deleted or reset, so existing
-- portfolio/r2 deliveries, the 4K visual workflow and the cleanup job keep
-- behaving exactly as before.
--
--   1. deliveries.delivery_mode        VIEW_ONLY / VIEW_AND_DOWNLOAD.
--   2. clients.status                  active / archived (soft archive; never hard delete).
--   3. deliveries.client_visible_id    cosmetic stable-link identifier used in /p/<id>-<token>.
--   4. deliveries.archived_at          soft-archive a whole delivery.
--   5. delivery_videos per-version state columns (confirmed_at, download_released_at,
--      downloaded_at, download_expires_at, expired_at, archived_at) so every version
--      carries its own lifecycle independent of the current active version.
--
-- Backfill: the active version of every existing delivery mirrors the
-- delivery-level timestamps, so current links/status/dates are unchanged.

begin;

--===========================================================================
-- 1. delivery mode
--===========================================================================

create type public.delivery_mode as enum ('VIEW_ONLY', 'VIEW_AND_DOWNLOAD');

alter table public.deliveries
    add column delivery_mode public.delivery_mode not null default 'VIEW_AND_DOWNLOAD';
-- Default matches the existing behaviour (confirm -> owner release -> download).

grant usage on type public.delivery_mode to service_role;
revoke usage on type public.delivery_mode from anon, authenticated;

--===========================================================================
-- 2. client status (soft archive)
--===========================================================================

create type public.client_status as enum ('active', 'archived');

alter table public.clients
    add column status public.client_status not null default 'active';

grant usage on type public.client_status to service_role;
revoke usage on type public.client_status from anon, authenticated;

--===========================================================================
-- 3. stable-link identifier + delivery archive
--===========================================================================

alter table public.deliveries
    add column client_visible_id text;

alter table public.deliveries
    add column archived_at timestamptz;

--===========================================================================
-- 4. per-version lifecycle state
--===========================================================================

alter table public.delivery_videos
    add column confirmed_at timestamptz,
    add column download_released_at timestamptz,
    add column downloaded_at timestamptz,
    add column download_expires_at timestamptz,
    add column expired_at timestamptz,
    add column archived_at timestamptz;

--===========================================================================
-- 5. Backfill (idempotent; only touches rows that still need values)
--===========================================================================

-- 5a. The currently active version of an existing delivery carries forward the
--     delivery-level timestamps, preserving the exact historical lifecycle.
update public.delivery_videos dv
set confirmed_at = d.confirmed_at,
    downloaded_at = d.downloaded_at,
    download_expires_at = d.download_expires_at,
    expired_at = d.expired_at
from public.deliveries d
where dv.delivery_id = d.id
  and dv.is_active = true
  and (dv.confirmed_at is not null or d.confirmed_at is not null
       or dv.downloaded_at is not null or d.downloaded_at is not null
       or dv.download_expires_at is not null or d.download_expires_at is not null
       or dv.expired_at is not null or d.expired_at is not null);

-- 5b. Cosmetic identifier for deliveries with a client: digits of the client's
--     WhatsApp number (e.g. 212776). Falls back to a delivery id digest.
update public.deliveries d
set client_visible_id = coalesce(
        nullif(regexp_replace(c.whatsapp_number, '\D', '', 'g'), ''),
        left(replace(d.id::text, '-', ''), 8)
    )
from public.clients c
where d.client_id = c.id
  and (d.client_visible_id is null or d.client_visible_id = '');

-- 5c. Client-less deliveries (portfolio immediate links) inherit a stable id
--     digest. The identifier never changes afterwards.
update public.deliveries d
set client_visible_id = left(replace(d.id::text, '-', ''), 8)
where d.client_id is null
  and (d.client_visible_id is null or d.client_visible_id = '');

-- The identifier is human-facing only: the actual security token is the random
-- secret after the dash, which is never stored (only its SHA-256 hash). No
-- uniqueness index is added because the identifier is deliberately cosmetic.

commit;