import type { Db } from '../../../_lib/supabase'
import { siteUrl, type DeliveryEnv } from '../../../_lib/env'
import { listNotifications } from '../../../_lib/notifications'
import {
  activeVideoCount,
  listDeliveries,
  type DeliveryListItem,
} from '../../deliveries/_helpers'

//============================================================================
// Phase 5A — Mobile Team Workspace data layer.
// Read-only helpers that reuse the exact loaders the admin already trusts
// (listDeliveries) plus a couple of small aggregates for the mobile home
// screen. No new table, no new query source, no new security model.
//============================================================================

export type MobileEnv = DeliveryEnv

export type MobileDeliveryRow = {
  id: string
  name: string
  status: DeliveryListItem['status']
  sourceType: DeliveryListItem['source_type']
  createdAt: string
  clientVisibleId: string | null
  videoCount: number
  downloadedAt: string | null
  confirmedAt: string | null
  archived: boolean
  /** True when this device stored the private link in localStorage. */
  linkAvailable: boolean
}

/**
 * Phase 5A note — the private token is hashed at creation time and is never
 * stored again, so the mobile app cannot re-derive an old link. A delivery is
 * only "openable" on this device when the link was created here (the creation
 * response is written to localStorage). The UI states this honestly instead of
 * pretending it can always re-open a link.
 */
export async function loadMobileDeliveries(service: Db): Promise<MobileDeliveryRow[]> {
  const items = await listDeliveries(service)
  return items.map((item) => ({
    id: item.id,
    name: clientNameOf(item),
    status: item.status,
    sourceType: item.source_type,
    createdAt: item.created_at,
    clientVisibleId: item.client_visible_id,
    videoCount: activeVideoCount(item.delivery_videos),
    downloadedAt: item.downloaded_at,
    confirmedAt: item.confirmed_at,
    archived: item.archived_at !== null,
    linkAvailable: false,
  }))
}

function clientNameOf(item: DeliveryListItem): string {
  const linked = item.clients?.name?.trim()
  if (linked) return linked
  const typed = item.client_label?.trim()
  if (typed) return typed
  return item.source_type === 'portfolio' ? 'رابط معرض عام' : 'توصيل خاص'
}

export type MobileHomeStats = {
  total: number
  active: number
  delivered: number
  expired: number
  videos: number
}

/** Counters for the mobile home screen; derived from the same list. */
export function mobileHomeStats(rows: MobileDeliveryRow[]): MobileHomeStats {
  let active = 0
  let delivered = 0
  let expired = 0
  let videos = 0
  for (const row of rows) {
    if (row.archived) continue
    if (row.status === 'expired') expired += 1
    else if (row.status === 'downloaded') delivered += 1
    else active += 1
    videos += row.videoCount
  }
  return { total: active + delivered + expired, active, delivered, expired, videos }
}

export type MobileNotification = {
  id: string
  type: string
  createdAt: string
  read: boolean
  title: string
  body: string
}

/**
 * Notifications are self-scoped: listNotifications() filters by user_id, and
 * the mobile app only ever renders the signed-in user's own rows. The desktop
 * /admin/api/notifications endpoint keeps working unchanged.
 */
export async function loadMobileNotifications(
  service: Db,
  userId: string,
): Promise<{ unread: number; items: MobileNotification[] }> {
  const data = await listNotifications(service, userId, 15)
  return {
    unread: data.unread,
    items: data.items.map((item) => ({
      id: item.id,
      type: item.type,
      createdAt: item.created_at,
      read: item.read_at !== null,
      title: item.title.trim() || 'تنبيه',
      body: item.message.trim(),
    })),
  }
}

export function siteBase(env: MobileEnv, request: Request): string {
  return siteUrl(env, request)
}
