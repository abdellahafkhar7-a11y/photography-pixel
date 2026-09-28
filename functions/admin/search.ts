import type { PagesFunction } from '@cloudflare/workers-types'
import { createServiceClient } from '../_lib/supabase'
import { requireSession } from './_lib/auth'
import type { Env } from './_lib/env'
import { renderSearch } from './_lib/search-views'
import { listProjects } from './_lib/projects-data'
import { listDeliveries } from './deliveries/_helpers'

//============================================================================
// /admin/search — global search across projects, clients, models, deliveries.
//============================================================================

type AdminFunction = PagesFunction<Env, never, Record<string, unknown>>

export const onRequestGet: AdminFunction = async (context) => {
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser

  const service = createServiceClient(context.env)
  if (!service) return new Response(null, { status: 307, headers: { Location: '/admin' } })

  const q = (new URL(context.request.url).searchParams.get('q') ?? '').trim().slice(0, 80)
  const query = q.toLowerCase()

  const matches = (value: string): boolean => value.toLowerCase().includes(query)

  const projects = q ? await listProjects(service, { query: q }) : []

  let clients: { id: string; name: string; whatsapp_number: string; status: string }[] = []
  let models: { id: string; name: string; photo: string | null }[] = []
  let deliveries: ReturnType<typeof listDeliveries> extends Promise<infer T> ? T : never = []
  if (q) {
    const [clientsRes, modelsRes, deliveriesRes] = await Promise.all([
      service
        .from('clients')
        .select('id, name, whatsapp_number, status')
        .order('name')
        .returns<{ id: string; name: string; whatsapp_number: string; status: string }[]>(),
      service.from('models').select('id, name, photo').order('name').returns<{ id: string; name: string; photo: string | null }[]>(),
      listDeliveries(service),
    ])
    clients = (clientsRes.data ?? []).filter(
      (c) => matches(c.name) || c.whatsapp_number.replace(/\D/g, '').includes(query.replace(/\D/g, '')),
    )
    models = (modelsRes.data ?? []).filter((m) => matches(m.name))
    deliveries = deliveriesRes.filter(
      (d) =>
        matches(d.clients?.name ?? '') ||
        (d.clients?.whatsapp_number ?? '').replace(/\D/g, '').includes(query.replace(/\D/g, '')),
    )
  }

  const response = new Response(renderSearch(appUser, { query: q, projects, clients, models, deliveries }), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' },
  })
  return response
}