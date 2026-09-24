import type { PagesFunction } from '@cloudflare/workers-types'
import { html, requireSession } from './_lib/auth'
import type { Env } from './_lib/env'
import { renderDashboard } from './_lib/views'

export const onRequestGet: PagesFunction<Env, never, Record<string, unknown>> = async (
  context,
) => {
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser
  return html(renderDashboard(appUser))
}