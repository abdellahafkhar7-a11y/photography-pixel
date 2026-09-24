import type { PagesFunction } from '@cloudflare/workers-types'
import { html, requireOwner, requireSession } from '../../_lib/auth'
import type { DeliveryEnv } from '../../../_lib/env'
import { siteUrl } from '../../../_lib/env'
import type { RoleKey } from '../../../_lib/db-types'
import { sameOrigin } from '../../_lib/security'
import {
  adminTopbar,
  brandPage,
  escapeHtml,
  formatDateTime,
  icon,
  sourcePillHtml,
  statusBadgeHtml,
  COPY_SCRIPT,
} from '../../../_lib/brand'
import { generatePrivateToken, hashPrivateToken } from '../../../_lib/tokens'
import { deliveryShareWaLink } from '../../../_lib/whatsapp'
import {
  ACTIVITY_LABEL,
  adminHtml,
  formString,
  isValidUuid,
  loadDeliveryDetail,
  serviceFrom,
  type DeliveryDetail,
} from '../_helpers'

type Route = PagesFunction<DeliveryEnv, never, Record<string, unknown>>

function roleOf(roleKey: string): RoleKey {
  return roleKey === 'owner' ? 'owner' : 'coordinator'
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function linkCardHtml(base: string, token: string, whatsapp: string): string {
  const privateLink = `${base}/p/${token}`
  return `<div class="card">
    <div class="between"><h2>رابط التوصيل</h2><span class="pill">يظهر مرة واحدة فقط</span></div>
    <div class="linkbox"><span dir="ltr">${escapeHtml(privateLink)}</span><button class="btn btn-subtle copy" data-copy="${escapeHtml(privateLink)}">${icon('copy')} نسخ الرابط</button></div>
    <p class="hint" style="margin-top:.5rem">شارك الرابط مع العميل عبر واتساب. النظام يحفظ نسخة مشفرة فقط من الرابط.</p>
    <div class="actionbar">
      <a class="btn btn-success" href="${escapeHtml(deliveryShareWaLink(whatsapp, privateLink))}" target="_blank" rel="noreferrer noopener">${icon('whatsapp')} فتح واتساب مع الرابط</a>
    </div>
  </div>`
}

export type DetailPageOptions = {
  freshToken?: string
  notice?: string
  error?: string
}

function renderDetailPageHtml(
  role: RoleKey,
  base: string,
  detail: DeliveryDetail | null,
  options: DetailPageOptions = {},
): string {
  if (!detail) {
    const message = options.error ?? 'تعذّر تحميل التوصيل.'
    return brandPage(
      'تفاصيل التوصيل',
      `${adminTopbar('deliveries', role)}
      <div class="card"><h1>${escapeHtml(message)}</h1>
      <div class="actionbar"><a class="btn btn-subtle" href="/admin/deliveries">الرجوع إلى التوصيلات</a></div></div>`,
    )
  }

  const client = detail.clients
  const whatsapp = client?.whatsapp_number ?? ''
  const clientName = client && client.name.trim().length > 0 ? client.name.trim() : 'عميل محذوف'
  const videos = detail.delivery_videos ?? []
  const active = videos.find((video) => video.is_active) ?? null
  const isOwner = role === 'owner'
  const expired = detail.status === 'expired'

  const alerts = []
  if (options.notice) alerts.push(`<div class="alert success">${escapeHtml(options.notice)}</div>`)
  if (options.error) alerts.push(`<div class="alert error">${escapeHtml(options.error)}</div>`)
  if (expired) {
    alerts.push(
      `<div class="alert error">${icon('clock', 16)} التوصيل منتهي — لا يمكن فتح الرابط ولا التحميل.`
      + `${isOwner && detail.source_type === 'r2' ? ' يمكن رفع نسخة جديدة لإعادة تنشيطه.' : ''}</div>`,
    )
  } else if (detail.source_type === 'r2' && !active && isOwner) {
    alerts.push(`<div class="alert info">لم يُرفَع الفيديو الخاص بعد. ارفع النسخة الأولى ليظهر الرابط للعميل.</div>`)
  }
  const alertHtml = alerts.join('')

  let shareCard: string
  if (options.freshToken) {
    shareCard = linkCardHtml(base, options.freshToken, whatsapp)
  } else {
    shareCard = `<div class="card">
      <h2>رابط التوصيل</h2>
      <p class="muted">الرابط الخاص ذُكر مرة واحدة عند الإنشاء ولا يمكن استرجاعه.</p>
      ${isOwner && !expired ? `<div class="actionbar" style="margin-top:1rem">
          <form method="post"><input type="hidden" name="action" value="regenerate"><button class="btn btn-subtle" type="submit">${icon('refresh', 16)} إنشاء رابط جديد</button></form>
          <form method="post" onsubmit="return confirm('إلغاء الرابط الحالي؟ لن يتمكن العميل من فتحه بعد الآن.')"><input type="hidden" name="action" value="revoke"><button class="btn btn-danger" type="submit">${icon('ban', 16)} إلغاء الرابط</button></form>
        </div>` : ''}
      ${isOwner && detail.source_type === 'r2'
        ? `<div class="actionbar" style="margin-top:.6rem"><a class="btn btn-primary" href="/admin/deliveries/${detail.id}/upload">${icon('upload', 16)} ${active ? 'رفع نسخة جديدة' : 'رفع الفيديو'}</a></div>`
        : ''}
    </div>`
  }

  const versionRows =
    videos.length === 0
      ? `<tr><td colspan="4"><p class="muted" style="padding:.5rem 0">لا يوجد فيديو بعد.</p></td></tr>`
      : videos
          .map((video) => {
            const badge = video.is_active
              ? `<span class="badge st-confirmed">النسخة النشطة</span>`
              : `<span class="badge st-pending">نسخة سابقة</span>`
            const statusLine = video.original_deleted_at
              ? `<p class="hint">حُذف الملف الأصلي من التخزين بعد انتهاء التحميل.</p>`
              : ''
            return `<tr><td>النسخة ${video.version}</td><td>${sourcePillHtml(video.source_type)}</td><td>${badge}${statusLine}</td><td>${escapeHtml(formatDateTime(video.created_at))}<br><span class="hint">${formatBytes(video.size_bytes)}</span></td></tr>`
          })
          .join('')

  const activityRows =
    detail.delivery_activity.length === 0
      ? `<tr><td colspan="2"><p class="muted" style="padding:.5rem 0">لا يوجد نشاط بعد.</p></td></tr>`
      : detail.delivery_activity
          .slice(0, 30)
          .map(
            (event) =>
              `<tr><td>${escapeHtml(ACTIVITY_LABEL[event.type] ?? event.type)}</td><td>${escapeHtml(formatDateTime(event.created_at))}</td></tr>`,
          )
          .join('')

  const page = brandPage(
    'تفاصيل التوصيل',
    `${adminTopbar('deliveries', role)}
     <div class="between" style="margin-bottom:1.25rem">
       <div>
         <p class="muted" style="margin-bottom:.3rem"><a href="/admin/deliveries">← التوصيلات</a></p>
         <h1>${escapeHtml(clientName)}</h1>
         <div class="row" style="margin-top:.4rem">${sourcePillHtml(detail.source_type)} ${statusBadgeHtml(detail.status)}</div>
       </div>
     </div>
     ${alertHtml}
     ${shareCard}
     <div class="card">
       <h2>معلومات العميل</h2>
       <div class="stat-grid">
         <div class="stat-cell"><div class="label">الاسم</div><div class="value">${escapeHtml(client?.name ?? '—')}</div></div>
         <div class="stat-cell"><div class="label">واتساب</div><div class="value" dir="ltr">${escapeHtml(whatsapp || '—')}</div></div>
         <div class="stat-cell"><div class="label">تاريخ الإنشاء</div><div class="value">${escapeHtml(formatDateTime(detail.created_at))}</div></div>
       </div>
     </div>
     <div class="card">
       <h2>النسخ</h2>
       <table class="tbl"><thead><tr><th>النسخة</th><th>المصدر</th><th>الحالة</th><th>التفاصيل</th></tr></thead><tbody>${versionRows}</tbody></table>
     </div>
     <div class="card">
       <h2>الحالة والجداول الزمنية</h2>
       <div class="stat-grid">
         <div class="stat-cell"><div class="label">الحالة</div><div class="value">${statusBadgeHtml(detail.status)}</div></div>
         <div class="stat-cell"><div class="label">تاريخ الإنشاء</div><div class="value">${escapeHtml(formatDateTime(detail.created_at))}</div></div>
         <div class="stat-cell"><div class="label">تاريخ التأكيد</div><div class="value">${detail.confirmed_at ? escapeHtml(formatDateTime(detail.confirmed_at)) : '—'}</div></div>
         <div class="stat-cell"><div class="label">أول تحميل</div><div class="value">${detail.downloaded_at ? escapeHtml(formatDateTime(detail.downloaded_at)) : '—'}</div></div>
         <div class="stat-cell"><div class="label">آخر موعد للتحميل</div><div class="value">${detail.download_expires_at ? escapeHtml(formatDateTime(detail.download_expires_at)) : '—'}</div></div>
         <div class="stat-cell"><div class="label">الانتهاء</div><div class="value">${detail.expired_at ? escapeHtml(formatDateTime(detail.expired_at)) : '—'}</div></div>
       </div>
     </div>
     <div class="card">
       <h2>سجل النشاط</h2>
       <table class="tbl"><thead><tr><th>الحدث</th><th>التاريخ</th></tr></thead><tbody>${activityRows}</tbody></table>
     </div>${COPY_SCRIPT}`,
    { wide: true },
  )
  return page
}

export function renderDetailPage(
  role: RoleKey,
  base: string,
  detail: DeliveryDetail | null,
  options: DetailPageOptions = {},
): string {
  return renderDetailPageHtml(role, base, detail, options)
}

function loadId(context: { params: unknown }): string {
  const params = context.params as { id?: string }
  return params.id ?? ''
}

export const onRequestGet: Route = async (context) => {
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser
  const role = roleOf(appUser.role_key)
  const base = siteUrl(context.env, context.request)

  const id = loadId(context)
  if (!isValidUuid(id)) return html(renderDetailPageHtml(role, base, null, { error: 'معرّف غير صالح.' }))

  const service = serviceFrom(context)
  if (!service) return html(renderDetailPageHtml(role, base, null, { error: 'النظام غير مهيأ.' }))
  const detail = await loadDeliveryDetail(service, id)
  if (!detail) return html(renderDetailPageHtml(role, base, null, { error: 'التوصيل غير موجود.' }))

  return html(renderDetailPageHtml(role, base, detail))
}

export const onRequestPost: Route = async (context) => {
  if (!sameOrigin(context.request)) return adminHtml('<p>طلب غير صالح.</p>', 403)
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser
  const forbidden = requireOwner(appUser)
  if (forbidden) return forbidden
  const role = roleOf(appUser.role_key)
  const base = siteUrl(context.env, context.request)

  const id = loadId(context)
  if (!isValidUuid(id)) return adminHtml('<p>معرّف غير صالح.</p>', 400)

  const service = serviceFrom(context)
  if (!service) return adminHtml('<p>النظام غير مهيأ.</p>', 500)

  const form = await context.request.formData()
  const action = formString(form.get('action'))
  const detail = await loadDeliveryDetail(service, id)
  if (!detail) return html(renderDetailPageHtml(role, base, null, { error: 'التوصيل غير موجود.' }))

  if (action === 'regenerate') {
    if (detail.status === 'expired') {
      return html(renderDetailPageHtml(role, base, detail, { error: 'التوصيل منتهي — لا يمكن إنشاء رابط جديد له. أعد رفعه لتفعيله.' }))
    }
    const token = generatePrivateToken()
    const hash = await hashPrivateToken(token)
    const { error } = await service
      .from('deliveries')
      .update({ private_token_hash: hash, token_created_at: new Date().toISOString(), token_expires_at: null })
      .eq('id', detail.id)
    if (error) {
      return html(renderDetailPageHtml(role, base, detail, { error: 'تعذّر إنشاء رابط جديد.' }))
    }
    const updated = await loadDeliveryDetail(service, detail.id)
    return html(renderDetailPageHtml(role, base, updated ?? detail, { freshToken: token }))
  }

  if (action === 'revoke') {
    const { error } = await service
      .from('deliveries')
      .update({ token_expires_at: new Date().toISOString() })
      .eq('id', detail.id)
    if (error) {
      return html(renderDetailPageHtml(role, base, detail, { error: 'تعذّر إلغاء الرابط.' }))
    }
    const updated = await loadDeliveryDetail(service, detail.id)
    return html(renderDetailPageHtml(role, base, updated ?? detail, { notice: 'تم إلغاء الرابط الحالي.' }))
  }

  return html(renderDetailPageHtml(role, base, detail, { error: 'إجراء غير معروف.' }))
}