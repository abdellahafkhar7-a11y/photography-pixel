--===========================================================================
-- 13. PHASE 4R — INTELLIGENCE LAYER (additive, backward compatible)
--
--   Three new tables, all isolated app-side via the service_role client:
--     notifications  — recipient-scoped (owner sees all owner-relevant;
--                      coordinators only their own). A NULLable partial-unique
--                      dedupe_key makes the reminder/automation engine
--                      idempotent (event-driven notifications omit the key).
--     video_revisions — production video revision cycles, one row per
--                      version bump (V1/V2/…). History is append-only.
--     communications  — cross-entity communication history (channel,
--                      direction, entity), fed by CRM actions + the client
--                      delivery page. Never any WhatsApp API — only recorded
--                      actions.
--   Existing tables are untouched; no duplicate of project_activity,
--   delivery_activity or delivery versioning is created.
--===========================================================================

alter table public.client_video_slots
    add column if not exists revision_version integer not null default 1;

------------------------------------------------------------------------------
-- revision_status enum
------------------------------------------------------------------------------
do $$
begin
    if not exists (select 1 from pg_type where typname = 'revision_status') then
        create type public.revision_status as enum ('none', 'requested', 'in_progress', 'pending_review', 'approved');
    end if;
end
$$;

alter type public.revision_status owner to postgres;
revoke usage on type public.revision_status from anon, authenticated;
grant usage on type public.revision_status to service_role;

------------------------------------------------------------------------------
-- notifications
------------------------------------------------------------------------------
create table if not exists public.notifications (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.app_users(id) on delete cascade,
    type text not null,
    title text not null,
    message text not null default '',
    entity_type text not null default 'system',
    entity_id uuid,
    dedupe_key text,
    read_at timestamptz,
    created_at timestamptz not null default now()
);

-- Idempotency anchor: reminders/automations give a deterministic dedupe_key so
-- a repeated sweep can never insert the same reminder twice. Event-driven
-- notifications leave it NULL (every real event is distinct).
create unique index if not exists notifications_dedupe_key_idx
    on public.notifications (dedupe_key)
    where dedupe_key is not null;

create index if not exists notifications_user_idx
    on public.notifications (user_id, read_at, created_at desc);

alter table public.notifications enable row level security;
revoke all on table public.notifications from anon, authenticated;
grant all on table public.notifications to service_role;

------------------------------------------------------------------------------
-- video_revisions
------------------------------------------------------------------------------
create table if not exists public.video_revisions (
    id uuid primary key default gen_random_uuid(),
    client_video_slot_id uuid not null references public.client_video_slots(id) on delete cascade,
    project_id uuid not null references public.projects(id) on delete cascade,
    version integer not null default 1,
    status public.revision_status not null default 'requested',
    reason text not null default '',
    notes text,
    created_by uuid references public.app_users(id) on delete set null,
    requested_at timestamptz not null default now(),
    resolved_at timestamptz,
    created_at timestamptz not null default now()
);

create index if not exists video_revisions_slot_idx
    on public.video_revisions (client_video_slot_id, created_at desc);

alter table public.video_revisions enable row level security;
revoke all on table public.video_revisions from anon, authenticated;
grant all on table public.video_revisions to service_role;

------------------------------------------------------------------------------
-- communications
------------------------------------------------------------------------------
create table if not exists public.communications (
    id uuid primary key default gen_random_uuid(),
    channel text not null check (channel in ('whatsapp', 'email', 'internal', 'system')),
    direction text not null check (direction in ('outbound', 'inbound', 'system')),
    entity_type text not null check (entity_type in ('client', 'project', 'delivery', 'model', 'task')),
    entity_id uuid,
    message text not null default '',
    user_id uuid references public.app_users(id) on delete set null,
    created_at timestamptz not null default now()
);

create index if not exists communications_entity_idx
    on public.communications (entity_type, entity_id, created_at desc);

create index if not exists communications_created_idx
    on public.communications (created_at desc);

alter table public.communications enable row level security;
revoke all on table public.communications from anon, authenticated;
grant all on table public.communications to service_role;