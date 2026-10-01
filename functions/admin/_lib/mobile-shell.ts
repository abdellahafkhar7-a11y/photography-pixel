import type { AppUserRow } from '../_lib/types'
import { escapeHtml, shellIcon } from '../_lib/shell'

//============================================================================
// Phase 5A — Mobile Team Workspace shell (Coordinator).
// A self-contained, mobile-first presentation layer for the SAME auth, RBAC,
// database and delivery backend the admin uses. It renders no sidebar: the app
// chrome is a header plus a 4-item bottom navigation with safe-area support.
// Desktop admin pages are untouched by this file.
//============================================================================

//============================================================================
// Phase 5A — the Coordinator app is TEMPORARY VIDEO SHARING, not Client
// Delivery. There is deliberately no "التسليمات" tab: a Coordinator neither
// sees nor manages Owner Client Deliveries, and delivery history is not part of
// this workflow. Bottom navigation is exactly:
//     الرئيسية | الأعمال | المزيد
//============================================================================

export type MobileTab = 'home' | 'portfolio' | 'more'

export const MOBILE_APP_NAME = 'Photography Pixel'

//============================================================================
// Device gate for the /admin entry point.
//
// Phase 5A built the Mobile Team Workspace as a real page tree under /admin/m.
// /admin itself is the desktop dashboard, so a Coordinator who opens /admin on
// a phone used to land on the desktop shell. The only signal available before
// the response is generated is the User-Agent, so the entry point sends mobile
// requests to the workspace with a redirect instead of hiding the dashboard.
//
// The Owner keeps the desktop dashboard at every width, and a Coordinator on a
// desktop browser keeps the Coordinator desktop dashboard.
//============================================================================

const MOBILE_USER_AGENT =
  /Android.*Mobile|webOS|iPhone|iPod|BlackBerry|BB10|IEMobile|Opera Mini|Opera Mobile|Windows Phone|Mobile Safari|Mobi/i

export function isMobileUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false
  return MOBILE_USER_AGENT.test(userAgent)
}

const NAV_ITEMS: { tab: MobileTab; label: string; href: string; icon: string }[] = [
  { tab: 'home', label: 'الرئيسية', href: '/admin/m', icon: 'grid' },
  { tab: 'portfolio', label: 'الأعمال', href: '/admin/m/portfolio', icon: 'video' },
  { tab: 'more', label: 'المزيد', href: '/admin/m/more', icon: 'user' },
]

const MOBILE_STYLES = `
<style>
  :root{
    --m-bg:#FAF8F3;
    --m-surface:#FFFFFF;
    --m-surface-2:#F5F2EC;
    --m-ink:#201F1C;
    --m-ink-2:#45413A;
    --m-muted:#6F6A5F;
    --m-subtle:#A8A297;
    --m-line:rgba(32,31,28,.1);
    --m-line-soft:rgba(32,31,28,.06);
    --m-accent:#362477;
    --m-blue:#181BBE;
    --m-gradient:linear-gradient(135deg,#2678bb 0%,#362477 55%,#4a1170 100%);
    --m-success:#2F7D5A;
    --m-error:#B3473F;
    --m-r-sm:.625rem;
    --m-r-md:.875rem;
    --m-r-lg:1.125rem;
    --m-r-xl:1.25rem;
    --m-shadow:0 2px 10px -4px rgba(32,31,28,.16),0 1px 2px rgba(32,31,28,.05);
    --m-shadow-lg:0 18px 40px -18px rgba(32,31,28,.32);
    --m-nav-h:66px;
    --m-font:'Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;
    color-scheme:light;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html{-webkit-text-size-adjust:100%;overflow-x:hidden}
  body.m-page{
    font-family:var(--m-font);
    background:var(--m-bg);
    color:var(--m-ink);
    line-height:1.65;
    min-height:100vh;
    min-height:100dvh;
    /* Reserve room for the fixed bottom navigation + the iOS home indicator. */
    padding-bottom:calc(var(--m-nav-h) + env(safe-area-inset-bottom, 0px) + 14px);
    overflow-x:hidden;
    -webkit-font-smoothing:antialiased;
  }
  img{max-width:100%}
  a{color:var(--m-accent);text-decoration:none}
  button{font-family:inherit}
  :focus-visible{outline:2px solid var(--m-accent);outline-offset:2px}

  /* ---------------- Header ---------------- */
  .m-header{
    position:sticky;top:0;z-index:60;
    padding:calc(env(safe-area-inset-top, 0px) + .7rem) 1rem .7rem;
    background:rgba(250,248,243,.9);
    backdrop-filter:blur(14px) saturate(150%);
    -webkit-backdrop-filter:blur(14px) saturate(150%);
    border-bottom:1px solid var(--m-line-soft);
    display:flex;align-items:center;gap:.7rem;min-height:52px;
  }
  .m-header .m-head-back{
    display:inline-flex;align-items:center;justify-content:center;
    width:42px;height:42px;flex:none;border-radius:50%;
    background:var(--m-surface);border:1px solid var(--m-line);color:var(--m-ink);
  }
  .m-header .m-head-back:active{background:var(--m-surface-2)}
  .m-header .m-head-text{min-width:0;flex:1;line-height:1.3}
  .m-header h1{font-size:1.12rem;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .m-header .m-head-sub{font-size:.76rem;color:var(--m-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .m-header .m-head-avatar{flex:none}

  .m-main{width:100%;max-width:560px;margin:0 auto;padding:1.1rem 1rem 0}

  /* ---------------- Cards & text ---------------- */
  .m-card{background:var(--m-surface);border:1px solid var(--m-line);border-radius:var(--m-r-xl);box-shadow:var(--m-shadow);padding:1.05rem 1.05rem 1.1rem}
  .m-card + .m-card{margin-top:.85rem}
  .m-section-title{display:flex;align-items:center;gap:.5rem;margin:1.35rem .1rem .6rem;font-size:.94rem;font-weight:800}
  .m-section-title:first-child{margin-top:.2rem}
  .m-muted{color:var(--m-muted);font-size:.86rem}
  .m-tiny{color:var(--m-subtle);font-size:.76rem}
  .m-eyebrow{font-size:.72rem;font-weight:800;letter-spacing:.06em;color:var(--m-muted)}
  .m-hero-title{font-size:1.32rem;font-weight:850;line-height:1.3;letter-spacing:-.01em}
  .m-empty{padding:1.6rem 1rem;text-align:center;color:var(--m-muted);font-size:.88rem}
  .m-avatar{width:44px;height:44px;border-radius:50%;background:var(--m-gradient);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:1rem;flex:none;overflow:hidden}
  .m-avatar img{width:100%;height:100%;object-fit:cover}

  /* ---------------- Buttons ---------------- */
  .m-btn{
    display:inline-flex;align-items:center;justify-content:center;gap:.5rem;
    min-height:50px;padding:.7rem 1.1rem;border-radius:var(--m-r-lg);
    border:1px solid transparent;background:var(--m-surface-2);color:var(--m-ink);
    font-size:.94rem;font-weight:750;text-decoration:none!important;cursor:pointer;
    transition:filter .15s ease,transform .06s ease;
  }
  .m-btn:active{transform:translateY(1px)}
  .m-btn-primary{background:var(--m-gradient);color:#fff;box-shadow:0 10px 22px -14px rgba(54,36,119,.9)}
  .m-btn-primary:active{filter:brightness(1.06)}
  .m-btn-ghost{background:var(--m-surface);border-color:var(--m-line);color:var(--m-ink-2)}
  .m-btn-quiet{background:transparent;color:var(--m-muted);min-height:44px;padding:.5rem .8rem}
  .m-btn-block{width:100%}
  .m-btn[disabled],.m-btn[aria-disabled=true]{opacity:.55;pointer-events:none}
  .m-btn-lg{min-height:58px;font-size:1rem;border-radius:var(--m-r-xl)}
  .m-actions{display:flex;flex-direction:column;gap:.6rem}
  .m-actions-row{display:flex;gap:.6rem}
  .m-actions-row .m-btn{flex:1}

  /* ---------------- Home action tiles ---------------- */
  .m-tiles{display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-top:1rem}
  .m-tile{
    display:flex;flex-direction:column;align-items:flex-start;gap:.5rem;
    min-height:132px;padding:1rem .95rem;border-radius:var(--m-r-xl);
    background:var(--m-surface);border:1px solid var(--m-line);box-shadow:var(--m-shadow);
    color:var(--m-ink);text-align:start;
  }
  .m-tile:active{background:var(--m-surface-2)}
  .m-tile .m-tile-ico{width:44px;height:44px;border-radius:14px;display:inline-flex;align-items:center;justify-content:center;background:var(--m-gradient);color:#fff}
  .m-tile .m-tile-ico.alt{background:linear-gradient(135deg,#2678bb 0%,#4a1170 100%)}
  .m-tile .m-tile-t{font-size:1rem;font-weight:800;line-height:1.25}
  .m-tile .m-tile-s{font-size:.78rem;color:var(--m-muted);line-height:1.45}

  /* ---------------- Pills & badges ---------------- */
  .m-pill{display:inline-flex;align-items:center;gap:.35rem;padding:.3rem .7rem;border-radius:999px;background:var(--m-surface-2);border:1px solid var(--m-line);font-size:.75rem;font-weight:700;color:var(--m-ink-2)}
  .m-pill.ok{background:rgba(47,125,90,.1);color:var(--m-success);border-color:rgba(47,125,90,.26)}
  .m-pill.accent{background:rgba(54,36,119,.07);color:var(--m-accent);border-color:rgba(54,36,119,.2)}
  .m-pill.warn{background:#F7F1E3;color:#8a6a1f;border-color:#E9DDB8}
  .m-pill.err{background:rgba(179,71,63,.08);color:var(--m-error);border-color:rgba(179,71,63,.24)}
  .m-chips{display:flex;gap:.45rem;overflow-x:auto;padding:.15rem .1rem .35rem;scrollbar-width:none;-webkit-overflow-scrolling:touch}
  .m-chips::-webkit-scrollbar{display:none}
  .m-chip{
    flex:none;min-height:42px;display:inline-flex;align-items:center;gap:.4rem;
    padding:.5rem .9rem;border-radius:999px;background:var(--m-surface);
    border:1px solid var(--m-line);color:var(--m-ink-2);font-size:.85rem;font-weight:700;
    text-decoration:none!important;white-space:nowrap;
  }
  .m-chip.on{background:var(--m-gradient);color:#fff;border-color:transparent}
  .m-chip .n{opacity:.7;font-weight:600;font-size:.78rem}

  /* ---------------- Forms ---------------- */
  .m-field{display:block;margin-top:.9rem}
  .m-field > span{display:block;font-weight:750;font-size:.88rem;margin-bottom:.42rem;color:var(--m-ink-2)}
  .m-input{
    width:100%;min-height:52px;padding:.75rem .9rem;background:var(--m-surface);
    border:1px solid var(--m-line);border-radius:var(--m-r-lg);color:var(--m-ink);
    font-size:1rem;font-family:inherit;
  }
  .m-input::placeholder{color:var(--m-subtle)}
  .m-input:focus{outline:2px solid var(--m-accent);outline-offset:1px;border-color:transparent}
  .m-search{position:relative;display:flex;align-items:center;margin-top:.2rem}
  .m-search .m-search-ico{position:absolute;inset-inline-start:.85rem;display:inline-flex;color:var(--m-subtle);pointer-events:none}
  .m-search .m-input{padding-inline:2.7rem 2.7rem}
  .m-search button{
    position:absolute;inset-inline-end:.4rem;width:40px;height:40px;display:inline-flex;
    align-items:center;justify-content:center;border:none;background:transparent;color:var(--m-subtle);cursor:pointer;
  }
  .m-alert{margin-top:.9rem;padding:.8rem .9rem;border-radius:var(--m-r-md);font-size:.88rem;line-height:1.6}
  .m-alert.error{background:rgba(179,71,63,.07);color:var(--m-error);border:1px solid rgba(179,71,63,.24)}
  .m-alert.info{background:rgba(54,36,119,.06);color:var(--m-accent);border:1px solid rgba(54,36,119,.18)}

  /* ---------------- Video picker ---------------- */
  .m-vgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.7rem}
  .m-vcard{
    position:relative;display:flex;flex-direction:column;overflow:hidden;
    background:var(--m-surface);border:1px solid var(--m-line);border-radius:var(--m-r-lg);
    box-shadow:var(--m-shadow);
  }
  .m-vcard.sel{border-color:var(--m-accent);box-shadow:0 0 0 2px rgba(54,36,119,.22),var(--m-shadow)}
  .m-vcard .m-vthumb{position:relative;display:block;width:100%;aspect-ratio:16/9;border:0;padding:0;background:linear-gradient(135deg,#2678bb 0%,#362477 55%,#4a1170 100%);overflow:hidden;cursor:pointer}
  .m-vcard .m-vthumb img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
  .m-vcard .m-vplay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff}
  .m-vcard .m-vplay span{width:40px;height:40px;border-radius:50%;background:rgba(32,31,28,.42);display:inline-flex;align-items:center;justify-content:center}
  .m-vcard input{position:absolute;opacity:0;width:1px;height:1px;pointer-events:none}
  .m-vbody{padding:.55rem .6rem .6rem;display:flex;flex-direction:column;gap:.15rem;min-width:0}
  .m-vbody .m-vtitle{font-size:.82rem;font-weight:750;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .m-vbody .m-vcat{font-size:.72rem;color:var(--m-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .m-vcheck{
    position:absolute;top:.45rem;inset-inline-start:.45rem;z-index:2;
    width:26px;height:26px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;
    background:rgba(255,255,255,.9);border:1.5px solid var(--m-line);color:transparent;
  }
  .m-vcard.sel .m-vcheck{background:var(--m-accent);border-color:var(--m-accent);color:#fff}
  .m-vcheck-num{position:absolute;top:.5rem;inset-inline-end:.5rem;z-index:2;font-size:.72rem;font-weight:800;color:#fff;background:rgba(32,31,28,.55);border-radius:999px;padding:.1rem .4rem;display:none}
  .m-vcard.sel .m-vcheck-num{display:inline-block}
  .m-vpick-label{flex:1;cursor:pointer}

  /* Sticky selection bar, docked right above the bottom navigation. */
  .m-pickbar{
    position:fixed;inset-inline:0;z-index:70;
    bottom:calc(var(--m-nav-h) + env(safe-area-inset-bottom, 0px));
    padding:.55rem .9rem;
    background:rgba(255,255,255,.96);
    backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
    border-top:1px solid var(--m-line);
    display:none;align-items:center;gap:.7rem;
  }
  .m-pickbar.show{display:flex}
  .m-pickbar .m-pick-count{font-size:.86rem;font-weight:800;min-width:0;line-height:1.3;flex:1}
  .m-pickbar .m-pick-count small{display:block;font-weight:600;color:var(--m-muted);font-size:.74rem}
  .m-pickbar .m-btn{flex:0 0 auto;min-width:0;padding-inline:.95rem}
  .m-pickbar .m-btn-primary{min-width:120px}
  body.m-picking{padding-bottom:calc(var(--m-nav-h) + env(safe-area-inset-bottom, 0px) + 92px)}

  /* ---------------- Delivery rows ---------------- */
  .m-drow{
    display:flex;gap:.75rem;align-items:flex-start;
    padding:.9rem 1rem;background:var(--m-surface);border:1px solid var(--m-line);
    border-radius:var(--m-r-lg);box-shadow:var(--m-shadow);
  }
  .m-drow + .m-drow{margin-top:.65rem}
  .m-drow-ico{width:42px;height:42px;flex:none;border-radius:13px;background:rgba(54,36,119,.07);color:var(--m-accent);display:inline-flex;align-items:center;justify-content:center}
  .m-drow-body{flex:1;min-width:0}
  .m-drow-name{font-size:.98rem;font-weight:800;line-height:1.3;overflow-wrap:anywhere}
  .m-drow-meta{display:flex;flex-wrap:wrap;gap:.35rem;margin-top:.35rem}
  .m-drow-actions{display:flex;gap:.5rem;margin-top:.6rem}
  .m-drow-actions .m-btn{min-height:44px;padding:.45rem .8rem;font-size:.83rem;flex:1}
  .m-drow-link{display:block;margin-top:.5rem;font-size:.72rem;color:var(--m-muted);direction:ltr;text-align:left;overflow-wrap:anywhere}

  /* ---------------- Bottom navigation (4 items, app-like) ---------------- */
  .m-nav{
    position:fixed;inset-inline:0;bottom:0;z-index:80;
    display:grid;grid-template-columns:repeat(4,1fr);align-items:stretch;
    background:rgba(255,255,255,.97);
    backdrop-filter:blur(18px) saturate(160%);-webkit-backdrop-filter:blur(18px) saturate(160%);
    border-top:1px solid var(--m-line);
    box-shadow:0 -6px 22px -14px rgba(32,31,28,.4);
    padding-bottom:env(safe-area-inset-bottom, 0px);
  }
  .m-nav a{
    display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.15rem;
    min-height:var(--m-nav-h);padding:.45rem .2rem;color:var(--m-muted);
    font-size:.7rem;font-weight:700;text-decoration:none!important;position:relative;
  }
  .m-nav a .m-nav-ico{
    display:inline-flex;align-items:center;justify-content:center;
    width:46px;height:29px;border-radius:999px;transition:background .18s ease,color .18s ease;
  }
  .m-nav a.on{color:var(--m-accent)}
  .m-nav a.on .m-nav-ico{background:var(--m-gradient);color:#fff;box-shadow:0 8px 16px -10px rgba(54,36,119,.95)}
  .m-nav a.on .m-nav-label{font-weight:800}
  .m-nav-badge{
    position:absolute;top:6px;inset-inline-end:calc(50% - 22px);
    min-width:17px;height:17px;padding:0 4px;border-radius:999px;background:var(--m-error);
    color:#fff;font-size:.64rem;font-weight:800;line-height:17px;text-align:center;
    box-shadow:0 0 0 2px rgba(255,255,255,.97);
  }

  /* ---------------- Full-screen sheet (player / success) ---------------- */
  .m-sheet{position:fixed;inset:0;z-index:120;display:none;flex-direction:column;background:rgba(250,248,243,.98)}
  .m-sheet.open{display:flex}
  .m-sheet-top{
    display:flex;align-items:center;gap:.6rem;
    padding:calc(env(safe-area-inset-top, 0px) + .7rem) .9rem .7rem;
    border-bottom:1px solid var(--m-line-soft);background:var(--m-surface);
  }
  .m-sheet-top .m-sheet-title{flex:1;min-width:0;font-size:.95rem;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .m-sheet-close{display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;flex:none;border-radius:50%;border:1px solid var(--m-line);background:var(--m-surface-2);color:var(--m-ink);cursor:pointer}
  .m-sheet-body{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:1rem;padding-bottom:calc(1rem + env(safe-area-inset-bottom, 0px))}
  .m-sheet-body .m-inner{width:100%;max-width:480px;margin:0 auto}
  .m-player{width:100%;aspect-ratio:16/9;border:0;display:block;background:#0d0c12;border-radius:var(--m-r-lg);box-shadow:var(--m-shadow-lg)}

  /* ---------------- Success ---------------- */
  .m-ok-badge{width:64px;height:64px;border-radius:50%;background:rgba(47,125,90,.1);color:var(--m-success);display:inline-flex;align-items:center;justify-content:center;margin-bottom:.7rem}
  .m-linkbox{
    display:flex;align-items:center;gap:.55rem;background:var(--m-surface-2);
    border:1px solid var(--m-line);border-radius:var(--m-r-md);padding:.6rem .75rem;
    direction:ltr;text-align:left;font-size:.8rem;color:var(--m-ink);overflow-wrap:anywhere;
  }
  .m-kv{display:flex;justify-content:space-between;gap:.8rem;padding:.6rem 0;border-bottom:1px solid var(--m-line-soft)}
  .m-kv:last-child{border-bottom:none}
  .m-kv .k{color:var(--m-muted);font-size:.85rem;flex:none}
  .m-kv .v{font-weight:750;font-size:.92rem;text-align:end;overflow-wrap:anywhere}

  /* ---------------- Misc ---------------- */
  .m-list{display:flex;flex-direction:column}
  .m-list a,.m-list > div{display:flex;align-items:center;gap:.7rem;min-height:54px;padding:.7rem .15rem;border-bottom:1px solid var(--m-line-soft);color:var(--m-ink);font-size:.92rem;font-weight:700}
  .m-list a:last-child,.m-list > div:last-child{border-bottom:none}
  .m-list .m-list-ico{width:36px;height:36px;flex:none;border-radius:11px;background:rgba(54,36,119,.07);color:var(--m-accent);display:inline-flex;align-items:center;justify-content:center}
  .m-list .m-list-ico.danger{background:rgba(179,71,63,.08);color:var(--m-error)}
  .m-toast{
    position:fixed;inset-inline:0;bottom:calc(var(--m-nav-h) + env(safe-area-inset-bottom, 0px) + 14px);
    z-index:140;margin:0 auto;width:max-content;max-width:88%;
    padding:.7rem 1rem;border-radius:999px;background:rgba(32,31,28,.93);color:#fff;
    font-size:.85rem;font-weight:700;box-shadow:var(--m-shadow-lg);
  }
  .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}

  @media (min-width:520px){
    .m-vgrid{grid-template-columns:repeat(3,minmax(0,1fr))}
  }
  @media (prefers-reduced-motion:reduce){
    *{animation:none!important;transition:none!important}
  }
</style>`

function navHtml(active: MobileTab, unread: number): string {
  const items = NAV_ITEMS.map((item) => {
    const on = item.tab === active
    const badge = item.tab === 'more' && unread > 0 ? `<span class="m-nav-badge">${unread > 9 ? '9+' : unread}</span>` : ''
    return `<a href="${item.href}" class="${on ? 'on' : ''}"${on ? ' aria-current="page"' : ''}>
      <span class="m-nav-ico">${shellIcon(item.icon, 20)}</span>
      <span class="m-nav-label">${item.label}</span>
      ${badge}
    </a>`
  }).join('')
  return `<nav class="m-nav" aria-label="التنقل الرئيسي">${items}</nav>`
}

export type MobilePageOptions = {
  title: string
  user: AppUserRow
  tab: MobileTab
  subtitle?: string
  /** Rendered at the start of the header (e.g. a back button). */
  leading?: string
  content: string
  scripts?: string
  unread?: number
  bodyClass?: string
}

export function mobilePage(options: MobilePageOptions): string {
  const { title, user, tab, subtitle, leading, content, scripts, unread = 0 } = options
  const avatar = user.avatar_key
    ? `<img src="/admin/avatar?id=${encodeURIComponent(user.id)}" alt="" width="44" height="44" decoding="async">`
    : ''
  const head = `
    <header class="m-header">
      ${leading ?? ''}
      <div class="m-head-text">
        <h1>${escapeHtml(title)}</h1>
        ${subtitle ? `<div class="m-head-sub">${escapeHtml(subtitle)}</div>` : ''}
      </div>
      <a class="m-head-avatar" href="/admin/m/more" aria-label="الحساب">${avatar ? `<span class="m-avatar">${avatar}</span>` : ''}</a>
    </header>`
  const body = `${head}<main class="m-main">${content}</main>${navHtml(tab, unread)}`
  const cls = options.bodyClass ? `m-page ${options.bodyClass}` : 'm-page'
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,maximum-scale=5">
    <meta name="robots" content="noindex,nofollow">
    <meta name="theme-color" content="#FFFFFF">
    <meta name="color-scheme" content="light">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-title" content="${escapeHtml(MOBILE_APP_NAME)}">
    <meta name="apple-mobile-web-app-status-bar-style" content="default">
    <title>${escapeHtml(title)} — ${escapeHtml(MOBILE_APP_NAME)}</title>
    <link rel="manifest" href="/manifest.webmanifest">
    <link rel="icon" type="image/png" sizes="192x192" href="/assets/images/pwa/icon-192.png">
    <link rel="apple-touch-icon" href="/assets/images/pwa/apple-touch-icon-180.png">
    <link rel="dns-prefetch" href="https://cdn.bamboo-cloud.com">${MOBILE_STYLES}
  </head><body class="${cls}">${body}${scripts ?? ''}</body></html>`
}

// Mobile responses are always private, uncached and never indexed.
export function mobileHtml(body: string, status = 200): Response {
  return new Response(body.startsWith('<!doctype html>') ? body : `<!doctype html>${body}`, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}

export function backLink(href: string, label = 'رجوع'): string {
  return `<a class="m-head-back" href="${escapeHtml(href)}" aria-label="${escapeHtml(label)}">${shellIcon('arrowLeft', 19)}</a>`
}
