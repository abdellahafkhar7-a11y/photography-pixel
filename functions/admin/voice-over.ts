import type { PagesFunction } from '@cloudflare/workers-types'
import { html, requireSession } from './_lib/auth'
import type { Env } from './_lib/env'
import { renderVoiceOver } from './_lib/content-views'
import { loadVoiceOver } from './_lib/content-data'

type AdminFunction = PagesFunction<Env, never, Record<string, unknown>>

export const onRequestGet: AdminFunction = async (context) => {
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser
  const records = await loadVoiceOver(context)
  return html(renderVoiceOver(appUser, records))
}
