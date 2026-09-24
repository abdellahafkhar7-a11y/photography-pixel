import type { PagesFunction } from '@cloudflare/workers-types'
import { html, requireOwner, requireSession } from '../_lib/auth'
import { sameOrigin } from '../_lib/security'
import type { RoleKey } from '../../_lib/db-types'
import type { DeliveryEnv } from '../../_lib/env'
import { runCleanup, type CleanupResult } from '../../_lib/cleanup'
import {
  adminTopbar,
  brandPage,
  emptyStateHtml,
  escapeHtml,
  formatDateTime,
  icon,
  sourcePillHtml,
  statusBadgeHtml,
} from '../../_lib/brand'
import { formString, listDeliveries, serviceFrom, type DeliveryListItem } from './_helpers'

type Route = PagesFunction<DeliveryEnv, never, Record<string, unknown>>

function roleOf(roleKey: string): RoleKey {
  return roleKey === 'owner' ? 'owner' : 'coordinator'
}

function rowHtml(item: DeliveryListItem): string {
  const client = item.clients
  const clientName = client && client.name.trim().length > 0 ? client.name.trim() : 'عميل محذوف'
  const active = item.delivery_videos.find((video) => video.is_active)
  const version = active ? `${active.version}` : '—'
  const expiry = item.download_expires_at ? formatDateTime(item.download_expires_at) : '—'
  return `<tr>
    <td><a href="/admin/deliveries/${item.id}"><strong>${escapeHtml(clientName)}</strong></a></td>
    <td>${sourcePillHtml(item.source_type)}</td>
    <td>${statusBadgeHtml(item.status)}</td>
    <td>${version}</td>
    <td>${escapeHtml(formatDateTime(item.created_at))}</td>
    <td>${expiry === '—' ? '—' : escapeHtml(expiry)}</td>
    <td><a class="btn btn-subtle" href="/admin/deliveries/${item.id}">${icon('eye', 16)} التفاصيل</a></td>
  </tr>`
}

function renderListPage(role: RoleKey, items: DeliveryListItem[], notice?: string): string {
  const cleanupAction = role === 'owner'
    ? `<form method="post" action="/admin/deliveries" onsubmit="return confirm('تثبيت حالة كل توصيل تجاوز مهلة التحميل وحذف ملفاته الأصلية من التخزين؟')">
         <button class="btn btn-outline" type="submit" name="action" value="cleanup">${icon('trash', 16)} تنظيف التوصيلات المنتهية</button>
       </form>`
    : ''
  const noticeHtml = notice ? `<div class="alert success">${escapeHtml(notice)}</div>` : ''
  const body =
    items.length === 0
      ? emptyStateHtml('لا توجد توصيلات بعد. أنشئ أول توصيل لتظهر هنا.')
      : `${
          role === 'owner'
            ? `<div class="row" style="margin-bottom:1rem">${cleanupAction}</div>`
            : ''
        }<div class="card"><table class="tbl">
          <thead><tr>
            <th>العميل</th><th>المصدر</th><th>الحالة</th><th>النسخة</th>
            <th>تاريخ الإنشاء</th><th>آخر موعد للتحميل</th><th>إجراء</th>
          </tr></thead>
          <tbody>${items.map(rowHtml).join('')}</tbody>
        </table></div>`

  return brandPage(
    'التوصيلات',
    `${adminTopbar('deliveries', role)}
     <div class="between" style="margin-bottom:1.25rem">
       <div><h1>التوصيلات</h1><p class="muted">عرض حالة كل توصيل خاص للعملاء.</p></div>
       <div class="row">
         <a class="btn btn-primary" href="/admin/deliveries/new">${icon('upload', 16)} توصيل جديد</a>
       </div>
     </div>${noticeHtml}${body}`,
    { wide: true },
  )
}

export const onRequestGet: Route = async (context) => {
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser
  const role = roleOf(appUser.role_key)

  const service = serviceFrom(context)
  const items = service ? await listDeliveries(service) : []
  return html(renderListPage(role, items))
}

export const onRequestPost: Route = async (context) => {
  if (!sameOrigin(context.request)) return html('<p>طلب غير صالح.</p>', 403)
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser
  const forbidden = requireOwner(appUser)
  if (forbidden) return forbidden
  const role = roleOf(appUser.role_key)

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
    return html(renderListPage(role, items, `انتهى التنظيف — ${parts.join('، ')}.`))
  }

  return html(renderListPage(role, items))
}