-- 20260925000004_optional_delivery_client.sql
-- Photography Pixel — Phase 4L: Portfolio "إنشاء رابط" is immediate and
-- video-specific. For an existing portfolio video a private link must be
-- generated without forcing a client form, so deliveries.client_id becomes
-- optional (null when no client info was provided yet). Client name/WhatsApp
-- can still be attached later via the owner-only set_client flow.
--
-- No fake client rows are ever created; a client-less delivery simply has a
-- null client_id. Deleting a client keeps its deliveries (on delete set null),
-- so a delivery attached later is never accidentally deleted with the client.

begin;

alter table public.deliveries
    alter column client_id drop not null;

alter table public.deliveries
    drop constraint deliveries_client_id_fkey;

alter table public.deliveries
    add constraint deliveries_client_id_fkey
        foreign key (client_id)
        references public.clients (id)
        on delete set null;

commit;