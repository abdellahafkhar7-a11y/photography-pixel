import type { AppUserRow } from './types'

//============================================================================
// Photography Pixel · Admin Dashboard Shell (Phase 4A)
// Design language mirrors the public portfolio site and _lib/brand.ts:
// warm ivory background, white cards, blue/purple accent, soft shadows,
// clean line icons, RTL-first, responsive sidebar shell.
//============================================================================

export type RouteKey =
  | 'dashboard'
  | 'portfolio'
  | 'models'
  | 'ugc'
  | 'media-buyer'
  | 'voice-over'
  | 'equipment'
  | 'client-delivery'
  | 'clients'
  | 'analytics'
  | 'team'
  | 'settings'

export type NavItem = {
  key: RouteKey
  label: string
  href: string
  icon: string
  ownerOnly: boolean
}

const ICONS: Record<string, string> = {
  grid: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7.4" height="7.4" rx="2"/><rect x="13.6" y="3" width="7.4" height="7.4" rx="2"/><rect x="3" y="13.6" width="7.4" height="7.4" rx="2"/><rect x="13.6" y="13.6" width="7.4" height="7.4" rx="2"/></svg>`,
  briefcase: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2.4"/><path d="M9 7V5.6A1.6 1.6 0 0 1 10.6 4h2.8A1.6 1.6 0 0 1 15 5.6V7"/><path d="M3 12.5h18"/></svg>`,
  users: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-2.9 2.7-4.5 5.5-4.5s4.9 1.6 5.5 4.5"/><path d="M15.5 5.2a3.2 3.2 0 0 1 0 5.6"/><path d="M17.4 14.7c1.9.7 3 2.1 3.4 4.3"/></svg>`,
  user: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.6"/><path d="M5 20c.8-3.6 3.4-5.4 7-5.4s6.2 1.8 7 5.4"/></svg>`,
  video: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5.5" width="13" height="13" rx="2.6"/><path d="m16 10.5 5-3.2v9.4l-5-3.2"/></svg>`,
  megaphone: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10v4a1.6 1.6 0 0 0 1.6 1.6H6l2.5 4.2c.4.7 1.5.5 1.5-.3V5.5c0-.8-1.1-1-1.5-.3L6 9.4H4.6A1.6 1.6 0 0 0 3 11Z"/><path d="M13.5 8.6a4.2 4.2 0 0 1 0 6.8"/><path d="M16 6.2a7.6 7.6 0 0 1 0 11.6"/></svg>`,
  mic: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0"/><path d="M12 18v3"/><path d="M9 21h6"/></svg>`,
  camera: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8.4A2.4 2.4 0 0 1 6.4 6h1.2l1.2-2h6.4l1.2 2h1.2A2.4 2.4 0 0 1 20 8.4v8.2A2.4 2.4 0 0 1 17.6 19H6.4A2.4 2.4 0 0 1 4 16.6Z"/><circle cx="12" cy="13" r="3.2"/></svg>`,
  package: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3.5 7.5 3.7v9.6L12 20.5l-7.5-3.7V7.2Z"/><path d="m4.8 7.4 7.2 3.6 7.2-3.6"/><path d="M12 11v9"/></svg>`,
  chart: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h16"/><rect x="6" y="12" width="3" height="6" rx=".8"/><rect x="11" y="8" width="3" height="10" rx=".8"/><rect x="16" y="4.5" width="3" height="13.5" rx=".8"/></svg>`,
  team: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-2.9 2.7-4.5 5.5-4.5s4.9 1.6 5.5 4.5"/><path d="M16.5 6.5c1.5.2 2.5 1.6 2.5 3.2s-1 3-2.5 3.2"/><path d="M17.2 14.9c2 .6 3.2 2 3.6 4.1"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3.1"/><path d="M19.4 13.8a7.6 7.6 0 0 0 0-3.6l1.9-1.5-2.1-3.6-2.3.9a7.6 7.6 0 0 0-3.1-1.8L13.6 2h-4.2l-.4 2.2a7.6 7.6 0 0 0-3.1 1.8l-2.3-.9-2.1 3.6 1.9 1.5a7.6 7.6 0 0 0 0 3.6L1.5 15l2.1 3.6 2.3-.9a7.6 7.6 0 0 0 3.1 1.8L9.4 22h4.2l.4-2.2a7.6 7.6 0 0 0 3.1-1.8l2.3.9L21.5 15Z"/></svg>`,
  menu: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></svg>`,
  close: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12"/><path d="M18 6 6 18"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 5H6.4A2.4 2.4 0 0 0 4 7.4v9.2A2.4 2.4 0 0 0 6.4 19H10"/><path d="M14 8.5 17.5 12 14 15.5"/><path d="M17 12H9.5"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/></svg>`,
  activity: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h4l2.5-6.5 4 13L16 12h5"/></svg>`,
  image: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="15" rx="2.4"/><circle cx="9" cy="10" r="1.8"/><path d="m5.5 17.5 4.2-4.2 2.6 2.6 2-2 4.2 4.2"/></svg>`,
  sparkle: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5c.8 4 2.5 5.7 6.5 6.5-4 .8-5.7 2.5-6.5 6.5-.8-4-2.5-5.7-6.5-6.5 4-.8 5.7-2.5 6.5-6.5Z"/><path d="M18.5 14.5c.3 1.8 1.2 2.7 3 3-1.8.3-2.7 1.2-3 3-.3-1.8-1.2-2.7-3-3 1.8-.3 2.7-1.2 3-3Z"/></svg>`,
  eye: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 12S6 4.8 12 4.8 21.5 12 21.5 12 18 19.2 12 19.2 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.4"/><path d="M8 3v4"/><path d="M16 3v4"/><path d="M3.5 10h17"/></svg>`,
  arrowLeft: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="m11 6-6 6 6 6"/></svg>`,
}

export function shellIcon(name: string, size = 20): string {
  const raw = ICONS[name]
  return raw ? raw.replace('width="20" height="20"', `width="${size}" height="${size}"`) : ''
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

//--------------------------------------------------------------------------
// Navigation
//--------------------------------------------------------------------------

export const NAV_ITEMS: readonly NavItem[] = [
  { key: 'dashboard', label: 'لوحة التحكم', href: '/admin', icon: 'grid', ownerOnly: false },
  { key: 'portfolio', label: 'الأعمال', href: '/admin/portfolio', icon: 'briefcase', ownerOnly: false },
  { key: 'models', label: 'الموديلات', href: '/admin/models', icon: 'users', ownerOnly: false },
  { key: 'ugc', label: 'UGC', href: '/admin/ugc', icon: 'video', ownerOnly: false },
  { key: 'media-buyer', label: 'Media Buyer', href: '/admin/media-buyer', icon: 'megaphone', ownerOnly: false },
  { key: 'voice-over', label: 'التعليق الصوتي', href: '/admin/voice-over', icon: 'mic', ownerOnly: false },
  { key: 'equipment', label: 'المعدات', href: '/admin/equipment', icon: 'camera', ownerOnly: false },
  { key: 'client-delivery', label: 'تسليم العملاء', href: '/admin/client-delivery', icon: 'package', ownerOnly: false },
  { key: 'clients', label: 'العملاء', href: '/admin/clients', icon: 'user', ownerOnly: true },
  { key: 'analytics', label: 'التحليلات', href: '/admin/analytics', icon: 'chart', ownerOnly: true },
  { key: 'team', label: 'الفريق', href: '/admin/team', icon: 'team', ownerOnly: true },
  { key: 'settings', label: 'الإعدادات', href: '/admin/settings', icon: 'settings', ownerOnly: true },
]

const ROLE_LABEL: Record<string, string> = { owner: 'صاحب الموقع', coordinator: 'منسق' }

export function roleLabel(role: string): string {
  return ROLE_LABEL[role] ?? role
}

export function navItemsFor(role: string): NavItem[] {
  const isOwner = role === 'owner'
  return NAV_ITEMS.filter((item) => isOwner || !item.ownerOnly)
}

export function moduleCopy(key: Exclude<RouteKey, 'dashboard' | 'team'>): { title: string; subtitle: string } {
  const titles: Record<Exclude<RouteKey, 'dashboard' | 'team'>, { title: string; subtitle: string }> = {
    portfolio: { title: 'الأعمال', subtitle: 'إدارة أعمال المعرض: الصور، المقاطع، والتصنيفات.' },
    models: { title: 'الموديلات', subtitle: 'إدارة ملفات الموديلات وتفاصيل كل جلسة.' },
    ugc: { title: 'المحتوى المُنشأ من المستخدمين', subtitle: 'متابعة محتوى UGC وإنشائه ومراجعته.' },
    'media-buyer': { title: 'الإعلانات الممولة', subtitle: 'إدارة حملات Media Buyer والعائد على الإعلانات.' },
    'voice-over': { title: 'التعليق الصوتي', subtitle: 'إدارة المقاطع التعليقية وأصوات التعليق.' },
    equipment: { title: 'المعدات', subtitle: 'جرد معدات التصوير وحالتها.' },
    'client-delivery': { title: 'تسليم العملاء', subtitle: 'متابعة توصيلات العملاء وروابط التحميل.' },
    clients: { title: 'العملاء', subtitle: 'بيانات العملاء وقنوات التواصل.' },
    analytics: { title: 'التحليلات', subtitle: 'إحصائيات وصول الزوار وأداء المعرض.' },
    settings: { title: 'الإعدادات', subtitle: 'إعدادات الموقع والمتغيرات العامة.' },
  }
  return titles[key]
}

//--------------------------------------------------------------------------
// Styles
//--------------------------------------------------------------------------

const STYLES = `
<style>
  :root{
    --bg-primary:#FAF8F3;
    --bg-secondary:#F4F0E8;
    --bg-tertiary:#EDE8DC;
    --surface-elevated:#FFFFFF;
    --text-primary:#201F1C;
    --text-secondary:#45413A;
    --text-muted:#6F6A5F;
    --text-subtle:#A8A297;
    --accent:#362477;
    --accent-bright:#181bbe;
    --accent-light:rgba(54,36,119,.08);
    --gradient:linear-gradient(135deg,#2678bb 0%,#362477 55%,#4a1170 100%);
    --success:#2F7D5A;
    --error:#B3473F;
    --line-subtle:rgba(32,31,28,.05);
    --line-default:rgba(32,31,28,.1);
    --line-strong:rgba(32,31,28,.2);
    --radius-sm:.375rem;
    --radius-md:.625rem;
    --radius-lg:.875rem;
    --radius-xl:1.25rem;
    --radius-2xl:1.75rem;
    --shadow-sm:0 1px 2px rgba(32,31,28,.04),0 1px 1px rgba(32,31,28,.02);
    --shadow-md:0 4px 12px -2px rgba(32,31,28,.07);
    --shadow-lg:0 12px 28px -8px rgba(32,31,28,.12);
    --shadow-xl:0 24px 48px -16px rgba(32,31,28,.18);
    --font-sans:'Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;
    --transition-fast:150ms cubic-bezier(.4,0,.2,1);
    --transition-smooth:300ms cubic-bezier(.4,0,.2,1);
    color-scheme:light;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html{overflow-x:hidden;-webkit-text-size-adjust:100%}
  body{font-family:var(--font-sans);color:var(--text-primary);line-height:1.7;min-height:100vh;display:flex;flex-direction:column;-webkit-font-smoothing:antialiased;overflow-x:hidden}
  a{color:var(--accent);text-decoration:none}
  .dash-root{min-height:100vh;display:grid;grid-template-columns:266px 1fr}
  .dash-main{display:flex;flex-direction:column;min-width:0;background:
    radial-gradient(ellipse 720px 420px at 12% -4%,rgba(54,36,119,.05),transparent 62%),
    radial-gradient(ellipse 640px 500px at 100% 108%,rgba(24,27,190,.04),transparent 60%),
    var(--bg-primary)}

  /* Sidebar (right side in RTL) */
  .side{position:sticky;top:0;height:100vh;height:100dvh;background:var(--surface-elevated);border-inline-end:1px solid var(--line-default);display:flex;flex-direction:column;padding:1rem .7rem .8rem}
  .side-head{display:flex;align-items:center;gap:.7rem;padding:.4rem .6rem 1rem}
  .side-head .brand-logo{flex:none;display:inline-flex}
  .side-head .t{font-weight:800;font-size:1rem;letter-spacing:.01em;line-height:1.25}
  .side-head .s{font-size:.72rem;color:var(--text-muted)}
  .nav-rail{display:flex;flex-direction:column;gap:2px;flex:1;overflow-y:auto;padding-inline:.2rem}
  .nav-item{display:flex;align-items:center;gap:.7rem;padding:.58rem .78rem;border-radius:var(--radius-md);color:var(--text-secondary);font-size:.92rem;font-weight:600;text-decoration:none!important;transition:background var(--transition-fast),color var(--transition-fast)}
  .nav-item .ico{flex:none;display:inline-flex;opacity:.9}
  .nav-item:hover{background:var(--bg-tertiary);color:var(--text-primary)}
  .nav-item.current{background:var(--gradient);color:#fff;box-shadow:var(--shadow-sm)}
  .side-foot{margin-top:auto;padding:.9rem .55rem .3rem;border-top:1px solid var(--line-default)}
  .side-user{display:flex;align-items:center;gap:.6rem;min-width:0}
  .side-user .meta{line-height:1.35;min-width:0}
  .side-user .n{font-size:.84rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .side-user .r{font-size:.72rem;color:var(--text-muted)}
  .avatar{width:35px;height:35px;border-radius:var(--radius-full);background:var(--gradient);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:.92rem;flex:none}
  .nav-overlay{position:fixed;inset:0;background:rgba(32,31,28,.38);z-index:400;opacity:0;pointer-events:none;transition:opacity var(--transition-fast)}

  /* Top bar */
  .top{position:sticky;top:0;z-index:200;display:flex;align-items:center;gap:.9rem;padding:.8rem 1.5rem;background:rgba(250,248,243,.86);backdrop-filter:blur(14px) saturate(140%);border-bottom:1px solid var(--line-default)}
  .menu-btn{display:none;align-items:center;justify-content:center;width:40px;height:40px;border-radius:var(--radius-md);border:1px solid var(--line-default);background:var(--surface-elevated);color:var(--text-primary);cursor:pointer;flex:none}
  .menu-btn:hover{background:var(--bg-secondary)}
  .title-block{min-width:0}
  .title-block h1{font-size:1.22rem;font-weight:800;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .title-block .crumb{font-size:.76rem;color:var(--text-subtle)}
  .user-area{margin-inline-start:auto;display:flex;align-items:center;gap:.7rem;min-width:0}
  .user-meta{line-height:1.3;text-align:start;min-width:0}
  .user-meta .u-n{font-size:.86rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:16ch}
  .user-meta .u-mail{direction:ltr;text-align:left;font-size:.74rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:20ch}
  .logout-btn{display:inline-flex;align-items:center;gap:.45rem;padding:.5rem .85rem;border-radius:var(--radius-md);border:1px solid var(--line-default);background:var(--surface-elevated);color:var(--text-secondary);font-size:.84rem;font-weight:650;cursor:pointer;text-decoration:none!important}
  .logout-btn:hover{background:var(--bg-tertiary);color:var(--error);border-color:rgba(179,71,63,.35)}

  /* Content */
  .content{width:100%;max-width:1180px;margin:0 auto;padding:1.5rem 1.5rem 3rem;flex:1}
  .dash-foot{padding:1.1rem 1.5rem;text-align:center;color:var(--text-subtle);font-size:.78rem;border-top:1px solid var(--line-subtle)}

  /* Cards & grids */
  .card{background:var(--surface-elevated);border:1px solid var(--line-default);border-radius:var(--radius-xl);padding:1.35rem 1.45rem;box-shadow:var(--shadow-sm)}
  .grid-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:1.25rem}
  .stat{background:var(--surface-elevated);border:1px solid var(--line-default);border-radius:var(--radius-xl);padding:1.1rem 1.2rem;box-shadow:var(--shadow-sm)}
  .stat .k{display:flex;align-items:center;gap:.45rem;font-size:.74rem;font-weight:700;color:var(--text-muted)}
  .stat .v{font-size:1.65rem;font-weight:800;line-height:1.2;margin-top:.35rem}
  .stat .h{font-size:.74rem;color:var(--text-subtle);margin-top:.15rem}
  .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
  .panel{background:var(--surface-elevated);border:1px solid var(--line-default);border-radius:var(--radius-xl);padding:1.3rem 1.4rem;box-shadow:var(--shadow-sm)}
  .panel-head{display:flex;align-items:center;gap:.6rem;margin-bottom:.85rem}
  .ico-chip{width:36px;height:36px;border-radius:var(--radius-md);background:var(--accent-light);color:var(--accent);display:inline-flex;align-items:center;justify-content:center;flex:none}
  .panel-head h2{font-size:1rem;font-weight:750}
  .soon-tag{display:inline-flex;align-items:center;gap:.3rem;padding:.14rem .55rem;border-radius:var(--radius-full);font-size:.7rem;font-weight:700;color:var(--text-muted);border:1px solid var(--line-strong);margin-inline-start:auto}
  .panel-body .muted{color:var(--text-muted);font-size:.88rem}
  .qrow{display:flex;flex-wrap:wrap;gap:.6rem}

  /* Buttons */
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;padding:.62rem 1.05rem;border-radius:var(--radius-md);border:1px solid transparent;font-size:.9rem;font-weight:700;cursor:pointer;text-decoration:none!important;transition:filter var(--transition-fast),transform .06s ease}
  .btn:active{transform:translateY(1px)}
  .btn-primary{background:var(--accent);color:#fff}
  .btn-primary:hover{filter:brightness(1.14)}
  .btn-subtle{background:var(--bg-secondary);color:var(--text-primary);border-color:var(--line-default)}
  .btn-subtle:hover{background:var(--bg-tertiary)}
  .btn-text{background:transparent;color:var(--text-secondary);border-color:transparent}
  .btn-text:hover{background:var(--bg-tertiary)}

  /* Placeholder module page */
  .placeholder-card{background:var(--surface-elevated);border:1.5px dashed var(--line-strong);border-radius:var(--radius-2xl);padding:3rem 1.5rem;text-align:center;box-shadow:var(--shadow-sm)}
  .placeholder-card .big-icon{width:62px;height:62px;border-radius:var(--radius-xl);background:var(--accent-light);color:var(--accent);display:inline-flex;align-items:center;justify-content:center;margin-bottom:1rem}
  .placeholder-card h2{font-size:1.15rem;font-weight:800;margin-bottom:.35rem}
  .placeholder-card .muted{color:var(--text-muted);font-size:.92rem;max-width:34rem;margin:0 auto}
  .back-link{display:inline-flex;align-items:center;gap:.4rem;margin-top:1.2rem;font-size:.88rem;font-weight:700}

  /* Welcome row */
  .welcome{display:flex;align-items:center;flex-wrap:wrap;gap:.9rem;margin-bottom:1.25rem}
  .welcome h2{font-size:1.05rem;font-weight:800}
  .welcome .sub{color:var(--text-muted);font-size:.85rem}
  .pill{display:inline-flex;align-items:center;padding:.18rem .65rem;border-radius:var(--radius-full);font-size:.78rem;font-weight:700;border:1px solid var(--line-default);background:var(--bg-secondary);color:var(--text-secondary)}
  .pill.owner{background:var(--accent-light);color:var(--accent);border-color:rgba(54,36,119,.22)}
  .pill.coordinator{background:var(--bg-secondary);color:var(--text-secondary);border-color:var(--line-default)}

  /* Tables */
  .table-wrap{width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch}
  .tbl{width:100%;border-collapse:collapse;font-size:.9rem}
  .tbl th{text-align:right;color:var(--text-muted);font-weight:700;font-size:.76rem;padding:.6rem .5rem;border-bottom:1px solid var(--line-default);white-space:nowrap}
  .tbl td{padding:.8rem .5rem;border-bottom:1px solid var(--line-subtle);vertical-align:middle}
  .tbl tr:last-child td{border-bottom:none}
  .tbl td[dir=ltr]{word-break:break-all;white-space:normal}
  @media (max-width:479px){
    .tbl{min-width:24rem}
  }

  /* Login */
  .auth-page{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1.5rem;background:
    radial-gradient(ellipse 640px 460px at 18% 8%,rgba(38,120,187,.09),transparent 60%),
    radial-gradient(ellipse 720px 520px at 85% 92%,rgba(54,36,119,.08),transparent 60%),
    var(--bg-tertiary)}
  .auth-card{width:100%;max-width:26rem;background:var(--surface-elevated);border:1px solid var(--line-default);border-radius:var(--radius-2xl);box-shadow:var(--shadow-lg);padding:2.1rem 2rem 1.9rem}
  .auth-head{display:flex;flex-direction:column;align-items:center;gap:.55rem;margin-bottom:1.6rem;text-align:center}
  .auth-head .logo-wrap{width:58px;height:58px;border-radius:var(--radius-xl);background:var(--gradient);color:#fff;display:inline-flex;align-items:center;justify-content:center;box-shadow:var(--shadow-md)}
  .auth-head h1{font-size:1.25rem;font-weight:800}
  .auth-head .sub{color:var(--text-muted);font-size:.86rem}
  .field{display:block;margin-bottom:1.1rem}
  .field label{display:block;font-weight:700;font-size:.88rem;margin-bottom:.4rem;color:var(--text-secondary)}
  .field input{width:100%;padding:.68rem .85rem;background:#fff;border:1px solid var(--line-strong);border-radius:var(--radius-md);color:var(--text-primary);font-size:.95rem;font-family:inherit}
  .field input:focus{outline:2px solid var(--accent);outline-offset:1px;border-color:transparent}
  .alert{padding:.78rem 1rem;border-radius:var(--radius-md);font-size:.88rem;margin-bottom:1.15rem}
  .alert.error{background:rgba(179,71,63,.07);color:var(--error);border:1px solid rgba(179,71,63,.24)}
  .auth-foot{margin-top:1.4rem;text-align:center;color:var(--text-subtle);font-size:.78rem}
  .auth-brand{display:inline-flex;align-items:center;gap:.4rem;font-weight:800;color:var(--text-primary)}

  @media (max-width:991px){
    .dash-root{grid-template-columns:1fr}
    .side{position:fixed;inset-block:0;inset-inline-end:0;width:min(288px,86vw);transform:translateX(100%);transition:transform var(--transition-smooth);z-index:500;box-shadow:var(--shadow-xl)}
    .nav-open .side{transform:none}
    .nav-overlay{opacity:0;pointer-events:none}
    .nav-open .nav-overlay{opacity:1;pointer-events:auto}
    .menu-btn{display:inline-flex}
  }
  @media (min-width:992px){
    .nav-overlay{display:none}
  }
  @media (max-width:767px){
    .grid-stats{grid-template-columns:repeat(2,1fr);gap:.8rem}
    .grid-2{grid-template-columns:1fr}
    .content{padding:1.25rem 1rem 2.5rem}
    .top{padding:.7rem 1rem}
    .user-meta .u-mail{display:none}
  }
  @media (max-width:479px){
    .grid-stats{grid-template-columns:1fr 1fr;gap:.7rem}
    .side-head .s{display:none}
  }
</style>
`

const DRAWER_SCRIPT = `<script>(function(){var root=document.getElementById('dash-root');var btn=document.getElementById('nav-toggle');var close=document.getElementById('nav-close');var overlay=document.getElementById('nav-overlay');function set(v){if(root)root.classList.toggle('nav-open',v);if(overlay)overlay.setAttribute('aria-hidden',String(!v))}if(btn)btn.addEventListener('click',function(e){e.stopPropagation();set(true)});if(close)close.addEventListener('click',function(){set(false)});if(overlay)overlay.addEventListener('click',function(){set(false)});document.addEventListener('keydown',function(e){if(e.key==='Escape')set(false)})})();</script>`

export function brandLogoMark(size = 26): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#6C4DFF"/><circle cx="12" cy="12" r="3.6" fill="rgba(255,255,255,.92)"/><path d="M12 3v2.4M12 18.6V21M3 12h2.4M18.6 12H21M6.3 6.3l1.7 1.7M16 16l1.7 1.7M17.7 6.3L16 8M8 16l-1.7 1.7" stroke="rgba(255,255,255,.85)" stroke-width="1.3" stroke-linecap="round"/></svg>`
}

export function htmlDoc(title: string, bodyClass: string, content: string, extra = ''): string {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(title)}</title>${STYLES}</head><body class="${bodyClass}">${content}${extra}</body></html>`
}

export function avatarFor(user: Pick<AppUserRow, 'full_name' | 'email'>): string {
  const name = (user.full_name ?? user.email).trim()
  const initial = escapeHtml(name.slice(0, 1).toLocaleUpperCase('ar'))
  return `<span class="avatar" aria-hidden="true">${initial}</span>`
}

//--------------------------------------------------------------------------
// Login page
//--------------------------------------------------------------------------

export function loginPage(error?: string): string {
  const err = error ? escapeHtml(error) : ''
  const content = `
    <div class="auth-card">
      <div class="auth-head">
        <span class="logo-wrap">${brandLogoMark(30)}</span>
        <h1>لوحة التحكم</h1>
        <span class="sub">Photography Pixel · الدخول لفريق الإدارة</span>
      </div>
      ${err ? `<div class="alert error">${escapeHtml(err)}</div>` : ''}
      <form method="post" action="/admin/login" autocomplete="on">
        <label class="field"><span class="label" style="display:block;margin-bottom:.4rem">البريد الإلكتروني</span><input type="email" name="email" required autocomplete="username" autofocus dir="ltr"></label>
        <label class="field"><span class="label" style="display:block;margin-bottom:.4rem">كلمة المرور</span><input type="password" name="password" required autocomplete="current-password"></label>
        <button class="btn btn-primary" type="submit" style="width:100%">دخول</button>
      </form>
      <div class="auth-foot"><span class="auth-brand">${brandLogoMark(16)} Photography Pixel</span></div>
    </div>`
  return htmlDoc('تسجيل الدخول', 'auth-page', content)
}

//--------------------------------------------------------------------------
// Shell
//--------------------------------------------------------------------------

export type ShellOptions = {
  active: RouteKey
  user: AppUserRow
  crumbs?: string
}

function sideHtml(user: AppUserRow, active: RouteKey): string {
  const items = navItemsFor(user.role_key)
  const nav = items
    .map((item) => {
      const cls = item.key === active ? 'nav-item current' : 'nav-item'
      const current = item.key === active ? ' aria-current="page"' : ''
      return `<a href="${item.href}" class="${cls}"${current}><span class="ico">${shellIcon(item.icon, 19)}</span><span>${item.label}</span></a>`
    })
    .join('')
  return `
    <aside class="side" id="side">
      <div class="side-head">
        <span class="brand-logo">${brandLogoMark(28)}</span>
        <div><div class="t">Photography Pixel</div><div class="s">لوحة إدارة المعرض</div></div>
      </div>
      <nav class="nav-rail" aria-label="التنقل الرئيسي">${nav}</nav>
      <div class="side-foot">
        <div class="side-user">${avatarFor(user)}<div class="meta"><div class="n">${escapeHtml(user.full_name ?? user.email)}</div><div class="r">${roleLabel(user.role_key)}</div></div></div>
      </div>
    </aside>`
}

function topHtml(title: string, user: AppUserRow, crumbs?: string): string {
  const crumb = crumbs ? `<div class="crumb">${crumbs}</div>` : ''
  return `
    <header class="top">
      <button class="menu-btn" id="nav-toggle" type="button" aria-label="فتح القائمة">${shellIcon('menu', 21)}</button>
      <div class="title-block">
        <h1>${escapeHtml(title)}</h1>
        ${crumb}
      </div>
      <div class="user-area">
        <div class="user-meta"><div class="u-n">${escapeHtml(user.full_name ?? user.email)}</div><div class="u-mail">${escapeHtml(user.email)}</div></div>
        ${avatarFor(user)}
        <a class="logout-btn" href="/admin/logout">${shellIcon('logout', 17)}<span>خروج</span></a>
      </div>
    </header>`
}

export function shell(title: string, content: string, options: ShellOptions): string {
  const { active, user, crumbs } = options
  const body = `
    <div class="dash-root" id="dash-root">
      ${sideHtml(user, active)}
      <div class="nav-overlay" id="nav-overlay" aria-hidden="true"></div>
      <div class="dash-main">
        ${topHtml(title, user, crumbs)}
        <main class="content">${content}</main>
        <footer class="dash-foot">Photography Pixel — لوحة التحكم</footer>
      </div>
    </div>`
  const doc = htmlDoc(title, 'dash', body, DRAWER_SCRIPT)
  return doc
}

//--------------------------------------------------------------------------
// Shared content components
//--------------------------------------------------------------------------

export function card(content: string): string {
  return `<div class="card">${content}</div>`
}

export function statCard(label: string, iconName: string, hint = 'جاهز للبيانات'): string {
  return `
    <div class="stat">
      <div class="k">${shellIcon(iconName, 15)}<span>${escapeHtml(label)}</span></div>
      <div class="v">—</div>
      <div class="h">${escapeHtml(hint)}</div>
    </div>`
}

export function panel(title: string, iconName: string, body: string, soon = true): string {
  const tag = soon ? '<span class="soon-tag">قيد التحضير</span>' : ''
  return `
    <section class="panel">
      <div class="panel-head"><span class="ico-chip">${shellIcon(iconName, 18)}</span><h2>${escapeHtml(title)}</h2>${tag}</div>
      <div class="panel-body">${body}</div>
    </section>`
}

export function rolePill(role: string, active: boolean): string {
  const cls = role === 'owner' ? 'owner' : active ? 'coordinator' : 'coordinator'
  const label = role === 'owner' ? 'صاحب الموقع' : active ? 'منسق' : 'موقوف'
  return `<span class="pill ${cls}">${label}</span>`
}

export function placeholderBody(moduleName: string, message: string, backHref = '/admin'): string {
  const copy = moduleCopy(moduleName as Exclude<RouteKey, 'dashboard' | 'team'>)
  const iconName = NAV_ITEMS.find((item) => item.key === moduleName)?.icon ?? 'sparkle'
  return `
    <div class="placeholder-card">
      <span class="big-icon">${shellIcon(iconName, 28)}</span>
      <h2>${escapeHtml(copy.title)} · في مرحلة التحضير</h2>
      <p class="muted">${escapeHtml(message)}</p>
      <div><span class="soon-tag" style="margin-top:.9rem">جاهز للبيانات</span></div>
      <div><a class="back-link" href="${backHref}">${shellIcon('arrowLeft', 17)} رجوع إلى لوحة التحكم</a></div>
    </div>`
}