import type { PagesFunction } from '@cloudflare/workers-types'
import { createServiceClient } from '../_lib/supabase'
import { html, requireOwner, requireSession } from './_lib/auth'
import type { Env } from './_lib/env'
import { casablancaYm, loadCalendarData } from './_lib/calendar-data'
import { renderCalendar } from './_lib/calendar-views'

type AdminFunction = PagesFunction<Env, never, Record<string, unknown>>

export const onRequestGet: AdminFunction = async (context) => {
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser
  const forbidden = requireOwner(appUser)
  if (forbidden) return forbidden

  const service = createServiceClient(context.env)
  if (!service) return html(renderCalendar(appUser, { ym: '', prevYm: '', nextYm: '', label: '', todayKey: '', events: [] }), 500)

  const url = new URL(context.request.url)
  const rawMonth = url.searchParams.get('month') ?? ''
  const currentYm = casablancaYm()
  const ym = /^\d{4}-\d{2}$/.test(rawMonth) ? rawMonth : currentYm

  const data = await loadCalendarData(service, ym)
  return html(renderCalendar(appUser, data))
}