import type { PagesFunction } from '@cloudflare/workers-types'
import { html, requireOwner, requireSession } from './_lib/auth'
import type { Env } from './_lib/env'
import { renderPlaceholder } from './_lib/views'

type AdminFunction = PagesFunction<Env, never, Record<string, unknown>>

export const onRequestGet: AdminFunction = async (context) => {
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser
  const forbidden = requireOwner(appUser)
  if (forbidden) return forbidden
  return html(renderPlaceholder(appUser, 'clients'))
}