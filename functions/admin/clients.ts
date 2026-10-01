import type { PagesFunction } from '@cloudflare/workers-types'
import { createServiceClient } from '../_lib/supabase'
import { html, requireOwner, requireSession } from './_lib/auth'
import { sameOrigin } from './_lib/security'
import type { Env } from './_lib/env'
import { renderClients, type ClientsListOptions } from './_lib/clients-views'
import {
  createClient,
  deleteClient,
  inspectClientDeletion,
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
      // Result of a client deletion, surfaced verbatim (escaped in the view).
      notice: url.searchParams.get('ok') ?? undefined,
      error: url.searchParams.get('error') ?? undefined,
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

  // Owner-only (guarded above by requireOwner). `action=inspect_delete` is what
  // the confirmation dialog calls to show the real impact before committing, so
  // the owner is never asked to confirm a blind guess.
  if (action === 'inspect_delete') {
    const clientId = formString(form.get('client_id'))
    const impact = await inspectClientDeletion(service, clientId)
    return Response.json(
      impact ?? { error: 'العميل غير موجود.' },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  }

  if (action === 'delete') {
    const clientId = formString(form.get('client_id'))
    const confirmText = formString(form.get('confirm'))
    // Explicit confirmation: the owner must retype the client name. This is the
    // last gate before an irreversible delete.
    const client = await service.from('clients').select('id, name').eq('id', clientId).maybeSingle<{ id: string; name: string }>()
    if (!client.data) return html('<p>العميل غير موجود.</p>', 404)
    if (confirmText.trim() !== client.data.name.trim()) {
      return html('<p>الاسم المكتوب لا يطابق اسم العميل — تم إلغاء الحذف.</p>', 400)
    }
    const result = await deleteClient(service, context.env, clientId)
    if (!result.ok) {
      return new Response(null, {
        status: 303,
        headers: { Location: `/admin/clients?error=${encodeURIComponent(result.error)}` },
      })
    }
    return new Response(null, {
      status: 303,
      headers: {
        Location: `/admin/clients?ok=${encodeURIComponent(
          `تم حذف العميل مع ${result.deletedDeliveries} توصيل و${result.deletedVideos} فيديو و${result.deletedR2Keys} ملف خاص.`,
        )}`,
      },
    })
  }

  const items = await listClients(service)
  const { models } = await listOptions(service)
  return html(renderClients(appUser, items, { models }))
}