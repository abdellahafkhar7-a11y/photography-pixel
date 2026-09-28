import type { AppUserRow } from './types'
import { escapeHtml, shell, shellIcon } from './shell'
import type { ProjectListItem } from './projects-data'
import type { DeliveryListItem } from '../deliveries/_helpers'
import { projectPill } from './projects-views'

//============================================================================
// Phase 4O — global search results page (/admin/search). One query searches
// projects, clients, models and deliveries. Presentation-only.
//============================================================================

export type SearchResults = {
  query: string
  projects: ProjectListItem[]
  clients: { id: string; name: string; whatsapp_number: string; status: string }[]
  models: { id: string; name: string; photo: string | null }[]
  deliveries: DeliveryListItem[]
}

const GMT_FMT = new Intl.DateTimeFormat('ar-MA', {
  dateStyle: 'medium',
  timeStyle: 'short',
  numberingSystem: 'latn',
  timeZone: 'Africa/Casablanca',
})

function formatTime(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : GMT_FMT.format(date)
}

function projectLink(item: ProjectListItem): string {
  const project = item.project
  const archived = project.status === 'archived' ? '<span class="badge off">مؤرشف</span>' : ''
  return `<tr>
    <td><span class="code-chip" dir="ltr">${escapeHtml(project.project_code)}</span></td>
    <td><a href="/admin/projects/${project.id}"><b>${escapeHtml(project.name)}</b></a> ${archived}</td>
    <td>${item.client ? escapeHtml(item.client.name) : '—'}</td>
    <td>${item.model ? escapeHtml(item.model.name) : '—'}</td>
    <td>${projectPill(project.status)}</td>
  </tr>`
}

function projectSection(items: ProjectListItem[]): string {
  if (!items.length) return `<p class="muted">لا مشاريع مطابقة.</p>`
  return `<div class="table-wrap"><table class="tbl">
    <thead><tr><th>الكود</th><th>المشروع</th><th>العميل</th><th>الموديل</th><th>الحالة</th></tr></thead>
    <tbody>${items.map(projectLink).join('')}</tbody>
  </table></div>`
}

function clientSection(clients: SearchResults['clients']): string {
  if (!clients.length) return `<p class="muted">لا عملاء مطابقون.</p>`
  return `<div class="table-wrap"><table class="tbl">
    <thead><tr><th>العميل</th><th>واتساب</th><th>الحالة</th></tr></thead>
    <tbody>${clients
      .map(
        (c) => `<tr>
          <td><a href="/admin/clients/${c.id}"><b>${escapeHtml(c.name)}</b></a></td>
          <td dir="ltr" style="text-align:right">${escapeHtml(c.whatsapp_number)}</td>
          <td>${c.status === 'archived' ? '<span class="badge off">مؤرشف</span>' : '<span class="badge st-confirmed">نشط</span>'}</td>
        </tr>`,
      )
      .join('')}
    </tbody>
  </table></div>`
}

function modelSection(models: SearchResults['models']): string {
  if (!models.length) return `<p class="muted">لا موديلات مطابقة.</p>`
  return `<div class="table-wrap"><table class="tbl">
    <thead><tr><th>الموديل</th><th>الأعمال والمشاريع</th></tr></thead>
    <tbody>${models
      .map(
        (m) => `<tr>
          <td><a href="/admin/models#${m.id}"><b>${escapeHtml(m.name)}</b></a></td>
          <td><a class="btn btn-text" href="/admin/projects?model=${m.id}">${shellIcon('kanban', 13)} مشاريعه</a></td>
        </tr>`,
      )
      .join('')}
    </tbody>
  </table></div>`
}

function deliverySection(deliveries: SearchResults['deliveries']): string {
  if (!deliveries.length) return `<p class="muted">لا توصيلات مطابقة.</p>`
  return `<div class="table-wrap"><table class="tbl">
    <thead><tr><th>العميل</th><th>الوضع</th><th>الحالة</th><th>أنشئ</th></tr></thead>
    <tbody>${deliveries
      .map((d) => {
        const status =
          d.status === 'expired'
            ? '<span class="badge off">منتهي</span>'
            : d.status === 'confirmed'
              ? '<span class="badge st-confirmed">مؤكد</span>'
              : d.status === 'downloaded'
                ? '<span class="badge st-downloaded">تم التنزيل</span>'
                : `<span class="badge st-${d.status}">${escapeHtml(d.status)}</span>`
        return `<tr>
          <td><a href="/admin/deliveries/${d.id}">${d.clients ? escapeHtml(d.clients.name) : '—'}</a></td>
          <td>${d.delivery_mode === 'VIEW_AND_DOWNLOAD' ? 'عرض وتحميل' : 'عرض فقط'}</td>
          <td>${status}</td>
          <td class="hint" style="white-space:nowrap">${formatTime(d.created_at)}</td>
        </tr>`
      })
      .join('')}
    </tbody>
  </table></div>`
}

export function renderSearch(appUser: AppUserRow, results: SearchResults): string {
  const q = results.query.trim()
  const total =
    results.projects.length + results.clients.length + results.models.length + results.deliveries.length

  const content = q ? `
  <div class="page-head">
    <div>
      <h1>نتائج البحث</h1>
      <p class="sub">${total} نتيجة عن «${escapeHtml(q)}».</p>
    </div>
  </div>

  <div class="panel" style="margin-block-end:1rem">
    <div class="panel-head"><span class="ico-chip">${shellIcon('kanban', 18)}</span><h2>المشاريع <span class="soon-tag">${results.projects.length}</span></h2></div>
    <div class="panel-body">${projectSection(results.projects)}</div>
  </div>

  <div class="panel" style="margin-block-end:1rem">
    <div class="panel-head"><span class="ico-chip">${shellIcon('user', 18)}</span><h2>العملاء <span class="soon-tag">${results.clients.length}</span></h2></div>
    <div class="panel-body">${clientSection(results.clients)}</div>
  </div>

  <div class="panel" style="margin-block-end:1rem">
    <div class="panel-head"><span class="ico-chip">${shellIcon('users', 18)}</span><h2>الموديلات <span class="soon-tag">${results.models.length}</span></h2></div>
    <div class="panel-body">${modelSection(results.models)}</div>
  </div>

  <div class="panel">
    <div class="panel-head"><span class="ico-chip">${shellIcon('package', 18)}</span><h2>التوصيلات <span class="soon-tag">${results.deliveries.length}</span></h2></div>
    <div class="panel-body">${deliverySection(results.deliveries)}</div>
  </div>`
  :
  `
  <div class="page-head">
    <div>
      <h1>البحث العام</h1>
      <p class="sub">ابحث في العملاء والمشاريع والموديلات والتوصيلات دفعة واحدة.</p>
    </div>
  </div>
  <div class="placeholder-card">
    <span class="big-icon">${shellIcon('search', 28)}</span>
    <h2>اكتب للبحث</h2>
    <p class="muted">مثال: اسم عميل، كود مشروع، اسم موديل، أو رقم هاتف.</p>
  </div>`

  const searchForm = `
  <form method="get" action="/admin/search" class="filter-bar" style="margin-block-start:1rem">
    <div class="field" style="margin-block-end:0;flex:1;min-width:14rem"><input type="search" name="q" value="${escapeHtml(q)}" placeholder="اسم، كود، واتساب، موديل…" autofocus></div>
    <button class="btn btn-primary" type="submit">${shellIcon('search', 16)} بحث</button>
  </form>`

  return shell('البحث العام', searchForm + content, {
    active: 'dashboard',
    user: appUser,
    crumbs: 'Photography Pixel / البحث',
  })
}