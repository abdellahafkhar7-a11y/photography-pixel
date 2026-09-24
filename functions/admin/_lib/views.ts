import type { AppUserRow } from './types'
import type { DeliveryActivityType, DeliveryStatus } from '../../_lib/db-types'
import type { DashboardData } from './dashboard-data'
import { DELIVERY_STATUS_ORDER } from './dashboard-data'
import type { RouteKey } from './shell'
import {
  escapeHtml,
  loginPage,
  panel,
  placeholderBody,
  roleLabel,
  rolePill,
  shell,
  shellIcon,
  statCard,
} from './shell'

export { escapeHtml }

const ERROR_MESSAGES: Record<string, string> = {
  invalid: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
  disabled: 'هذا الحساب غير مفعّل. تواصل مع صاحب الموقع.',
  missing: 'أدخل البريد الإلكتروني وكلمة المرور.',
  invalid_origin: 'طلب غير صالح، حاول مرة أخرى.',
  not_configured: 'نظام تسجيل الدخول غير مُهيأ بعد.',
  disabled_redirect: 'تم تسجيل خروجك لأن الحساب غير مفعّل.',
}

export function renderLogin(error?: string): string {
  const code = error ?? 'invalid'
  return loginPage(ERROR_MESSAGES[code] ?? ERROR_MESSAGES.invalid)
}

const DATE_TIME = new Intl.DateTimeFormat('ar-MA', {
  dateStyle: 'medium',
  timeStyle: 'short',
  numberingSystem: 'latn',
  timeZone: 'Africa/Casablanca',
})

const DATE_ONLY = new Intl.DateTimeFormat('ar-MA', {
  dateStyle: 'medium',
  numberingSystem: 'latn',
  timeZone: 'Africa/Casablanca',
})

const DATE_FULL = new Intl.DateTimeFormat('ar-MA', {
  dateStyle: 'full',
  numberingSystem: 'latn',
  timeZone: 'Africa/Casablanca',
})

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : DATE_TIME.format(date)
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : DATE_ONLY.format(date)
}

const DELIVERY_STATUS_LABEL: Record<DeliveryStatus, string> = {
  pending: 'قيد الانتظار',
  preview_viewed: 'تمت المشاهدة',
  confirmed: 'تم التأكيد',
  download_available: 'متاح للتحميل',
  downloaded: 'تم التحميل',
  expired: 'منتهي',
}

const ACTIVITY_ICON: Partial<Record<DeliveryActivityType, string>> = {
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

function miniEmpty(message: string, actionHtml = ''): string {
  return `<div class="mini-empty"><p class="muted">${escapeHtml(message)}</p>${actionHtml}</div>`
}

function deliverySummary(data: DashboardData): string {
  if (data.deliveriesCount === 0) {
    return miniEmpty(
      'لا توجد عمليات تسليم حالياً',
      `<a class="btn btn-primary" href="/admin/deliveries/new">${shellIcon('plus', 16)} إنشاء تسليم</a>`,
    )
  }
  const rows = DELIVERY_STATUS_ORDER.map((status) => {
    const count = data.statusCounts[status]
    return `<div class="status-row"><span class="dot st-${status}" aria-hidden="true"></span><span class="s-label">${DELIVERY_STATUS_LABEL[status]}</span><span class="s-count">${count}</span></div>`
  }).join('')
  return `<div class="status-list">${rows}</div>`
}

function activityList(data: DashboardData): string {
  if (data.recentActivity.length === 0) return miniEmpty('لا توجد أنشطة حديثة')
  return `<div class="activity-list">${data.recentActivity
    .map((item) => {
      const iconName = ACTIVITY_ICON[item.type] ?? 'activity'
      const meta = item.clientName ? `<div class="a-meta">العميل: ${escapeHtml(item.clientName)}</div>` : ''
      return `<div class="activity-row"><span class="a-ico" aria-hidden="true">${shellIcon(iconName, 16)}</span><div class="a-body"><div class="a-label">${escapeHtml(item.label)}</div>${meta}</div><time class="a-time">${escapeHtml(formatDateTime(item.createdAt))}</time></div>`
    })
    .join('')}</div>`
}

function clientList(data: DashboardData): string {
  if (data.recentClients.length === 0) return miniEmpty('لا توجد بيانات بعد')
  return `<div class="client-list">${data.recentClients
    .map((client) => {
      const initial = escapeHtml(client.name.trim().slice(0, 1).toLocaleUpperCase('ar') || '؟')
      return `<div class="client-row"><span class="c-avatar" aria-hidden="true">${initial}</span><div class="c-body"><div class="c-name">${escapeHtml(client.name)}</div><div class="c-wa">+${escapeHtml(client.whatsappNumber)}</div></div><time class="c-time">${escapeHtml(formatDate(client.createdAt))}</time></div>`
    })
    .join('')}</div>`
}

export function renderDashboard(appUser: AppUserRow, data: DashboardData): string {
  const name = appUser.full_name ?? appUser.email
  const isOwner = appUser.role_key === 'owner'
  const role = isOwner ? 'owner' : 'coordinator'

  const teamCard = isOwner ? statCard('أعضاء الفريق', 'team', String(data.teamCount ?? 0)) : ''
  const statsClass = isOwner ? 'grid-stats' : 'grid-stats three'

  const quickActions = [
    `<a class="btn btn-primary" href="/admin/deliveries/new">${shellIcon('plus', 15)}<span>إنشاء تسليم عميل</span></a>`,
    `<a class="btn btn-subtle" href="/admin/portfolio">${shellIcon('briefcase', 15)}<span>عرض الأعمال</span></a>`,
    isOwner
      ? `<a class="btn btn-subtle" href="/admin/clients">${shellIcon('user', 15)}<span>العملاء</span></a>`
      : '',
    isOwner
      ? `<a class="btn btn-subtle" href="/admin/team">${shellIcon('team', 15)}<span>الفريق</span></a>`
      : '',
  ]
    .filter(Boolean)
    .join('')

  const content = `
    <div class="welcome">
      <div>
        <h2>مرحبا، ${escapeHtml(name)} 👋</h2>
        <div class="sub">هذه نظرة سريعة على نشاط Photography Pixel.</div>
      </div>
      <div class="welcome-side">
        <span class="pill ${role}">${roleLabel(appUser.role_key)}</span>
        <span class="date-chip">${shellIcon('calendar', 15)} ${escapeHtml(DATE_FULL.format(new Date()))}</span>
      </div>
    </div>

    <div class="${statsClass}">
      ${statCard('العملاء', 'user', String(data.clientsCount))}
      ${statCard('المشاريع', 'briefcase', '—', 'لا يوجد نموذج مشاريع بعد')}
      ${statCard('تسليمات العملاء', 'package', String(data.deliveriesCount))}
      ${teamCard}
    </div>

    <div class="grid-2">
      ${panel('ملخص تسليم العملاء', 'package', deliverySummary(data), {
        action:
          data.deliveriesCount > 0
            ? `<a class="section-link" href="/admin/deliveries">عرض كل التسليمات</a>`
            : '',
      })}
      ${panel('النشاط الأخير', 'activity', activityList(data), {})}
    </div>

    <div class="grid-2" style="margin-top:1rem">
      ${panel('أحدث العملاء', 'user', clientList(data), {
        action: isOwner ? `<a class="section-link" href="/admin/clients">عرض جميع العملاء</a>` : '',
      })}
      ${panel('إجراءات سريعة', 'sparkle', `<div class="qrow">${quickActions}</div>`, {})}
    </div>

    <div class="card shortcut" style="margin-top:1rem">
      <span class="ico-chip">${shellIcon('image', 18)}</span>
      <div class="sc-body"><h2>الأعمال</h2><p class="muted">استكشف أعمال المعرض وملخص المحتوى.</p></div>
      <div class="sc-actions"><a class="btn btn-subtle" href="/admin/portfolio">${shellIcon('arrowLeft', 15)}<span>استكشف Portfolio</span></a></div>
    </div>`

  return shell('لوحة التحكم', content, {
    active: 'dashboard',
    user: appUser,
    crumbs: 'Photography Pixel / لوحة التحكم',
  })
}

export function renderTeam(current: AppUserRow, members: AppUserRow[]): string {
  const rows = members
    .map(
      (m) =>
        `<tr><td>${escapeHtml(m.full_name ?? '—')}</td><td dir="ltr" style="text-align:left">${escapeHtml(m.email)}</td><td>${rolePill(m.role_key, m.is_active)}</td><td>${escapeHtml(formatDateTime(m.last_login_at))}</td></tr>`,
    )
    .join('')

  const content = `
    <div class="welcome">
      <div>
        <h2>فريق العمل</h2>
        <div class="sub">${members.length} عضو · دورك: ${roleLabel(current.role_key)}</div>
      </div>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table class="tbl">
          <thead><tr><th>الاسم</th><th dir="ltr">البريد الإلكتروني</th><th>الدور</th><th>آخر دخول</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`

  return shell('الفريق', content, {
    active: 'team',
    user: current,
    crumbs: 'Photography Pixel / الفريق',
  })
}

export function renderPlaceholder(appUser: AppUserRow, active: RouteKey): string {
  const copy = placeholderBody(active, 'ستُفعّل هذه الوحدة في المراحل القادمة، وسيظهر هنا محتوى حي.')
  return shell(copyTitle(active), copy, {
    active,
    user: appUser,
    crumbs: `Photography Pixel / ${copyTitle(active)}`,
  })
}

function copyTitle(active: RouteKey): string {
  switch (active) {
    case 'portfolio':
      return 'الأعمال'
    case 'models':
      return 'الموديلات'
    case 'ugc':
      return 'UGC'
    case 'media-buyer':
      return 'Media Buyer'
    case 'voice-over':
      return 'التعليق الصوتي'
    case 'equipment':
      return 'المعدات'
    case 'clients':
      return 'العملاء'
    case 'analytics':
      return 'التحليلات'
    case 'settings':
      return 'الإعدادات'
    default:
      return 'لوحة التحكم'
  }
}