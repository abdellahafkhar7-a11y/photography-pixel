-- 20260927000010_crm_projects.sql
-- Photography Pixel — Phase 4O: Client -> Project/Session CRM workspace.
--
-- Additive migration only: nothing existing is dropped, deleted or reset.
-- Phase 4N clients/models/slots/deliveries/versions/R2/activity and the stable
-- /p/<identifier>-<secret> links keep behaving exactly as before.
--
--   1. projects                 the CRM centrepiece: one project = one client
--      session. Carries workflow status (new/contacted/booked/shooting/
--      editing/review/delivery/completed/archived), model, planned video
--      count, shoot date/time/location, script, private admin notes and a
--      payments-ready structure (total_price / advance / payment_status).
--   2. client_video_slots       EXTENDED, not duplicated: project_id ties a
--      slot to a project, kanban_status + kanban_order power the Trello-style
--      board, notes give the card copy. The existing partial-unique delivery
--      index and (client_id, position) planning constraint are untouched, so
--      per-video deliveries and stable links still work for BOTH the legacy
--      client plan and project slots.
--   3. project_tasks            todo/in_progress/done board with assignee
--      (from app_users), due date and priority.
--   4. project_activity         project-scoped timeline (created / status /
--      kanban moves / tasks / message_sent / archive ...). Delivery-level
--      events keep living in delivery_activity.
--
-- Access model mirrors migration 000003 / 000009: RLS enabled, zero policies,
-- all access through the server-side service_role client.

begin;

--===========================================================================
-- 1. new enums
--===========================================================================

create type public.project_status as enum
    ('new', 'contacted', 'booked', 'shooting', 'editing', 'review', 'delivery', 'completed', 'archived');

create type public.kanban_status as enum
    ('todo', 'editing', 'review', 'ready', 'done');

create type public.task_status as enum
    ('todo', 'in_progress', 'done');

create type public.task_priority as enum
    ('low', 'medium', 'high');

create type public.payment_status as enum
    ('unpaid', 'partial', 'paid');

grant usage on type public.project_status to service_role;
grant usage on type public.kanban_status to service_role;
grant usage on type public.task_status to service_role;
grant usage on type public.task_priority to service_role;
grant usage on type public.payment_status to service_role;

revoke usage on type public.project_status from anon, authenticated;
revoke usage on type public.kanban_status from anon, authenticated;
revoke usage on type public.task_status from anon, authenticated;
revoke usage on type public.task_priority from anon, authenticated;
revoke usage on type public.payment_status from anon, authenticated;

--===========================================================================
-- 2. projects
--===========================================================================

create table public.projects (
    id                  uuid primary key default gen_random_uuid(),
    client_id           uuid not null references public.clients (id) on delete cascade,
    name                text not null,
    project_code        text not null unique,
    status              public.project_status not null default 'new',
    status_prior        public.project_status,
    model_id            uuid references public.models (id) on delete set null,
    planned_video_count integer not null default 0,
    shoot_date          date,
    shoot_time          text,
    location            text,
    script              text,
    notes               text,
    total_price         numeric(12, 2),
    advance             numeric(12, 2),
    payment_status      public.payment_status not null default 'unpaid',
    created_by          uuid,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    archived_at         timestamptz
);

create index projects_client_idx
    on public.projects (client_id, created_at);

create index projects_status_idx
    on public.projects (status, created_at);

create index projects_shoot_idx
    on public.projects (shoot_date);

create index projects_model_idx
    on public.projects (model_id);

create trigger projects_set_updated_at
    before update on public.projects
    for each row
    execute function public.set_updated_at();

--===========================================================================
-- 3. client_video_slots — project + kanban columns (additive)
--===========================================================================

alter table public.client_video_slots
    add column project_id uuid references public.projects (id) on delete set null;

alter table public.client_video_slots
    add column kanban_status public.kanban_status not null default 'todo';

alter table public.client_video_slots
    add column kanban_order integer not null default 0;

alter table public.client_video_slots
    add column notes text;

create index client_video_slots_project_idx
    on public.client_video_slots (project_id, kanban_status, kanban_order)
    where project_id is not null;

-- Legacy plan slots (project_id IS NULL) keep position 1..N as today; project
-- slots keep the unique (client_id, position) rule by continuing the client's
-- global numbering, while kanban_order gives their order inside the board.

--===========================================================================
-- 4. project_tasks
--===========================================================================

create table public.project_tasks (
    id           uuid primary key default gen_random_uuid(),
    project_id   uuid not null references public.projects (id) on delete cascade,
    title        text not null,
    status       public.task_status not null default 'todo',
    priority     public.task_priority not null default 'medium',
    assignee_id  uuid references public.app_users (id) on delete set null,
    due_date     date,
    sort_order   integer not null default 0,
    completed_at timestamptz,
    created_by   uuid,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

create index project_tasks_project_idx
    on public.project_tasks (project_id, status, sort_order);

create trigger project_tasks_set_updated_at
    before update on public.project_tasks
    for each row
    execute function public.set_updated_at();

--===========================================================================
-- 5. project_activity (project-scoped timeline)
--===========================================================================

create table public.project_activity (
    id         uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects (id) on delete cascade,
    type       text not null,
    metadata   jsonb,
    created_at timestamptz not null default now()
);

create index project_activity_project_idx
    on public.project_activity (project_id, created_at);

--===========================================================================
-- 6. RLS + service_role grants (default-deny, same pattern as 000003/000009)
--===========================================================================

alter table public.projects enable row level security;
alter table public.project_tasks enable row level security;
alter table public.project_activity enable row level security;

revoke all on public.projects from anon;
revoke all on public.projects from authenticated;
revoke all on public.project_tasks from anon;
revoke all on public.project_tasks from authenticated;
revoke all on public.project_activity from anon;
revoke all on public.project_activity from authenticated;

grant all privileges on table public.projects to service_role;
grant all privileges on table public.project_tasks to service_role;
grant all privileges on table public.project_activity to service_role;

commit;