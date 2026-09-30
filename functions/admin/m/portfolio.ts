import type { PagesFunction } from '@cloudflare/workers-types'
import { requireSession } from '../_lib/auth'
import { listNotifications } from '../../_lib/notifications'
import type { DeliveryEnv } from '../../_lib/env'
import { loadPortfolioCatalog, serviceFrom } from '../deliveries/_helpers'
import { renderMobilePortfolio, type MobilePortfolioCategory } from './_lib/mobile-views'

//============================================================================
// GET /admin/m/portfolio — Phase 5A portfolio picker.
// Read-only: the SAME static /data/*.txt catalogue the admin "إنشاء رابط"
// modal uses, so a Coordinator picks from the real public portfolio and the
// server re-validates every submitted URL against this catalogue at creation.
//============================================================================

type Route = PagesFunction<DeliveryEnv, never, Record<string, unknown>>

export const onRequestGet: Route = async (context) => {
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser

  const service = serviceFrom(context)
  if (!service) {
    return new Response('الخدمة غير مهيأة.', { status: 503 })
  }
  const [catalog, notifications] = await Promise.all([
    loadPortfolioCatalog(context),
    listNotifications(service, appUser.id, 1),
  ])

  const url = new URL(context.request.url)
  const query = url.searchParams.get('q') ?? ''
  const requested = url.searchParams.get('cat') ?? ''
  const counts = new Map<string, number>()
  for (const option of catalog) counts.set(option.category, (counts.get(option.category) ?? 0) + 1)
  const categories: MobilePortfolioCategory[] = [...counts.keys()]
    .sort((a, b) => a.localeCompare(b, 'ar'))
    .map((label) => ({ key: label, label, count: counts.get(label) ?? 0 }))
  // Only a real category from the catalogue is accepted; anything else falls
  // back to "all" instead of rendering an empty grid.
  const activeCategory = categories.some((item) => item.key === requested) ? requested : ''

  return new Response(
    renderMobilePortfolio(appUser, catalog, categories, activeCategory, query, notifications.unread),
    {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    },
  )
}
