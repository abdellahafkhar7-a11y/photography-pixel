import type { AppUserRow } from './types'
import { profileDisplayName, profileInitials } from './profile'

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
  | 'projects'
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
  upload: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M4 19h16"/></svg>`,
  download: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 19h16"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2.2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  link: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1.2 1.2"/><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1.2-1.2"/></svg>`,
  check: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5L20 7"/></svg>`,
  play: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4.5v15l13-7.5Z"/></svg>`,
  refresh: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 6"/><path d="M20 4v7h-7"/></svg>`,
  ban: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m5.5 5.5 13 13"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2"/><path d="M6 7l1 12a1.8 1.8 0 0 0 1.8 1.6h6.4A1.8 1.8 0 0 0 17 19l1-12"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`,
  phone: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l1.5 4.5-2.2 1.6a13 13 0 0 0 5.6 5.6l1.6-2.2L20 15v4a1.8 1.8 0 0 1-2 1.8C10 20 4 14 3.2 6A1.8 1.8 0 0 1 5 4Z"/></svg>`,
  search: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>`,
  filter: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16"/><path d="M7 12h10"/><path d="M10 19h4"/></svg>`,
  external: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 14v5a1.8 1.8 0 0 1-1.8 1.8H5.8A1.8 1.8 0 0 1 4 19V8.8A1.8 1.8 0 0 1 5.8 7H11"/></svg>`,
  whatsapp: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.2 14.1c-.2.6-1.2 1.2-1.7 1.2-.5.1-1.1.1-1.7-.1-.5-.1-1-.3-1.5-.6a9.6 9.6 0 0 1-4.2-4.2c-.3-.5-.5-1-.6-1.5-.2-.6-.2-1.2-.1-1.7.1-.5.6-1.5 1.2-1.7.2 0 .4 0 .5.1.1.1.1.2.3.6.1.2.2.3.1.5-.1.2-.3.5-.4.7-.1.2-.3.3-.1.6.1.3.6 1 1.3 1.7s1.4 1.2 1.7 1.3c.3.2.4.1.6-.1l.7-.8c.2-.2.3-.2.6-.1l1 1.2c.1.2.3.4.3.5-.1.2-.1.3-.1.5Z"/></svg>`,
  archive: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="4.5" rx="1.6"/><path d="M5 8.5V20h14V8.5"/><path d="M10 12h4"/></svg>`,
  kanban: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3.5" width="5.2" height="17" rx="1.6"/><rect x="9.4" y="3.5" width="5.2" height="11" rx="1.6"/><rect x="15.8" y="3.5" width="5.2" height="14" rx="1.6"/></svg>`,
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
  { key: 'client-delivery', label: 'تسليم العملاء', href: '/admin/deliveries', icon: 'package', ownerOnly: false },
  { key: 'clients', label: 'العملاء', href: '/admin/clients', icon: 'user', ownerOnly: true },
  { key: 'projects', label: 'المشاريع', href: '/admin/projects', icon: 'kanban', ownerOnly: true },
  { key: 'analytics', label: 'التحليلات', href: '/admin/analytics', icon: 'chart', ownerOnly: true },
  { key: 'team', label: 'الفريق', href: '/admin/team', icon: 'team', ownerOnly: true },
  { key: 'settings', label: 'الإعدادات', href: '/admin/settings', icon: 'settings', ownerOnly: false },
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
    projects: { title: 'المشاريع', subtitle: 'جلسات التصوير: الجداول، المهام، الفيديوهات، والتسليم.' },
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
  .avatar-img{background:var(--surface-elevated);object-fit:cover;border:1px solid var(--line-default)}
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
  .user-meta .u-s{font-size:.74rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:20ch}
  .logout-btn{display:inline-flex;align-items:center;gap:.45rem;padding:.5rem .85rem;border-radius:var(--radius-md);border:1px solid var(--line-default);background:var(--surface-elevated);color:var(--text-secondary);font-size:.84rem;font-weight:650;cursor:pointer;text-decoration:none!important}
  .logout-btn:hover{background:var(--bg-tertiary);color:var(--error);border-color:rgba(179,71,63,.35)}

  /* Content */
  .content{width:100%;max-width:1440px;margin:0 auto;padding:1.5rem 1.5rem 3rem;flex:1}
  .dash-foot{padding:1.1rem 1.5rem;text-align:center;color:var(--text-subtle);font-size:.78rem;border-top:1px solid var(--line-subtle)}

  /* Cards & grids */
  .card{background:var(--surface-elevated);border:1px solid var(--line-default);border-radius:var(--radius-xl);padding:1.35rem 1.45rem;box-shadow:var(--shadow-sm)}
  .grid-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:1.25rem}
  .stat{background:var(--surface-elevated);border:1px solid var(--line-default);border-radius:var(--radius-xl);padding:1.1rem 1.2rem;box-shadow:var(--shadow-sm)}
  .stat .k{display:flex;align-items:center;gap:.45rem;font-size:.74rem;font-weight:700;color:var(--text-muted)}
  .stat .v{font-size:1.65rem;font-weight:800;line-height:1.2;margin-top:.35rem}
  .stat .h{font-size:.74rem;color:var(--text-subtle);margin-top:.15rem}
  .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:1rem;min-width:0}
  .grid-2>*{min-width:0}
  .grid-stats.three{grid-template-columns:repeat(3,1fr)}
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
  .welcome-side{display:flex;align-items:center;gap:.6rem;margin-inline-start:auto;flex-wrap:wrap}
  .pill{display:inline-flex;align-items:center;padding:.18rem .65rem;border-radius:var(--radius-full);font-size:.78rem;font-weight:700;border:1px solid var(--line-default);background:var(--bg-secondary);color:var(--text-secondary)}
  .pill.owner{background:var(--accent-light);color:var(--accent);border-color:rgba(54,36,119,.22)}
  .pill.coordinator{background:var(--bg-secondary);color:var(--text-secondary);border-color:var(--line-default)}
  .welcome .date-chip{display:inline-flex;align-items:center;gap:.4rem;padding:.3rem .7rem;border-radius:var(--radius-full);border:1px solid var(--line-default);background:var(--surface-elevated);color:var(--text-muted);font-size:.8rem;font-weight:600}
  .panel-action{margin-inline-start:auto;display:inline-flex;align-items:center}
  .soon-tag + .panel-action{margin-inline-start:.6rem}
  .section-link{font-size:.82rem;font-weight:700;white-space:nowrap}

  /* Dashboard lists (Phase 4B) */
  .status-list,.activity-list,.client-list{display:flex;flex-direction:column}
  .status-row{display:flex;align-items:center;gap:.6rem;padding:.52rem .15rem;border-bottom:1px solid var(--line-subtle)}
  .status-row:last-child{border-bottom:none}
  .status-row .dot{width:9px;height:9px;border-radius:50%;flex:none;background:var(--text-subtle)}
  .status-row .s-label{font-size:.88rem;color:var(--text-secondary);font-weight:600}
  .status-row .s-count{margin-inline-start:auto;font-weight:800;font-size:1rem}
  .dot.st-pending{background:#9A6B00}
  .dot.st-preview_viewed{background:var(--accent-bright)}
  .dot.st-confirmed,.dot.st-download_available{background:var(--accent)}
  .dot.st-downloaded{background:var(--success)}
  .dot.st-expired{background:var(--error)}
  .activity-row,.client-row{display:flex;align-items:center;gap:.7rem;padding:.55rem .15rem;border-bottom:1px solid var(--line-subtle)}
  .activity-row:last-child,.client-row:last-child{border-bottom:none}
  .activity-row .a-ico{width:32px;height:32px;border-radius:var(--radius-md);background:var(--accent-light);color:var(--accent);display:inline-flex;align-items:center;justify-content:center;flex:none}
  .activity-row .a-body{min-width:0;flex:1}
  .activity-row .a-label{font-size:.88rem;font-weight:700}
  .activity-row .a-meta{font-size:.76rem;color:var(--text-muted)}
  .activity-row .a-time{margin-inline-start:auto;font-size:.74rem;color:var(--text-subtle);white-space:nowrap;flex:none}
  .client-row .c-avatar{width:34px;height:34px;border-radius:var(--radius-full);background:var(--bg-tertiary);color:var(--text-secondary);display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:.85rem;flex:none}
  .client-row .c-body{min-width:0;flex:1}
  .client-row .c-name{font-size:.9rem;font-weight:700}
  .client-row .c-wa{font-size:.76rem;color:var(--text-muted);direction:ltr;text-align:left}
  .client-row .c-time{margin-inline-start:auto;font-size:.74rem;color:var(--text-subtle);white-space:nowrap;flex:none}
  .mini-empty{padding:1.1rem .2rem;text-align:center}
  .mini-empty .muted{color:var(--text-muted);font-size:.88rem;margin-bottom:.85rem}
  .shortcut{display:flex;align-items:center;gap:1rem;flex-wrap:wrap}
  .shortcut .sc-body{min-width:0;flex:1}
  .shortcut .sc-body h2{font-size:1.05rem;font-weight:800}
  .shortcut .sc-body .muted{font-size:.88rem;color:var(--text-muted)}
  .shortcut .sc-actions{display:flex;gap:.6rem;flex-wrap:wrap}
  a:focus-visible,.btn:focus-visible,.nav-item:focus-visible,button:focus-visible,.logout-btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:var(--radius-sm)}

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

  /* Forms, alerts, badges, layout utilities */
  .muted{color:var(--text-muted);font-size:.9rem}
  .hint{color:var(--text-subtle);font-size:.82rem}
  .row{display:flex;align-items:center;gap:.75rem;flex-wrap:wrap}
  .between{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap}
  .grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(16rem,1fr));gap:1rem}
  .page-head{display:flex;align-items:flex-end;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-bottom:1.25rem}
  .page-head h1{font-size:1.35rem;font-weight:800}
  .page-head .sub{color:var(--text-muted);font-size:.88rem;margin-top:.2rem}
  .form-card-title{font-size:1.02rem;font-weight:800;margin-bottom:1rem}
  .field>span{display:block;font-weight:700;font-size:.88rem;margin-bottom:.4rem;color:var(--text-secondary)}
  .field select,.field textarea,.field input[type=file],.field input[type=tel],.field input[type=email],.field input[type=url],.field input[type=text]{width:100%;padding:.68rem .85rem;background:#fff;border:1px solid var(--line-strong);border-radius:var(--radius-md);color:var(--text-primary);font-size:.95rem;font-family:inherit}
  .field select:focus,.field textarea:focus,.field input:focus{outline:2px solid var(--accent);outline-offset:1px;border-color:transparent}
  .field .hint{display:block;margin-top:.35rem}
  .btn-outline{background:transparent;color:var(--accent);border-color:var(--accent)}
  .btn-outline:hover{background:var(--accent-light)}
  .btn-danger{background:transparent;color:var(--error);border-color:rgba(179,71,63,.4)}
  .btn-danger:hover{background:rgba(179,71,63,.06)}
  .btn-success{background:var(--success);color:#fff}
  .btn-success:hover{filter:brightness(1.08)}
  .alert.success{background:rgba(47,125,90,.08);color:var(--success);border:1px solid rgba(47,125,90,.24)}
  .alert.info{background:var(--accent-light);color:var(--accent);border:1px solid rgba(54,36,119,.18)}
  .badge{display:inline-flex;align-items:center;gap:.35rem;padding:.22rem .7rem;border-radius:var(--radius-full);font-size:.76rem;font-weight:700;border:1px solid transparent;white-space:nowrap}
  .badge.st-pending{background:#F7F1E3;color:#8a6a1f;border-color:#E9DDB8}
  .badge.st-preview_viewed{background:var(--accent-light);color:var(--accent);border-color:rgba(54,36,119,.22)}
  .badge.st-confirmed,.badge.st-download_available{background:rgba(54,36,119,.12);color:var(--accent);border-color:rgba(54,36,119,.28)}
  .badge.st-downloaded{background:rgba(47,125,90,.1);color:var(--success);border-color:rgba(47,125,90,.28)}
  .badge.st-expired{background:rgba(179,71,63,.08);color:var(--error);border-color:rgba(179,71,63,.24)}
  .badge.src-portfolio{background:var(--accent-light);color:var(--accent);border-color:rgba(54,36,119,.2)}
  .badge.src-r2{background:var(--bg-secondary);color:var(--text-secondary);border-color:var(--line-default)}
  .badge.ok{background:rgba(47,125,90,.1);color:var(--success);border-color:rgba(47,125,90,.28)}
  .badge.off{background:rgba(179,71,63,.08);color:var(--error);border-color:rgba(179,71,63,.24)}
  .badge.md-download{background:rgba(47,125,90,.1);color:var(--success);border-color:rgba(47,125,90,.28)}
  .badge.md-view{background:var(--accent-light);color:var(--accent);border-color:rgba(54,36,119,.22)}
  .badge.st-download{background:rgba(47,125,90,.1);color:var(--success);border-color:rgba(47,125,90,.28)}
  .tbl tr.row-muted td{opacity:.62}
  .tbl tr.row.deleted td{opacity:.55}
  .check-field{display:flex;align-items:center;gap:.45rem;font-size:.86rem;color:var(--text-secondary);cursor:pointer}
  .check-field input{width:1rem;height:1rem;accent-color:var(--accent);cursor:pointer}
  .card.danger-zone{border:1px solid rgba(179,71,63,.28);background:rgba(179,71,63,.04)}
  .card.danger-zone .form-card-title{color:var(--error)}
  .tbl select{padding:.4rem .55rem;border:1px solid var(--line-strong);border-radius:var(--radius-sm);background:#fff;color:var(--text-primary);font-size:.84rem;font-family:inherit}
  .inline-actions{display:flex;gap:.4rem;flex-wrap:wrap;align-items:center}
  .linkbox{display:flex;align-items:center;gap:.6rem;background:var(--bg-secondary);border:1px solid var(--line-strong);border-radius:var(--radius-md);padding:.6rem .8rem;direction:ltr;text-align:left;font-size:.88rem;color:var(--text-primary);word-break:break-all}
  .linkbox .copy{margin-inline-start:auto;flex:none}
  .actionbar{display:flex;gap:.6rem;flex-wrap:wrap;margin-top:1rem}
  .stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(9rem,1fr));gap:.75rem;margin-top:1.1rem}
  .stat-cell{background:var(--surface-elevated);border:1px solid var(--line-default);border-radius:var(--radius-lg);padding:.9rem 1rem;box-shadow:var(--shadow-sm)}
  .stat-cell .label{font-size:.7rem;letter-spacing:.04em;color:var(--text-muted);font-weight:700;margin-bottom:.25rem}
  .stat-cell .value{font-weight:700;font-size:.98rem;word-break:break-word}
  .video-frame{background:#14121a;border-radius:var(--radius-lg);overflow:hidden;box-shadow:var(--shadow-md)}
  .video-frame video{display:block;width:100%;aspect-ratio:16/9;object-fit:contain;background:#0d0c12}
  .video-frame-lock{position:relative;display:flex;align-items:center;justify-content:center;background:#0d0c12}
  .video-frame-lock .pp-pattern-watermark{position:absolute;inset:-30%;pointer-events:none;background-repeat:repeat;background-position:0 0;opacity:.1;transform:rotate(-25deg);background-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22280%22%20height%3D%2280%22%3E%3Ctext%20x%3D%2210%22%20y%3D%2228%22%20fill%3D%22white%22%20font-family%3D%22Arial%2CHelvetica%2Csans-serif%22%20font-size%3D%2218%22%20font-weight%3D%22bold%22%3EPhotography%20Pixel%3C%2Ftext%3E%3Ctext%20x%3D%22150%22%20y%3D%2268%22%20fill%3D%22white%22%20font-family%3D%22Arial%2CHelvetica%2Csans-serif%22%20font-size%3D%2218%22%20font-weight%3D%22bold%22%3EPhotography%20Pixel%3C%2Ftext%3E%3C%2Fsvg%3E")}
  .ok-glow{display:inline-flex;align-items:center;gap:.3rem;color:var(--success);font-weight:650;font-size:.85rem}
  .video-item-head{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;font-weight:700;font-size:.9rem;color:var(--text-secondary);margin-bottom:.6rem}
  .video-item-head .form-card-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .video-item-n{display:inline-flex;align-items:center;justify-content:center;min-width:1.6rem;height:1.6rem;border-radius:999px;background:var(--accent);color:#fff;font-size:.78rem;font-weight:750}
  .video-item-head .st-confirmed{margin-inline-start:auto}
  .video-add-card{margin-top:1rem;border-style:dashed}
  .pf-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(15rem,1fr));gap:.55rem;margin-top:.4rem}
  .pf-group{display:contents}
  .pf-cat{grid-column:1/-1;font-size:.72rem;font-weight:800;letter-spacing:.04em;color:var(--text-muted);margin-top:.25rem}
  .pf-item{display:flex;align-items:center;gap:.55rem;padding:.52rem .7rem;border:1px solid var(--line-default);border-radius:var(--radius-md);background:var(--surface-elevated);cursor:pointer;transition:border-color var(--transition-fast),background var(--transition-fast)}
  .pf-item:hover{border-color:var(--line-strong)}
  .pf-item.checked{border-color:var(--accent);background:rgba(82,52,156,.08)}
  .pf-item input{position:absolute;opacity:0;pointer-events:none}
  .pf-check{display:inline-flex;align-items:center;justify-content:center;width:1.15rem;height:1.15rem;border-radius:4px;border:1.5px solid var(--line-strong);color:transparent;font-size:.65rem;font-weight:800;flex:none}
  .pf-item.checked .pf-check{background:var(--accent);border-color:var(--accent);color:#fff}
  .pf-num{display:inline-flex;align-items:center;justify-content:center;min-width:1.3rem;height:1.3rem;border-radius:999px;background:var(--bg-tertiary);color:var(--text-secondary);font-size:.7rem;font-weight:750;flex:none}
  .pf-label{font-size:.85rem;font-weight:650;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .filter-bar{display:flex;gap:.6rem;flex-wrap:wrap;align-items:flex-end}
  .filter-bar .field{margin-bottom:0}
  .form-grid{display:grid;grid-template-columns:1fr 1fr;gap:.2rem 1.1rem}
  @media (max-width:640px){.form-grid{grid-template-columns:1fr}}

  /* Portfolio grid (Phase 4I) */
  .pcat-row{display:flex;flex-wrap:wrap;gap:.5rem;margin-bottom:1.1rem}
  .pcat-pill{display:inline-flex;align-items:center;gap:.4rem;padding:.42rem .85rem;border-radius:var(--radius-full);border:1px solid var(--line-default);background:var(--surface-elevated);color:var(--text-secondary);font-size:.84rem;font-weight:700;text-decoration:none!important;transition:background var(--transition-fast),transform .06s ease}
  .pcat-pill:hover{background:var(--bg-tertiary)}
  .pcat-pill.current{background:var(--gradient);color:#fff;border-color:transparent}
  .pcat-pill .n{opacity:.75;font-weight:600}
  .vcard-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(15rem,1fr));gap:1rem}
  .vcard{background:var(--surface-elevated);border:1px solid var(--line-default);border-radius:var(--radius-lg);overflow:hidden;box-shadow:var(--shadow-sm);display:flex;flex-direction:column;min-width:0}
  .vthumb{position:relative;display:block;width:100%;aspect-ratio:16/9;border:0;padding:0;cursor:pointer;background:linear-gradient(135deg,#2678bb 0%,#362477 55%,#4a1170 100%);overflow:hidden}
  .vthumb img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform var(--transition-smooth)}
  .vthumb:hover img{transform:scale(1.04)}
  .vthumb .vplay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff}
  .vthumb .vplay .play-chip{width:52px;height:52px;border-radius:50%;background:rgba(32,31,28,.45);backdrop-filter:blur(2px);display:inline-flex;align-items:center;justify-content:center;transition:transform var(--transition-fast),background var(--transition-fast)}
  .vthumb:hover .play-chip{background:var(--accent);transform:scale(1.08)}
  .vbody{padding:.85rem .95rem .95rem;display:flex;flex-direction:column;gap:.55rem;min-width:0}
  .vmeta{display:flex;align-items:center;justify-content:space-between;gap:.5rem}
  .vmeta .vt{font-weight:750;font-size:.92rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .vactions{display:flex;gap:.45rem;flex-wrap:wrap}
  .vactions .btn{padding:.42rem .7rem;font-size:.8rem;flex:1}

  /* Portfolio video player modal (Phase 4I) */
  .vmodal{position:fixed;inset:0;z-index:900;display:none;align-items:center;justify-content:center;padding:1rem}
  .vmodal.open{display:flex}
  .vmodal-backdrop{position:absolute;inset:0;background:rgba(20,18,26,.78);backdrop-filter:blur(3px)}
  .vmodal-box{position:relative;width:min(960px,100%);max-height:90vh;background:#0d0c12;border-radius:var(--radius-lg);overflow:hidden;box-shadow:var(--shadow-xl)}
  .vmodal-head{display:flex;align-items:center;gap:.6rem;padding:.6rem .75rem;background:var(--surface-elevated)}
  .vmodal-head .vm-title{font-size:.9rem;font-weight:750;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
  .vmodal-close{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:var(--radius-md);border:1px solid var(--line-default);background:var(--bg-secondary);color:var(--text-primary);cursor:pointer;flex:none}
  .vmodal-close:hover{background:var(--bg-tertiary)}
  .vmodal-frame{width:100%;aspect-ratio:16/9;border:0;display:block;background:#0d0c12}

  /* Light modal (create delivery / link card, Phase 4J) */
  .lm-modal{position:fixed;inset:0;z-index:950;display:none;align-items:center;justify-content:center;padding:1rem}
  .lm-modal.open{display:flex}
  .lm-modal-backdrop{position:absolute;inset:0;background:rgba(20,18,26,.78);backdrop-filter:blur(3px)}
  .lm-box{position:relative;width:min(540px,100%);max-height:92vh;overflow:auto;background:var(--surface-elevated);border-radius:var(--radius-xl);box-shadow:var(--shadow-xl);padding:1.4rem 1.5rem 1.5rem}
  .lm-head{display:flex;align-items:center;gap:.6rem;margin-bottom:1.1rem}
  .lm-title{font-size:1.05rem;font-weight:800;flex:1;min-width:0}
  .lm-close{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:var(--radius-md);border:1px solid var(--line-default);background:var(--bg-secondary);color:var(--text-primary);cursor:pointer;flex:none}
  .lm-close:hover{background:var(--bg-tertiary)}
  .lm-chip{display:flex;gap:.6rem;align-items:flex-start;background:var(--bg-primary);border:1px solid var(--line-default);border-radius:var(--radius-md);padding:.6rem .8rem;margin-bottom:1.1rem;min-width:0}
  .lm-chip .lm-chip-ico{color:var(--accent);flex:none;margin-top:.1rem}
  .lm-chip .lm-chip-name{font-weight:750;font-size:.9rem;word-break:break-all}
  .lm-chip .lm-chip-cat{font-size:.78rem;color:var(--text-muted)}
  .lm-linkbox{display:flex;align-items:center;gap:.6rem;background:var(--bg-secondary);border:1px solid var(--line-default);border-radius:var(--radius-md);padding:.6rem .8rem;direction:ltr;text-align:left;font-size:.84rem;color:var(--text-primary);word-break:break-all}
  .lm-linkbox .copy{margin-inline-start:auto;flex:none}
  .lm-error{color:var(--error);font-size:.88rem;margin-top:.6rem;min-height:1.2em}
  .lm-done{margin-top:.9rem;padding:.8rem 1rem;border-radius:var(--radius-md);background:rgba(47,125,90,.08);color:var(--success);border:1px solid rgba(47,125,90,.24);font-size:.9rem}

  /* Real upload UI (Phase 4I) */
  .dropzone{border:1.5px dashed var(--line-strong);border-radius:var(--radius-lg);padding:2rem 1rem;text-align:center;cursor:pointer;background:var(--bg-primary);transition:background var(--transition-fast),border-color var(--transition-fast)}
  .dropzone.drag{background:var(--accent-light);border-color:var(--accent)}
  .dropzone .dz-ico{color:var(--accent)}
  .dropzone p{color:var(--text-muted);font-size:.9rem;margin-top:.4rem}
  .dropzone input[type=file]{display:none}
  .up-meta{display:flex;align-items:center;gap:.7rem;flex-wrap:wrap;margin-top:1rem}
  .up-file{flex:1;min-width:14rem;min-width:0}
  .up-name{font-weight:750;font-size:.95rem;word-break:break-all}
  .up-detail{font-size:.8rem;color:var(--text-muted)}
  .up-size-big{color:var(--error);font-weight:700}
  .up-bar{height:10px;border-radius:var(--radius-full);background:var(--bg-tertiary);overflow:hidden;margin-top:1rem}
  .up-bar>span{display:block;height:100%;width:0;background:var(--gradient);border-radius:var(--radius-full);transition:width .15s ease}
  .up-progress{display:flex;align-items:center;justify-content:space-between;gap:.7rem;margin-top:.55rem;font-size:.84rem;color:var(--text-muted);flex-wrap:wrap}
  .up-actions{display:flex;gap:.6rem;flex-wrap:wrap;margin-top:1.1rem}

  @media (max-width:767px){
    .vcard-grid{grid-template-columns:repeat(auto-fill,minmax(13rem,1fr));gap:.85rem}
  }
  @media (max-width:479px){
    .vcard-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:.7rem}
    .vbody{padding:.7rem .7rem .8rem}
    .dropzone{padding:1.4rem .8rem}
  }

  /* Login */
  .auth-page{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1.25rem;background:#24567D}
  .auth-panel{width:90%;max-width:1300px;height:min(680px,calc(100dvh - 2.5rem));min-height:560px;display:flex;direction:ltr;flex-wrap:nowrap;overflow:hidden;border-radius:26px;background:var(--bg-primary);box-shadow:0 30px 80px -28px rgba(8,28,52,.6)}
  .auth-brand{flex:0 1 49.5%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.1rem;padding:2.5rem 2rem;background:#3F7FF5;color:#fff;text-align:center}
  .auth-logo{width:170px;height:170px;display:block;object-fit:contain;flex:none}
  .auth-brand-name{font-size:1.15rem;font-weight:800;letter-spacing:.01em;color:#fff}
  .auth-brand-sub{font-size:.85rem;color:rgba(255,255,255,.82)}
  .auth-formpanel{flex:1 1 50.5%;min-width:0;direction:rtl;display:flex;align-items:center;justify-content:center;padding:2.5rem;background:var(--bg-primary)}
  .auth-formwrap{width:100%;max-width:420px}
  .auth-title{font-size:1.5rem;font-weight:800;color:var(--text-primary);letter-spacing:-.01em;line-height:1.3}
  .auth-sub{color:var(--text-muted);font-size:.92rem;margin-top:.5rem}
  .auth-alert{display:block;margin-top:1.4rem;padding:.8rem .95rem;border-radius:12px;background:rgba(212,60,90,.08);border:1px solid rgba(212,60,90,.22);color:#B33050;font-size:.87rem;line-height:1.6}
  .auth-form{display:flex;flex-direction:column;gap:1.15rem;margin-top:1.75rem}
  .auth-field{display:flex;flex-direction:column;gap:.45rem}
  .auth-label{font-size:.86rem;font-weight:700;color:var(--text-secondary)}
  .auth-input{width:100%;height:48px;padding:.6rem .95rem;background:#fff;border:1px solid var(--line-strong);border-radius:12px;color:var(--text-primary);font-size:.95rem;font-family:inherit;transition:border-color var(--transition-fast),box-shadow var(--transition-fast)}
  .auth-input::placeholder{color:var(--text-subtle)}
  .auth-input:hover{border-color:rgba(32,31,28,.32)}
  .auth-input:focus{outline:none;border-color:#3F7FF5;box-shadow:0 0 0 3px rgba(63,127,245,.16)}
  .auth-input[dir=ltr]{text-align:left}
  .auth-btn{display:inline-flex;align-items:center;justify-content:center;width:100%;height:48px;padding:0 1.2rem;background:#3F7FF5;color:#fff;border:1px solid transparent;border-radius:12px;font-size:.95rem;font-weight:750;font-family:inherit;cursor:pointer;transition:filter var(--transition-fast),transform .06s ease}
  .auth-btn:hover{filter:brightness(1.07)}
  .auth-btn:active{transform:translateY(1px);filter:brightness(.96)}
  .auth-btn:focus-visible{outline:2px solid #3F7FF5;outline-offset:2px}
  .auth-btn:disabled{background:#B9C6D4;color:#fff;cursor:default;transform:none;filter:none}
  .auth-link-row{text-align:center;margin-top:-.3rem}
  .auth-link{font-size:.85rem;font-weight:700;color:#3F7FF5;text-decoration:none}
  .auth-link:hover{text-decoration:underline}
  .auth-success{display:block;margin-top:1.4rem;padding:.8rem .95rem;border-radius:12px;background:rgba(40,167,112,.09);border:1px solid rgba(40,167,112,.25);color:#147A4B;font-size:.87rem;line-height:1.6}
  .field{display:block;margin-bottom:1.1rem}
  .field label{display:block;font-weight:700;font-size:.88rem;margin-bottom:.4rem;color:var(--text-secondary)}
  .field input{width:100%;padding:.68rem .85rem;background:#fff;border:1px solid var(--line-strong);border-radius:var(--radius-md);color:var(--text-primary);font-size:.95rem;font-family:inherit}
  .field input:focus{outline:2px solid var(--accent);outline-offset:1px;border-color:transparent}
  .alert{padding:.78rem 1rem;border-radius:var(--radius-md);font-size:.88rem;margin-bottom:1.15rem}
  .alert.error{background:rgba(179,71,63,.07);color:var(--error);border:1px solid rgba(179,71,63,.24)}
  @media (max-width:920px){
    .auth-page{padding:1rem}
    .auth-panel{width:100%;max-width:520px;height:auto;min-height:calc(100dvh - 2rem);flex-direction:column;border-radius:24px}
    .auth-brand{flex:none;width:100%;height:250px;padding:1.6rem 1.25rem;gap:.8rem}
    .auth-logo{width:110px;height:110px}
    .auth-brand-name{font-size:1.02rem}
    .auth-brand-sub{font-size:.8rem}
    .auth-formpanel{flex:1;padding:2.1rem 1.5rem 2.4rem}
    .auth-title{font-size:1.4rem}
  }
  @media (max-width:400px){
    .auth-brand{height:225px}
    .auth-formpanel{padding:1.8rem 1.15rem 2rem}
    .auth-input,.auth-btn{height:46px}
  }

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
    .grid-stats.three{grid-template-columns:repeat(2,1fr);gap:.8rem}
    .grid-2{grid-template-columns:1fr}
    .content{padding:1.25rem 1rem 2.5rem}
    .top{padding:.7rem 1rem}
    .user-meta .u-s{display:none}
  }
  @media (max-width:479px){
    .grid-stats{grid-template-columns:1fr 1fr;gap:.7rem}
    .grid-stats.three{grid-template-columns:1fr 1fr;gap:.7rem}
    .side-head .s{display:none}
  }
</style>
`

const DRAWER_SCRIPT = `<script>(function(){var root=document.getElementById('dash-root');var btn=document.getElementById('nav-toggle');var close=document.getElementById('nav-close');var overlay=document.getElementById('nav-overlay');function set(v){if(root)root.classList.toggle('nav-open',v);if(overlay)overlay.setAttribute('aria-hidden',String(!v))}if(btn)btn.addEventListener('click',function(e){e.stopPropagation();set(true)});if(close)close.addEventListener('click',function(){set(false)});if(overlay)overlay.addEventListener('click',function(){set(false)});document.addEventListener('keydown',function(e){if(e.key==='Escape')set(false)})})();</script>`

export function brandLogoMark(size = 26): string {
  return `<img class="brand-logo-img" src="/assets/images/photography-pixel-logo.png" alt="شعار Photography Pixel" width="${size}" height="${size}" decoding="async">`
}

export function htmlDoc(title: string, bodyClass: string, content: string, extra = ''): string {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(title)}</title>${STYLES}</head><body class="${bodyClass}">${content}${extra}</body></html>`
}

export function avatarFor(user: Pick<AppUserRow, 'id' | 'full_name' | 'avatar_key'>): string {
  if (user.avatar_key) {
    return `<img class="avatar avatar-img" src="/admin/avatar?id=${encodeURIComponent(user.id)}" alt="" width="35" height="35" decoding="async">`
  }
  const initial = escapeHtml(profileInitials(user))
  return `<span class="avatar" aria-hidden="true">${initial}</span>`
}

//--------------------------------------------------------------------------
// Login page
//--------------------------------------------------------------------------

const LOGIN_SCRIPT = `<script>(function(){var form=document.getElementById('auth-form');var btn=document.getElementById('auth-submit');if(!form||!btn)return;form.addEventListener('submit',function(){if(btn.disabled)return;btn.disabled=true;btn.textContent='جارٍ التحقق…';});})();</script>`

export function loginPage(error?: string): string {
  const err = error ? escapeHtml(error) : ''
  const content = `
    <div class="auth-panel">
      <div class="auth-brand">
        <img class="auth-logo" src="/assets/images/photography-pixel-logo.png" alt="شعار Photography Pixel" width="170" height="170" decoding="async">
        <span class="auth-brand-name">Photography Pixel</span>
        <span class="auth-brand-sub">لوحة إدارة الوكالة</span>
      </div>
      <main class="auth-formpanel">
        <div class="auth-formwrap">
          <h1 class="auth-title">تسجيل الدخول</h1>
          <p class="auth-sub">مرحباً بك في لوحة تحكم Photography Pixel</p>
          ${err ? `<div class="auth-alert" role="alert">${err}</div>` : ''}
          <form method="post" action="/admin/login" autocomplete="on" id="auth-form" class="auth-form">
            <label class="auth-field">
              <span class="auth-label">البريد الإلكتروني</span>
              <input class="auth-input" type="email" name="email" required autocomplete="username" autofocus dir="ltr" placeholder="name@example.com">
            </label>
            <label class="auth-field">
              <span class="auth-label">كلمة المرور</span>
              <input class="auth-input" type="password" name="password" required autocomplete="current-password">
            </label>
            <button class="auth-btn" type="submit" id="auth-submit">تسجيل الدخول</button>
            <p class="auth-link-row"><a class="auth-link" href="/admin/recover">نسيت كلمة المرور؟</a></p>
          </form>
        </div>
      </main>
    </div>`
  return htmlDoc('تسجيل الدخول', 'auth-page', content, LOGIN_SCRIPT)
}

const AUTH_FORM_OPEN = `
    <div class="auth-panel">
      <div class="auth-brand">
        <img class="auth-logo" src="/assets/images/photography-pixel-logo.png" alt="شعار Photography Pixel" width="170" height="170" decoding="async">
        <span class="auth-brand-name">Photography Pixel</span>
        <span class="auth-brand-sub">لوحة إدارة الوكالة</span>
      </div>
      <main class="auth-formpanel">
        <div class="auth-formwrap">`

// Password recovery (Phase 4M): the admin sends a password-reset link to their
// own email exactly like normal staff accounts. Reset links are one-time and
// handled purely by Supabase Auth (no custom tokens are stored).
export function recoverPage(error?: string, sentEmail?: string): string {
  const err = error ? escapeHtml(error) : ''
  const sent = sentEmail
    ? `<div class="auth-success" role="status">أرسلنا رابط استعادة كلمة المرور إلى <strong dir="ltr">${escapeHtml(sentEmail)}</strong>. تحقّق من بريدك واتبع الرابط لإعادة تعيين كلمة المرور.</div>`
    : ''
  const content = `${AUTH_FORM_OPEN}
        <h1 class="auth-title">استعادة كلمة المرور</h1>
        <p class="auth-sub">اكتب بريدك الإلكتروني وسنرسل لك رابطاً لإعادة التعيين.</p>
        ${err ? `<div class="auth-alert" role="alert">${err}</div>` : ''}
        ${sent}
        <form method="post" action="/admin/recover" autocomplete="on" class="auth-form" id="auth-form">
          <label class="auth-field">
            <span class="auth-label">البريد الإلكتروني</span>
            <input class="auth-input" type="email" name="email" required autocomplete="username" dir="ltr" placeholder="name@example.com">
          </label>
          <button class="auth-btn" type="submit" id="auth-submit">إرسال رابط الاستعادة</button>
          <p class="auth-link-row"><a class="auth-link" href="/admin/login">العودة إلى تسجيل الدخول</a></p>
        </form>
      </div></main></div>`
  return htmlDoc('استعادة كلمة المرور', 'auth-page', content, LOGIN_SCRIPT)
}

// Reset page: first visit shows the new-password form once a valid recovery
// session has been exchanged (cookies are set by the middleware). After saving
// the password the page redirects to the login page.
export function resetPage(error?: string, notice?: string): string {
  const err = error ? escapeHtml(error) : ''
  const n = notice ? `<div class="auth-success" role="status">${escapeHtml(notice)}</div>` : ''
  const content = `${AUTH_FORM_OPEN}
        <h1 class="auth-title">كلمة مرور جديدة</h1>
        <p class="auth-sub">أدخل كلمة المرور الجديدة لحسابك في لوحة التحكم.</p>
        ${err ? `<div class="auth-alert" role="alert">${err}</div>` : ''}
        ${n}
        <form method="post" action="/admin/reset" autocomplete="new-password" class="auth-form" id="auth-form">
          <label class="auth-field">
            <span class="auth-label">كلمة المرور الجديدة</span>
            <input class="auth-input" type="password" name="password" required minlength="8" autocomplete="new-password">
          </label>
          <label class="auth-field">
            <span class="auth-label">تأكيد كلمة المرور</span>
            <input class="auth-input" type="password" name="confirm" required minlength="8" autocomplete="new-password">
          </label>
          <button class="auth-btn" type="submit" id="auth-submit">حفظ كلمة المرور</button>
          <p class="auth-link-row"><a class="auth-link" href="/admin/login">العودة إلى تسجيل الدخول</a></p>
        </form>
      </div></main></div>`
  return htmlDoc('كلمة مرور جديدة', 'auth-page', content, LOGIN_SCRIPT)
}

//--------------------------------------------------------------------------
// Shell
//--------------------------------------------------------------------------

export type ShellOptions = {
  active: RouteKey
  user: AppUserRow
  crumbs?: string
  bodyClass?: string
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
        <div class="side-user">${avatarFor(user)}<div class="meta"><div class="n">${escapeHtml(profileDisplayName(user))}</div><div class="r">${roleLabel(user.role_key)}</div></div></div>
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
        <div class="user-meta"><div class="u-n">${escapeHtml(profileDisplayName(user))}</div><div class="u-s">${roleLabel(user.role_key)}</div></div>
        ${avatarFor(user)}
        <a class="logout-btn" href="/admin/search" title="بحث عام في العملاء والمشاريع والموديلات والتوصيلات">${shellIcon('search', 16)}<span>بحث</span></a>
        <a class="logout-btn" href="/admin/logout">${shellIcon('logout', 17)}<span>خروج</span></a>
      </div>
    </header>`
}

export function shell(title: string, content: string, options: ShellOptions, extra = ''): string {
  const { active, user, crumbs, bodyClass } = options
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
  const bodyClassValue = bodyClass ? `dash ${bodyClass}` : 'dash'
  const doc = htmlDoc(title, bodyClassValue, body, DRAWER_SCRIPT + extra)
  return doc
}

//--------------------------------------------------------------------------
// Shared content components
//--------------------------------------------------------------------------

export function card(content: string): string {
  return `<div class="card">${content}</div>`
}

export function statCard(label: string, iconName: string, value: string, hint = ''): string {
  const hintHtml = hint ? `<div class="h">${escapeHtml(hint)}</div>` : ''
  return `
    <div class="stat">
      <div class="k">${shellIcon(iconName, 15)}<span>${escapeHtml(label)}</span></div>
      <div class="v">${escapeHtml(value)}</div>
      ${hintHtml}
    </div>`
}

export type PanelOptions = { soon?: boolean; action?: string }

export function panel(title: string, iconName: string, body: string, options: PanelOptions = {}): string {
  const tag = options.soon ? '<span class="soon-tag">قيد التحضير</span>' : ''
  const action = options.action ? `<div class="panel-action">${options.action}</div>` : ''
  return `
    <section class="panel">
      <div class="panel-head"><span class="ico-chip">${shellIcon(iconName, 18)}</span><h2>${escapeHtml(title)}</h2>${tag}${action}</div>
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