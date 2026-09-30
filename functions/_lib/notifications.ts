import type { NotificationType, NotificationsRow } from './db-types'
import type { Db } from './supabase'

//============================================================================
// Phase 4R — Notifications.
// Recipient-scoped: every notification row targets a specific user
// (app_users.id). The owner receives owner-relevant events; coordinators only
// rows created for them (e.g. task assignments). Authorization is always
// server-side: list/mark helpers scope by userId.
//
// Idempotency: reminders/automations pass a deterministic dedupe_key and the
// insert uses `ignoreDuplicates` against the flat unique index on
// notifications(dedupe_key) (migration 00014 replaced the partial index — a
// partial index cannot be used by PostgREST's on_conflict target). Event-driven
// notifications leave dedupe_key null (NULLs stay unlimited under a unique
// index), so each real event is distinct.
//============================================================================

export type NotificationInput = {
  user_id: string
  type: NotificationType
  title: string
  message?: string
  entity_type?: string
  entity_id?: string | null
  dedupe_key?: string | null
}

export async function createNotification(
  service: Db,
  input: NotificationInput,
): Promise<void> {
  await service.from('notifications').upsert(
    {
      user_id: input.user_id,
      type: input.type,
      title: input.title,
      message: input.message ?? '',
      entity_type: input.entity_type ?? 'system',
      entity_id: input.entity_id ?? null,
      dedupe_key: input.dedupe_key ?? null,
    },
    { onConflict: 'dedupe_key', ignoreDuplicates: true },
  )
}

// Resolve the owner's app_users id. Used by system reminders/automations that
// must reach the owner specifically.
export async function ownerAppUserId(service: Db): Promise<string | null> {
  const { data } = await service
    .from('app_users')
    .select('id, roles(key)')
    .eq('roles.key', 'owner')
    .eq('is_active', true)
    .limit(1)
    .returns<{ id: string }[]>()
  const first = data && data.length > 0 ? data[0] : undefined
  return first ? first.id : null
}

export async function notifyOwner(
  service: Db,
  input: Omit<NotificationInput, 'user_id' | 'dedupe_key'> & { dedupe_key?: string | null },
): Promise<string | null> {
  const ownerId = await ownerAppUserId(service)
  if (!ownerId) return null
  const key =
    input.dedupe_key ??
    `event:${input.type}:${input.entity_type ?? 'system'}:${input.entity_id ?? 'none'}:${Date.now()}`
  await createNotification(service, { ...input, user_id: ownerId, dedupe_key: key })
  return ownerId
}

export function emptyNotificationList(): { unread: number; items: NotificationsRow[] } {
  return { unread: 0, items: [] }
}

export async function listNotifications(
  service: Db,
  userId: string,
  limit = 20,
): Promise<{ unread: number; items: NotificationsRow[] }> {
  const [countRes, listRes] = await Promise.all([
    service
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('read_at', null),
    service
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)
      .returns<NotificationsRow[]>(),
  ])
  return { unread: countRes.count ?? 0, items: listRes.data ?? [] }
}

export async function markNotificationRead(
  service: Db,
  userId: string,
  notificationId: string,
): Promise<void> {
  const now = new Date().toISOString()
  await service
    .from('notifications')
    .update({ read_at: now })
    .eq('id', notificationId)
    .eq('user_id', userId)
    .is('read_at', null)
}

export async function markAllNotificationsRead(service: Db, userId: string): Promise<number> {
  const now = new Date().toISOString()
  const { data } = await service
    .from('notifications')
    .update({ read_at: now })
    .eq('user_id', userId)
    .is('read_at', null)
    .select('id')
  return (data ?? []).length
}