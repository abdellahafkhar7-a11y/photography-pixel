import type { AppUserRow } from './types'
import { escapeHtml, roleLabel, shell, shellIcon, statCard } from './shell'
import type { RoleOption } from './team-data'

//============================================================================
// Phase 4G — Team management UI, rendered with the Phase 4A/4B shell.
// Presentation only: authorization is enforced server-side (owner-only) and
// account creation goes through the Supabase Auth admin API.
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

export type TeamFormValues = {
  email: string
  fullName: string
  roleKey: string
}

export type TeamViewOptions = {
  notice?: string
  error?: string
  values?: TeamFormValues
}

function alert(kind: 'success' | 'error' | 'info', message: string): string {
  return `<div class="alert ${kind}">${escapeHtml(message)}</div>`
}

function statusBadge(active: boolean): string {
  return active
    ? '<span class="badge ok">مفعّل</span>'
    : '<span class="badge off">موقوف</span>'
}

function roleOptions(roles: RoleOption[], selected: string): string {
  const list = roles.length > 0 ? roles : ([
    { id: '', key: 'coordinator', name: 'Coordinator' },
    { id: '', key: 'owner', name: 'Owner' },
  ] as RoleOption[])
  return list
    .map(
      (role) =>
        `<option value="${escapeHtml(role.key)}"${role.key === selected ? ' selected' : ''}>${escapeHtml(role.key === 'owner' ? 'صاحب الموقع' : 'منسق')}</option>`,
    )
    .join('')
}

function memberRow(member: AppUserRow, roles: RoleOption[], selfId: string): string {
  const isSelf = member.id === selfId
  const name = member.full_name && member.full_name.trim().length > 0 ? member.full_name.trim() : 'بدون اسم'

  const roleCell = isSelf
    ? `<span class="pill ${member.role_key === 'owner' ? 'owner' : 'coordinator'}">${escapeHtml(roleLabel(member.role_key))}</span>`
    : `<form method="post" action="/admin/team" class="inline-actions">
         <input type="hidden" name="action" value="role">
         <input type="hidden" name="user_id" value="${escapeHtml(member.id)}">
         <select name="role" aria-label="الدور">${roleOptions(roles, member.role_key)}</select>
         <button class="btn btn-subtle" type="submit">${shellIcon('check', 14)} حفظ</button>
       </form>`

  const actions = isSelf
    ? `<span class="hint">حسابك الحالي</span>`
    : member.is_active
      ? `<form method="post" action="/admin/team">
           <input type="hidden" name="action" value="toggle">
           <input type="hidden" name="user_id" value="${escapeHtml(member.id)}">
           <input type="hidden" name="active" value="0">
           <button class="btn btn-danger" type="submit">${shellIcon('ban', 14)} إيقاف</button>
         </form>`
      : `<form method="post" action="/admin/team">
           <input type="hidden" name="action" value="toggle">
           <input type="hidden" name="user_id" value="${escapeHtml(member.id)}">
           <input type="hidden" name="active" value="1">
           <button class="btn btn-success" type="submit">${shellIcon('check', 14)} تفعيل</button>
         </form>`

  return `<tr>
    <td><strong>${escapeHtml(name)}</strong><div class="hint" dir="ltr" style="text-align:left">${escapeHtml(member.email)}</div></td>
    <td>${roleCell}</td>
    <td>${statusBadge(member.is_active)}</td>
    <td>${escapeHtml(formatDateTime(member.last_login_at))}</td>
    <td>${actions}</td>
  </tr>`
}

export function renderTeam(
  appUser: AppUserRow,
  members: AppUserRow[],
  roles: RoleOption[],
  options: TeamViewOptions = {},
): string {
  const owners = members.filter((m) => m.role_key === 'owner').length
  const coordinators = members.filter((m) => m.role_key === 'coordinator').length
  const active = members.filter((m) => m.is_active).length

  const values = options.values ?? { email: '', fullName: '', roleKey: 'coordinator' }

  const createForm = `
    <form method="post" action="/admin/team">
      <input type="hidden" name="action" value="create">
      <div class="form-grid">
        <label class="field"><span>الاسم الكامل</span>
          <input type="text" name="full_name" value="${escapeHtml(values.fullName)}" autocomplete="name" placeholder="مثال: سارة العلوي">
        </label>
        <label class="field"><span>البريد الإلكتروني</span>
          <input type="email" name="email" value="${escapeHtml(values.email)}" autocomplete="off" required placeholder="name@example.com">
        </label>
        <label class="field"><span>كلمة المرور المؤقتة</span>
          <input type="password" name="password" autocomplete="new-password" required minlength="8" placeholder="8 أحرف على الأقل">
          <span class="hint">تُمرَّر إلى نظام المصادقة ولا تُخزَّن في هذا التطبيق.</span>
        </label>
        <label class="field"><span>الدور</span>
          <select name="role">${roleOptions(roles, values.roleKey)}</select>
        </label>
      </div>
      <div class="actionbar">
        <button class="btn btn-primary" type="submit">${shellIcon('plus', 15)} إنشاء الحساب</button>
      </div>
    </form>`

  const rows = members.map((m) => memberRow(m, roles, appUser.id)).join('')

  const table =
    members.length === 0
      ? `<div class="card"><div class="mini-empty"><p class="muted">لا يوجد أعضاء بعد.</p></div></div>`
      : `<div class="card"><div class="table-wrap"><table class="tbl">
          <thead><tr><th>العضو</th><th>الدور</th><th>الحالة</th><th>آخر دخول</th><th>إجراء</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div></div>`

  const notices = [
    options.notice ? alert('success', options.notice) : '',
    options.error ? alert('error', options.error) : '',
  ].join('')

  const content = `
    <div class="page-head">
      <div><h1>فريق العمل</h1><p class="sub">إدارة حسابات المنسقين وصلاحياتهم. هذه الصفحة متاحة لصاحب الموقع فقط.</p></div>
    </div>
    ${notices}
    <div class="grid-stats">
      ${statCard('إجمالي الأعضاء', 'team', String(members.length))}
      ${statCard('أصحاب الموقع', 'user', String(owners))}
      ${statCard('المنسقون', 'users', String(coordinators))}
      ${statCard('المفعّلون', 'check', String(active))}
    </div>
    <div class="card" style="margin-bottom:1.25rem">
      <div class="panel-head"><span class="ico-chip">${shellIcon('plus', 18)}</span><h2>إضافة عضو</h2></div>
      <div style="padding-top:.35rem">${createForm}</div>
    </div>
    ${table}`

  return shell('الفريق', content, {
    active: 'team',
    user: appUser,
    crumbs: 'Photography Pixel / الفريق',
  })
}
