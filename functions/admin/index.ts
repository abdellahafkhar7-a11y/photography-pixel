import type { PagesFunction } from '@cloudflare/workers-types'
import { createServiceClient } from '../_lib/supabase'
import { html, requireSession } from './_lib/auth'
import { emptyDashboardData, loadDashboardData } from './_lib/dashboard-data'
import type { Env } from './_lib/env'
import { isMobileUserAgent } from './_lib/mobile-shell'
import { renderDashboard } from './_lib/views'

//============================================================================
// GET /admin — the admin entry point.
//
// This is a real role + device routing decision, not a CSS trick: a Coordinator
// on a phone is sent to the Phase 5A Mobile Team Workspace that already exists
// under /admin/m, so the workspace is the page that actually renders. The Owner
// and any desktop browser keep rendering the desktop dashboard below.
//============================================================================

export const onRequestGet: PagesFunction<Env, never, Record<string, unknown>> = async (
  context,
) => {
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser

  if (appUser.role_key !== 'owner' && isMobileUserAgent(context.request.headers.get('user-agent'))) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: '/admin/m',
        'Cache-Control': 'private, no-store',
        Vary: 'User-Agent',
      },
    })
  }

  const service = createServiceClient(context.env)
  const role = appUser.role_key === 'owner' ? 'owner' : 'coordinator'
  const data = service ? await loadDashboardData(service, role, appUser.id) : emptyDashboardData()
  const response = html(renderDashboard(appUser, data))
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('X-Robots-Tag', 'noindex')
  response.headers.set('Vary', 'User-Agent')
  return response
}
