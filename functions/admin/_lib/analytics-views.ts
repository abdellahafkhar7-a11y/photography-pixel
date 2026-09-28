import type { AppUserRow } from './types'
import type { DeliveryStatus } from '../../_lib/db-types'
import { escapeHtml, panel, shell, shellIcon, statCard } from './shell'
import type { AnalyticsData } from './analytics-data'

//============================================================================
// Phase 4H — Analytics UI, rendered with the Phase 4A/4B shell.
// Presentation only; all numbers come from the analytics-data loader (real
// database values, no invented metrics).
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

const STATUS_LABEL: Record<DeliveryStatus, string> = {
  pending: 'قيد الانتظار',
  preview_viewed: 'تم فتح المعاينة',
  confirmed: 'تم التأكيد',
  download_available: 'التحميل متاح',
  downloaded: 'تم التحميل',
  expired: 'منتهي',
}

const ACTIVITY_ICON: Partial<Record<string, string>> = {
  delivery_created: 'package',
  version_created: 'package',
  reuploaded: 'package',
  link_opened: 'eye',
  preview_viewed: 'eye',
  video_confirmed: 'sparkle',
  download_started: 'package',
  download_completed: 'package',
  delivery_expired: 'clock',
  original_deleted: 'package',
}

function miniEmpty(message: string): string {
  return `<div class="mini-empty"><p class="muted">${escapeHtml(message)}</p></div>`
}

function statusContent(data: AnalyticsData): string {
  if (data.deliveriesCount === 0) return miniEmpty('لا توجد تسليمات بعد')
  const rows = data.statusRows
    .filter((row) => row.count > 0)
    .map(
      (row) =>
        `<tr>
          <td><span class="dot st-${row.status}" aria-hidden="true"></span>${STATUS_LABEL[row.status] ?? row.status}</td>
          <td>${row.count}</td>
          <td>${row.share}٪</td>
        </tr>`,
    )
    .join('')
  return `<div class="table-wrap"><table class="tbl">
    <thead><tr><th>الحالة</th><th>العدد</th><th>الحصة</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`
}

function eventsContent(data: AnalyticsData): string {
  if (data.eventRows.length === 0) return miniEmpty('لا توجد أحداث نشاط بعد')
  const rows = data.eventRows
    .map(
      (row) =>
        `<tr>
          <td><span class="a-ico" aria-hidden="true">${shellIcon(ACTIVITY_ICON[row.type] ?? 'activity', 15)}</span>${escapeHtml(row.label)}</td>
          <td>${row.count}</td>
        </tr>`,
    )
    .join('')
  return `<div class="table-wrap"><table class="tbl">
    <thead><tr><th>الحدث</th><th>العدد</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`
}

function monthlyContent(data: AnalyticsData): string {
  if (data.monthlyRows.length === 0) return miniEmpty('لا توجد تسليمات مسجلة')
  const rows = data.monthlyRows
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.label)}</td><td>${row.count}</td></tr>`,
    )
    .join('')
  return `<div class="table-wrap"><table class="tbl">
    <thead><tr><th>الشهر</th><th>التسليمات</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`
}

function recentActivity(data: AnalyticsData): string {
  if (data.recentActivity.length === 0) return miniEmpty('لا توجد أنشطة حديثة')
  const rows = data.recentActivity
    .map((item) => {
      const meta = item.clientName ? `<div class="a-meta">العميل: ${escapeHtml(item.clientName)}</div>` : ''
      return `<div class="activity-row"><span class="a-ico" aria-hidden="true">${shellIcon(ACTIVITY_ICON[item.type] ?? 'activity', 16)}</span><div class="a-body"><div class="a-label">${escapeHtml(item.label)}</div>${meta}</div><time class="a-time">${escapeHtml(formatDateTime(item.createdAt))}</time></div>`
    })
    .join('')
  return `<div class="activity-list">${rows}</div>`
}

export function renderAnalytics(appUser: AppUserRow, data: AnalyticsData): string {
  const content = `
    <div class="page-head">
      <div><h1>التحليلات</h1><p class="sub">أرقام حقيقية من قاعدة البيانات فقط — دون مقاييس مُختلقة. هذه الصفحة متاحة لصاحب الموقع.</p></div>
    </div>
    <div class="grid-stats">
      ${statCard('إجمالي التوصيلات', 'package', String(data.deliveriesCount))}
      ${statCard('العملاء', 'users', String(data.clientsCount))}
      ${statCard('نسبة الإتمام', 'check', data.completionRate === null ? '—' : `${data.completionRate}٪`, 'حتى تأكيد الفيديو')}
      ${statCard('تحميلات مكتملة', 'download', String(data.downloadsCompleted))}
    </div>
    <div class="grid-2">
      ${panel('توزيع الحالات', 'package', statusContent(data), {})}
      ${panel('نشاط التوصيلات', 'activity', eventsContent(data), {})}
    </div>
    <div class="grid-2" style="margin-top:1rem">
      ${panel('التوصيلات الشهرية', 'calendar', monthlyContent(data), {})}
      ${panel('آخر النشاطات', 'clock', recentActivity(data), {})}
    </div>`

  return shell('التحليلات', content, {
    active: 'analytics',
    user: appUser,
    crumbs: 'Photography Pixel / التحليلات',
  })
}