import type { AppUserRow } from './types'
import type { CommunicationChannel, CommunicationDirection, CommunicationsRow, DeliveryMode, DeliverySourceType, DeliveryStatus, DeliveryVideosRow } from '../../_lib/db-types'
import { COPY_SCRIPT } from '../../_lib/brand'
import { MAX_UPLOAD_BYTES, UPLOAD_PART_SIZE } from '../../_lib/r2'
import {
  escapeHtml,
  shell,
  shellIcon,
  statCard,
} from './shell'
import type {
  DeliveryDetail,
  DeliveryListItem,
  PortfolioOption,
} from '../deliveries/_helpers'
import { ACTIVITY_LABEL, activeVideoCount, deliveryClientName } from '../deliveries/_helpers'

//============================================================================
// Phase 4C — Client Delivery admin UI, rendered with the Phase 4A/4B shell.
// These are presentation-only helpers: every token/R2/cleanup/versioning
// decision stays in the existing Phase 2 route handlers.
//============================================================================

const DATE_TIME = new Intl.DateTimeFormat('ar-MA', {
  dateStyle: 'medium',
  timeStyle: 'short',
  numberingSystem: 'latn',
  timeZone: 'Africa/Casablanca',
})

const SLOT_POSITION_LABEL: Record<string, string> = {
  planned: 'لقطة مخططة',
  active: 'في الخطة',
  paused: 'خارج الخطة',
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : DATE_TIME.format(date)
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const STATUS_LABEL: Record<DeliveryStatus, string> = {
  pending: 'في انتظار تأكيد العميل',
  preview_viewed: 'تم فتح المعاينة',
  confirmed: 'تم التأكيد — بانتظار إطلاق التحميل',
  download_available: 'التحميل متاح',
  downloaded: 'تم التحميل',
  expired: 'منتهي',
}

export function statusBadge(status: DeliveryStatus): string {
  return `<span class="badge st-${status}">${STATUS_LABEL[status] ?? status}</span>`
}

export function sourcePill(source: DeliverySourceType): string {
  if (source === 'portfolio') {
    return `<span class="badge src-portfolio">فيديو من المعرض العام</span>`
  }
  return `<span class="badge src-r2">فيديو خاص</span>`
}

const MODE_LABEL: Record<DeliveryMode, string> = {
  VIEW_ONLY: 'عرض فقط',
  VIEW_AND_DOWNLOAD: 'عرض وتحميل',
}

export function modeBadge(mode: DeliveryMode): string {
  return `<span class="badge ${mode === 'VIEW_ONLY' ? 'md-view' : 'md-download'}">${MODE_LABEL[mode] ?? mode}</span>`
}

function alert(kind: 'success' | 'error' | 'info', message: string): string {
  return `<div class="alert ${kind}">${escapeHtml(message)}</div>`
}

//----------------------------------------------------------------------------
// List
//----------------------------------------------------------------------------

export type DeliveryListOptions = {
  notice?: string
  error?: string
  query?: string
  status?: string
  source?: string
  clientId?: string
  multiVersion?: boolean
  clients?: { id: string; name: string; whatsapp_number: string }[]
}

function statusFilterOptions(current: string): string {
  const options = [['', 'كل الحالات'] as const, ...Object.entries(STATUS_LABEL)]
  return options
    .map(
      ([value, label]) =>
        `<option value="${value}"${value === current ? ' selected' : ''}>${escapeHtml(label)}</option>`,
    )
    .join('')
}

function sourceFilterOptions(current: string): string {
  const options = [
    ['', 'كل المصادر'] as const,
    ['r2', 'فيديو خاص'] as const,
    ['portfolio', 'من المعرض العام'] as const,
  ]
  return options
    .map(
      ([value, label]) =>
        `<option value="${value}"${value === current ? ' selected' : ''}>${escapeHtml(label)}</option>`,
    )
    .join('')
}

function clientFilterOptions(clients: { id: string; name: string; whatsapp_number: string }[], current: string): string {
  const options = [`<option value="">كل العملاء</option>`]
  for (const client of clients) {
    options.push(
      `<option value="${escapeHtml(client.id)}"${client.id === current ? ' selected' : ''}>${escapeHtml(client.name)} — ${escapeHtml(client.whatsapp_number)}</option>`,
    )
  }
  return options.join('')
}

function listRow(item: DeliveryListItem): string {
  const client = item.clients
  // Phase 5A — a name-only delivery (mobile flow) shows the typed name instead
  // of the generic "portfolio video" placeholder.
  const clientName =
    deliveryClientName(item) ||
    (item.source_type === 'portfolio' ? 'فيديو من المعرض العام' : 'فيديو خاص')
  const whatsapp = client?.whatsapp_number ?? ''
  const active = item.delivery_videos.find((video) => video.is_active)
  const activeCount = activeVideoCount(item.delivery_videos)
  const versions = item.delivery_videos?.length ?? 0
  const archived = item.archived_at ? `<span class="badge st-expired">مؤرشف</span>` : ''
  const expiry = item.download_expires_at ? formatDateTime(item.download_expires_at) : '—'
  const confirmed =
    item.confirmed_at
      ? `<span class="ok-glow">${shellIcon('check', 13)} ${escapeHtml(formatDateTime(item.confirmed_at))}</span>`
      : item.status === 'pending' || item.status === 'preview_viewed'
        ? '<span class="muted">بانتظار التأكيد</span>'
        : '—'
  const releaseInfo = ((): string => {
    if (item.delivery_mode === 'VIEW_ONLY') return `<span class="hint">عرض فقط</span>`
    const released = active?.download_released_at
    if (item.status === 'downloaded') return `<span class="ok-glow">${shellIcon('check', 13)} تم التحميل</span>`
    if (item.status === 'expired') return '<span class="muted">منتهي</span>'
    if (item.status === 'download_available') {
      return `<span class="ok-glow">${shellIcon('download', 13)} ${escapeHtml(formatDateTime(released ?? null))}</span>`
    }
    if (item.status === 'confirmed') return `<span class="hint">جاهز للإطلاق</span>`
    return '<span class="hint">محجوب</span>'
  })()
  const waCell = whatsapp
    ? `<a dir="ltr" href="https://wa.me/${encodeURIComponent(whatsapp)}" target="_blank" rel="noreferrer noopener">+${escapeHtml(whatsapp)}</a>`
    : '—'
  const visibleId = (item.client_visible_id ?? '').trim()
  const videoCell =
    activeCount > 1
      ? `<strong>${shellIcon('play', 12)} ${activeCount} فيديو</strong><span class="hint" style="display:block">${versions} إصدار</span>`
      : `<strong>${escapeHtml(active?.version?.toString() ?? '—')}</strong><span class="hint" style="display:block">${versions} إصدار</span>`
  return `<tr>
    <td><a href="/admin/deliveries/${item.id}"><strong>${escapeHtml(clientName)}</strong></a>${visibleId ? `<span class="hint" style="display:block" dir="ltr">${escapeHtml(visibleId)}</span>` : ''}</td>
    <td>${waCell}</td>
    <td>${videoCell}</td>
    <td>${sourcePill(item.source_type)}${modeBadge(item.delivery_mode ?? 'VIEW_AND_DOWNLOAD')}</td>
    <td>${statusBadge(item.status)}${archived}</td>
    <td>${confirmed}</td>
    <td>${releaseInfo}</td>
    <td>${expiry === '—' ? '—' : escapeHtml(expiry)}</td>
    <td>${escapeHtml(formatDateTime(item.created_at))}</td>
    <td><a class="btn btn-subtle" href="/admin/deliveries/${item.id}">${shellIcon('eye', 15)} التفاصيل</a></td>
  </tr>`
}

export function renderDeliveryList(
  appUser: AppUserRow,
  items: DeliveryListItem[],
  options: DeliveryListOptions = {},
): string {
  const isOwner = appUser.role_key === 'owner'

  const query = (options.query ?? '').trim().toLowerCase()
  const queryDigits = query.replace(/\D/g, '')
  const statusFilter = options.status ?? ''
  const sourceFilter = options.source ?? ''
  const clientFilter = options.clientId ?? ''
  const multiVersion = options.multiVersion === true
  const filtered = items.filter((item) => {
    if (statusFilter && item.status !== statusFilter) return false
    if (sourceFilter && item.source_type !== sourceFilter) return false
    if (clientFilter && item.clients && item.clients.id !== clientFilter) return false
    if (clientFilter && !item.clients) return false
    if (multiVersion && activeVideoCount(item.delivery_videos) < 2) return false
    if (!query) return true
    // Phase 5A: name-only deliveries (mobile flow) are searchable by label too.
    const name = deliveryClientName(item).toLowerCase()
    const whatsapp = item.clients?.whatsapp_number ?? ''
    const visibleId = item.client_visible_id ?? ''
    if (name.includes(query)) return true
    return queryDigits.length > 0 && (whatsapp.includes(queryDigits) || visibleId.includes(queryDigits))
  })

  const counts: { pending: number; confirmed: number; downloaded: number; expired: number } = {
    pending: 0,
    confirmed: 0,
    downloaded: 0,
    expired: 0,
  }
  for (const item of items) {
    if (item.status === 'pending' || item.status === 'preview_viewed') counts.pending += 1
    else if (item.status === 'confirmed' || item.status === 'download_available') counts.confirmed += 1
    else if (item.status === 'downloaded') counts.downloaded += 1
    else if (item.status === 'expired') counts.expired += 1
  }

  const cleanupForm = isOwner
    ? `<form method="post" action="/admin/deliveries" onsubmit="return confirm('تثبيت حالة كل توصيل تجاوز مهلة التحميل وحذف ملفاته الأصلية من التخزين؟')">
         <button class="btn btn-outline" type="submit" name="action" value="cleanup">${shellIcon('trash', 15)} تنظيف التوصيلات المنتهية</button>
       </form>`
    : ''

  const filterBar = `<form method="get" action="/admin/deliveries" class="filter-bar" role="search">
    <label class="field" style="min-width:14rem;flex:1"><span>بحث</span>
      <input type="search" name="q" value="${escapeHtml(options.query ?? '')}" placeholder="اسم العميل، رقم الواتساب أو معرف الرابط">
    </label>
    <label class="field" style="min-width:10rem"><span>الحالة</span>
      <select name="status">${statusFilterOptions(options.status ?? '')}</select>
    </label>
    <label class="field" style="min-width:10rem"><span>المصدر</span>
      <select name="source">${sourceFilterOptions(options.source ?? '')}</select>
    </label>
    <label class="field" style="min-width:12rem"><span>العميل</span>
      <select name="client">${clientFilterOptions(options.clients ?? [], options.clientId ?? '')}</select>
    </label>
    <label class="check-field" style="align-self:flex-end;padding-bottom:.6rem">
      <input type="checkbox" name="multi" value="1"${options.multiVersion ? ' checked' : ''}> فيديوهات متعددة (≥2)
    </label>
    <button class="btn btn-subtle" type="submit">${shellIcon('filter', 15)} تصفية</button>
    <a class="btn btn-text" href="/admin/deliveries">إعادة تعيين</a>
  </form>`

  const table =
    filtered.length === 0
      ? `<div class="card"><div class="mini-empty"><p class="muted">لا توجد توصيلات مطابقة.</p><a class="btn btn-primary" href="/admin/deliveries/new">${shellIcon('plus', 15)} توصيل جديد</a></div></div>`
      : `<div class="card"><div class="table-wrap"><table class="tbl">
          <thead><tr>
            <th>العميل</th><th>واتساب</th><th>الفيديوهات</th><th>المصدر</th><th>الحالة</th>
            <th>تأكيد العميل</th><th>الإطلاق/التحميل</th><th>آخر موعد للتحميل</th><th>تاريخ الإنشاء</th><th>إجراء</th>
          </tr></thead>
          <tbody>${filtered.map(listRow).join('')}</tbody>
        </table></div></div>`

  const notices = [
    options.notice ? alert('success', options.notice) : '',
    options.error ? alert('error', options.error) : '',
  ].join('')

  const content = `
    <div class="page-head">
      <div><h1>تسليم العملاء</h1><p class="sub">أنشئ روابط خاصة للعملاء وتابع حالة كل تسليم.</p></div>
      <div class="row">
        ${cleanupForm}
        ${isOwner ? `<a class="btn btn-primary" href="/admin/uploads">${shellIcon('upload', 15)} رفع فيديو جديد</a>` : ''}
        <a class="btn btn-primary" href="/admin/deliveries/new">${shellIcon('plus', 15)} توصيل جديد</a>
      </div>
    </div>
    ${notices}
    <div class="grid-stats">
      ${statCard('الإجمالي', 'package', String(items.length))}
      ${statCard('بانتظار العميل', 'clock', String(counts.pending))}
      ${statCard('مؤكّدة', 'check', String(counts.confirmed))}
      ${statCard('منتهية', 'ban', String(counts.expired))}
    </div>
    <div class="card" style="margin-bottom:1rem">${filterBar}</div>
    ${table}${COPY_SCRIPT}`

  return shell('تسليم العملاء', content, {
    active: 'client-delivery',
    user: appUser,
    crumbs: 'Photography Pixel / تسليم العملاء',
  })
}

//----------------------------------------------------------------------------
// New delivery form
//----------------------------------------------------------------------------

type ClientOption = { id: string; name: string; whatsapp_number: string }

export type DeliveryFormValues = {
  clientId: string
  name: string
  whatsapp: string
  source: string
  portfolioUrls: string[]
  mode: string
}

function groupedPortfolioCheckboxes(options: PortfolioOption[], selected: string[] = []): string {
  const byCategory = new Map<string, { items: string[] }>()
  let index = 0
  for (const opt of options) {
    index += 1
    const checked = selected.includes(opt.url)
    const itemHtml = `<label class="pf-item${checked ? ' checked' : ''}">
        <input type="checkbox" name="portfolio_url" value="${escapeHtml(opt.url)}"${checked ? ' checked' : ''}>
        <span class="pf-check">${checked ? '✔' : ''}</span>
        <span class="pf-num">${index}</span>
        <span class="pf-label">${escapeHtml(opt.category)}</span>
      </label>`
    const entry = byCategory.get(opt.category)
    if (entry) entry.items.push(itemHtml)
    else byCategory.set(opt.category, { items: [itemHtml] })
  }
  if (options.length === 0)
    return `<div class="muted" style="padding:.5rem 0">لا توجد فيديوهات منشورة في المعرض بعد.</div>`
  return `<div class="pf-list">${[...byCategory.entries()]
    .map(
      ([category, entry]) =>
        `<div class="pf-group"><div class="pf-cat">${escapeHtml(category)}</div>${entry.items.join('')}</div>`,
    )
    .join('')}</div>`
}

export function renderDeliveryNew(
  appUser: AppUserRow,
  clients: ClientOption[],
  portfolio: PortfolioOption[],
  values: DeliveryFormValues,
  error?: string,
): string {
  const isOwner = appUser.role_key === 'owner'
  const clientOptions = clients
    .map(
      (client) =>
        `<option value="${client.id}"${client.id === values.clientId ? ' selected' : ''}>${escapeHtml(client.name)} — ${escapeHtml(client.whatsapp_number)}</option>`,
    )
    .join('')

  const sourceRadio = (value: string, label: string, hint: string): string =>
    `<label class="card" style="cursor:pointer;display:block;margin-top:0">
       <input type="radio" name="source_type" value="${value}"${values.source === value ? ' checked' : ''} style="accent-color:var(--accent)">
       <strong>${label}</strong><span class="muted" style="display:block">${hint}</span>
     </label>`

  const modeRadio = (value: string, label: string, hint: string): string =>
    `<label class="card" style="cursor:pointer;display:block;margin-top:0">
       <input type="radio" name="delivery_mode" value="${value}"${values.mode === value ? ' checked' : ''} style="accent-color:var(--accent)">
       <strong>${label} ${value === 'VIEW_ONLY' ? '<span class="badge md-view">عرض فقط</span>' : '<span class="badge md-download">عرض وتحميل</span>'}</strong>
       <span class="muted" style="display:block">${hint}</span>
     </label>`

  const content = `
    <div class="page-head">
      <div><h1>توصيل جديد</h1><p class="sub">أنشئ رابطاً خاصاً لتسليم العميل فيديو أو عدة فيديوهات.</p></div>
      <a class="btn btn-subtle" href="/admin/deliveries">${shellIcon('arrowLeft', 15)} رجوع</a>
    </div>
    ${error ? alert('error', error) : ''}
    <form method="post" action="/admin/deliveries/new">
      <div class="card">
        <h2 class="form-card-title">1 · العميل</h2>
        <label class="field"><span>اختيار عميل موجود</span>
          <select name="client_id">
            <option value="">— عميل جديد —</option>
            ${clientOptions}
          </select>
        </label>
        <div class="grid2">
          <label class="field"><span>اسم العميل</span>
            <input type="text" name="name" value="${escapeHtml(values.name)}" placeholder="مثال: سارة أمين" autocomplete="off">
          </label>
          <label class="field"><span>رقم الواتساب</span>
            <input type="tel" name="whatsapp" value="${escapeHtml(values.whatsapp)}" placeholder="0663493003" dir="ltr" autocomplete="off">
            <span class="hint">سيُستخدم لإرسال الرابط عبر واتساب بعد الإنشاء.</span>
          </label>
        </div>
      </div>
      <div class="card">
        <h2 class="form-card-title">2 · مصدر الفيديو</h2>
        <div class="grid2">
          ${sourceRadio('portfolio', 'من المعرض العام', 'اختر فيديو من أعمالك المنشورة على الموقع.')}
          ${isOwner ? sourceRadio('r2', 'فيديو خاص', 'فيديو خاص لا يُعرض على الموقع؛ سيُرفع الملف الأصلي بعد الإنشاء. متاح لصاحب الموقع.') : ''}
        </div>
        <label class="field" style="margin-top:1.25rem"><span>اختر الفيديوهات (يمكن اختيار عدة فيديوهات)</span>
          ${groupedPortfolioCheckboxes(portfolio, values.portfolioUrls)}
          <span class="hint">كل فيديو يتحول إلى عنصر مستقل في نفس التوصيل — العميل يشاهدها كلها عبر رابط واحد، ويبدأ العد التنازلي المشترك (3 أيام) بعد أول تحميل.</span>
        </label>
      </div>
      <div class="card">
        <h2 class="form-card-title">3 · وضع التسليم</h2>
        <div class="grid2">
          ${modeRadio(
            'VIEW_AND_DOWNLOAD',
            'عرض وتحميل',
            'يُشاهد العميل الفيديو ويؤكّده، ثم تطلق التحميل يدوياً ليحصل على الجودة الأصلية خلال 3 أيام من أول تحميل.',
          )}
          ${modeRadio(
            'VIEW_ONLY',
            'عرض فقط',
            'يُشاهد العميل الفيديو ويؤكّده عبر الرابط فقط — لا يتوفر تحميل للأصل أبداً من رابط التوصيل.',
          )}
        </div>
      </div>
      <div class="card">
        <h2 class="form-card-title">4 · الإنشاء</h2>
        <p class="muted">بعد الإنشاء سيظهر الرابط الخاص مرة واحدة، مع زر لإرساله مباشرة عبر واتساب.</p>
        <div class="actionbar">
          <button class="btn btn-primary" type="submit">${shellIcon('link', 15)} إنشاء رابط التوصيل</button>
          <a class="btn btn-subtle" href="/admin/deliveries">إلغاء</a>
        </div>
      </div>
    </form>`

  return shell('توصيل جديد', content, {
    active: 'client-delivery',
    user: appUser,
    crumbs: 'Photography Pixel / تسليم العملاء / جديد',
  })
}

//----------------------------------------------------------------------------
// Detail
//----------------------------------------------------------------------------

export type DetailPageOptions = {
  freshToken?: string
  identifier?: string
  notice?: string
  error?: string
  portfolio?: PortfolioOption[]
  communications?: CommunicationsRow[]
}

function linkCard(base: string, token: string, identifier: string | null, whatsapp: string): string {
  const privateLink = identifier
    ? `${base}/p/${identifier}-${token}`
    : `${base}/p/${token}`
  const wa = `https://wa.me/${encodeURIComponent(whatsapp)}?text=${encodeURIComponent(
    `السلام عليكم، هذا هو الرابط الخاص بالفيديو ديالك من Photography Pixel:\n\n${privateLink}\n\nيمكنك مشاهدة الفيديو وتأكيده من خلال الرابط.`,
  )}`
  return `<div class="card" style="border-color:rgba(54,36,119,.28)">
    <div class="between"><h2>رابط التوصيل</h2><span class="badge st-preview_viewed">يظهر مرة واحدة فقط</span></div>
    <div class="linkbox" style="margin-top:.9rem"><span dir="ltr">${escapeHtml(privateLink)}</span><button type="button" class="btn btn-subtle copy" data-copy="${escapeHtml(privateLink)}">${shellIcon('copy', 15)} نسخ الرابط</button></div>
    <p class="hint" style="margin-top:.5rem">الرابط ثابت لا يتغيّر عند رفع نسخة جديدة من الفيديو. النظام يحفظ نسخة مشفّرة فقط من الرابط.</p>
    <div class="actionbar">
      <a class="btn btn-success" href="${escapeHtml(wa)}" target="_blank" rel="noreferrer noopener">${shellIcon('whatsapp', 15)} إرسال عبر واتساب</a>
      <a class="btn btn-outline" href="${escapeHtml(privateLink)}" target="_blank" rel="noreferrer noopener">${shellIcon('eye', 15)} فتح الرابط</a>
    </div>
  </div>`
}

function statCell(label: string, value: string): string {
  return `<div class="stat-cell"><div class="label">${escapeHtml(label)}</div><div class="value">${value}</div></div>`
}

function modeRadioInline(value: string, label: string, hint: string, checked: boolean): string {
  return `<label class="card" style="cursor:pointer;display:block;margin-top:0">
    <input type="radio" name="delivery_mode" value="${value}"${checked ? ' checked' : ''} style="accent-color:var(--accent)">
    <strong>${label} ${value === 'VIEW_ONLY' ? '<span class="badge md-view">عرض فقط</span>' : '<span class="badge md-download">عرض وتحميل</span>'}</strong>
    <span class="muted" style="display:block">${hint}</span>
  </label>`
}

export function renderDeliveryDetail(
  appUser: AppUserRow,
  base: string,
  detail: DeliveryDetail | null,
  options: DetailPageOptions = {},
): string {
  const backLink = `<a class="btn btn-subtle" href="/admin/deliveries">${shellIcon('arrowLeft', 15)} التوصيلات</a>`

  if (!detail) {
    const message = options.error ?? 'تعذّر تحميل التوصيل.'
    const content = `<div class="page-head"><div><h1>تفاصيل التوصيل</h1></div>${backLink}</div>${alert('error', message)}`
    return shell('تفاصيل التوصيل', content, {
      active: 'client-delivery',
      user: appUser,
      crumbs: 'Photography Pixel / تسليم العملاء / تفاصيل',
    })
  }

  const client = detail.clients
  const whatsapp = client?.whatsapp_number ?? ''
  const clientName =
    client && client.name.trim().length > 0
      ? client.name.trim()
      : detail.source_type === 'portfolio'
        ? 'فيديو من المعرض العام'
        : 'فيديو خاص'
  const videos = detail.delivery_videos ?? []
  const active = videos.find((video) => video.is_active) ?? null
  const isOwner = appUser.role_key === 'owner'
  const expired = detail.status === 'expired'
  const viewOnly = detail.delivery_mode === 'VIEW_ONLY'
  const archivedDelivery = Boolean(detail.archived_at)

  const alerts = []
  if (options.notice) alerts.push(alert('success', options.notice))
  if (options.error) alerts.push(alert('error', options.error))
  if (expired) {
    alerts.push(
      alert(
        'error',
        `التوصيل منتهي — لا يمكن فتح الرابط ولا التحميل.${isOwner && detail.source_type === 'r2' ? ' يمكن رفع نسخة جديدة لإعادة تنشيطه.' : ''}`,
      ),
    )
  } else if (detail.source_type === 'r2' && !active && isOwner) {
    alerts.push(alert('info', 'لم يُرفَع الفيديو الخاص بعد. ارفع النسخة الأولى ليظهر الرابط للعميل.'))
  }
  const alertHtml = alerts.join('')

  // VIEW_ONLY deliveries confirm visually but never promise a download, so
  // their confirmed badge must not say "بانتظار إطلاق التحميل".
  const statusShown =
    viewOnly && detail.status === 'confirmed'
      ? `<span class="badge st-download">تم التأكيد — العرض فقط</span>`
      : statusBadge(detail.status)

  let shareCard: string
  if (options.freshToken) {
    shareCard = linkCard(base, options.freshToken, options.identifier ?? detail.client_visible_id, whatsapp)
  } else {
    const releaseAction =
      isOwner && detail.status === 'confirmed' && !viewOnly && !archivedDelivery
        ? `<form method="post" onsubmit="return confirm('إطلاق التحميل للعميل؟ يبدأ العد التنازلي (3 أيام) عند أول تحميل من العميل.')"><input type="hidden" name="action" value="release"><button class="btn btn-primary" type="submit">${shellIcon('download', 15)} إطلاق التحميل</button></form>`
        : isOwner && detail.status === 'confirmed' && viewOnly
          ? `<span class="hint">وضع «عرض فقط» — لا يتوفر تحميل للأصل من هذا التوصيل.</span>`
          : ''
    const ownerActions = archivedDelivery
      ? isOwner
        ? `<p class="hint" style="margin-top:.9rem">التوصيل مؤرشف — أعد تفعيله لاستخدام الرابط.</p>`
        : ''
      : isOwner && !expired
        ? `<div class="actionbar" style="margin-top:1rem">
             ${releaseAction}
             <form method="post"><input type="hidden" name="action" value="regenerate"><button class="btn btn-subtle" type="submit">${shellIcon('refresh', 15)} إنشاء رابط جديد</button></form>
             <form method="post" onsubmit="return confirm('إلغاء الرابط الحالي؟ لن يتمكن العميل من فتحه بعد الآن.')"><input type="hidden" name="action" value="revoke"><button class="btn btn-danger" type="submit">${shellIcon('ban', 15)} إلغاء الرابط</button></form>
           </div>`
        : ''
    const stableLink = detail.client_visible_id
      ? `<div class="linkbox" style="margin-top:.9rem"><span dir="ltr">${escapeHtml(`${base}/p/${detail.client_visible_id}-••••••••••••••••••••`)}</span></div>
         <p class="hint" style="margin-top:.5rem">الرابط ثابت لا يتغيّر عند رفع نسخة جديدة. المفتاح السري أُعطي مرة واحدة عند الإنشاء.</p>`
      : ''
    shareCard = `<div class="card">
      <div class="between"><h2>رابط التوصيل</h2>${modeBadge(detail.delivery_mode)}</div>
      ${stableLink}
      ${ownerActions}
    </div>`
  }

  // ---- Per video item cards (Phase 4M: one delivery, several videos) ----
  const activeVideos = [...videos]
    .filter((video) => video.is_active)
    .sort((a, b) => a.item_pos - b.item_pos || b.version - a.version)

  const itemLifecycleLine = (video: DeliveryVideosRow): string => {
    const parts: string[] = []
    if (video.confirmed_at) parts.push(`تأكيد العميل: ${formatDateTime(video.confirmed_at)}`)
    if (video.download_released_at) parts.push(`إطلاق التحميل: ${formatDateTime(video.download_released_at)}`)
    if (video.downloaded_at) parts.push(`أول تحميل: ${formatDateTime(video.downloaded_at)}`)
    if (video.expired_at) parts.push(`انتهاء: ${formatDateTime(video.expired_at)}`)
    return parts.length > 0 ? parts.join('<br>') : ''
  }

  const itemActions = (video: DeliveryVideosRow): string => {
    if (!isOwner || archivedDelivery || expired) return ''
    const actions: string[] = []
    const r2Private = video.source_type === 'r2'
    if (r2Private) {
      actions.push(
        `<a class="btn btn-subtle" href="/admin/deliveries/${detail.id}/upload?item=${video.item_pos}">${shellIcon('upload', 15)} رفع نسخة جديدة</a>`,
      )
    }
    actions.push(
      `<form method="post" onsubmit="return confirm('حذف هذا الفيديو من التوصيل؟ سيُحذف الملف الأصلي (إن وجد) وتُؤرشف نسخه. لا يمكن التراجع.')">
        <input type="hidden" name="action" value="delete_video"><input type="hidden" name="item_pos" value="${video.item_pos}">
        <button class="btn btn-danger" type="submit">${shellIcon('trash', 15)} حذف الفيديو</button>
      </form>`,
    )
    return `<div class="row">${actions.join('')}</div>`
  }

  const itemCards =
    activeVideos.length === 0
      ? `<div class="card"><p class="muted" style="padding:.4rem 0">لا يوجد فيديو نشط في هذا التوصيل.</p></div>`
      : activeVideos
          .map((video) => {
            const portfolioUrl = video.source_type === 'portfolio' ? video.portfolio_url : null
            const embed = portfolioUrl
              ? `<div class="video-frame"><video controls preload="metadata" src="${escapeHtml(portfolioUrl)}"></video></div>`
              : `<div class="video-frame video-frame-lock"><div class="pp-pattern-watermark"></div><p class="muted" style="padding:1rem">${shellIcon('lock', 16)} فيديو خاص — معاينة العميل تعرض نسخة بعلامة مائية (Photography Pixel). الأصل يُحمَّل بعد تأكيد العميل وإطلاق التحميل.</p></div>`
            const meta = [
              video.source_type === 'portfolio' ? 'من المعرض العام' : 'فيديو خاص',
              video.original_filename ? escapeHtml(video.original_filename) : '',
              formatBytes(video.size_bytes),
            ]
              .filter(Boolean)
              .join(' · ')
            const deleted = video.original_deleted_at
              ? `<p class="hint">حُذف الملف الأصلي من المخزن الخاص بعد انتهاء التحميل.</p>`
              : ''
            const lifecycle = itemLifecycleLine(video)
            return `<div class="video-item card" style="margin-bottom:1rem">
              <div class="video-item-head">
                <span class="video-item-n">${video.item_pos}</span>
                <h3 class="form-card-title" style="margin:0">${escapeHtml(video.original_filename ?? (portfolioUrl ? 'فيديو من المعرض العام' : 'فيديو خاص'))}</h3>
                <span class="badge st-confirmed">النسخة الحالية ${video.version}</span>
              </div>
              ${embed}
              <p class="hint" style="margin-top:.6rem">${escapeHtml(meta)}${deleted ? `<br>${deleted.replace(/<\/?p[^>]*>/g, '')}` : ''}</p>
              ${lifecycle ? `<p class="hint">${lifecycle}</p>` : ''}
              ${itemActions(video)}
            </div>`
          })
          .join('')

  const addVideoCard = (() => {
    if (!isOwner || archivedDelivery || expired) return ''
    if (detail.source_type === 'r2') {
      return `<div class="card video-add-card">
        <h3 class="form-card-title">إضافة فيديو خاص جديد</h3>
        <p class="muted">${shellIcon('lock', 14)} يُضاف كعنصر مستقل في نفس التوصيل — الرابط الخاص يبقى نفسه ويضم كل الفيديوهات بعد رفع الملف.</p>
        <div class="actionbar"><a class="btn btn-primary" href="/admin/deliveries/${detail.id}/upload?item=add">${shellIcon('plus', 15)} إضافة فيديو خاص</a></div>
      </div>`
    }
    const catalog = options.portfolio ?? []
    if (catalog.length === 0) {
      return `<div class="card video-add-card"><p class="muted">لا توجد فيديوهات إضافية في المعرض العام حالياً.</p></div>`
    }
    const alreadyUsed = new Set(activeVideos.map((video) => video.portfolio_url))
    const selectable = catalog.filter((option) => !alreadyUsed.has(option.url))
    if (selectable.length === 0) {
      return `<div class="card video-add-card"><p class="muted">كل فيديوهات المعرض العام مضافة بالفعل إلى هذا التوصيل.</p></div>`
    }
    const optionsHtml = selectable
      .map((option) => `<option value="${escapeHtml(option.url)}">${escapeHtml(option.category)} — ${escapeHtml(option.file)}</option>`)
      .join('')
    return `<div class="card video-add-card">
      <h3 class="form-card-title">إضافة فيديو من المعرض العام</h3>
      <form method="post" action="/admin/deliveries/${detail.id}">
        <input type="hidden" name="action" value="add_video">
        <label class="field"><span>اختر فيديو</span>
          <select name="portfolio_url">${optionsHtml}</select>
        </label>
        <div class="actionbar" style="margin-top:1rem"><button class="btn btn-primary" type="submit">${shellIcon('plus', 15)} إضافة الفيديو</button></div>
      </form>
    </div>`
  })()

  const versionStateLabel = (video: DeliveryVideosRow): string => {
    if (video.is_active) return `<span class="badge st-confirmed">النسخة الحالية</span>`
    if (video.archived_at) return `<span class="badge st-expired">مؤرشفة</span>`
    return `<span class="badge st-pending">نسخة سابقة</span>`
  }

  const versionActions = (video: DeliveryVideosRow): string => {
    if (video.is_active || !isOwner) return ''
    const deleted = video.original_deleted_at ? ' deleted' : ''
    return `<div class="row${deleted}">
      <form method="post">${video.archived_at ? '' : `<input type="hidden" name="action" value="archive_version"><input type="hidden" name="version_id" value="${video.id}"><button class="btn btn-subtle" type="submit">${shellIcon('archive', 15)} أرشفة</button>`}</form>
      <form method="post" onsubmit="${video.original_deleted_at ? "return confirm('إعادة الرابط؟')" : "return confirm('حذف الملف الأصلي لهذه النسخة؟ لا يمكن التراجع.')"}"><input type="hidden" name="action" value="delete_version"><input type="hidden" name="version_id" value="${video.id}"><button class="btn btn-danger" type="submit">${video.original_deleted_at ? `${shellIcon('refresh', 15)} إلغاء الحذف` : `${shellIcon('trash', 15)} حذف الملف`}</button></form>
    </div>`
  }

  const versionRows =
    videos.length === 0
      ? `<tr><td colspan="5"><p class="muted" style="padding:.5rem 0">لا يوجد فيديو بعد.</p></td></tr>`
      : videos
          .map((video) => {
            const statusLine = video.original_deleted_at
              ? `<p class="hint">حُذف الملف الأصلي من التخزين بعد انتهاء التحميل.</p>`
              : ''
            const detailLine = [
              video.source_type === 'portfolio' ? 'المعرض العام' : 'فيديو خاص',
              video.original_filename ? escapeHtml(video.original_filename) : '',
              formatBytes(video.size_bytes),
            ]
              .filter(Boolean)
              .join(' · ')
            const stateLine = [
              video.confirmed_at ? `تأكيد: ${formatDateTime(video.confirmed_at)}` : '',
              video.downloaded_at ? `تحميل: ${formatDateTime(video.downloaded_at)}` : '',
              video.expired_at ? `انتهاء: ${formatDateTime(video.expired_at)}` : '',
            ]
              .filter(Boolean)
              .join('<br>')
            return `<tr><td><strong>فيديو ${video.item_pos} · النسخة ${video.version}</strong>${video.is_active ? '<br><span class="hint">نشطة حاليًا</span>' : ''}</td><td>${escapeHtml(detailLine)}</td><td>${versionStateLabel(video)}${statusLine}</td><td>${formatDateTime(video.created_at)}${stateLine ? `<br><span class="hint">${stateLine}</span>` : ''}</td><td>${versionActions(video)}</td></tr>`
          })
          .join('')

  const activityRows =
    detail.delivery_activity.length === 0
      ? `<tr><td colspan="2"><p class="muted" style="padding:.5rem 0">لا يوجد نشاط بعد.</p></td></tr>`
      : detail.delivery_activity
          .slice(0, 30)
          .map(
            (event) =>
              `<tr><td>${escapeHtml(ACTIVITY_LABEL[event.type] ?? event.type)}</td><td>${escapeHtml(formatDateTime(event.created_at))}</td></tr>`,
          )
          .join('')

  const COMMUNICATION_CHANNEL_LABEL: Record<CommunicationChannel, string> = {
    whatsapp: 'واتساب',
    email: 'بريد',
    internal: 'ملاحظة',
    system: 'النظام',
  }
  const COMMUNICATION_DIRECTION_LABEL: Record<CommunicationDirection, string> = {
    outbound: 'صادر',
    inbound: 'وارد',
    system: 'تلقائي',
  }
  const commRows =
    !options.communications || options.communications.length === 0
      ? `<tr><td colspan="3"><p class="muted" style="padding:.5rem 0">لا يوجد تواصل مسجّل بعد.</p></td></tr>`
      : options.communications
          .slice(0, 30)
          .map(
            (c) =>
              `<tr>
                <td><span class="badge st-preview_viewed">${COMMUNICATION_DIRECTION_LABEL[c.direction] ?? c.direction} · ${COMMUNICATION_CHANNEL_LABEL[c.channel] ?? c.channel}</span> ${escapeHtml(c.message)}</td>
                <td>${escapeHtml(formatDateTime(c.created_at))}</td>
              </tr>`,
          )
          .join('')
  const commCard = `<div class="card">
      <h2 class="form-card-title">سجل التواصل</h2>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>الرسالة</th><th>التاريخ</th></tr></thead><tbody>${commRows}</tbody></table></div>
      ${isOwner ? `<form method="post" style="margin-top:.9rem" class="comm-note">
        <input type="hidden" name="action" value="add_note">
        <div class="comm-note-row">
          <select name="direction" aria-label="الاتجاه">
            <option value="outbound">صادر (إلى العميل)</option>
            <option value="inbound">وارد (من العميل)</option>
          </select>
          <select name="channel" aria-label="القناة">
            <option value="whatsapp">واتساب</option>
            <option value="email">بريد</option>
            <option value="internal">ملاحظة داخلية</option>
          </select>
          <input type="text" name="note" required minlength="2" maxlength="500" placeholder="سجّل رسالة تواصل (واتساب / بريد / ملاحظة)…">
          <button class="btn btn-subtle" type="submit">${shellIcon('plus', 14)} تسجيل</button>
        </div>
      </form>` : ''}
    </div>`

  const content = `
    <div class="page-head">
      <div>
        <h1>${escapeHtml(clientName)}</h1>
        <div class="row" style="margin-top:.45rem">${sourcePill(detail.source_type)} ${modeBadge(detail.delivery_mode)} ${statusShown}${archivedDelivery ? ' <span class="badge st-expired">مؤرشف</span>' : ''}</div>
        ${detail.client_video_slots && client ? `<div style="margin-top:.5rem"><a class="btn btn-subtle" href="/admin/clients/${client.id}">${shellIcon('video', 15)} جزء من خطة «${escapeHtml(client.name)}» — اللقطة ${detail.client_video_slots.position} (${SLOT_POSITION_LABEL[detail.client_video_slots.status] ?? detail.client_video_slots.status})</a></div>` : ''}
      </div>
      ${backLink}
    </div>
    ${alertHtml}
    ${shareCard}
    ${itemCards}
    ${addVideoCard}
    <div class="card">
      <h2 class="form-card-title">معلومات العميل</h2>
      <div class="stat-grid">
        ${statCell('الاسم', escapeHtml(deliveryClientName(detail) || '—'))}
        ${statCell('واتساب', `<span dir="ltr">${escapeHtml(whatsapp || '—')}</span>`)}
        ${statCell('تاريخ الإنشاء', escapeHtml(formatDateTime(detail.created_at)))}
        ${statCell('ملف العميل', client ? `<a class="btn btn-subtle" href="/admin/clients/${client.id}">${shellIcon('user', 15)} عرض الملف</a>` : escapeHtml('—'))}
      </div>
    </div>
    <div class="card">
      <h2 class="form-card-title">وضع التوصيل</h2>
      ${detail.status === 'downloaded' || expired ? `<p class="muted">${MODE_LABEL[detail.delivery_mode] ?? detail.delivery_mode} — لا يمكن تغيير وضع التوصيل بعد بدء التحميل.</p>` : (archivedDelivery ? `<p class="muted">${MODE_LABEL[detail.delivery_mode] ?? detail.delivery_mode} — التوصيل مؤرشف.</p>` : (isOwner ? `
        <form method="post" action="/admin/deliveries/${detail.id}">
          <div class="grid2">
            ${modeRadioInline('VIEW_AND_DOWNLOAD', 'عرض وتحميل', 'يُشاهد العميل ويحمّل الأصل بعد التأكيد وإطلاق التحميل.', detail.delivery_mode === 'VIEW_AND_DOWNLOAD')}
            ${modeRadioInline('VIEW_ONLY', 'عرض فقط', 'يشاهد ويؤكد فقط — التحميل غير متاح أبداً لهذا التوصيل.', detail.delivery_mode === 'VIEW_ONLY')}
          </div>
          <div class="actionbar" style="margin-top:1rem"><button class="btn btn-subtle" type="submit" name="action" value="set_mode">${shellIcon('settings', 15)} حفظ الوضع</button></div>
        </form>` : `<p class="muted">${MODE_LABEL[detail.delivery_mode] ?? detail.delivery_mode}</p>`))}
    </div>
    <div class="card">
      <h2 class="form-card-title">النسخ</h2>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>النسخة</th><th>التفاصيل</th><th>الحالة</th><th>الإنشاء</th><th>إجراء</th></tr></thead><tbody>${versionRows}</tbody></table></div>
    </div>
    <div class="card">
      <h2 class="form-card-title">الحالة والجداول الزمنية</h2>
      ${detail.status === 'confirmed' && isOwner && !viewOnly ? `<div class="alert info" style="margin-bottom:.9rem">العميل أكّد الفيديوهات — اضغط «إطلاق التحميل» أعلاه ليصبح الرابط قابلاً للتحميل.</div>` : ''}
      ${detail.status === 'confirmed' && viewOnly ? `<div class="alert success" style="margin-bottom:.9rem">العميل أكّد الفيديوهات — هذا التوصيل «عرض فقط» فلا يتوفر تحميل للأصل.</div>` : ''}
      ${detail.status === 'download_available' ? `<div class="alert success" style="margin-bottom:.9rem">تم إطلاق التحميل — يبدأ العد التنازلي المشترك (3 أيام) عند أول تحميل من العميل.</div>` : ''}
      <div class="stat-grid">
        ${statCell('الحالة', statusShown)}
        ${statCell('الوضع', modeBadge(detail.delivery_mode))}
        ${statCell('الفيديوهات', `<strong>${activeVideos.length}</strong><span class="hint" style="display:block">${videos.length} إصدار مسجّل</span>`)}
        ${statCell('تاريخ التأكيد', detail.confirmed_at ? escapeHtml(formatDateTime(detail.confirmed_at)) : '—')}
        ${statCell('أول تحميل', detail.downloaded_at ? escapeHtml(formatDateTime(detail.downloaded_at)) : '—')}
        ${statCell('آخر موعد للتحميل', detail.download_expires_at ? escapeHtml(formatDateTime(detail.download_expires_at)) : '—')}
        ${statCell('الانتهاء', detail.expired_at ? escapeHtml(formatDateTime(detail.expired_at)) : '—')}
      </div>
    </div>
    <div class="card">
      <h2 class="form-card-title">سجل النشاط</h2>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>الحدث</th><th>التاريخ</th></tr></thead><tbody>${activityRows}</tbody></table></div>
    </div>
    ${commCard}
    ${isOwner ? `<div class="card danger-zone">
      <h2 class="form-card-title">إدارة التوصيل</h2>
      ${archivedDelivery
        ? `<form method="post"><button class="btn btn-subtle" type="submit" name="action" value="unarchive_delivery">${shellIcon('refresh', 15)} إعادة التوصيل إلى القوائم</button></form>`
        : `<form method="post" onsubmit="return confirm('أرشفة هذا التوصيل؟ سيُخفى من القوائم الرئيسية ويبقى محفوظاً.')"><button class="btn btn-subtle" type="submit" name="action" value="archive_delivery">${shellIcon('archive', 15)} أرشفة التوصيل</button></form>`}
    </div>` : ''}${COPY_SCRIPT}`

  return shell('تفاصيل التوصيل', content, {
    active: 'client-delivery',
    user: appUser,
    crumbs: `Photography Pixel / تسليم العملاء / ${clientName}`,
  })
}

//----------------------------------------------------------------------------
// Upload
//----------------------------------------------------------------------------

const UPLOADER_SCRIPT = `<script>
(function(){
  var root=document.getElementById('up-root');
  if(!root)return;
  var dz=root.querySelector('.dropzone');
  var fileInput=root.querySelector('input[type=file]');
  var panel=root.querySelector('#up-panel');
  var nameEl=root.querySelector('#up-name');
  var detailEl=root.querySelector('#up-detail');
  var barEl=root.querySelector('#up-bar');
  var statusEl=root.querySelector('#up-status');
  var pctEl=root.querySelector('#up-pct');
  var btnStart=root.querySelector('#btn-start');
  var btnCancel=root.querySelector('#btn-cancel');
  var errEl=root.querySelector('#up-error');
  var action=root.getAttribute('data-action');
  var maxBytes=parseInt(root.getAttribute('data-max'),10)||1073741824;
  var partSize=parseInt(root.getAttribute('data-part'),10)||33554432;
  var ALLOWED={mp4:1,mov:1,webm:1,m4v:1,mkv:1,avi:1,mpeg:1,mpg:1};
  var file=null,uploaded=0,session=null,aborted=false,retried=0;

  function fmt(n){if(n<1024)return n+' B';if(n<1048576)return (n/1024).toFixed(1)+' KB';if(n<1073741824)return (n/1048576).toFixed(1)+' MB';return (n/1073741824).toFixed(2)+' GB'}
  function setError(msg){errEl.textContent=msg||'';errEl.hidden=!msg}
  function displayFile(){
    nameEl.textContent=file.name;
    detailEl.textContent=fmt(file.size)+' — '+file.type+' · mp4/mov/webm/mkv';
    var ok=file.size>0&&file.size<=maxBytes;
    if(file.size>maxBytes){setError('الحجم يتجاوز الحد الأقصى 1 جيجابايت.');return}
    if(file.size<=0){setError('الملف فارغ.');return}
    var ext=(file.name.split('.').pop()||'').toLowerCase();
    var videoType=file.type?file.type.indexOf('video/')===0:false;
    if(!videoType&&!ALLOWED[ext]&&!file.type){setError('الرجاء اختيار ملف فيديو (mp4, mov, webm, mkv ...).');return}
    var a=dz.closest('.card').querySelector('.up-actions');if(a)a.hidden=false;
    setError('');
  }
  function selectFile(f){if(!f)return;file=f;displayFile();panel.hidden=false;}
  function setBusy(busy){btnStart.disabled=busy;btnCancel.hidden=!busy;btnStart.textContent=busy?'يتم الرفع...':'رفع الفيديو'}
  function render(){var pct=file&&file.size?Math.min(Math.round(uploaded/file.size*100),100):0;barEl.style.width=pct+'%';pctEl.textContent=pct+'%';
    if(session&&session.mode==='multipart'&&session.container){var done=session.container.done||0;statusEl.textContent='يتم الرفع... الجزء '+(done+Math.min(session.container.current||1,1))+' من '+Math.ceil(file.size/partSize)}
    else if(session&&session.mode==='stream'){statusEl.textContent='يتم الرفع...'}
    else{statusEl.textContent='جاري التحضير...'}}

  function showFinalHtml(html){
    document.open();document.write(html);document.close();
  }

  function xhrPart(n,total,uploadId,key){return new Promise(function(resolve,reject){
    var offset=(n-1)*partSize;
    var slice=file.slice(offset,Math.min(offset+partSize,file.size));
    var start=uploaded;
    var xhr=new XMLHttpRequest();
    xhr.open('POST',action,true);
    xhr.setRequestHeader('x-action','part');
    xhr.setRequestHeader('x-part',String(n));
    xhr.setRequestHeader('x-part-count',String(total));
    xhr.setRequestHeader('x-upload-id',uploadId);
    xhr.setRequestHeader('x-key',key);
    xhr.responseType='json';
    xhr.upload.onprogress=function(e){if(e.lengthComputable){uploaded=start+e.loaded;render()}};
    xhr.onload=function(){
      if(xhr.status===200&&xhr.response&&xhr.response.ok){resolve({n:n,etag:xhr.response.etag})}
      else{reject(new Error((xhr.response&&xhr.response.error)||('خطأ في رفع الجزء '+n)))}
    };
    xhr.onerror=function(){reject(new Error('فشل الاتصال أثناء رفع الجزء '+n))};
    xhr.onabort=function(){reject(new Error('aborted'))};
    xhr.send(slice);
  });}

  async function uploadMultipart(uploadId,key,total){
    var parts=[];
    for(var n=1;n<=total;n++){
      if(aborted)throw new Error('aborted');
      session.container={done:parts.length,current:n};
      render();
      try{parts.push(await xhrPart(n,total,uploadId,key))}
      catch(err){if(String(err&&err.message)==='aborted')throw err;
        if(retried<2){retried++;n--;continue}
        throw err;}
    }
    session.container=null;
    statusEl.textContent='جاري تجهيز الفيديو...';
    var res=await fetch(action,{method:'POST',headers:{'x-action':'complete','content-type':'application/json'},body:JSON.stringify({uploadId:uploadId,key:key,parts:parts,size:file.size,filename:file.name})});
    var data=await res.json();
    if(!res.ok||!data.ok)throw new Error((data&&data.error)||'تعذّر إنهاء الرفع.');
    showFinalHtml(data.html);
  }

  async function uploadStream(key){
    var start=0;
    var xhr=new XMLHttpRequest();
    xhr.open('POST',action,true);
    xhr.setRequestHeader('x-action','stream');
    xhr.setRequestHeader('x-filename',encodeURIComponent(file.name));
    xhr.setRequestHeader('x-mime',file.type||'application/octet-stream');
    xhr.setRequestHeader('x-size',String(file.size));
    xhr.responseType='json';
    xhr.upload.onprogress=function(e){if(e.lengthComputable){uploaded=start+e.loaded;render()}};
    var result=await new Promise(function(resolve,reject){
      xhr.onload=function(){if(xhr.status===200&&xhr.response&&xhr.response.ok)resolve(xhr.response);else reject(new Error((xhr.response&&xhr.response.error)||'تعذّر الرفع.'))};
      xhr.onerror=function(){reject(new Error('فشل الاتصال أثناء الرفع.'))};
      xhr.onabort=function(){reject(new Error('aborted'))};
      xhr.send(file);
    });
    showFinalHtml(result.html);
  }

  btnStart.addEventListener('click',async function(){
    if(!file)return;
    setError('');aborted=false;retried=0;uploaded=0;setBusy(true);statusEl.textContent='جاري التحضير...';render();
    try{
      var res=await fetch(action,{method:'POST',headers:{'x-action':'init','content-type':'application/json'},body:JSON.stringify({filename:file.name,mime:file.type||'',size:file.size})});
      var data=await res.json();
      if(!res.ok||!data.ok)throw new Error((data&&data.error)||'تعذّر بدء الرفع.');
      session=data;
      if(session.mode==='multipart'){var total=Math.ceil(file.size/session.partSize);await uploadMultipart(session.uploadId,session.key,total)}
      else{await uploadStream(session.key)}
    }catch(err){
      var msg=String(err&&err.message||err);
      if(msg==='aborted'){setError('تم إلغاء الرفع.');uploaded=0;render();setBusy(false);session=null;return}
      if(session&&session.mode==='multipart'&&session.uploadId){
        try{fetch(action,{method:'POST',headers:{'x-action':'abort','content-type':'application/json'},body:JSON.stringify({uploadId:session.uploadId,key:session.key})})}catch(e){}
      }
      setError(msg);setBusy(false);session=null;uploaded=0;render();
    }
  });

  btnCancel.addEventListener('click',function(){
    aborted=true;
    try{fetch(action,{method:'POST',headers:{'x-action':'abort','content-type':'application/json'},body:JSON.stringify({uploadId:session&&session.uploadId||'',key:session&&session.key||''})})}catch(e){}
  });

  if(dz){
    dz.addEventListener('click',function(){fileInput.click()});
    dz.addEventListener('dragover',function(e){e.preventDefault();dz.classList.add('drag')});
    dz.addEventListener('dragleave',function(){dz.classList.remove('drag')});
    dz.addEventListener('drop',function(e){e.preventDefault();dz.classList.remove('drag');selectFile(e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0])});
  }
  if(fileInput)fileInput.addEventListener('change',function(){selectFile(fileInput.files&&fileInput.files[0])});
})();
</script>`

export function renderDeliveryUpload(
  appUser: AppUserRow,
  deliveryId: string,
  hasVideo: boolean,
  notice?: string,
  error?: string,
  title?: string,
  sub?: string,
  item?: 'add' | number,
): string {
  const itemSuffix = item === undefined ? '' : `?item=${item}`
  const action = `/admin/deliveries/${deliveryId}/upload${itemSuffix}`
  const heading = title ?? (hasVideo ? 'رفع نسخة جديدة من الفيديو' : 'رفع الفيديو الخاص')
  const subText =
    sub ??
    'يتم الرفع جزئياً إلى المخزن الخاص مباشرة مع مؤشر تقدم حقيقي. الحد الأقصى 1 جيجابايت لكل فيديو.'
  const content = `
    <div class="page-head">
      <div>
        <h1>${escapeHtml(heading)}</h1>
        <p class="sub">${escapeHtml(subText)}</p>
      </div>
      <a class="btn btn-subtle" href="/admin/deliveries/${deliveryId}">${shellIcon('arrowLeft', 15)} تفاصيل التوصيل</a>
    </div>
    ${notice ? alert('success', notice) : ''}
    ${error ? alert('error', error) : ''}
    <div class="up-root card" id="up-root" data-action="${action}" data-max="${MAX_UPLOAD_BYTES}" data-part="${UPLOAD_PART_SIZE}">
      <h2 class="form-card-title">ملف الفيديو (mp4 · mov · webm · mkv)</h2>
      <div class="dropzone" id="dz">
        <span class="dz-ico">${shellIcon('upload', 30)}</span>
        <p>اسحب ملف الفيديو هنا أو اضغط للاختيار</p>
        <input type="file" name="file" accept="video/mp4,video/quicktime,video/webm,video/x-matroska,video/x-msvideo,video/mpeg,.mp4,.mov,.webm,.mkv,.avi,.mpeg,.mpg" hidden>
      </div>
      <p id="up-error" class="alert alert-error" style="margin-top:.9rem" hidden></p>
      <div id="up-panel" hidden>
        <div class="up-meta">
          <span class="ico-chip">${shellIcon('video', 18)}</span>
          <div class="up-file"><div class="up-name" id="up-name"></div><div class="up-detail" id="up-detail"></div></div>
          <span class="hint">يُخزَّن في مخزن خاص غير متاح للعموم. لا يُنشر أبداً على الموقع.</span>
        </div>
        <div class="up-bar"><span id="up-bar"></span></div>
        <div class="up-progress"><span id="up-status">جاري التحضير...</span><span dir="ltr" id="up-pct">0%</span></div>
        <div class="up-actions">
          <button class="btn btn-primary" type="button" id="btn-start">${shellIcon('upload', 15)} رفع الفيديو</button>
          <button class="btn btn-outline" type="button" id="btn-cancel" hidden>${shellIcon('ban', 15)} إلغاء</button>
        </div>
      </div>
      <p class="hint" style="margin-top:1rem">${item === 'add' ? 'الفيديو الجديد يُضاف كعنصر مستقل في التوصيل، والرابط الخاص يبقى نفسه.'
        : typeof item === 'number' ? `النسخة الجديدة تُوقف النسخة السابقة للفيديو ${item} فقط، والرابط الخاص يبقى نفسه.`
        : 'النسخة الجديدة تُوقف النسخة السابقة وتعيد حالة التوصيل إلى البداية، مع بقاء الرابط الخاص نفسه.'}</p>
    </div>${UPLOADER_SCRIPT}`

  return shell('رفع الفيديو', content, {
    active: 'client-delivery',
    user: appUser,
    crumbs: 'Photography Pixel / تسليم العملاء / رفع',
  })
}

//----------------------------------------------------------------------------
// Standalone "رفع فيديو جديد" wizard (Phase 4J): file first, then the client
// and finally the private link. Uploads stream to a reserved R2 key under a
// generated delivery id; the delivery row (with the private link) is created
// only after the client data is entered on the success step.
//----------------------------------------------------------------------------

const WIZARD_SCRIPT = `<script>
(function(){
  var root=document.getElementById('wz-root');
  if(!root)return;
  var dz=root.querySelector('.dropzone');
  var fileInput=root.querySelector('input[type=file]');
  var panel=root.querySelector('#wz-panel');
  var nameEl=root.querySelector('#wz-name');
  var detailEl=root.querySelector('#wz-detail');
  var barEl=root.querySelector('#wz-bar');
  var statusEl=root.querySelector('#wz-status');
  var pctEl=root.querySelector('#wz-pct');
  var btnStart=root.querySelector('#wz-start');
  var btnCancel=root.querySelector('#wz-cancel');
  var errEl=root.querySelector('#wz-error');
  var stepVideo=root.querySelector('#wz-step-video');
  var stepClient=root.querySelector('#wz-step-client');
  var stepDone=root.querySelector('#wz-step-done');
  var doneName=root.querySelector('#wz-done-name');
  var doneVid=root.querySelector('#wz-done-vid');
  var doneLink=root.querySelector('#wz-done-link');
  var doneCopy=root.querySelector('#wz-done-copy');
  var doneWa=root.querySelector('#wz-done-wa');
  var doneOpen=root.querySelector('#wz-done-open');
  var doneDelivery=root.querySelector('#wz-done-delivery');
  var inputName=root.querySelector('#wz-client-name');
  var inputWa=root.querySelector('#wz-client-wa');
  var btnCreate=root.querySelector('#wz-create');
  var createErr=root.querySelector('#wz-create-error');
  var previewName=root.querySelector('#wz-preview-name');
  var previewMeta=root.querySelector('#wz-preview-meta');
  var action=root.getAttribute('data-action');
  var maxBytes=parseInt(root.getAttribute('data-max'),10)||1073741824;
  var partSize=parseInt(root.getAttribute('data-part'),10)||33554432;
  var ALLOWED={mp4:1,mov:1,webm:1,m4v:1,mkv:1,avi:1,mpeg:1,mpg:1};
  var file=null,uploaded=0,session=null,mode='',deliveryId='',uploadedKey='',uploadedFilename='',uploadedMime='',uploadedSize=0,aborted=false,retried=0;

  function fmt(n){if(n<1024)return n+' B';if(n<1048576)return (n/1024).toFixed(1)+' KB';if(n<1073741824)return (n/1048576).toFixed(1)+' MB';return (n/1073741824).toFixed(2)+' GB'}
  function setError(msg){errEl.textContent=msg||'';errEl.hidden=!msg}
  function setCreateError(msg){createErr.textContent=msg||'';createErr.hidden=!msg}
  function displayFile(){
    nameEl.textContent=file.name;
    detailEl.textContent=fmt(file.size)+' — '+file.type+' · mp4/mov/webm/mkv';
    if(file.size>maxBytes){setError('الحجم يتجاوز الحد الأقصى 1 جيجابايت.');return}
    if(file.size<=0){setError('الملف فارغ.');return}
    var ext=(file.name.split('.').pop()||'').toLowerCase();
    var videoType=file.type?file.type.indexOf('video/')===0:false;
    if(!videoType&&!ALLOWED[ext]&&!file.type){setError('الرجاء اختيار ملف فيديو (mp4, mov, webm, mkv ...).');return}
    var a=stepVideo.querySelector('.up-actions');if(a)a.hidden=false;
    setError('');
  }
  function selectFile(f){if(!f)return;file=f;displayFile();panel.hidden=false;inputName.value='';inputWa.value=''}
  function setBusy(busy){btnStart.disabled=busy;btnCancel.hidden=!busy;btnStart.textContent=busy?'يتم الرفع...':'رفع الفيديو'}
  function render(){var pct=file&&file.size?Math.min(Math.round(uploaded/file.size*100),100):0;barEl.style.width=pct+'%';pctEl.textContent=pct+'%';
    if(session&&mode==='multipart'&&session.container){var done=session.container.done||0;statusEl.textContent='يتم الرفع... الجزء '+(done+Math.min(session.container.current||1,1))+' من '+Math.ceil(file.size/partSize)}
    else if(session&&mode==='stream'){statusEl.textContent='يتم الرفع...'}
    else{statusEl.textContent='جاري التحضير...'}}

  function xhrPart(n,total,uploadId,key){return new Promise(function(resolve,reject){
    var offset=(n-1)*partSize;
    var slice=file.slice(offset,Math.min(offset+partSize,file.size));
    var start=uploaded;
    var xhr=new XMLHttpRequest();
    xhr.open('POST',action,true);
    xhr.setRequestHeader('x-action','part');
    xhr.setRequestHeader('x-part',String(n));
    xhr.setRequestHeader('x-part-count',String(total));
    xhr.setRequestHeader('x-upload-id',uploadId);
    xhr.setRequestHeader('x-key',key);
    xhr.responseType='json';
    xhr.upload.onprogress=function(e){if(e.lengthComputable){uploaded=start+e.loaded;render()}};
    xhr.onload=function(){
      if(xhr.status===200&&xhr.response&&xhr.response.ok){resolve({n:n,etag:xhr.response.etag})}
      else{reject(new Error((xhr.response&&xhr.response.error)||('خطأ في رفع الجزء '+n)))}
    };
    xhr.onerror=function(){reject(new Error('فشل الاتصال أثناء رفع الجزء '+n))};
    xhr.onabort=function(){reject(new Error('aborted'))};
    xhr.send(slice);
  });}

  function begin() {
    return fetch(action,{method:'POST',headers:{'x-action':'begin','content-type':'application/json'},body:JSON.stringify({filename:file.name,mime:file.type||'',size:file.size})});
  }

  async function uploadMultipart2(uploadId,key,total){
    var parts=[];
    for(var n=1;n<=total;n++){
      if(aborted)throw new Error('aborted');
      session.container={done:parts.length,current:n};
      render();
      try{parts.push(await xhrPart(n,total,uploadId,key))}
      catch(err){if(String(err&&err.message)==='aborted')throw err;
        if(retried<2){retried++;n--;continue}
        throw err;}
    }
    session.container=null;
    statusEl.textContent='جاري تجهيز الفيديو...';
    var res=await fetch(action,{method:'POST',headers:{'x-action':'complete','content-type':'application/json'},body:JSON.stringify({uploadId:uploadId,key:key,parts:parts,size:file.size,filename:file.name,deliveryId:deliveryId})});
    var data=await res.json();
    if(!res.ok||!data.ok)throw new Error((data&&data.error)||'تعذّر إنهاء الرفع.');
    onUploadDone(data);
  }

  function onUploadDone(data){
    uploadedKey=data.key||'';
    uploadedFilename=data.filename||file.name;
    uploadedMime=data.mime||'video/mp4';
    uploadedSize=data.sizeBytes||file.size;
    previewName.textContent=uploadedFilename;
    previewMeta.textContent=fmt(uploadedSize)+' — تم رفع الفيديو بنجاح';
    var pv=root.querySelector('#wz-preview-video');
    if(pv)pv.setAttribute('src','/admin/uploads?action=preview&key='+encodeURIComponent(uploadedKey));
    stepVideo.hidden=true;
    stepClient.hidden=false;
  }

  btnStart.addEventListener('click',async function(){
    if(!file)return;
    setError('');setCreateError('');aborted=false;retried=0;uploaded=0;setBusy(true);statusEl.textContent='جاري التحضير...';render();
    try{
      var res=await begin();
      var data=await res.json();
      if(!res.ok||!data.ok)throw new Error((data&&data.error)||'تعذّر بدء الرفع.');
      deliveryId=data.deliveryId||'';
      mode=data.mode||'stream';
      session=data;
      if(mode==='multipart'){var total=Math.ceil(file.size/session.partSize);await uploadMultipart2(session.uploadId,session.key,total)}
      else{
        var xhr=new XMLHttpRequest();
        xhr.open('POST',action,true);
        xhr.setRequestHeader('x-action','stream');
        xhr.setRequestHeader('x-filename',encodeURIComponent(file.name));
        xhr.setRequestHeader('x-mime',file.type||'application/octet-stream');
        xhr.setRequestHeader('x-size',String(file.size));
        xhr.setRequestHeader('x-delivery-id',deliveryId);
        xhr.responseType='json';
        xhr.upload.onprogress=function(e){if(e.lengthComputable){uploaded=e.loaded;render()}};
        var sr=await new Promise(function(resolve,reject){
          xhr.onload=function(){if(xhr.status===200&&xhr.response&&xhr.response.ok)resolve(xhr.response);else reject(new Error((xhr.response&&xhr.response.error)||'تعذّر الرفع.'))};
          xhr.onerror=function(){reject(new Error('فشل الاتصال أثناء الرفع.'))};
          xhr.onabort=function(){reject(new Error('aborted'))};
          xhr.send(file);
        });
        onUploadDone(sr);
      }
    }catch(err){
      var msg=String(err&&err.message||err);
      if(msg==='aborted'){setError('تم إلغاء الرفع.');uploaded=0;render();setBusy(false);session=null;return}
      if(mode==='multipart'&&session&&session.uploadId){
        try{fetch(action,{method:'POST',headers:{'x-action':'abort','content-type':'application/json'},body:JSON.stringify({uploadId:session.uploadId,key:session.key})})}catch(e){}
      }
      setError(msg);setBusy(false);session=null;uploaded=0;render();
    }
  });

  btnCancel.addEventListener('click',function(){
    aborted=true;
    try{fetch(action,{method:'POST',headers:{'x-action':'abort','content-type':'application/json'},body:JSON.stringify({uploadId:session&&session.uploadId||'',key:session&&session.key||''})})}catch(e){}
  });

  btnCreate.addEventListener('click',async function(){
  function getMode(){
    var sel=root.querySelector('input[name="delivery_mode"]:checked');
    return sel&&sel.value||'VIEW_AND_DOWNLOAD';
  }
  setCreateError('');
    var name=(inputName.value||'').trim();
    var wa=(inputWa.value||'').trim();
    if(name.length<2){setCreateError('أدخل اسم العميل (حرفان على الأقل).');return}
    if((wa.replace(/\\D/g,'').length<10)||(wa.replace(/\\D/g,'').length>15)){setCreateError('أدخل رقم واتساب صحيح، مثال: 0663493003');return}
    btnCreate.disabled=true;btnCreate.textContent='يتم إنشاء الرابط...';
    try{
      var res=await fetch(action,{method:'POST',headers:{'x-action':'create','content-type':'application/json'},body:JSON.stringify({deliveryId:deliveryId,key:uploadedKey,filename:uploadedFilename,mime:uploadedMime,sizeBytes:uploadedSize,name:name,whatsapp:wa,delivery_mode:getMode()})});
      var data=await res.json();
      if(!res.ok||!data.ok){setCreateError((data&&data.error)||'تعذّر إنشاء الرابط.');btnCreate.disabled=false;btnCreate.textContent='إنشاء الرابط الخاص';return}
      doneName.textContent=data.clientName||name;
      doneVid.textContent=(data.whatsapp||wa)+' — '+uploadedFilename;
      doneLink.textContent=data.link;
      doneCopy.setAttribute('data-copy',data.link);
      doneWa.setAttribute('href','https://wa.me/'+encodeURIComponent(data.whatsapp||'')+'?text='+encodeURIComponent('السلام عليكم، هذا هو الرابط الخاص بالفيديو ديالك من Photography Pixel:\\n\\n'+data.link+'\\n\\nيمكنك مشاهدة الفيديو وتأكيده من خلال الرابط.'));
      doneOpen.setAttribute('href',data.link);
      doneDelivery.setAttribute('href','/admin/deliveries/'+encodeURIComponent(data.deliveryId||''));
      stepClient.hidden=true;
      stepDone.hidden=false;
      try{await navigator.clipboard.writeText(data.link)}catch(e){}
    }catch(err){setCreateError('تعذّر إنشاء الرابط، حاول مرة أخرى.');btnCreate.disabled=false;btnCreate.textContent='إنشاء الرابط الخاص'}
  });

  if(dz){
    dz.addEventListener('click',function(){fileInput.click()});
    dz.addEventListener('dragover',function(e){e.preventDefault();dz.classList.add('drag')});
    dz.addEventListener('dragleave',function(){dz.classList.remove('drag')});
    dz.addEventListener('drop',function(e){e.preventDefault();dz.classList.remove('drag');selectFile(e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0])});
  }
  if(fileInput)fileInput.addEventListener('change',function(){selectFile(fileInput.files&&fileInput.files[0])});
})();
</script>`

export function renderUploadWizard(appUser: AppUserRow): string {
  const content = `
    <div class="page-head">
      <div><h1>رفع فيديو جديد</h1><p class="sub">ارفع الفيديو أولاً، ثم أدخل بيانات العميل لإنشاء رابطه الخاص.</p></div>
      <a class="btn btn-subtle" href="/admin/deliveries">${shellIcon('arrowLeft', 15)} التوصيلات</a>
    </div>
    <div id="wz-root" data-action="/admin/uploads" data-max="${MAX_UPLOAD_BYTES}" data-part="${UPLOAD_PART_SIZE}">
      <div class="card" id="wz-step-video">
        <h2 class="form-card-title">1 · الفيديو</h2>
        <p class="muted">يُرفع مباشرة إلى مخزن خاص بمؤشر تقدم حقيقي. الحد الأقصى 1 جيجابايت.</p>
        <div class="dropzone" style="margin-top:1rem">
          <span class="dz-ico">${shellIcon('upload', 30)}</span>
          <p>اسحب ملف الفيديو هنا أو اضغط للاختيار</p>
          <input type="file" name="file" accept="video/mp4,video/quicktime,video/webm,video/x-matroska,video/x-msvideo,video/mpeg,.mp4,.mov,.webm,.mkv,.avi,.mpeg,.mpg" hidden>
        </div>
        <p id="wz-error" class="alert alert-error" style="margin-top:.9rem" hidden></p>
        <div id="wz-panel" hidden>
          <div class="up-meta">
            <span class="ico-chip">${shellIcon('video', 18)}</span>
            <div class="up-file"><div class="up-name" id="wz-name"></div><div class="up-detail" id="wz-detail"></div></div>
            <span class="hint">يُخزَّن في مخزن خاص غير متاح للعموم.</span>
          </div>
          <div class="up-bar"><span id="wz-bar"></span></div>
          <div class="up-progress"><span id="wz-status">جاري التحضير...</span><span dir="ltr" id="wz-pct">0%</span></div>
          <div class="up-actions">
            <button class="btn btn-primary" type="button" id="wz-start">${shellIcon('upload', 15)} رفع الفيديو</button>
            <button class="btn btn-outline" type="button" id="wz-cancel" hidden>${shellIcon('ban', 15)} إلغاء</button>
          </div>
        </div>
      </div>
      <div class="card" id="wz-step-client" hidden>
        <h2 class="form-card-title">2 · بيانات العميل</h2>
        <div class="up-meta" style="margin-top:0">
          <span class="ico-chip">${shellIcon('check', 18)}</span>
          <div class="up-file"><div class="up-name" id="wz-preview-name"></div><div class="up-detail" id="wz-preview-meta"></div></div>
        </div>
        <div class="video-frame" style="margin-top:1rem;max-width:420px;margin-inline:auto">
          <video controls preload="metadata" id="wz-preview-video" style="width:100%;aspect-ratio:16/9;object-fit:contain;background:#0d0c12;display:block;border:none"></video>
        </div>
        <div class="grid2" style="margin-top:1.1rem">
          <label class="field"><span>اسم العميل</span>
            <input type="text" id="wz-client-name" placeholder="مثال: سارة أمين" autocomplete="off">
          </label>
          <label class="field"><span>رقم الواتساب</span>
            <input type="tel" id="wz-client-wa" placeholder="0663493003" dir="ltr" autocomplete="off">
            <span class="hint">سيُستخدم لإرسال الرابط عبر واتساب.</span>
          </label>
        </div>
        <div class="grid2" style="margin-top:1.1rem">
          <label class="card" style="cursor:pointer;display:block;margin-top:0">
            <input type="radio" name="delivery_mode" value="VIEW_AND_DOWNLOAD" checked style="accent-color:var(--accent)">
            <strong>عرض وتحميل <span class="badge md-download">عرض وتحميل</span></strong>
            <span class="muted" style="display:block">يُشاهد العميل ويحمّل الأصل بعد التأكيد وإطلاق التحميل.</span>
          </label>
          <label class="card" style="cursor:pointer;display:block;margin-top:0">
            <input type="radio" name="delivery_mode" value="VIEW_ONLY" style="accent-color:var(--accent)">
            <strong>عرض فقط <span class="badge md-view">عرض فقط</span></strong>
            <span class="muted" style="display:block">يشاهد ويؤكد فقط — التحميل غير متاح أبداً لهذا التوصيل.</span>
          </label>
        </div>
        <div class="actionbar">
          <button class="btn btn-primary" type="button" id="wz-create">${shellIcon('link', 15)} إنشاء الرابط الخاص</button>
          <button class="btn btn-subtle" type="button" onclick="window.location.reload()">التراجع</button>
        </div>
        <p id="wz-create-error" class="alert alert-error" style="margin-top:.9rem" hidden></p>
      </div>
      <div class="card" id="wz-step-done" hidden>
        <h2 class="form-card-title">3 · الرابط الخاص جاهز</h2>
        <div class="alert alert-success">تم إنشاء التوصيل بنجاح. أرسل الرابط للعميل الآن.</div>
        <div class="lm-chip" style="margin-bottom:1.1rem">
          <span class="lm-chip-ico">${shellIcon('user', 18)}</span>
          <div style="min-width:0"><div class="lm-chip-name" id="wz-done-name"></div><div class="lm-chip-cat" id="wz-done-vid"></div></div>
        </div>
        <div class="lm-linkbox"><span dir="ltr" id="wz-done-link"></span><button type="button" class="btn btn-subtle copy" id="wz-done-copy" data-copy="">${shellIcon('copy', 15)} نسخ الرابط</button></div>
        <div class="actionbar" style="margin-top:1.1rem">
          <a class="btn btn-success" id="wz-done-wa" href="#" target="_blank" rel="noreferrer noopener">${shellIcon('whatsapp', 15)} إرسال عبر واتساب</a>
          <a class="btn btn-outline" id="wz-done-open" href="#" target="_blank" rel="noreferrer noopener">${shellIcon('external', 15)} فتح الرابط</a>
          <a class="btn btn-subtle" id="wz-done-delivery" href="#">${shellIcon('package', 15)} صفحة التوصيل</a>
        </div>
        <p class="hint" style="margin-top:.9rem">الرابط يظهر مرة واحدة فقط. معاينة العميل تعرض نسخة بعلامة مائية (Photography Pixel).</p>
      </div>
    </div>${WIZARD_SCRIPT}${COPY_SCRIPT}`

  return shell('رفع فيديو جديد', content, {
    active: 'client-delivery',
    user: appUser,
    crumbs: 'Photography Pixel / تسليم العملاء / رفع فيديو جديد',
  })
}
