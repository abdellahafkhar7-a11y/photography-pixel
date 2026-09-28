import type { PagesFunction } from '@cloudflare/workers-types'
import { createServiceClient } from '../_lib/supabase'
import { html, requireOwner, requireSession } from './_lib/auth'
import { sameOrigin } from './_lib/security'
import type { Env } from './_lib/env'
import { renderProjects, type ProjectsListOptions } from './_lib/projects-views'
import {
  createProject,
  loadProjectsWorkbench,
} from './_lib/projects-data'
import { loadModelsOptions } from './_lib/clients-data'
import { formString, parseIntOr, isValidUuid } from './deliveries/_helpers'
import type { Db } from '../_lib/supabase'

type AdminFunction = PagesFunction<Env, never, Record<string, unknown>>

const WORKBENCH_FILTERS = new Set(['all', 'today', 'wip', 'review', 'ready'])

async function listOptions(service: Db): Promise<Pick<NonNullable<ProjectsListOptions>, 'models' | 'clients'>> {
  const [models, clientsRes] = await Promise.all([
    loadModelsOptions(service),
    service.from('clients').select('id, name').order('name').returns<{ id: string; name: string }[]>(),
  ])
  return {
    models,
    clients: clientsRes.data ?? [],
  }
}

export const onRequestGet: AdminFunction = async (context) => {
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser
  const forbidden = requireOwner(appUser)
  if (forbidden) return forbidden

  const service = createServiceClient(context.env)
  if (!service) return html(renderProjects(appUser, { date: '', all: [], projects: [] }, { models: [], clients: [], error: 'النظام غير مهيأ.' }), 500)

  const url = new URL(context.request.url)
  const query = url.searchParams.get('q') ?? ''
  const rawDate = url.searchParams.get('date') ?? ''
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : undefined
  const rawFilter = url.searchParams.get('filter') ?? 'all'
  const filter = WORKBENCH_FILTERS.has(rawFilter) ? (rawFilter as NonNullable<NonNullable<ProjectsListOptions>['filter']>) : 'all'
  const requestedClient = url.searchParams.get('client_id') ?? ''
  const createOpen = url.searchParams.get('new') === '1'

  const { models, clients } = await listOptions(service)
  const clientOk = isValidUuid(requestedClient) && clients.some((c) => c.id === requestedClient)

  const data = await loadProjectsWorkbench(service, {
    date,
    query,
    clientId: clientOk ? requestedClient : '',
  })

  const response = html(
    renderProjects(appUser, data, {
      date,
      filter,
      query,
      models,
      clients,
      clientId: clientOk ? requestedClient : '',
      createOpen,
      createClientId: createOpen && clientOk ? requestedClient : undefined,
    }),
  )
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('X-Robots-Tag', 'noindex')
  return response
}

export const onRequestPost: AdminFunction = async (context) => {
  if (!sameOrigin(context.request)) return html('<p>طلب غير صالح.</p>', 403)
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser
  const forbidden = requireOwner(appUser)
  if (forbidden) return forbidden

  const form = await context.request.formData()
  const action = formString(form.get('action'))
  const service = createServiceClient(context.env)
  if (!service) return html(renderProjects(appUser, { date: '', all: [], projects: [] }, { models: [], clients: [], error: 'النظام غير مهيأ.' }), 500)

  if (action === 'create') {
    const count = parseIntOr(formString(form.get('video_count')), 3, 50)
    const result = await createProject(service, {
      clientId: formString(form.get('client_id')),
      name: formString(form.get('name')),
      modelId: formString(form.get('model_id')) || null,
      count,
      userId: appUser.id,
    })
    if (!result.ok) {
      const [data, { models, clients }] = await Promise.all([loadProjectsWorkbench(service), listOptions(service)])
      return html(
        renderProjects(appUser, data, {
          models,
          clients,
          error: result.error,
          createOpen: true,
          createClientId: clients.some((c) => c.id === formString(form.get('client_id')))
            ? formString(form.get('client_id'))
            : undefined,
        }),
      )
    }
    return new Response(null, {
      status: 303,
      headers: { Location: `/admin/projects/${result.project.id}` },
    })
  }

  const [data, { models, clients }] = await Promise.all([loadProjectsWorkbench(service), listOptions(service)])
  return html(renderProjects(appUser, data, { models, clients }))
}