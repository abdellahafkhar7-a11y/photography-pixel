import type { DeliveryStatus, DeliverySourceType, RoleKey } from './db-types'

//============================================================================
// Photography Pixel brand system — light/cream, white cards, soft shadows,
// the site's blue/purple accent, rounded corners, clean line icons, RTL.
// Values mirror the public styles.css tokens.
//============================================================================

const BRAND_STYLES = `
<style>
  :root{
    --bg-primary:#FAF8F3;
    --bg-secondary:#F4F0E8;
    --bg-tertiary:#EDE8DC;
    --surface:#FFFFFF;
    --text-primary:#201F1C;
    --text-secondary:#45413A;
    --text-muted:#6F6A5F;
    --text-subtle:#A8A297;
    --accent:#362477;
    --accent-bright:#181bbe;
    --accent-light:rgba(54,36,119,.08);
    --gradient:linear-gradient(135deg,#2678bb 0%,#362477 55%,#4a1170 100%);
    --success:#2F7D5A;
    --warning:#9A6B00;
    --error:#B3473F;
    --border:#E6E0D4;
    --radius-sm:.375rem;
    --radius-md:.625rem;
    --radius-lg:.875rem;
    --radius-xl:1.25rem;
    --radius-2xl:1.75rem;
    --shadow-sm:0 1px 2px rgba(32,31,28,.05);
    --shadow-md:0 2px 10px rgba(32,31,28,.06);
    --shadow-lg:0 8px 28px rgba(32,31,28,.09);
    color-scheme:light;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html{-webkit-text-size-adjust:100%}
  body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:var(--bg-primary);color:var(--text-primary);line-height:1.7;min-height:100vh;display:flex;flex-direction:column}
  a{color:var(--accent);text-decoration:none}
  a:hover{text-decoration:underline}
  .page{width:100%;max-width:58rem;margin:0 auto;padding:2rem 1.25rem 4rem;flex:1}
  .page.wide{max-width:72rem}
  .brand-foot{padding:1.5rem;text-align:center;color:var(--text-subtle);font-size:.8rem}

  /* Topbar (admin) */
  .topbar{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-bottom:1.75rem}
  .topbar .brand{display:flex;align-items:center;gap:.6rem;font-weight:750;font-size:1.02rem;letter-spacing:.01em}
  .nav{display:flex;align-items:center;gap:.25rem;flex-wrap:wrap}
  .nav a{padding:.45rem .8rem;border-radius:var(--radius-full);color:var(--text-secondary);font-size:.88rem}
  .nav a:hover{background:var(--bg-tertiary);text-decoration:none;color:var(--text-primary)}
  .nav a.active{background:var(--accent);color:#fff;font-weight:600}
  .nav a.muted-link{color:var(--text-muted)}

  .card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-xl);padding:1.5rem;box-shadow:var(--shadow-sm)}
  .card + .card{margin-top:1.25rem}
  h1{font-size:1.45rem;font-weight:750}
  h2{font-size:1.05rem;font-weight:700;color:var(--text-primary)}
  .label{font-size:.72rem;letter-spacing:.05em;color:var(--text-muted);margin-bottom:.4rem;font-weight:600}
  .muted{color:var(--text-muted);font-size:.9rem}
  .hint{color:var(--text-subtle);font-size:.82rem}
  .row{display:flex;align-items:center;gap:.75rem;flex-wrap:wrap}
  .between{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap}
  .grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(16rem,1fr));gap:1rem}

  .btn{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;padding:.68rem 1.15rem;border-radius:var(--radius-md);border:1px solid transparent;font-size:.95rem;font-weight:650;cursor:pointer;text-decoration:none!important;transition:transform .06s ease}
  .btn:active{transform:translateY(1px)}
  .btn-primary{background:var(--accent);color:#fff}
  .btn-primary:hover{filter:brightness(1.12)}
  .btn-subtle{background:var(--bg-secondary);color:var(--text-primary);border-color:var(--border)}
  .btn-subtle:hover{background:var(--bg-tertiary)}
  .btn-outline{background:transparent;color:var(--accent);border-color:var(--accent)}
  .btn-danger{background:transparent;color:var(--error);border-color:rgba(179,71,63,.4)}
  .btn-danger:hover{background:rgba(179,71,63,.06)}
  .btn-success{background:var(--success);color:#fff}
  .btn.block{width:100%}
  .btn:disabled{opacity:.55;cursor:not-allowed}

  .field{display:block;margin-bottom:1.1rem}
  .field label{display:block;font-weight:600;font-size:.9rem;margin-bottom:.4rem;color:var(--text-secondary)}
  .field input[type=text],.field input[type=url],.field input[type=tel],.field input[type=email],.field input[type=file],.field textarea,.field select{
    width:100%;padding:.65rem .8rem;background:#fff;border:1px solid var(--border);border-radius:var(--radius-md);color:var(--text-primary);font-size:.95rem;font-family:inherit}
  .field input:focus,.field select:focus,.field textarea:focus{outline:2px solid var(--accent);outline-offset:1px;border-color:transparent}
  .field .hint{display:block;margin-top:.35rem}

  .badge{display:inline-flex;align-items:center;gap:.35rem;padding:.22rem .7rem;border-radius:var(--radius-full);font-size:.78rem;font-weight:650;border:1px solid transparent}
  .st-pending{background:#F7F1E3;color:#8a6a1f;border-color:#E9DDB8}
  .st-preview_viewed{background:rgba(54,36,119,.08);color:var(--accent);border-color:rgba(54,36,119,.22)}
  .st-confirmed,.st-download_available{background:rgba(54,36,119,.12);color:var(--accent);border-color:rgba(54,36,119,.28)}
  .st-downloaded{background:rgba(47,125,90,.1);color:var(--success);border-color:rgba(47,125,90,.28)}
  .st-expired{background:rgba(179,71,63,.08);color:var(--error);border-color:rgba(179,71,63,.24)}
  .pill{display:inline-flex;padding:.16rem .6rem;border-radius:var(--radius-full);font-size:.76rem;font-weight:600;border:1px solid var(--border);color:var(--text-secondary);background:var(--bg-secondary)}
  .pill.src-portfolio{color:var(--accent);background:var(--accent-light);border-color:rgba(54,36,119,.2)}

  table.tbl{width:100%;border-collapse:collapse;font-size:.9rem}
  .tbl th{text-align:right;color:var(--text-muted);font-weight:600;font-size:.76rem;padding:.6rem .5rem;border-bottom:1px solid var(--border)}
  .tbl td{padding:.75rem .5rem;border-bottom:1px solid var(--bg-tertiary);vertical-align:middle}
  .tbl tr:last-child td{border-bottom:none}

  .alert{padding:.8rem 1rem;border-radius:var(--radius-md);font-size:.9rem;margin-bottom:1.25rem}
  .alert.info{background:var(--accent-light);color:var(--accent);border:1px solid rgba(54,36,119,.18)}
  .alert.error{background:rgba(179,71,63,.07);color:var(--error);border:1px solid rgba(179,71,63,.22)}
  .alert.success{background:rgba(47,125,90,.08);color:var(--success);border:1px solid rgba(47,125,90,.22)}

  .linkbox{display:flex;align-items:center;gap:.6rem;background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--radius-md);padding:.6rem .8rem;direction:ltr;text-align:left;font-size:.88rem;color:var(--text-primary);word-break:break-all}
  .linkbox .copy{margin-inline-start:auto;flex:none}

  .actionbar{display:flex;gap:.6rem;flex-wrap:wrap;margin-top:1rem}

  /* Client page */
  .hero{position:relative;overflow:hidden;border-radius:var(--radius-2xl);background:var(--gradient);color:#fff;padding:2.2rem 1.8rem;box-shadow:var(--shadow-lg)}
  .hero .logo{display:inline-flex;align-items:center;gap:.7rem;font-weight:800;font-size:1.35rem;letter-spacing:.01em}
  .hero .sub{margin-top:.5rem;color:rgba(255,255,255,.85);font-size:.95rem}
  .client-body{margin-top:1.25rem}
  .video-frame{background:#14121a;border-radius:var(--radius-xl);overflow:hidden;box-shadow:var(--shadow-md);position:relative}
  .video-frame video,.video-frame img{display:block;width:100%;aspect-ratio:16/9;object-fit:contain;background:#0d0c12}
  .confirm-note{margin-top:1rem;background:var(--accent-light);border:1px solid rgba(54,36,119,.14);border-radius:var(--radius-lg);padding:1rem 1.1rem;color:var(--text-secondary);font-size:.92rem}
  .confirm-note b{color:var(--accent)}
  .stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(9rem,1fr));gap:.75rem;margin-top:1.1rem}
  .stat-cell{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:.9rem 1rem;box-shadow:var(--shadow-sm)}
  .stat-cell .label{font-size:.68rem}
  .stat-cell .value{font-weight:700;font-size:.98rem}
  .wa-row{display:flex;align-items:center;gap:.6rem;color:var(--success);font-weight:650}
</style>
`

function htmlDoc(title: string, content: string): string {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(title)}</title>${BRAND_STYLES}</head><body>${content}<footer class="brand-foot">Photography Pixel — ${escapeHtml(title)}</footer></body></html>`
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function brandLogo(size = 26): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#6C4DFF"/><circle cx="12" cy="12" r="3.6" fill="rgba(255,255,255,.92)"/><path d="M12 3v2.4M12 18.6V21M3 12h2.4M18.6 12H21M6.3 6.3l1.7 1.7M16 16l1.7 1.7M17.7 6.3L16 8M8 16l-1.7 1.7" stroke="rgba(255,255,255,.85)" stroke-width="1.3" stroke-linecap="round"/></svg>`
}

export const icons = {
  link: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1.2 1.2"/><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1.2-1.2"/></svg>`,
  whatsapp: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.2 14.1c-.2.6-1.2 1.2-1.7 1.2-.5.1-1.1.1-1.7-.1-.5-.1-1-.3-1.5-.6a9.6 9.6 0 0 1-4.2-4.2c-.3-.5-.5-1-.6-1.5-.2-.6-.2-1.2-.1-1.7.1-.5.6-1.5 1.2-1.7.2 0 .4 0 .5.1.1.1.1.2.3.6.1.2.2.3.1.5-.1.2-.3.5-.4.7-.1.2-.3.3-.1.6.1.3.6 1 1.3 1.7s1.4 1.2 1.7 1.3c.3.2.4.1.6-.1l.7-.8c.2-.2.3-.2.6-.1l1 1.2c.1.2.3.4.3.5-.1.2-.1.3-.1.5Z"/></svg>`,
  download: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 19h16"/></svg>`,
  check: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5L20 7"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2.2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  refresh: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 6"/><path d="M20 4v7h-7"/></svg>`,
  ban: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m5.5 5.5 13 13"/></svg>`,
  upload: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M4 19h16"/></svg>`,
  play: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4.5v15l13-7.5Z"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  phone: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l1.5 4.5-2.2 1.6a13 13 0 0 0 5.6 5.6l1.6-2.2L20 15v4a1.8 1.8 0 0 1-2 1.8C10 20 4 14 3.2 6A1.8 1.8 0 0 1 5 4Z"/></svg>`,
  eye: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>`,
  arrow: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2"/><path d="M6 7l1 12a1.8 1.8 0 0 0 1.8 1.6h6.4A1.8 1.8 0 0 0 17 19l1-12"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`,
  arrowLeft: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="m11 6-6 6 6 6"/></svg>`,
} as const

type IconName = keyof typeof icons

export function icon(name: IconName, size = 20): string {
  const raw = icons[name]
  if (typeof raw === 'string' && size !== 20) {
    return raw.replace('width="20" height="20"', `width="${size}" height="${size}"`)
  }
  return raw
}

//----------------------------------------------------------------------------
// Pages
//----------------------------------------------------------------------------

export type BrandPageOptions = {
  header?: string
  wide?: boolean
  bodyClass?: string
}

export function brandPage(title: string, content: string, options: BrandPageOptions = {}): string {
  const pageClass = options.wide ? 'page wide' : 'page'
  const contentHtml = [
    options.header ?? '',
    `<main class="${pageClass} ${options.bodyClass ?? ''}">`,
    content,
    '</main>',
  ].join('')
  return htmlDoc(title, contentHtml)
}

export function adminTopbar(
  activeKey: 'dash' | 'deliveries' | 'new' | 'other',
  role: RoleKey,
): string {
  const item = (key: typeof activeKey, href: string, label: string): string =>
    `<a href="${href}" class="${activeKey === key ? 'active' : ''}">${label}</a>`
  return `<header class="topbar"><span class="brand">${brandLogo(26)}<span>Photography Pixel</span></span><nav class="nav">${item(
    'dash',
    '/admin',
    'لوحة التحكم',
  )}${item('deliveries', '/admin/deliveries', 'التوصيلات')}${item('new', '/admin/deliveries/new', 'توصيل جديد')}<span class="pill">${
    role === 'owner' ? 'صاحب الموقع' : 'منسق'
  }</span><a href="/admin/logout" class="muted-link">خروج</a></nav></header>`
}

//----------------------------------------------------------------------------
// Status / formatting helpers
//----------------------------------------------------------------------------

const STATUS_LABEL: Record<DeliveryStatus, string> = {
  pending: 'قيد الانتظار',
  preview_viewed: 'تم فتح المعاينة',
  confirmed: 'تم التأكيد',
  download_available: 'التحميل متاح',
  downloaded: 'تم التحميل',
  expired: 'منتهي',
}

export function statusBadgeHtml(status: DeliveryStatus): string {
  const label = STATUS_LABEL[status] ?? status
  return `<span class="badge st-${status}">${label}</span>`
}

export function sourcePillHtml(source: DeliverySourceType): string {
  if (source === 'portfolio') {
    return `<span class="pill src-portfolio">فيديو من المعرض العام</span>`
  }
  return `<span class="pill">فيديو خاص</span>`
}

const DATE_FORMATTER = new Intl.DateTimeFormat('ar-MA', {
  dateStyle: 'medium',
  timeStyle: 'short',
  numberingSystem: 'latn',
})

const DATE_ONLY_FORMATTER = new Intl.DateTimeFormat('ar-MA', {
  dateStyle: 'medium',
  numberingSystem: 'latn',
})

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : DATE_FORMATTER.format(date)
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : DATE_ONLY_FORMATTER.format(date)
}

export const COPY_SCRIPT = `<script>(function(){document.addEventListener('click',function(e){var b=e.target.closest('[data-copy]');if(!b)return;var v=b.getAttribute('data-copy')||'';function done(){var old=b.innerHTML;b.innerHTML='${icons.check} تم النسخ';setTimeout(function(){b.innerHTML=old},1400)}if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(v).then(done,function(){fallback(v);done()})}else{fallback(v);done()}});function fallback(v){var t=document.createElement('textarea');t.value=v;t.style.position='fixed';t.style.opacity='0';document.body.appendChild(t);t.select();document.execCommand('copy');document.body.removeChild(t)}})();</script>`

export function emptyStateHtml(message: string): string {
  return `<div class="card"><p class="muted">${escapeHtml(message)}</p></div>`
}