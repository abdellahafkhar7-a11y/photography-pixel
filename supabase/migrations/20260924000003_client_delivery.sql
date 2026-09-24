-- 20260924000003_client_delivery.sql
-- Photography Pixel — Phase 2: Client Delivery System.
--
-- Private client video delivery:
--   clients            -> client info (name + normalized WhatsApp number)
--   deliveries         -> one private shareable delivery per client/video
--   delivery_videos    -> video content per delivery, one version per row
--   delivery_activity  -> append-only event log
--
-- Access model mirrors migration 000002: all reads/writes go through the
-- server-side service_role client (Cloudflare Pages Functions and the cron
-- worker). RLS is enabled on every table with NO policies, so the anon and
-- authenticated roles are default-denied; nothing is ever exposed directly
-- to browsers.

begin;

--===========================================================================
-- 1. Enumerated types
--===========================================================================

create type public.delivery_source_type as enum ('portfolio', 'r2');
-- portfolio: an existing public Bamboo Cloud video selected from the site.
-- r2: a private client original stored in the private R2 bucket.

create type public.delivery_status as enum (
    'pending',
    'preview_viewed',
    'confirmed',
    'download_available',
    'downloaded',
    'expired'
);
-- State machine (server-enforced):
--   pending -> preview_viewed -> confirmed -> downloaded -> expired
-- download_available is accepted as an explicit alias of confirmed wherever
-- download gating is evaluated (retained for status-list compatibility).

create type public.delivery_activity_type as enum (
    'delivery_created',
    'link_opened',
    'preview_viewed',
    'video_confirmed',
    'download_started',
    'download_completed',
    'delivery_expired',
    'original_deleted',
    'reuploaded',
    'version_created'
);

--===========================================================================
-- 2. clients
--===========================================================================

create table public.clients (
    id               uuid primary key default gen_random_uuid(),
    name             text not null,
    whatsapp_number  text not null unique,
    created_by       uuid references auth.users (id) on delete set null,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

-- _whatsapp_number carries only digits (international format without '+'), e.g. 212663493003.

--===========================================================================
-- 3. deliveries
--===========================================================================

create table public.deliveries (
    id                   uuid primary key default gen_random_uuid(),
    client_id            uuid not null references public.clients (id) on delete cascade,
    created_by           uuid references auth.users (id) on delete set null,
    source_type          public.delivery_source_type not null,
    status               public.delivery_status not null default 'pending',
    private_token_hash   text not null unique,
    token_created_at     timestamptz not null default now(),
    token_expires_at     timestamptz,
    confirmed_at         timestamptz,
    downloaded_at        timestamptz,
    download_expires_at  timestamptz,
    expired_at           timestamptz,
    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now()
);

create index deliveries_client_id_idx on public.deliveries (client_id);
create index deliveries_expiry_idx
    on public.deliveries (download_expires_at)
    where download_expires_at is not null
      and status in ('confirmed', 'download_available', 'downloaded');

--===========================================================================
-- 4. delivery_videos (versioned content)
--===========================================================================

create table public.delivery_videos (
    id                    uuid primary key default gen_random_uuid(),
    delivery_id           uuid not null references public.deliveries (id) on delete cascade,
    version               integer not null,
    is_active             boolean not null default true,
    source_type           public.delivery_source_type not null,
    portfolio_url         text,
    r2_original_key       text,
    r2_preview_key        text,
    r2_thumb_key          text,
    original_filename     text,
    mime_type             text,
    size_bytes            bigint,
    original_deleted_at   timestamptz,
    created_by            uuid references auth.users (id) on delete set null,
    created_at            timestamptz not null default now(),
    constraint delivery_videos_delivery_version_key unique (delivery_id, version),
    constraint delivery_videos_source_key check (
        (source_type = 'portfolio' and portfolio_url is not null and r2_original_key is null)
        or
        (source_type = 'r2' and r2_original_key is not null)
    )
);

create index delivery_videos_delivery_idx
    on public.delivery_videos (delivery_id, is_active)
    where is_active;

--===========================================================================
-- 5. delivery_activity (append-only history; never deleted)
--===========================================================================

create table public.delivery_activity (
    id            uuid primary key default gen_random_uuid(),
    delivery_id   uuid not null references public.deliveries (id) on delete cascade,
    type          public.delivery_activity_type not null,
    metadata      jsonb,
    created_at    timestamptz not null default now()
);

create index delivery_activity_delivery_idx
    on public.delivery_activity (delivery_id, created_at);

--===========================================================================
-- 6. updated_at triggers (reuses public.set_updated_at from migration 000001)
--===========================================================================

create trigger clients_set_updated_at
    before update on public.clients
    for each row
    execute function public.set_updated_at();

create trigger deliveries_set_updated_at
    before update on public.deliveries
    for each row
    execute function public.set_updated_at();

--===========================================================================
-- 7. Audit triggers: initial activity is written automatically, so every
--    delivery/video that exists also has a verifiable creation record.
--===========================================================================

create or replace function public.handle_delivery_created()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
    insert into public.delivery_activity (delivery_id, type, metadata)
    values (new.id, 'delivery_created', jsonb_build_object('source_type', new.source_type));
    return new;
end;
$$;

create trigger deliveries_on_insert
    after insert on public.deliveries
    for each row
    execute function public.handle_delivery_created();

create or replace function public.handle_video_created()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
    insert into public.delivery_activity (delivery_id, type, metadata)
    values (
        new.delivery_id,
        'version_created',
        jsonb_build_object('version', new.version, 'source_type', new.source_type)
    );
    return new;
end;
$$;

create trigger delivery_videos_on_insert
    after insert on public.delivery_videos
    for each row
    execute function public.handle_video_created();

revoke all on function public.handle_delivery_created() from public;
revoke all on function public.handle_video_created() from public;

--===========================================================================
-- 8. RLS (default-deny for anon/authenticated) + service_role grants
--===========================================================================

alter table public.clients          enable row level security;
alter table public.deliveries       enable row level security;
alter table public.delivery_videos  enable row level security;
alter table public.delivery_activity enable row level security;

-- No policies are created: RLS with zero policies denies everything for the
-- non-service roles. All access happens through the service_role client.

revoke all on public.clients           from anon;
revoke all on public.deliveries        from anon;
revoke all on public.delivery_videos   from anon;
revoke all on public.delivery_activity from anon;

revoke all on public.clients           from authenticated;
revoke all on public.deliveries        from authenticated;
revoke all on public.delivery_videos   from authenticated;
revoke all on public.delivery_activity from authenticated;

grant all privileges on table public.clients           to service_role;
grant all privileges on table public.deliveries        to service_role;
grant all privileges on table public.delivery_videos   to service_role;
grant all privileges on table public.delivery_activity to service_role;

revoke usage on type public.delivery_source_type    from anon, authenticated;
revoke usage on type public.delivery_status         from anon, authenticated;
revoke usage on type public.delivery_activity_type  from anon, authenticated;

grant usage on type public.delivery_source_type    to service_role;
grant usage on type public.delivery_status         to service_role;
grant usage on type public.delivery_activity_type  to service_role;

commit;