import type { PagesFunction } from '@cloudflare/workers-types'
import { html, requireSession } from './_lib/auth'
import type { Env } from './_lib/env'
import { renderEquipment } from './_lib/content-views'

type AdminFunction = PagesFunction<Env, never, Record<string, unknown>>

export const onRequestGet: AdminFunction = async (context) => {
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser
  return html(renderEquipment(appUser))
}
