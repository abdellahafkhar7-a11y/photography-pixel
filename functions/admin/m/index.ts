import type { PagesFunction } from '@cloudflare/workers-types'
import { requireSession } from '../_lib/auth'
import { listNotifications } from '../../_lib/notifications'
import type { DeliveryEnv } from '../../_lib/env'
import { serviceFrom } from '../deliveries/_helpers'
import { loadMobileDeliveries, mobileHomeStats } from './_lib/mobile-data'
import { renderMobileHome } from './_lib/mobile-views'

//============================================================================
// GET /admin/m — Phase 5A mobile home (the coordinator's app entry point).
// The same requireSession() guard as the admin: an inactive or signed-out user
// is redirected to /admin/login, so a Coordinator can use the app while every
// Owner-only admin route stays protected by its own role check.
//============================================================================

type Route = PagesFunction<DeliveryEnv, never, Record<string, unknown>>

export const onRequestGet: Route = async (context) => {
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser

  const service = serviceFrom(context)
  if (!service) {
    return new Response('الخدمة غير مهيأة.', { status: 503 })
  }
  const [rows, notifications] = await Promise.all([
    loadMobileDeliveries(service),
    listNotifications(service, appUser.id, 1),
  ])

  return new Response(
    renderMobileHome(appUser, mobileHomeStats(rows), rows.slice(0, 3), notifications.unread),
    {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    },
  )
}
