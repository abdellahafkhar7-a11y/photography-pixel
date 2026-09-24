import type { PagesFunction } from '@cloudflare/workers-types'
import { createServiceClient } from '../_lib/supabase'
import { html, requireSession } from './_lib/auth'
import { emptyDashboardData, loadDashboardData } from './_lib/dashboard-data'
import type { Env } from './_lib/env'
import { renderDashboard } from './_lib/views'

export const onRequestGet: PagesFunction<Env, never, Record<string, unknown>> = async (
  context,
) => {
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser
  const service = createServiceClient(context.env)
  const role = appUser.role_key === 'owner' ? 'owner' : 'coordinator'
  const data = service ? await loadDashboardData(service, role) : emptyDashboardData()
  const response = html(renderDashboard(appUser, data))
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('X-Robots-Tag', 'noindex')
  return response
}
