import type { PagesFunction } from '@cloudflare/workers-types'
import { createServiceClient } from '../_lib/supabase'
import { html, requireOwner, requireSession } from './_lib/auth'
import { sameOrigin } from './_lib/security'
import type { Env } from './_lib/env'
import { renderClients, type ClientsListOptions } from './_lib/clients-views'
import {
  createClient,
  listClients,
  loadModelsOptions,
  type ClientProfileInput,
} from './_lib/clients-data'
import { formString, parseIntOr } from './deliveries/_helpers'
import type { DeliveryMode } from '../_lib/db-types'
import type { Db } from '../_lib/supabase'

type AdminFunction = PagesFunction<Env, never, Record<string, unknown>>

async function listOptions(service: Db): Promise<{ models: NonNullable<ClientsListOptions['models']> }> {
  const models = await loadModelsOptions(service)
  return { models }
}

function profileFromForm(form: FormData): ClientProfileInput {
  const rawCount = parseIntOr(formString(form.get('video_count')), 1)
  const mode: DeliveryMode = formString(form.get('delivery_mode')) === 'VIEW_ONLY' ? 'VIEW_ONLY' : 'VIEW_AND_DOWNLOAD'
  return {
    modelId: formString(form.get('model_id')) || null,
    count: rawCount,
    mode,
    script: formString(form.get('script')),
  }
}

export const onRequestGet: AdminFunction = async (context) => {
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser
  const forbidden = requireOwner(appUser)
  if (forbidden) return forbidden

  const service = createServiceClient(context.env)
  if (!service) return html(renderClients(appUser, [], { error: 'النظام غير مهيأ.' }), 500)

  const url = new URL(context.request.url)
  const query = url.searchParams.get('q') ?? ''
  const rawStatus = url.searchParams.get('status') ?? ''
  const status: 'active' | 'archived' | '' = rawStatus === 'active' || rawStatus === 'archived' ? rawStatus : ''
  const modelId = url.searchParams.get('model') ?? ''
  const items = await listClients(service, { status, modelId })
  const { models } = await listOptions(service)
  const modelValid = models.some((model) => model.id === modelId)

  const response = html(
    renderClients(appUser, items, {
      query,
      status,
      models,
      modelId: modelValid ? modelId : '',
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
  if (!service) return html(renderClients(appUser, [], { error: 'النظام غير مهيأ.' }), 500)

  if (action === 'create') {
    const profile = profileFromForm(form)
    const result = await createClient(service, {
      name: formString(form.get('name')),
      whatsapp: formString(form.get('whatsapp')),
      userId: appUser.id,
      profile,
    })
    if (!result.ok) {
      const items = await listClients(service)
      const { models } = await listOptions(service)
      return html(
        renderClients(appUser, items, {
          models,
          error: result.error,
          profile: {
            name: formString(form.get('name')),
            whatsapp: formString(form.get('whatsapp')),
            modelId: formString(form.get('model_id')),
            count: formString(form.get('video_count')),
            mode: profile.mode,
            script: profile.script,
          },
        }),
      )
    }
    return new Response(null, {
      status: 303,
      headers: { Location: `/admin/clients/${result.client.id}` },
    })
  }

  const items = await listClients(service)
  const { models } = await listOptions(service)
  return html(renderClients(appUser, items, { models }))
}