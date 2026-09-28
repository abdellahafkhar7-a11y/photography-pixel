import type { PagesFunction } from '@cloudflare/workers-types'
import { createServiceClient } from '../_lib/supabase'
import { html, requireOwner, requireSession } from './_lib/auth'
import type { Env } from './_lib/env'
import { renderAnalytics } from './_lib/analytics-views'
import { emptyAnalyticsData, loadAnalyticsData } from './_lib/analytics-data'

type AdminFunction = PagesFunction<Env, never, Record<string, unknown>>

export const onRequestGet: AdminFunction = async (context) => {
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser
  const forbidden = requireOwner(appUser)
  if (forbidden) return forbidden

  const service = createServiceClient(context.env)
  const data = service ? await loadAnalyticsData(service) : emptyAnalyticsData()
  const response = html(renderAnalytics(appUser, data))
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('X-Robots-Tag', 'noindex')
  return response
}