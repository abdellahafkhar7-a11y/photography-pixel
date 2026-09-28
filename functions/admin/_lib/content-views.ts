import type { AppUserRow } from './types'
import { escapeHtml, shell, shellIcon, statCard } from './shell'
import type {
  MediaBuyerRecord,
  ModelRecord,
  VoiceOverRecord,
} from './content-data'

//============================================================================
// Phase 4E — read-only views for the content modules, rendered with the
// Phase 4A/4B shell. All data comes from the site's existing /data files.
//============================================================================

function publicLink(route: string): string {
  return `<a class="btn btn-subtle" href="/${escapeHtml(route)}" target="_blank" rel="noreferrer noopener">${shellIcon('external', 15)} الصفحة العامة</a>`
}

function pageHead(title: string, sub: string, route: string): string {
  return `<div class="page-head">
    <div><h1>${escapeHtml(title)}</h1><p class="sub">${escapeHtml(sub)}</p></div>
    ${publicLink(route)}
  </div>`
}

function table(headers: string[], rows: string): string {
  const head = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')
  return `<div class="card"><div class="table-wrap"><table class="tbl"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div></div>`
}

function noRow(cols: number, message: string): string {
  return `<tr><td colspan="${cols}"><p class="muted" style="padding:.5rem 0">${escapeHtml(message)}</p></td></tr>`
}

//----------------------------------------------------------------------------
// Models
//----------------------------------------------------------------------------

export function renderModels(appUser: AppUserRow, models: ModelRecord[]): string {
  const available = models.filter((m) => m.available).length

  const rows =
    models.length === 0
      ? noRow(6, 'لا توجد بيانات موديلات.')
      : models
          .map((model) => {
            const photo = model.photo
              ? `<img src="${escapeHtml(model.photo)}" alt="${escapeHtml(model.name)}" loading="lazy" style="width:44px;height:56px;object-fit:cover;border-radius:8px;border:1px solid var(--line-default)">`
              : `<span class="muted">—</span>`
            const status = model.available
              ? `<span class="badge st-downloaded">متاح</span>`
              : `<span class="badge st-pending">غير متاح</span>`
            return `<tr>
              <td>${photo}</td>
              <td><strong>${escapeHtml(model.name || '—')}</strong></td>
              <td>${escapeHtml(model.city || '—')}</td>
              <td>${escapeHtml((model.category || '').trim() || '—')}</td>
              <td>${status}</td>
              <td>${escapeHtml(model.description || '—')}</td>
            </tr>`
          })
          .join('')

  const content = `
    ${pageHead('المودل', 'استعراض قراءة فقط لموديلات الاستوديو المنشورة.', 'model')}
    <div class="grid-stats three">
      ${statCard('إجمالي الموديلات', 'users', String(models.length))}
      ${statCard('متاح', 'check', String(available))}
    </div>
    ${table(['الصورة', 'الاسم', 'المدينة', 'التصنيف', 'الحالة', 'الوصف'], rows)}`

  return shell('المودل', content, {
    active: 'models',
    user: appUser,
    crumbs: 'Photography Pixel / المودل',
  })
}

//----------------------------------------------------------------------------
// UGC
//----------------------------------------------------------------------------

export function renderUgc(appUser: AppUserRow, videos: string[]): string {
  const rows =
    videos.length === 0
      ? noRow(3, 'لا توجد فيديوهات UGC.')
      : videos
          .map(
            (url, index) =>
              `<tr><td>${index + 1}</td><td dir="ltr" style="text-align:left;word-break:break-all">${escapeHtml(url)}</td><td><a class="btn btn-text" href="${escapeHtml(url)}" target="_blank" rel="noreferrer noopener">فتح</a></td></tr>`,
          )
          .join('')

  const content = `
    ${pageHead('UGC', 'فيديوهات UGC المنشورة على الموقع (من data/ugc.txt).', 'ugc')}
    <div class="grid-stats three">
      ${statCard('عدد الفيديوهات', 'video', String(videos.length))}
    </div>
    ${table(['#', 'رابط الفيديو', 'إجراء'], rows)}`

  return shell('UGC', content, {
    active: 'ugc',
    user: appUser,
    crumbs: 'Photography Pixel / UGC',
  })
}

//----------------------------------------------------------------------------
// Media Buyer
//----------------------------------------------------------------------------

export function renderMediaBuyer(appUser: AppUserRow, campaigns: MediaBuyerRecord[]): string {
  const totalMessages = campaigns.reduce((sum, c) => {
    const n = Number.parseInt(String(c.messages).replace(/[^\d]/g, ''), 10)
    return sum + (Number.isFinite(n) ? n : 0)
  }, 0)

  const rows =
    campaigns.length === 0
      ? noRow(7, 'لا توجد حملات مسجلة.')
      : campaigns
          .map(
            (c) => `<tr>
              <td><strong>${escapeHtml(c.campaign || '—')}</strong></td>
              <td>${escapeHtml(c.platform || '—')}</td>
              <td>${escapeHtml(c.objective || '—')}</td>
              <td>${escapeHtml(c.messages || '—')}</td>
              <td>${escapeHtml(c.result || '—')}</td>
              <td>${escapeHtml(c.description || '—')}</td>
              <td>${c.screenshot ? `<a class="btn btn-text" href="${escapeHtml(c.screenshot)}" target="_blank" rel="noreferrer noopener">عرض</a>` : '—'}</td>
            </tr>`,
          )
          .join('')

  const content = `
    ${pageHead('Media Buyer', 'الحملات الإعلانية المسجلة (من data/media-buyer.json).', 'media-buyer')}
    <div class="grid-stats three">
      ${statCard('عدد الحملات', 'megaphone', String(campaigns.length))}
      ${statCard('إجمالي الرسائل', 'phone', String(totalMessages))}
    </div>
    ${table(['الحملة', 'المنصة', 'الهدف', 'الرسائل', 'النتيجة', 'الوصف', 'لقطة'], rows)}`

  return shell('Media Buyer', content, {
    active: 'media-buyer',
    user: appUser,
    crumbs: 'Photography Pixel / Media Buyer',
  })
}

//----------------------------------------------------------------------------
// Voice Over
//----------------------------------------------------------------------------

export function renderVoiceOver(appUser: AppUserRow, records: VoiceOverRecord[]): string {
  const languages = new Set(records.map((r) => (r.language || '').trim()).filter(Boolean))

  const rows =
    records.length === 0
      ? noRow(8, 'لا توجد تسجيلات صوتية.')
      : records
          .map(
            (r) => `<tr>
              <td><strong>${escapeHtml(r.title || '—')}</strong>${r.featured ? ` <span class="badge st-confirmed">مميز</span>` : ''}</td>
              <td>${escapeHtml(r.category || '—')}</td>
              <td>${escapeHtml(r.language || '—')}</td>
              <td dir="ltr" style="text-align:left">${escapeHtml(r.duration || '—')}</td>
              <td>${escapeHtml(r.client || '—')}</td>
              <td>${escapeHtml(r.date || '—')}</td>
              <td>${r.audio ? `<a class="btn btn-text" href="${escapeHtml(r.audio)}" target="_blank" rel="noreferrer noopener">تشغيل</a>` : '—'}</td>
            </tr>`,
          )
          .join('')

  const content = `
    ${pageHead('التعليق الصوتي', 'التسجيلات الصوتية المنشورة (من data/voiceover.json).', 'voice-over')}
    <div class="grid-stats three">
      ${statCard('عدد التسجيلات', 'mic', String(records.length))}
      ${statCard('اللغات', 'grid', String(languages.size))}
    </div>
    ${table(['العنوان', 'التصنيف', 'اللغة', 'المدة', 'العميل', 'التاريخ', 'ملف'], rows)}`

  return shell('التعليق الصوتي', content, {
    active: 'voice-over',
    user: appUser,
    crumbs: 'Photography Pixel / التعليق الصوتي',
  })
}

//----------------------------------------------------------------------------
// Equipment
//----------------------------------------------------------------------------

export function renderEquipment(appUser: AppUserRow): string {
  const content = `
    ${pageHead('المعدات', 'لا توجد بيانات معدات منظمة على الموقع حالياً.', 'equipment')}
    <div class="card">
      <div class="mini-empty">
        <span class="big-icon">${shellIcon('camera', 28)}</span>
        <p class="muted">صفحة المعدات العامة تعريفية ولا تحتوي على قائمة معدات منظمة، لذلك لا توجد بيانات لعرضها هنا. لن نخترع أي معدات.</p>
        <a class="btn btn-subtle" href="/equipment" target="_blank" rel="noreferrer noopener">${shellIcon('external', 15)} الصفحة العامة</a>
      </div>
    </div>`

  return shell('المعدات', content, {
    active: 'equipment',
    user: appUser,
    crumbs: 'Photography Pixel / المعدات',
  })
}
