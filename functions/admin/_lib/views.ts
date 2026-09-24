import type { AppUserRow } from './types'
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
})

function lastLogin(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : DATE_TIME.format(date)
}

export function renderDashboard(appUser: AppUserRow): string {
  const name = appUser.full_name ?? appUser.email
  const roleTxt = roleLabel(appUser.role_key)
  const teamAction =
    appUser.role_key === 'owner'
      ? `<a class="btn btn-subtle" href="/admin/team">${shellIcon('team', 16)}<span>الفريق</span></a>`
      : ''

  const content = `
    <div class="welcome">
      <div>
        <h2>مرحبًا، ${escapeHtml(name)}</h2>
        <div class="sub">آخر دخول: ${escapeHtml(lastLogin(appUser.last_login_at))}</div>
      </div>
      <span class="pill ${appUser.role_key === 'owner' ? 'owner' : 'coordinator'}">${roleTxt}</span>
    </div>

    <div class="grid-stats">
      ${statCard('العملاء', 'user')}
      ${statCard('الأعمال', 'briefcase')}
      ${statCard('تسليمات العملاء', 'package')}
      ${statCard('أعضاء الفريق', 'team')}
    </div>

    <div class="grid-2">
      ${panel('النشاط الأخير', 'activity', '<p class="muted">ستظهر هنا آخر العمليات على التوصيلات والحسابات تلقائيًا.</p>')}
      ${panel(
        'تسليم العملاء',
        'package',
        `<p class="muted">متابعة التوصيلات المتاحة الآن وروابط التحميل.</p><div class="qrow" style="margin-top:.9rem"><a class="btn btn-subtle" href="/admin/deliveries/new">${shellIcon('plus', 15)} توصيل جديد</a><a class="btn btn-subtle" href="/admin/deliveries">${shellIcon('package', 15)} قائمة التوصيلات</a></div>`,
        false,
      )}
      ${panel(
        'إجراءات سريعة',
        'sparkle',
        `<div class="qrow">${teamAction}<a class="btn btn-primary" href="/admin/deliveries/new">${shellIcon('plus', 15)}<span>توصيل جديد</span></a><a class="btn btn-subtle" href="/admin/deliveries">${shellIcon('package', 15)}<span>قائمة التوصيلات</span></a></div>`,
        false,
      )}
      ${panel('نظرة عامة على المعرض', 'image', '<p class="muted">سيعرض هنا ملخص أعمال المعرض والمحتوى عند تفعيل الوحدة.</p>')}
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
        `<tr><td>${escapeHtml(m.full_name ?? '—')}</td><td dir="ltr" style="text-align:left">${escapeHtml(m.email)}</td><td>${rolePill(m.role_key, m.is_active)}</td><td>${escapeHtml(lastLogin(m.last_login_at))}</td></tr>`,
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