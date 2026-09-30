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

//--------------------------------------------------------------------------
// Phase 4R — Analytics 2.0: date-range filter + production/CRM/delivery/model
// panels. The range slice (filterBar) submits back to /admin/analytics and the
// data layer (analytics-data) re-reads it, so every number below already
// respects the selected window.
//--------------------------------------------------------------------------

const RANGE_SEGMENTS = [
  { key: 'all', label: 'كل الفترات' },
  { key: 'today', label: 'اليوم' },
  { key: 'week', label: '7 أيام' },
  { key: 'month', label: '30 يوم' },
  { key: 'year', label: '12 شهراً' },
]

function filterBar(range: AnalyticsData['range']): string {
  const segs = RANGE_SEGMENTS.map((s) => {
    const active = range.key === s.key ? ' active' : ''
    return `<a class="range-seg${active}" href="/admin/analytics?range=${s.key}">${s.label}</a>`
  }).join('')
  const customActive = range.key === 'custom' ? ' active' : ''
  return `
    <div class="filter-bar an-filter">
      <div class="range-segs">${segs}<span class="range-seg${customActive}">مخصصة</span></div>
      <form method="get" action="/admin/analytics" class="range-custom">
        <input type="hidden" name="range" value="custom">
        <input type="date" name="from" value="${escapeHtml(range.from ?? '')}" aria-label="من">
        <span class="range-sep">←</span>
        <input type="date" name="to" value="${escapeHtml(range.to ?? '')}" aria-label="إلى">
        <button class="btn btn-subtle" type="submit">تطبيق</button>
      </form>
      <span class="pill">${escapeHtml(range.label)}${range.from ? ` · ${escapeHtml(range.from)} → ${escapeHtml(range.to ?? range.from)}` : ''}</span>
    </div>`
}

function productionContent(data: AnalyticsData): string {
  const pr = data.production
  const kanban =
    pr.kanbanRows.length === 0
      ? miniEmpty('لا توجد بطاقات فيديو بعد')
      : `<div class="table-wrap"><table class="tbl"><thead><tr><th>الحالة</th><th>الفيديوهات</th></tr></thead><tbody>${pr.kanbanRows
          .map((r) => `<tr><td><span class="dot st-${r.key}" aria-hidden="true"></span>${escapeHtml(r.label)}</td><td>${r.count}</td></tr>`)
          .join('')}</tbody></table></div>`
  const pills = pr.projectPills
    .filter((p) => p.count > 0)
    .sort((a, b) => b.count - a.count)
    .map((p) => `<span class="pill">${escapeHtml(p.label)} · ${p.count}</span>`)
    .join(' ')
  return `
    <div class="grid-stats an-sub">
      ${statCard('مشاريع إجمالاً', 'folder', String(pr.projectsTotal))}
      ${statCard('مشاريع في الفترة', 'sparkle', String(pr.projectsCreatedInRange), 'أنشئت ضمن النطاق المختار')}
      ${statCard('فيديوهات في اللوحة', 'video', String(pr.videosTotal), 'عبر كل البطاقات')}
    </div>
    <div class="grid-2" style="margin-top:1rem">
      ${panel('لوحة الإنتاج (كانبان)', 'kanban', kanban, {})}
      <div class="panel"><div class="panel-head">${shellIcon('folder', 15)} حالة المشاريع</div><div class="panel-body an-pills">${pills || miniEmpty('لا توجد مشاريع')}</div></div>
    </div>`
}

function crmContent(data: AnalyticsData): string {
  const crm = data.crm
  const top = crm.topClients
    .slice(0, 8)
    .filter((c) => c.projects + c.videos > 0)
    .map(
      (c) => `<tr><td>${escapeHtml(c.name)}</td><td>${c.projects}</td><td>${c.videos}</td><td>${c.deliveries}</td></tr>`,
    )
    .join('')
  return `
    <div class="grid-stats an-sub">
      ${statCard('عملاء إجمالاً', 'users', String(crm.totalClients))}
      ${statCard('جدد في الفترة', 'sparkle', String(crm.newClientsInRange), 'ضمن النطاق المختار')}
      ${statCard('عملاء عائدون', 'refresh', String(crm.returningClients), '≥ مشروعين أو مشروع مع تسليم')}
      ${statCard('نشطون', 'check', String(crm.activeClients), `${crm.archivedClients} مؤرشف`)}
    </div>
    <div class="table-wrap" style="margin-top:1rem"><table class="tbl"><thead><tr><th>العميل</th><th>مشاريع</th><th>فيديوهات</th><th>تسليمات</th></tr></thead><tbody>${top || '<tr><td colspan="4" class="muted">لا بيانات بعد</td></tr>'}</tbody></table></div>`
}

function deliveryContent(data: AnalyticsData): string {
  const d = data.delivery
  return `
    <div class="grid-stats an-sub">
      ${statCard('تسليمات مطلقة', 'rocket', String(d.releasedCount), 'التحميل متاح أو اكتمل')}
      ${statCard('تم التنزيل', 'download', String(d.downloadedCount))}
      ${statCard('منتهية', 'clock', String(d.expiredCount))}
    </div>`
}

function modelsContent(data: AnalyticsData): string {
  const m = data.models
  const rows = m.topModels
    .slice(0, 8)
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.name)}</td><td>${r.projects}</td><td>${r.videos}</td><td>${r.upcomingSessions}</td></tr>`,
    )
    .join('')
  return `
    <div class="grid-stats an-sub">
      ${statCard('موديلات مسجلة', 'users', String(m.totalModels))}
      ${statCard('موديلات مستخدمة', 'sparkle', String(m.modelsUsed), 'ظهروا في مشاريع')}
    </div>
    <div class="table-wrap" style="margin-top:1rem"><table class="tbl"><thead><tr><th>الموديل</th><th>مشاريع</th><th>فيديوهات</th><th>جلسات قادمة</th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="muted">لا بيانات بعد</td></tr>'}</tbody></table></div>`
}

export function renderAnalytics(appUser: AppUserRow, data: AnalyticsData): string {
  const content = `
    <style>
      .an-filter{display:flex;gap:.7rem;flex-wrap:wrap;align-items:center;margin-bottom:1.1rem}
      .range-segs{display:flex;gap:.3rem;padding:.25rem;background:var(--bg-tertiary);border:1px solid var(--line-subtle);border-radius:var(--radius-lg);width:max-content;flex-wrap:wrap}
      .range-seg{padding:.32rem .75rem;border-radius:var(--radius-md);font-size:.8rem;font-weight:700;color:var(--text-secondary);text-decoration:none!important}
      .range-seg:hover{background:var(--surface-elevated)}
      .range-seg.active{background:var(--accent);color:#fff}
      .range-custom{display:flex;gap:.4rem;align-items:center;flex-wrap:wrap}
      .range-custom input{ padding:.38rem .55rem;border:1px solid var(--line-strong);border-radius:var(--radius-md);font-family:inherit;font-size:.8rem}
      .range-sep{color:var(--text-subtle);font-weight:700}
      .an-sub{margin-top:.2rem}
      .an-pills{display:flex;gap:.5rem;flex-wrap:wrap}
      .an-pills .pill{background:var(--bg-primary);border:1px solid var(--line-default)}
    </style>
    <div class="page-head">
      <div><h1>التحليلات</h1><p class="sub">أرقام حقيقية من قاعدة البيانات فقط — دون مقاييس مُختلقة. هذه الصفحة متاحة لصاحب الموقع.</p></div>
    </div>
    ${filterBar(data.range)}
    <div class="grid-2">
      ${panel('الإنتاج — مشاريع وفيديوهات', 'video', productionContent(data), {})}
      ${panel('التسليمات', 'package', deliveryContent(data), {})}
    </div>
    <div class="grid-2" style="margin-top:1rem">
      ${panel('العملاء (CRM)', 'users', crmContent(data), {})}
      ${panel('الموديلات', 'sparkle', modelsContent(data), {})}
    </div>

    <div class="page-head" style="margin-top:1.6rem">
      <div><h2 class="h2">التسليمات — عرض المرحلة 4H (محفوظ)</h2><p class="sub">نفس اللوحات السابقة للمقارنة مع النطاق المختار.</p></div>
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