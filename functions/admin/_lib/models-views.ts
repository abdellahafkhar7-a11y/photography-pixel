import type { AppUserRow } from './types'
import { escapeHtml, shell, shellIcon, statCard } from './shell'
import type { ModelListItem } from './models-data'

//============================================================================
// Phase 4N — Model workspace (management). The /admin/models page is now a
// real workspace over the seeded models table: availability, WhatsApp target
// for the booking message, and per-model client/video stats.
//============================================================================

const DATE_TIME = new Intl.DateTimeFormat('ar-MA', {
  dateStyle: 'medium',
  timeStyle: 'short',
  numberingSystem: 'latn',
  timeZone: 'Africa/Casablanca',
})

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : DATE_TIME.format(date)
}

export type ModelsWorkspaceOptions = {
  notice?: string
  error?: string
  missingWhatsapp?: { id: string; name: string }[]
}

function photoCell(photo: string | null, name: string): string {
  return photo
    ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(name)}" loading="lazy" style="width:48px;height:60px;object-fit:cover;border-radius:8px;border:1px solid var(--line-default)">`
    : `<span class="muted">—</span>`
}

function availabilityPill(available: boolean): string {
  return available
    ? `<span class="badge st-downloaded">متاح</span>`
    : `<span class="badge st-pending">غير متاح</span>`
}

export function renderModelsWorkspace(
  appUser: AppUserRow,
  items: ModelListItem[],
  options: ModelsWorkspaceOptions = {},
): string {
  const isOwner = appUser.role_key === 'owner'
  const clientsTotal = items.reduce((sum, item) => sum + item.clientCount, 0)
  const videosTotal = items.reduce((sum, item) => sum + item.activeVideos, 0)

  const warnings = new Map((options.missingWhatsapp ?? []).map((m) => [m.id, m]))
  const alerts = [
    options.notice ? `<div class="alert success">${escapeHtml(options.notice)}</div>` : '',
    options.error ? `<div class="alert error">${escapeHtml(options.error)}</div>` : '',
  ].join('')

  const rows =
    items.length === 0
      ? `<tr><td colspan="7"><p class="muted" style="padding:.5rem 0">لا توجد موديلات مسجلة.</p></td></tr>`
      : items
          .map(({ model, clientCount, slotCount, activeVideos, delivered, pending, latestClient }) => {
            const missingWa = warnings.has(model.id)
            const whatsappCell = isOwner
              ? `<form method="post" action="/admin/models" style="display:flex;gap:.4rem;flex-wrap:wrap;align-items:center">
                   <input type="hidden" name="action" value="set_whatsapp">
                   <input type="hidden" name="model_id" value="${model.id}">
                   <input type="tel" name="whatsapp" value="${escapeHtml(model.whatsapp_number ?? '')}" dir="ltr" placeholder="0663…" style="width:8.5rem;padding:.42rem .6rem;border:1px solid var(--line-strong);border-radius:var(--radius-sm);background:#fff;font-size:.84rem;font-family:inherit" aria-label="رقم واتساب الموديل">
                   <button class="btn btn-text" type="submit">${shellIcon('check', 15)} حفظ</button>
                 </form>${missingWa ? `<p class="hint" style="color:var(--error)">أضف رقم واتساب لإرسال رسالة الحجز للموديل.</p>` : ''}`
              : model.whatsapp_number
                ? `<span dir="ltr">+${escapeHtml(model.whatsapp_number)}</span>`
                : '—'
            const availability =
              isOwner
                ? `<form method="post" action="/admin/models">
                     <input type="hidden" name="action" value="set_available">
                     <input type="hidden" name="model_id" value="${model.id}">
                     <button class="btn btn-text" type="submit" name="available" value="${model.available ? '0' : '1'}">${model.available ? '<span class="badge st-pending">تعطيل</span>' : '<span class="badge st-downloaded">تفعيل</span>'}</button>
                   </form>`
                : availabilityPill(model.available)
            const latest = latestClient
              ? `<a href="/admin/clients/${latestClient.id}"><strong>${escapeHtml(latestClient.name)}</strong></a><span class="hint" style="display:block">${escapeHtml(formatDateTime(latestClient.created_at))}</span>`
              : '—'
            return `<tr>
              <td>${photoCell(model.photo, model.name)}</td>
              <td><strong>${escapeHtml(model.name || '—')}</strong> ${availabilityPill(model.available)}</td>
              <td>${availability}</td>
              <td>${whatsappCell}</td>
              <td>${clientCount} <span class="hint" style="display:block">${slotCount} فيديو مخطّط</span></td>
              <td>${activeVideos} <span class="hint" style="display:block">${delivered} تم التسليم · ${pending} بانتظار</span></td>
              <td>${latest}</td>
              <td><a class="btn btn-subtle" href="/admin/clients?model=${model.id}">${shellIcon('user', 15)} العملاء</a> <a class="btn btn-subtle" href="/admin/projects?model=${model.id}">${shellIcon('kanban', 15)} المشاريع</a></td>
            </tr>`
          })
          .join('')

  const content = `
    <div class="page-head">
      <div>
        <h1>الموديلات</h1>
        <p class="sub">فريق الموديلات المرتبط بحجوزات العملاء. تُستورد أسماء الموديلات من بيانات الموقع المنشورة.</p>
      </div>
      <a class="btn btn-subtle" href="/model" target="_blank" rel="noreferrer noopener">${shellIcon('external', 15)} الصفحة العامة</a>
    </div>
    ${alerts}
    <div class="grid-stats three">
      ${statCard('إجمالي الموديلات', 'users', String(items.length))}
      ${statCard('عملاء مرتبطون', 'user', String(clientsTotal))}
      ${statCard('فيديوهات مسلّمة', 'video', String(videosTotal))}
    </div>
    <div class="card"><div class="table-wrap"><table class="tbl">
      <thead><tr><th>الصورة</th><th>الاسم</th><th>الحالة</th><th>واتساب</th><th>العملاء</th><th>الفيديوهات</th><th>آخر عميل</th><th>إجراء</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div></div>`

  return shell('الموديلات', content, {
    active: 'models',
    user: appUser,
    crumbs: 'Photography Pixel / الموديلات',
  })
}