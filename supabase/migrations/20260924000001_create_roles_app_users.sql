-- 20260924000001_create_roles_app_users.sql
-- Photography Pixel — admin RBAC foundation.
-- Creates roles + app_users (profile) tables, triggers, and RLS.

--===========================================================================
-- 1. roles
--===========================================================================
create table public.roles (
    id          uuid primary key default gen_random_uuid(),
    key         text not null unique check (key in ('owner', 'coordinator')),
    name        text not null,
    description text,
    created_at  timestamptz not null default now()
);

insert into public.roles (key, name, description)
values
    ('owner', 'Owner', 'full control over the site and team'),
    ('coordinator', 'Coordinator', 'can sign in to the admin dashboard');

--===========================================================================
-- 2. app_users (one row per authenticated user)
--===========================================================================
create table public.app_users (
    id            uuid primary key references auth.users (id) on delete cascade,
    email         text not null unique,
    role_id       uuid not null references public.roles (id),
    full_name     text,
    is_active     boolean not null default true,
    last_login_at timestamptz,
    created_by    uuid references auth.users (id),
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

--===========================================================================
-- 3. updated_at trigger
--===========================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger app_users_set_updated_at
    before update on public.app_users
    for each row
    execute function public.set_updated_at();

--===========================================================================
-- 4. auto-create a profile for every new signup
-- New users land as inactive coordinators until an owner activates them.
--===========================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
    insert into public.app_users (id, email, role_id, is_active)
    values (
        new.id,
        new.email,
        (select id from public.roles where key = 'coordinator'),
        false
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

create trigger on_auth_user_created
    after insert on auth.users
    for each row
    execute function public.handle_new_user();

revoke all on function public.handle_new_user() from public;
revoke all on function public.set_updated_at() from public;

--===========================================================================
-- 5. RLS
--===========================================================================
alter table public.roles     enable row level security;
alter table public.app_users enable row level security;

-- roles: any signed-in user may read the lookup table
create policy "roles_read_authenticated"
    on public.roles
    for select
    to authenticated
    using (true);

-- app_users: a user may read their own profile
create policy "app_users_select_own"
    on public.app_users
    for select
    to authenticated
    using (auth.uid() = id);

-- All writes go through the service role / admin APIs only.
revoke insert, update, delete on public.roles     from anon, authenticated;
revoke insert, update, delete on public.app_users from anon, authenticated;
revoke all on public.roles                        from anon;
revoke all on public.app_users                    from anon;
grant select on public.roles     to authenticated;
grant select on public.app_users to authenticated;