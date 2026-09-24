import type { PagesFunction } from '@cloudflare/workers-types'
import { html, requireOwner, requireSession } from '../../_lib/auth'
import { sameOrigin } from '../../_lib/security'
import { siteUrl, type DeliveryEnv } from '../../../_lib/env'
import type { RoleKey } from '../../../_lib/db-types'
import { adminTopbar, brandPage, escapeHtml, icon } from '../../../_lib/brand'
import { generatePrivateToken, hashPrivateToken } from '../../../_lib/tokens'
import { recordActivity } from '../../../_lib/activities'
import { originalKey, sanitizeFileName } from '../../../_lib/r2'
import {
  isValidUuid,
  loadDeliveryDetail,
  serviceFrom,
} from '../_helpers'
import { renderDetailPage } from './index'

type Route = PagesFunction<DeliveryEnv, never, Record<string, unknown>>

const VIDEO_EXT: Record<string, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  m4v: 'video/x-m4v',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  mpeg: 'video/mpeg',
  mpg: 'video/mpeg',
}

function extOf(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase()
}

function detectMime(file: File): string | null {
  const fromType = file.type.toLowerCase()
  if (fromType.startsWith('video/') || fromType.startsWith('image/')) return fromType
  const ext = extOf(file.name)
  return VIDEO_EXT[ext] ?? null
}

function roleOf(roleKey: string): RoleKey {
  return roleKey === 'owner' ? 'owner' : 'coordinator'
}

function renderUploadForm(
  role: RoleKey,
  deliveryId: string,
  hasVideo: boolean,
  notice?: string,
  error?: string,
): string {
  return brandPage(
    'رفع الفيديو',
    `${adminTopbar('deliveries', role)}
     <div class="between" style="margin-bottom:1.25rem">
       <div>
         <p class="muted" style="margin-bottom:.3rem"><a href="/admin/deliveries/${deliveryId}">← تفاصيل التوصيل</a></p>
         <h1>${hasVideo ? 'رفع نسخة جديدة من الفيديو' : 'رفع الفيديو الخاص'}</h1>
         <p class="muted">النسخة الجديدة تُلغى النسخة السابقة، تعيد ضبط حالة التوصيل وتُنشئ رابطاً جديداً.</p>
       </div>
     </div>
     ${notice ? `<div class="alert success">${escapeHtml(notice)}</div>` : ''}
     ${error ? `<div class="alert error">${escapeHtml(error)}</div>` : ''}
     <form method="post" action="/admin/deliveries/${deliveryId}/upload" enctype="multipart/form-data">
       <div class="card">
         <label class="field"><span>ملف الفيديو (mp4, mov, webm ...)</span>
           <input type="file" name="file" accept="video/*" required>
           <span class="hint">يُخزَّن في مخزن خاص، غير متاح للعموم. لا يُنشر أبداً على الموقع.</span>
         </label>
         <div class="actionbar">
           <button class="btn btn-primary" type="submit">${icon('upload')} ${hasVideo ? 'رفع النسخة الجديدة' : 'رفع الفيديو'}</button>
         </div>
       </div>
     </form>`,
  )
}

export const onRequestGet: Route = async (context) => {
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser
  const forbidden = requireOwner(appUser)
  if (forbidden) return forbidden
  const role = roleOf(appUser.role_key)

  const id = (context.params as { id?: string }).id ?? ''
  if (!isValidUuid(id)) return html(renderUploadForm(role, id, true, undefined, 'معرّف غير صالح.'))
  const service = serviceFrom(context)
  if (!service) return html(renderUploadForm(role, id, true, undefined, 'النظام غير مهيأ.'))
  const detail = await loadDeliveryDetail(service, id)
  if (!detail) return html(renderUploadForm(role, id, true, undefined, 'التوصيل غير موجود.'))
  if (detail.source_type !== 'r2') {
    return html(renderUploadForm(role, id, true, undefined, 'توصيل "المعرض العام" لا يُرفع له ملفات — فيديوهاته منشورة أصلاً على الموقع.'))
  }
  const hasVideo = (detail.delivery_videos ?? []).length > 0
  return html(renderUploadForm(role, id, hasVideo))
}

export const onRequestPost: Route = async (context) => {
  if (!sameOrigin(context.request)) return html('<p>طلب غير صالح.</p>', 403)
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser
  const forbidden = requireOwner(appUser)
  if (forbidden) return forbidden
  const role = roleOf(appUser.role_key)
  const base = siteUrl(context.env, context.request)

  const id = (context.params as { id?: string }).id ?? ''
  if (!isValidUuid(id)) return html(renderUploadForm(role, id, true, undefined, 'معرّف غير صالح.'))
  const service = serviceFrom(context)
  if (!service) return html(renderUploadForm(role, id, true, undefined, 'النظام غير مهيأ.'))
  const detail = await loadDeliveryDetail(service, id)
  if (!detail) return html(renderUploadForm(role, id, true, undefined, 'التوصيل غير موجود.'))
  if (detail.source_type !== 'r2') {
    return html(renderUploadForm(role, id, (detail.delivery_videos ?? []).length > 0, undefined, 'توصيل المعرض العام لا يُرفع له ملفات.'))
  }
  const hasVideo = (detail.delivery_videos ?? []).length > 0

  const form = await context.request.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    return html(renderUploadForm(role, id, hasVideo, undefined, 'اختر ملف فيديو أولاً.'))
  }
  if (file.size <= 0) {
    return html(renderUploadForm(role, id, hasVideo, undefined, 'الملف فارغ.'))
  }
  const mime = detectMime(file)
  if (!mime) {
    return html(renderUploadForm(role, id, hasVideo, undefined, 'نوع الملف غير مدعوم — ارفع فيديو (mp4, mov, webm ...).'))
  }
  if (!context.env.BUCKET) {
    return html(renderUploadForm(role, id, hasVideo, undefined, 'مخزن R2 غير مهيأ — لا يمكن تخزين الملف الخاص.'))
  }

  const versions = detail.delivery_videos ?? []
  const nextVersion = versions.reduce((max, video) => Math.max(max, video.version), 0) + 1
  const filename = sanitizeFileName(file.name)
  const key = originalKey(detail.id, nextVersion, filename)

  try {
    await context.env.BUCKET.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: mime },
    })
  } catch {
    return html(renderUploadForm(role, id, hasVideo, undefined, 'تعذّر رفع الملف إلى التخزين.'))
  }

  // Deactivate all older versions (a delivery has exactly one active version).
  await service.from('delivery_videos').update({ is_active: false }).eq('delivery_id', detail.id)

  const { error: insertError } = await service.from('delivery_videos').insert({
    delivery_id: detail.id,
    version: nextVersion,
    source_type: 'r2',
    r2_original_key: key,
    r2_preview_key: null,
    r2_thumb_key: null,
    original_filename: filename,
    mime_type: mime,
    size_bytes: file.size,
    created_by: appUser.id,
  })
  if (insertError) {
    return html(renderUploadForm(role, id, hasVideo, undefined, 'تعذّر حفظ النسخة.'))
  }

  // A new version resets the delivery and rotates the private token.
  const token = generatePrivateToken()
  const hash = await hashPrivateToken(token)
  const now = new Date().toISOString()
  const { error: resetError } = await service.from('deliveries').update({
    status: 'pending',
    private_token_hash: hash,
    token_created_at: now,
    token_expires_at: null,
    confirmed_at: null,
    downloaded_at: null,
    download_expires_at: null,
    expired_at: null,
  }).eq('id', detail.id)
  if (resetError) {
    return html(renderUploadForm(role, id, hasVideo, undefined, 'تعذّر تفعيل النسخة الجديدة.'))
  }

  if (nextVersion > 1) {
    await recordActivity(service, detail.id, 'reuploaded', { version: nextVersion })
  }

  const updated = await loadDeliveryDetail(service, detail.id)
  const notice = hasVideo
    ? `تم رفع النسخة ${nextVersion}. أُلغيت النسخة السابقة وأُنشئ رابط جديد للعميل.`
    : 'تم رفع الفيديو. أصبح الرابط جاهزاً للإرسال إلى العميل.'
  return html(renderDetailPage(role, base, updated ?? detail, { freshToken: token, notice }))
}