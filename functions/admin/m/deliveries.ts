import type { PagesFunction } from '@cloudflare/workers-types'
import { requireSession } from '../_lib/auth'
import { listNotifications } from '../../_lib/notifications'
import type { DeliveryEnv } from '../../_lib/env'
import { serviceFrom } from '../deliveries/_helpers'
import { loadMobileDeliveries } from './_lib/mobile-data'
import { renderMobileDeliveries, type MobileFilter } from './_lib/mobile-views'

//============================================================================
// GET /admin/m/deliveries — Phase 5A delivery list.
// Same rows as the admin list (listDeliveries), rendered as mobile cards.
// The private link is only re-openable for deliveries created on this device
// (the token is hashed at creation and never stored again), so the row says so
// instead of showing a dead button.
//============================================================================

type Route = PagesFunction<DeliveryEnv, never, Record<string, unknown>>

const FILTERS: MobileFilter[] = ['all', 'active', 'downloaded', 'expired']

export const onRequestGet: Route = async (context) => {
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser

  const service = serviceFrom(context)
  if (!service) return new Response('الخدمة غير مهيأة.', { status: 503 })

  const url = new URL(context.request.url)
  const q = url.searchParams.get('q') ?? ''
  const requested = url.searchParams.get('status') ?? 'all'
  const status: MobileFilter = FILTERS.includes(requested as MobileFilter)
    ? (requested as MobileFilter)
    : 'all'

  const [rows, notifications] = await Promise.all([
    loadMobileDeliveries(service),
    listNotifications(service, appUser.id, 1),
  ])

  return new Response(renderMobileDeliveries(appUser, rows, { q, status }, notifications.unread), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}
