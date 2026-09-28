import type { PagesFunction } from '@cloudflare/workers-types'
import { createServiceClient } from '../../_lib/supabase'
import { siteUrl } from '../../_lib/env'
import { html, requireOwner, requireSession } from '../_lib/auth'
import { sameOrigin } from '../_lib/security'
import type { Env } from '../_lib/env'
import { adminHtml, formString, isValidUuid, loadDeliveryDetail, parseIntOr } from '../deliveries/_helpers'
import { renderDetailPage } from '../deliveries/[id]/index'
import { renderClientWorkspace, renderClients } from '../_lib/clients-views'
import {
  createSlotDelivery,
  loadClientDetail,
  loadModelsOptions,
  setClientProfile,
  setClientStatus,
  type ClientProfileInput,
} from '../_lib/clients-data'
import type { DeliveryMode } from '../../_lib/db-types'

type AdminFunction = PagesFunction<Env, never, Record<string, unknown>>

function workspaceError(appUser: Parameters<typeof renderClients>[0], message: string, status = 404): Response {
  return html(renderClients(appUser, [], { error: message }), status)
}

export const onRequestGet: AdminFunction = async (context) => {
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser
  const forbidden = requireOwner(appUser)
  if (forbidden) return forbidden

  const id = (context.params as { id?: string }).id ?? ''
  if (!isValidUuid(id)) return workspaceError(appUser, 'معرّف غير صالح.')

  const service = createServiceClient(context.env)
  if (!service) return workspaceError(appUser, 'النظام غير مهيأ.', 500)

  const detail = await loadClientDetail(service, id)
  if (!detail) return workspaceError(appUser, 'العميل غير موجود.')

  const models = await loadModelsOptions(service)
  const response = html(renderClientWorkspace(appUser, detail, models))
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('X-Robots-Tag', 'noindex')
  return response
}

function profileFromForm(form: FormData): ClientProfileInput {
  const rawCount = parseIntOr(formString(form.get('video_count')), 0, 50)
  const mode: DeliveryMode = formString(form.get('delivery_mode')) === 'VIEW_ONLY' ? 'VIEW_ONLY' : 'VIEW_AND_DOWNLOAD'
  return {
    modelId: formString(form.get('model_id')) || null,
    count: rawCount,
    mode,
    script: formString(form.get('script')),
  }
}

export const onRequestPost: AdminFunction = async (context) => {
  if (!sameOrigin(context.request)) return html('<p>طلب غير صالح.</p>', 403)
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser
  const forbidden = requireOwner(appUser)
  if (forbidden) return forbidden

  const id = (context.params as { id?: string }).id ?? ''
  if (!isValidUuid(id)) return workspaceError(appUser, 'معرّف غير صالح.')

  const service = createServiceClient(context.env)
  if (!service) return workspaceError(appUser, 'النظام غير مهيأ.', 500)

  const detail = await loadClientDetail(service, id)
  if (!detail) return workspaceError(appUser, 'العميل غير موجود.')

  const models = await loadModelsOptions(service)
  const form = await context.request.formData()
  const action = formString(form.get('action'))

  const renderWorkspace = (notice = '', error = '') =>
    html(renderClientWorkspace(appUser, detail, models, { notice, error }))

  if (action === 'archive' || action === 'reactivate') {
    const next = action === 'archive' ? 'archived' : 'active'
    const result = await setClientStatus(service, id, next)
    if (!result.ok) return renderWorkspace('', result.error)
    const updated = await loadClientDetail(service, id)
    return html(
      renderClientWorkspace(appUser, updated ?? detail, models, {
        notice: action === 'archive' ? 'تمت أرشفة العميل — تبقى توصيلاته وروابطه الخاصة كما هي.' : 'أُعيد تنشيط العميل.',
      }),
    )
  }

  if (action === 'set_profile') {
    const result = await setClientProfile(service, id, profileFromForm(form))
    if (!result.ok) return renderWorkspace('', result.error)
    const updated = await loadClientDetail(service, id)
    return html(
      renderClientWorkspace(appUser, updated ?? detail, await loadModelsOptions(service), {
        notice: 'تم حفظ الخطة — فُسّحت اللقطات وحُدّث الوضع والسكربت. الفيديوهات المرفوعة لم تتغيّر.',
      }),
    )
  }

  if (action === 'upload_slot') {
    const slotId = formString(form.get('slot_id'))
    if (!isValidUuid(slotId)) return renderWorkspace('', 'اللقطة غير معروفة.')
    const slot = detail.slots.find((item) => item.slot.id === slotId)
    if (!slot) return renderWorkspace('', 'اللقطة غير موجودة.')

    const result = await createSlotDelivery(service, {
      clientId: id,
      slotId,
      userId: appUser.id,
      whatsapp: detail.client.whatsapp_number,
    })
    if (!result.ok) return renderWorkspace('', result.error)

    if ('existing' in result) {
      return renderWorkspace('اللقطة جاهزة مسبقاً — ارفع فيديوها من صفحة التوصيل.')
    }

    // Same flow as the delivery creation page: render the detail once with the
    // fresh private link so the owner can copy/share it exactly once.
    const base = siteUrl(context.env, context.request)
    const updatedDetail = await loadDeliveryDetail(service, result.deliveryId)
    return adminHtml(
      renderDetailPage(appUser, base, updatedDetail ?? null, {
        freshToken: result.token,
        identifier: result.identifier,
        notice: 'تم تجهيز الفيديو الخاص لهذه اللقطة — ارفع الملف ثم أرسل الرابط للعميل.',
      }),
    )
  }

  return renderWorkspace('', 'إجراء غير معروف.')
}