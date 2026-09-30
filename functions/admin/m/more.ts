import type { PagesFunction } from '@cloudflare/workers-types'
import { requireSession } from '../_lib/auth'
import type { DeliveryEnv } from '../../_lib/env'
import { serviceFrom } from '../deliveries/_helpers'
import { loadMobileNotifications } from './_lib/mobile-data'
import { renderMobileMore } from './_lib/mobile-views'

//============================================================================
// GET /admin/m/more — Phase 5A account + notifications.
// Notifications are self-scoped (listNotifications filters by the caller's own
// user id) and the logout is the existing /admin/logout route — this page
// never manages users, roles or uploads.
//============================================================================

type Route = PagesFunction<DeliveryEnv, never, Record<string, unknown>>

export const onRequestGet: Route = async (context) => {
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser

  const service = serviceFrom(context)
  if (!service) return new Response('الخدمة غير مهيأة.', { status: 503 })

  const data = await loadMobileNotifications(service, appUser.id)

  return new Response(renderMobileMore(appUser, data.items, data.unread), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}
