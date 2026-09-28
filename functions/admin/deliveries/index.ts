import type { PagesFunction } from '@cloudflare/workers-types'
import { requireOwner, requireSession } from '../_lib/auth'
import { sameOrigin } from '../_lib/security'
import type { DeliveryEnv } from '../../_lib/env'
import { runCleanup, type CleanupResult } from '../../_lib/cleanup'
import { renderDeliveryList } from '../_lib/delivery-views'
import { adminHtml, formString, listDeliveries, serviceFrom } from './_helpers'

type Route = PagesFunction<DeliveryEnv, never, Record<string, unknown>>

export const onRequestGet: Route = async (context) => {
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser

  const service = serviceFrom(context)
  const items = service ? await listDeliveries(service) : []
  const url = new URL(context.request.url)
  const query = url.searchParams.get('q') ?? ''
  const status = url.searchParams.get('status') ?? ''
  const source = url.searchParams.get('source') ?? ''
  const clientId = url.searchParams.get('client') ?? ''
  const clientIdValid = /^[0-9a-f-]{36}$/.test(clientId)
  const multiVersion = url.searchParams.get('multi') === '1'
  let clients: { id: string; name: string; whatsapp_number: string }[] = []
  if (service) {
    const { data } = await service
      .from('clients')
      .select('id, name, whatsapp_number')
      .order('name', { ascending: true })
      .limit(200)
    clients = (data ?? []).filter((c): c is { id: string; name: string; whatsapp_number: string } => Boolean(c?.id && c.name))
  }
  return adminHtml(
    renderDeliveryList(appUser, items, {
      query,
      status,
      source,
      clientId: clientIdValid ? clientId : undefined,
      multiVersion,
      clients,
    }),
  )
}

export const onRequestPost: Route = async (context) => {
  if (!sameOrigin(context.request)) return adminHtml('<p>طلب غير صالح.</p>', 403)
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser
  const forbidden = requireOwner(appUser)
  if (forbidden) return forbidden

  const form = await context.request.formData()
  const action = formString(form.get('action'))
  const service = serviceFrom(context)
  const items = service ? await listDeliveries(service) : []

  if (action === 'cleanup') {
    const result: CleanupResult = await runCleanup(context.env, (line) => console.log(line))
    const parts = [
      `التوصيلات المنتهية: ${result.claimed}`,
      `الملفات المحذوفة: ${result.originalsDeleted}`,
    ]
    if (result.errors.length > 0) parts.push(`أخطاء: ${result.errors.length}`)
    return adminHtml(
      renderDeliveryList(appUser, items, { notice: `انتهى التنظيف — ${parts.join('، ')}.` }),
    )
  }

  return adminHtml(renderDeliveryList(appUser, items))
}
