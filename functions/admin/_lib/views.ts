import type { AppUserRow } from './types'

const STYLES = `
<style>
  :root{color-scheme:dark}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,-apple-system,sans-serif;background:#0d0d0d;color:#e8e8e8;line-height:1.6;min-height:100vh;display:flex;flex-direction:column}
  a{color:#e8b96b;text-decoration:none}
  a:hover{text-decoration:underline}
  .wrap{max-width:52rem;width:100%;margin:0 auto;padding:2rem 1.25rem}
  .card{background:#141414;border:1px solid #262626;border-radius:12px;padding:1.75rem}
  h1{font-size:1.5rem;margin-bottom:1.25rem;font-weight:650}
  h2{font-size:1.05rem;margin-bottom:.75rem;font-weight:600}
  .label{font-size:.78rem;text-transform:uppercase;letter-spacing:.08em;color:#9a9a9a;margin-bottom:.4rem}
  .muted{color:#9a9a9a;font-size:.9rem}
  .field{display:block;margin-bottom:1rem}
  .field input{width:100%;padding:.65rem .8rem;background:#0d0d0d;border:1px solid #333;border-radius:8px;color:#fff;font-size:1rem}
  .field input:focus{outline:2px solid #e8b96b;border-color:transparent}
  .btn{display:inline-block;width:100%;padding:.7rem 1rem;background:#e8b96b;color:#1a1206;border:none;border-radius:8px;font-size:1rem;font-weight:650;cursor:pointer}
  .btn:hover{background:#f3c87f}
  .err{background:#2a1212;border:1px solid #5c2222;color:#ffb4b4;padding:.75rem 1rem;border-radius:8px;margin-bottom:1.25rem;font-size:.92rem}
  .topbar{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:2rem}
  .brand{font-weight:750;letter-spacing:.02em}
  table{width:100%;border-collapse:collapse;font-size:.92rem}
  th,td{text-align:right;padding:.6rem .5rem;border-bottom:1px solid #262626}
  th{color:#9a9a9a;font-weight:600;font-size:.8rem}
  .tag{display:inline-block;padding:.15rem .6rem;border-radius:999px;font-size:.75rem;border:1px solid #444}
  .tag.owner{background:#2a210f;color:#e8b96b;border-color:#6b5426}
  .tag.coordinator{background:#15231a;color:#7ee2a3;border-color:#255a3a}
  .tag.inactive{background:#241414;color:#ff9595;border-color:#5c2222}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(14rem,1fr));gap:1rem;margin-bottom:1.5rem}
  .stat{background:#141414;border:1px solid #262626;border-radius:12px;padding:1rem}
  .stat .value{font-size:1.6rem;font-weight:700}
  .foot{margin-top:auto;padding:1rem 0;text-align:center;color:#6a6a6a;font-size:.8rem}
</style>
`

function layout(title: string, content: string): string {
  return `<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>${STYLES}</head><body><div class="wrap">${content}</div><footer class="foot">Photography Pixel — إدارة</footer></body></html>`
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
  disabled: 'هذا الحساب غير مفعّل. تواصل مع صاحب الموقع.',
  missing: 'أدخل البريد الإلكتروني وكلمة المرور.',
  invalid_origin: 'طلب غير صالح، حاول مرة أخرى.',
  not_configured: 'نظام تسجيل الدخول غير مُهيأ بعد.',
  disabled_redirect: 'تم تسجيل خروجك لأن الحساب غير مفعّل.',
}

export function renderLogin(error?: string): string {
  const err = error ? ERROR_MESSAGES[error] : undefined
  return layout(
    'تسجيل الدخول',
    `<div class="card"><h1>تسجيل الدخول</h1>${err ? `<div class="err">${escapeHtml(err)}</div>` : ''}<form method="post" action="/admin/login" autocomplete="on"><label class="field"><span class="label">البريد الإلكتروني</span><input type="email" name="email" required autocomplete="username" autofocus></label><label class="field"><span class="label">كلمة المرور</span><input type="password" name="password" required autocomplete="current-password"></label><button class="btn" type="submit">دخول</button></form></div>`,
  )
}

function roleTag(role: string, active: boolean): string {
  const cls = role === 'owner' ? 'owner' : active ? 'coordinator' : 'inactive'
  const label = role === 'owner' ? 'صاحب الموقع' : active ? 'منسق' : 'موقوف'
  return `<span class="tag ${cls}">${label}</span>`
}

export function renderDashboard(appUser: AppUserRow): string {
  const dateFormat = new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' })
  const lastLogin = appUser.last_login_at ? dateFormat.format(new Date(appUser.last_login_at)) : '—'
  const teamLink =
    appUser.role_key === 'owner'
      ? '<p class="muted"><a href="/admin/team">إدارة الفريق ←</a></p>'
      : ''
  return layout(
    'لوحة التحكم',
    `<div class="topbar"><span class="brand">لوحة التحكم</span><a href="/admin/logout">تسجيل الخروج</a></div>
     <div class="card">
       <h1>مرحبًا، ${escapeHtml(appUser.full_name ?? appUser.email)}</h1>
       <p class="muted">${escapeHtml(appUser.email)} · ${roleTag(appUser.role_key, appUser.is_active)}</p>
       <div style="height:1.25rem"></div>
       <div class="grid">
         <div class="stat"><div class="label">آخر دخول</div><div class="value" style="font-size:1rem">${escapeHtml(lastLogin)}</div></div>
         <div class="stat"><div class="label">الحالة</div><div class="value" style="font-size:1rem">${appUser.is_active ? 'نشط' : 'موقوف'}</div></div>
       </div>
       ${teamLink}
     </div>`,
  )
}

export function renderTeam(current: AppUserRow, members: AppUserRow[]): string {
  const dateFormat = new Intl.DateTimeFormat('ar', { dateStyle: 'medium' })
  const rows = members
    .map(
      (m) => `<tr><td>${escapeHtml(m.full_name ?? '—')}</td><td dir="ltr" style="text-align:left">${escapeHtml(m.email)}</td><td>${roleTag(m.role_key, m.is_active)}</td><td>${m.last_login_at ? escapeHtml(dateFormat.format(new Date(m.last_login_at))) : '—'}</td></tr>`,
    )
    .join('')
  return layout(
    'الفريق',
    `<div class="topbar"><span class="brand"><a href="/admin">لوحة التحكم</a></span><a href="/admin/logout">تسجيل الخروج</a></div>
     <div class="card">
       <h1>فريق العمل</h1>
       <p class="muted">${members.length} عضو · أنت بصفتك ${current.role_key === 'owner' ? 'صاحب الموقع' : 'منسق'}</p>
       <div style="height:1.25rem"></div>
       <table><thead><tr><th>الاسم</th><th dir="ltr">البريد الإلكتروني</th><th>الدور</th><th>آخر دخول</th></tr></thead><tbody>${rows}</tbody></table>
     </div>`,
  )
}