-- 20260927000009_client_model_video_workspace.sql
-- Photography Pixel — Phase 4N: Client -> Model -> Video Slots -> Script -> Delivery.
--
-- Additive migration only: nothing existing is dropped, deleted or reset, so
-- Phase 4M clients/deliveries/links/versions and the cleanup job keep behaving
-- exactly as before.
--
--   1. models                    real DB entity (was read-only /data/models.json).
--      Seeded with the SAME six names/photos already published on the site, so
--      no new data is invented and nothing on the public page changes.
--   2. clients.model_id           client <-> model relation.
--   3. clients.video_slots_count  planned slot count (PLANNING ONLY — never a
--      hard DB limit on deliveries).
--   4. clients.delivery_mode      workflow default for NEW slot deliveries
--      (reuses the existing delivery_mode enum; existing deliveries keep their
--      own mode and set_mode still manages them individually).
--   5. clients.script             optional Arabic shooting/communication script.
--   6. client_video_slots         one row per planned video (position 1..N).
--      status: planned -> active (has a delivery) -> paused (count reduced;
--      uploaded videos are NEVER deleted).
--   7. deliveries.client_video_slot_id  delivery-per-video preserved: each slot
--      owns at most one current delivery (partial unique index). Uploading a
--      new video to a slot re-uses the existing per-delivery versioning, so the
--      stable /p/<id>-<secret> link and 3-day download window are untouched.
--
-- Access model mirrors migration 000003: RLS enabled, zero policies, all access
-- through the server-side service_role client.

begin;

--===========================================================================
-- 1. slot status
--===========================================================================

create type public.slot_status as enum ('planned', 'active', 'paused');

grant usage on type public.slot_status to service_role;
revoke usage on type public.slot_status from anon, authenticated;

--===========================================================================
-- 2. models (real entity, seeded from the published /data/models.json)
--===========================================================================

create table public.models (
    id               uuid primary key default gen_random_uuid(),
    name             text not null,
    photo            text,
    whatsapp_number  text,
    available        boolean not null default true,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

insert into public.models (name, photo, available) values
    ('مريم',        '/assets/models/maryam hawara.webp',  true),
    ('دريس',        '/assets/models/model dris.webp',     true),
    ('حنان',        '/assets/models/model hanan.webp',    true),
    ('حسناء',       '/assets/models/model hasna.webp',    true),
    ('يوسف',        '/assets/models/yousef.jpg',          true),
    ('خولود',       '/assets/models/kholoud.jpg',         true);

create trigger models_set_updated_at
    before update on public.models
    for each row
    execute function public.set_updated_at();

--===========================================================================
-- 3. client workspace columns
--===========================================================================

alter table public.clients
    add column model_id uuid references public.models (id) on delete set null;

alter table public.clients
    add column video_slots_count integer not null default 0;

alter table public.clients
    add column delivery_mode public.delivery_mode not null default 'VIEW_AND_DOWNLOAD';

alter table public.clients
    add column script text;

create index clients_model_idx on public.clients (model_id);

--===========================================================================
-- 4. client_video_slots (planned videos; one row per position 1..N)
--===========================================================================

create table public.client_video_slots (
    id          uuid primary key default gen_random_uuid(),
    client_id   uuid not null references public.clients (id) on delete cascade,
    position    integer not null,
    title       text not null,
    status      public.slot_status not null default 'planned',
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    constraint client_video_slots_client_position_key unique (client_id, position)
);

create index client_video_slots_client_idx
    on public.client_video_slots (client_id, status);

create trigger client_video_slots_set_updated_at
    before update on public.client_video_slots
    for each row
    execute function public.set_updated_at();

--===========================================================================
-- 5. slot <-> delivery link (delivery-per-video preserved)
--===========================================================================

alter table public.deliveries
    add column client_video_slot_id uuid references public.client_video_slots (id) on delete set null;

create unique index deliveries_slot_unique_idx
    on public.deliveries (client_video_slot_id)
    where client_video_slot_id is not null;

--===========================================================================
-- 6. RLS + service_role grants (default-deny, same pattern as 000003)
--===========================================================================

alter table public.models enable row level security;
alter table public.client_video_slots enable row level security;

revoke all on public.models from anon;
revoke all on public.models from authenticated;
revoke all on public.client_video_slots from anon;
revoke all on public.client_video_slots from authenticated;

grant all privileges on table public.models to service_role;
grant all privileges on table public.client_video_slots to service_role;

commit;