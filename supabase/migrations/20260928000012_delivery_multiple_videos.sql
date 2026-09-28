--===========================================================================
-- 12. ONE DELIVERY -> MANY VIDEOS (additive, backward compatible)
--
--   Previously a delivery held a single video; delivery_videos rows formed a
--   per-delivery version chain keyed by (delivery_id, version). A delivery now
--   holds 1..N distinct videos ("items"); each item has its own version chain.
--   item_pos identifies the item within the delivery; every item starts at
--   version 1 and a re-upload bumps that item's version.
--
--   Existing rows (single-video deliveries) are unaffected: they default to
--   item_pos = 1 and keep working through the same private link.
--===========================================================================

alter table public.delivery_videos
    add column if not exists item_pos integer not null default 1;

-- Replace delivery-wide version uniqueness with per-item uniqueness: two
-- distinct videos in the same delivery share the same version number as long
-- as their item_pos differ.
alter table public.delivery_videos
    drop constraint if exists delivery_videos_delivery_version_key;

alter table public.delivery_videos
    add constraint delivery_videos_delivery_item_version_key
    unique (delivery_id, item_pos, version);

-- Active-item lookup: one active version per (delivery, item). This is what
-- the client page, preview and download endpoints use for multi-video.
create index if not exists delivery_videos_active_item_idx
    on public.delivery_videos (delivery_id, item_pos, is_active)
    where is_active;

-- Version history now also records the item position so activity for
-- multi-video deliveries stays self-documenting.
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
        jsonb_build_object('version', new.version, 'item', new.item_pos, 'source_type', new.source_type)
    );
    return new;
end;
$$;

revoke all on function public.handle_video_created() from public;