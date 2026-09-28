-- 20260927000011_trello_project_board.sql
-- Photography Pixel — Phase 4P: Trello-style project board refinement.
--
-- Additive migration only: nothing existing is dropped, deleted or reset.
-- Builds directly on 20260927000010_crm_projects.sql (projects, boards,
-- project_tasks, project_activity). Phase 4M/4N/4O behaviour is untouched.
--
--   1. client_video_slots  EXTENDED with two optional card fields:
--      - label     free label chip shown on the card (e.g. "ألوان طبيعية"),
--      - deadline  optional due date rendered on the card and in the detail.
--      (title was already carried and is reused for editable card titles.)
--   2. project_tasks       EXTENDED with client_video_slot_id (FK, SET NULL)
--      so a Trello-style checklist can hang off a board card. Tasks keep
--      working as a project-scoped board with no requirement to belong to a
--      card.
--
-- Access model unchanged: RLS enabled, zero policies, service_role only.

begin;

--===========================================================================
-- 1. client_video_slots — label + deadline (additive)
--===========================================================================

alter table public.client_video_slots
    add column label text;

alter table public.client_video_slots
    add column deadline date;

--===========================================================================
-- 2. project_tasks — optional card membership (additive)
--===========================================================================

alter table public.project_tasks
    add column client_video_slot_id uuid
        references public.client_video_slots (id) on delete set null;

create index project_tasks_slot_idx
    on public.project_tasks (project_id, client_video_slot_id, status);

--===========================================================================
-- 3. RLS stays default-deny for anon/authenticated; service_role unchanged.
-- New column inherits the existing table grants (revoke/grant leak not
-- possible for columns), so no extra grant statements are required.
--===========================================================================

commit;