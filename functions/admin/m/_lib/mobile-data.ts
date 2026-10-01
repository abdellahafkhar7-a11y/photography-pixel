import type { Db } from '../../../_lib/supabase'
import { siteUrl, type DeliveryEnv } from '../../../_lib/env'
import { listNotifications } from '../../../_lib/notifications'

//============================================================================
// Phase 5A — Mobile Team Workspace data layer.
//
// The Coordinator app is TEMPORARY VIDEO SHARING, not Client Delivery. There
// is deliberately no delivery loader here: a Coordinator never sees Owner
// Client Deliveries, delivery history, clients or statistics. The only data
// this workspace needs is the signed-in user's own notifications.
//
// The portfolio catalog and the share creation itself are reused unchanged from
// the Owner side (loadPortfolioCatalog / createDelivery), so there is one
// implementation of each and no second security model.
//============================================================================

export type MobileEnv = DeliveryEnv

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
