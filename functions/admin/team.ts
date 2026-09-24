import type { PagesFunction } from '@cloudflare/workers-types'
import { html, readAdminData, requireOwner, requireSession } from './_lib/auth'
import { listTeam } from './_lib/db'
import type { Env } from './_lib/env'
import { renderTeam } from './_lib/views'

export const onRequestGet: PagesFunction<Env, never, Record<string, unknown>> = async (
  context,
) => {
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser
  const forbidden = requireOwner(appUser)
  if (forbidden) return forbidden
  const data = readAdminData(context)
  if (!data) return html(renderTeam(appUser, []))
  const members = await listTeam(data.service)
  return html(renderTeam(appUser, members))
}