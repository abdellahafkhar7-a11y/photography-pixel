import type { PagesFunction } from '@cloudflare/workers-types'
import { html, requireSession } from './_lib/auth'
import type { Env } from './_lib/env'
import { sameOrigin } from './_lib/security'
import { renderModelsWorkspace } from './_lib/models-views'
import {
  loadModelWorkspace,
  setModelAvailable,
  setModelWhatsapp,
} from './_lib/models-data'
import { createServiceClient } from '../_lib/supabase'
import { isValidWhatsapp, normalizeWhatsapp } from '../_lib/whatsapp'
import { formString } from './deliveries/_helpers'

type AdminFunction = PagesFunction<Env, never, Record<string, unknown>>

export const onRequestGet: AdminFunction = async (context) => {
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser

  const service = createServiceClient(context.env)
  if (!service) return html(renderModelsWorkspace(appUser, [], { error: 'النظام غير مهيأ.' }), 500)
  const items = await loadModelWorkspace(service)
  return html(
    renderModelsWorkspace(appUser, items, {
      missingWhatsapp: items.filter((item) => !item.model.whatsapp_number).map((item) => ({
        id: item.model.id,
        name: item.model.name,
      })),
    }),
  )
}

export const onRequestPost: AdminFunction = async (context) => {
  if (!sameOrigin(context.request)) return html('<p>طلب غير صالح.</p>', 403)
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser
  if (appUser.role_key !== 'owner') {
    return html(renderModelsWorkspace(appUser, [], { error: 'غير مصرح لك بإجراء هذا التعديل.' }), 403)
  }

  const service = createServiceClient(context.env)
  if (!service) return html(renderModelsWorkspace(appUser, [], { error: 'النظام غير مهيأ.' }), 500)
  const input = await context.request.formData()
  const action = formString(input.get('action'))
  const modelId = formString(input.get('model_id'))

  if (!modelId) {
    const items = await loadModelWorkspace(service)
    return html(renderModelsWorkspace(appUser, items, { error: 'اختر الموديل أولاً.' }))
  }

  let notice = ''
  let error = ''

  if (action === 'set_whatsapp') {
    const raw = formString(input.get('whatsapp'))
    if (raw.trim() && !isValidWhatsapp(raw)) {
      error = 'رقم الواتساب غير صالح — استعمل صيغة مثل 0663493003.'
    } else {
      const result = await setModelWhatsapp(service, modelId, normalizeWhatsapp(raw))
      if (result.ok) notice = 'تم حفظ رقم واتساب الموديل.'
      else error = result.error
    }
  } else if (action === 'set_available') {
    const available = formString(input.get('available')) === '1'
    const result = await setModelAvailable(service, modelId, available)
    if (result.ok) notice = `تم ${available ? 'تفعيل' : 'تعطيل'} الموديل.`
    else error = result.error
  } else {
    error = 'إجراء غير معروف.'
  }

  const items = await loadModelWorkspace(service)
  return html(
    renderModelsWorkspace(appUser, items, {
      notice,
      error,
      missingWhatsapp: items.filter((item) => !item.model.whatsapp_number).map((item) => ({
        id: item.model.id,
        name: item.model.name,
      })),
    }),
  )
}