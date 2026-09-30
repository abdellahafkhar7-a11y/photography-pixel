import type { AppUserRow } from './types'
import type {
  KanbanStatus,
  ProjectStatus,
  TaskPriority,
  TaskStatus,
} from '../../_lib/db-types'
import { COPY_SCRIPT } from '../../_lib/brand'
import { escapeHtml, shell, shellIcon } from './shell'
import { modeBadge, statusBadge } from './delivery-views'
import { ACTIVITY_LABEL } from '../deliveries/_helpers'
import {
  type CardDetail,
  type ProjectDetail,
  type ProjectSlotDetail,
  type WorkbenchData,
  type WorkbenchProject,
  CANONICAL_PROJECT_STATUSES,
  KANBAN_LABEL,
  KANBAN_STATUSES,
  PAYMENT_STATUS_LABEL,
  PROJECT_ACTIVITY_LABEL,
  PROJECT_STATUS_LABEL,
  TASK_PRIORITY_LABEL,
  inPlanSlots,
  projectProgress,
  shiftDate,
  todayCasablancaDate,
} from './projects-data'
import {
  clientContactWaLink,
  modelBookingWaLink,
  projectMessageText,
  projectWaLink,
} from '../../_lib/whatsapp'
import { REVISION_STATUS_LABEL, nextRevisionStatuses } from '../../_lib/revisions'

//============================================================================
// Phase 4O — Projects views: list (CRM overview + shoot agenda), the project
// workspace with the Trello-style kanban and its tabs, task board, delivery
// tab and activity timeline. Presentation-only.
//============================================================================

const TIME_FMT = new Intl.DateTimeFormat('ar-MA', {
  dateStyle: 'medium',
  timeStyle: 'short',
  numberingSystem: 'latn',
  timeZone: 'Africa/Casablanca',
})

const DATE_FMT = new Intl.DateTimeFormat('ar-MA', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  numberingSystem: 'latn',
  timeZone: 'UTC',
})

function formatDateOnly(value: string | null): string {
  if (!value) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return escapeHtml(value)
  const time = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return Number.isNaN(time.getTime()) ? escapeHtml(value) : DATE_FMT.format(time)
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : TIME_FMT.format(date)
}

function formatMoney(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '—'
  return `${new Intl.NumberFormat('en-US').format(value)} MAD`
}

//----------------------------------------------------------------------------
// Shared fragments
//----------------------------------------------------------------------------

function alert(kind: 'success' | 'error' | 'info', message: string): string {
  return `<div class="alert ${kind}">${escapeHtml(message)}</div>`
}

const PROJECT_STATUS_CLASS: Record<ProjectStatus, string> = {
  new: 'ps-new',
  contacted: 'ps-contacted',
  booked: 'ps-booked',
  shooting: 'ps-shooting',
  editing: 'ps-editing',
  review: 'ps-review',
  delivery: 'ps-delivery',
  completed: 'ps-completed',
  archived: 'ps-archived',
}

export function projectPill(status: ProjectStatus): string {
  return `<span class="ppill ${PROJECT_STATUS_CLASS[status]}">${PROJECT_STATUS_LABEL[status] ?? status}</span>`
}

const KANBAN_COLOR: Record<KanbanStatus, string> = {
  todo: '#9A6B00',
  editing: '#24567D',
  review: '#362477',
  ready: '#2F7D5A',
  done: '#1F6B4A',
}

const KANBAN_GRADIENT: Record<KanbanStatus, string> = {
  todo: 'linear-gradient(135deg,#d3a34b,#9A6B00)',
  editing: 'linear-gradient(135deg,#4a86c0,#24567D)',
  review: 'linear-gradient(135deg,#6a56c0,#362477)',
  ready: 'linear-gradient(135deg,#4aa076,#2F7D5A)',
  done: 'linear-gradient(135deg,#3f9e77,#1F6B4A)',
}

function projectStatusOptions(current: KanbanStatus | ProjectStatus, list: readonly (KanbanStatus | ProjectStatus)[], labels: Record<string, string>): string {
  return list
    .map(
      (value) =>
        `<option value="${value}"${value === current ? ' selected' : ''}>${labels[value] ?? value}</option>`,
    )
    .join('')
}

//----------------------------------------------------------------------------
// Workbench (Phase 4Q) — /admin/projects daily production command center
//----------------------------------------------------------------------------

type WorkbenchFilter = 'all' | 'today' | 'wip' | 'review' | 'ready'

export type ProjectsListOptions = {
  notice?: string
  error?: string
  date?: string
  filter?: WorkbenchFilter
  query?: string
  clientId?: string
  createOpen?: boolean
  createClientId?: string
  models: { id: string; name: string; photo: string | null }[]
  clients: { id: string; name: string }[]
}

const WB_FILTER_ORDER: readonly WorkbenchFilter[] = ['all', 'today', 'wip', 'review', 'ready']

const WB_FILTER_LABEL: Record<WorkbenchFilter, string> = {
  all: 'كل المشاريع',
  today: 'اليوم',
  wip: 'قيد التنفيذ',
  review: 'تحتاج مراجعة',
  ready: 'جاهزة',
}

function shortDay(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) return date
  const time = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return Number.isNaN(time.getTime())
    ? date
    : new Intl.DateTimeFormat('ar-MA', { day: 'numeric', month: 'long', numberingSystem: 'latn', timeZone: 'UTC' }).format(time)
}

function relativeDayLabel(date: string, base: string): string {
  if (date === base) return 'اليوم'
  if (date === shiftDate(base, 1)) return 'غداً'
  if (date === shiftDate(base, 2)) return 'بعد غد'
  return shortDay(date)
}

function matchWorkbenchFilter(item: WorkbenchProject, filter: WorkbenchFilter): boolean {
  switch (filter) {
    case 'today':
      return item.hostedOnDate || item.workedOnDate
    case 'wip':
      return item.slots.editing + item.slots.review > 0
    case 'review':
      return item.slots.review > 0
    case 'ready':
      return item.slots.ready > 0
    default:
      return true
  }
}

function nextActionText(item: WorkbenchProject, today: string): string | null {
  const { project, slots, tasks } = item
  if (slots.review > 0) return `راجع ${slots.review} فيديو`
  if (tasks.due && tasks.due.date >= today && tasks.due.date <= shiftDate(today, 2)) {
    return `مهمة مستحقة: ${tasks.due.title}`
  }
  if (slots.editing > 0) return `أكمل مونتاج ${slots.editing} فيديو`
  if (slots.ready > 0) return `جهّز تسليم ${slots.ready} فيديو`
  if (project.shoot_date) {
    if (project.shoot_date === today) return project.shoot_time ? `الجلسة اليوم ${project.shoot_time}` : 'الجلسة اليوم'
    if (project.shoot_date > today) return `الجلسة ${shortDay(project.shoot_date)}`
  }
  if (slots.total > 0 && slots.todo === slots.total) return 'ابدأ البطاقات الجديدة'
  return null
}

type AttentionEntry = {
  level: 'high' | 'due' | 'ready'
  icon: string
  text: string
  href: string
  label: string
  weight: number
  item: WorkbenchProject
}

function buildAttention(all: WorkbenchProject[], today: string): AttentionEntry[] {
  const candidates: AttentionEntry[] = []
  for (const item of all) {
    const { project, slots, tasks } = item
    const boardHref = `/admin/projects/${project.id}`
    const picks: AttentionEntry[] = []
    if (slots.review > 0) {
      picks.push({ level: 'high', icon: 'eye', text: `${slots.review} فيديوهات تنتظر المراجعة`, href: boardHref, label: 'فتح الـBoard', weight: 4, item })
    }
    if (project.shoot_date === today) {
      picks.push({ level: 'high', icon: 'calendar', text: `جلسة التصوير اليوم${project.shoot_time ? ` ${project.shoot_time}` : ''}`, href: boardHref, label: 'فتح المشروع', weight: 3, item })
    }
    if (tasks.due && tasks.due.date >= today && tasks.due.date <= shiftDate(today, 2)) {
      picks.push({ level: 'due', icon: 'clock', text: `مهمة مستحقة: ${tasks.due.title} (${formatDateOnly(tasks.due.date)})`, href: `${boardHref}?tab=details`, label: 'فتح المشروع', weight: 2, item })
    }
    if (slots.ready > 0) {
      picks.push({ level: 'ready', icon: 'check', text: `${slots.ready} فيديوهات جاهزة للتسليم`, href: boardHref, label: 'فتح الـBoard', weight: 1, item })
    }
    const pick = picks.sort((a, b) => b.weight - a.weight)[0]
    if (pick) candidates.push(pick)
  }
  return candidates.sort((a, b) => b.weight - a.weight).slice(0, 8)
}

function slotBreakdown(item: WorkbenchProject): string {
  const parts: [KanbanStatus, string][] = [
    ['todo', KANBAN_LABEL.todo],
    ['editing', KANBAN_LABEL.editing],
    ['review', KANBAN_LABEL.review],
    ['ready', KANBAN_LABEL.ready],
    ['done', KANBAN_LABEL.done],
  ]
  const chips = parts
    .filter(([status]) => item.slots[status] > 0)
    .map(([status, label]) => `<span class="kbrk k-${status}">${label} ${item.slots[status]}</span>`)
    .join('')
  return chips || '<span class="kbrk none">لا بطاقات بعد</span>'
}

function workbenchCard(item: WorkbenchProject, today: string): string {
  const { project, client, model, slots } = item
  const pct = slots.total > 0 ? Math.min(100, Math.round((slots.done / slots.total) * 100)) : 0
  const next = nextActionText(item, today)
  const wa = client
    ? `<a class="btn btn-subtle btn-sm" target="_blank" rel="noopener noreferrer" href="${escapeHtml(
        projectWaLink(client.whatsapp_number, {
          clientName: client.name,
          projectName: project.name,
          modelName: model?.name ?? null,
          videoCount: slots.total,
          shootDate: project.shoot_date,
          shootTime: project.shoot_time,
          location: project.location,
          script: project.script,
        }),
      )}">${shellIcon('whatsapp', 15)} واتساب</a>`
    : ''
  return `
  <article class="wb-card" data-project-id="${project.id}">
    <div class="wb-head">
      <div class="wb-id">
        <a class="wb-name" href="/admin/projects/${project.id}">${escapeHtml(project.name)}</a>
        <span class="code-chip" dir="ltr">${escapeHtml(project.project_code)}</span>
      </div>
      ${projectPill(project.status)}
    </div>
    <div class="wb-client">${client ? escapeHtml(client.name) : 'عميل محذوف'}${model ? ` · ${escapeHtml(model.name)}` : ''}</div>
    <div class="wb-meta">
      ${project.shoot_date ? `<span class="wb-m">${shellIcon('calendar', 14)} ${formatDateOnly(project.shoot_date)}${project.shoot_time ? ` · ${escapeHtml(project.shoot_time)}` : ''}</span>` : ''}
      ${project.location ? `<span class="wb-m">${shellIcon('phone', 14)} ${escapeHtml(project.location)}</span>` : ''}
      <span class="wb-m">${shellIcon('video', 14)} ${slots.total} فيديو</span>
      ${item.filled > 0 ? `<span class="wb-m filled">${shellIcon('upload', 14)} ${item.filled} مرفوع</span>` : ''}
    </div>
    <div class="wb-prog">
      <div class="wb-bar"><div class="wb-fill" style="width:${pct}%"></div></div>
      <span class="wb-prog-n">${slots.done}/${slots.total}</span>
    </div>
    <div class="wb-brk">${slotBreakdown(item)}</div>
    ${next ? `<div class="wb-next"><span class="wb-next-hint">الخطوة التالية:</span> ${escapeHtml(next)}</div>` : ''}
    <div class="wb-actions">
      <a class="btn btn-primary btn-sm" href="/admin/projects/${project.id}">${shellIcon('kanban', 15)} فتح الـBoard</a>
      <a class="btn btn-subtle btn-sm" href="/admin/projects/${project.id}?tab=board&amp;focus=add">${shellIcon('plus', 14)} إضافة فيديو</a>
      ${wa}
    </div>
  </article>`
}

export function renderProjects(appUser: AppUserRow, data: WorkbenchData, options: ProjectsListOptions): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(options.date ?? '') ? options.date! : data.date
  const today = todayCasablancaDate()
  const isToday = date === today
  const filter = options.filter ?? 'all'
  const q = options.query ?? ''

  const all = data.all
  const searched = data.projects

  const filterCounts: Record<WorkbenchFilter, number> = {
    all: all.length,
    today: all.filter((p) => p.hostedOnDate || p.workedOnDate).length,
    wip: all.filter((p) => p.slots.editing + p.slots.review > 0).length,
    review: all.filter((p) => p.slots.review > 0).length,
    ready: all.filter((p) => p.slots.ready > 0).length,
  }

  const hrefFor = (dateFor: string, f: WorkbenchFilter) =>
    `/admin/projects?date=${dateFor}${f !== 'all' ? `&filter=${f}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`

  const cards = [
    statCard('جلسات اليوم', 'calendar', String(all.filter((p) => p.hostedOnDate).length), isToday ? 'اليوم' : formatDateOnly(date)),
    statCard('قيد التنفيذ', 'activity', String(all.reduce((s, p) => s + p.slots.editing + p.slots.review, 0)), 'مونتاج + مراجعة'),
    statCard('تحتاج مراجعة', 'eye', String(all.reduce((s, p) => s + p.slots.review, 0)), 'فيديوهات بانتظارك'),
    statCard('جاهزة', 'check', String(all.reduce((s, p) => s + p.slots.ready, 0)), 'جاهزة للتسليم'),
  ].join('')

  const attention = buildAttention(all, today)
  const attentionIds = new Set(attention.map((a) => a.item.project.id))

  const dayProjects = searched.filter((p) => (p.hostedOnDate || p.workedOnDate) && matchWorkbenchFilter(p, filter))
  const activeProjects = searched
    .filter((p) => !(p.hostedOnDate || p.workedOnDate) && matchWorkbenchFilter(p, filter))
    .sort(
      (a, b) =>
        Number(attentionIds.has(b.project.id)) - Number(attentionIds.has(a.project.id)) ||
        b.slots.review - a.slots.review ||
        a.project.name.localeCompare(b.project.name),
    )

  const upcoming = all
    .filter((p) => p.project.shoot_date && p.project.shoot_date > date && p.project.shoot_date <= shiftDate(date, 14))
    .sort((a, b) => (a.project.shoot_date ?? '').localeCompare(b.project.shoot_date ?? ''))
    .slice(0, 12)

  const nav = `
  <nav class="wd-nav" aria-label="التنقل بين الأيام">
    <a class="wd-nav-btn" href="${hrefFor(shiftDate(date, -1), filter)}">${shortDay(shiftDate(date, -1))}</a>
    <span class="wd-nav-date">${isToday ? 'اليوم — ' : ''}${formatDateOnly(date)}</span>
    <a class="wd-nav-btn" href="${hrefFor(shiftDate(date, 1), filter)}">${shortDay(shiftDate(date, 1))}</a>
    ${isToday ? '' : `<a class="wd-nav-btn accent" href="${hrefFor(today, filter)}">اليوم</a>`}
  </nav>`

  const filterPills = WB_FILTER_ORDER.map(
    (f) => `<a class="wb-filter${f === filter ? ' current' : ''}" href="${hrefFor(date, f)}">${WB_FILTER_LABEL[f]} <span class="n">${filterCounts[f]}</span></a>`,
  ).join('')

  const pickerItems = (href: (id: string) => string) =>
    all.length
      ? all
          .slice(0, 24)
          .map(
            (p) =>
              `<a class="qa-item" href="${href(p.project.id)}"><span>${escapeHtml(p.project.name)}</span><code class="code-chip" dir="ltr">${escapeHtml(p.project.project_code)}</code></a>`,
          )
          .join('')
      : '<p class="qa-empty">لا توجد مشاريع نشطة — أنشئ مشروعاً أولاً.</p>'

  const attentionHtml = attention.length
    ? `<div class="att-list">${attention
        .map(
          (a) => `<div class="att-row lv-${a.level}">
          <span class="att-ico">${shellIcon(a.icon, 18)}</span>
          <div class="att-body">
            <div class="att-line"><b>${escapeHtml(a.item.project.name)}</b> <span class="code-chip" dir="ltr">${escapeHtml(a.item.project.project_code)}</span></div>
            <p>${escapeHtml(a.text)}</p>
          </div>
          <a class="btn btn-sm ${a.level === 'high' ? 'btn-primary' : 'btn-subtle'}" href="${a.href}">${escapeHtml(a.label)}</a>
        </div>`,
        )
        .join('')}</div>`
    : '<div class="wb-empty">كلشي مزيان — ما كاين حتى إجراء مستعجل.</div>'

  const dayHtml = dayProjects.length
    ? `<div class="wb-grid">${dayProjects.map((p) => workbenchCard(p, today)).join('')}</div>`
    : `<div class="wb-empty">${isToday ? 'ما كايناش جلسات مبرمجة اليوم.' : 'ما كايناش جلسات مبرمجة في هذا اليوم.'}</div>`

  const activeEmpty = filter === 'all' ? 'ما كاين حتى مشروع نشط حالياً.' : 'لا توجد مشاريع تطابق هذا الفلتر.'

  const upcomingHtml = upcoming.length
    ? `<div class="up-list">${upcoming
        .map((p) => {
          const shoot = p.project.shoot_date!
          return `<a class="up-row" href="/admin/projects/${p.project.id}">
            <span class="up-date"><b>${relativeDayLabel(shoot, date)}</b><span dir="ltr">${formatDateOnly(shoot)}${p.project.shoot_time ? ` · ${escapeHtml(p.project.shoot_time)}` : ''}</span></span>
            <span class="up-main"><b>${escapeHtml(p.project.name)}</b> <code class="code-chip" dir="ltr">${escapeHtml(p.project.project_code)}</code></span>
            <span class="up-client">${p.client ? escapeHtml(p.client.name) : '—'}${p.model ? ` · ${escapeHtml(p.model.name)}` : ''}</span>
            <span class="up-loc">${p.project.location ? escapeHtml(p.project.location) : '—'}</span>
          </a>`
        })
        .join('')}</div>`
    : '<div class="wb-empty">لا توجد جلسات قادمة خلال الأسبوعين القادمين.</div>'

  const content = `
  ${WORKBENCH_CSS}
  ${options.notice ? alert('success', options.notice) : ''}
  ${options.error ? alert('error', options.error) : ''}

  <div class="page-head">
    <div>
      <h1>المشاريع</h1>
      <p class="sub">لوحة العمل اليومية — من الجلسة حتى التسليم.</p>
    </div>
    <div class="qas">
      <button class="btn btn-primary" type="button" data-open-modal="create-project">${shellIcon('plus', 18)} مشروع جديد</button>
      <span class="qa">
        <button class="btn btn-subtle" type="button" data-qa="add-video">${shellIcon('video', 16)} إضافة فيديو</button>
        <span class="qa-pop" data-qa-pop="add-video">${pickerItems((id) => `/admin/projects/${id}?tab=board&focus=add`)}</span>
      </span>
      <span class="qa">
        <button class="btn btn-subtle" type="button" data-qa="add-task">${shellIcon('check', 16)} إضافة مهمة</button>
        <span class="qa-pop" data-qa-pop="add-task">${pickerItems((id) => `/admin/projects/${id}?tab=details&open=add-task`)}</span>
      </span>
    </div>
  </div>

  ${nav}

  <div class="grid-stats">${cards}</div>

  <section class="wb-sec" id="wb-attention">
    <div class="wb-sec-head"><span class="ico-chip">${shellIcon('eye', 18)}</span><h2>يحتاج انتباهك</h2></div>
    ${attentionHtml}
  </section>

  <form method="get" action="/admin/projects" class="filter-bar">
    <input type="hidden" name="date" value="${date}">
    ${filter !== 'all' ? `<input type="hidden" name="filter" value="${filter}">` : ''}
    <div class="field" style="margin-bottom:0;flex:1;min-width:14rem"><input type="text" name="q" value="${escapeHtml(q)}" placeholder="بحث بالاسم أو الكود أو العميل أو الموديل…"></div>
    <button class="btn btn-subtle" type="submit">${shellIcon('search', 16)} بحث</button>
  </form>

  <div class="card" style="margin-bottom:1rem;padding:.4rem 1.15rem">
    <div class="pcat-row" style="margin-bottom:0">${filterPills}</div>
  </div>

  <section class="wb-sec" id="wb-today">
    <div class="wb-sec-head"><span class="ico-chip">${shellIcon('calendar', 18)}</span><h2>أعمال اليوم</h2><span class="wb-count">${dayProjects.length}</span></div>
    ${dayHtml}
  </section>

  <section class="wb-sec" id="wb-upcoming">
    <div class="wb-sec-head"><span class="ico-chip">${shellIcon('clock', 18)}</span><h2>الجلسات القادمة</h2></div>
    ${upcomingHtml}
  </section>

  <section class="wb-sec" id="wb-active">
    <div class="wb-sec-head"><span class="ico-chip">${shellIcon('kanban', 18)}</span><h2>المشاريع النشطة</h2><span class="wb-count">${activeProjects.length}</span></div>
    ${activeProjects.length ? `<div class="wb-grid">${activeProjects.map((p) => workbenchCard(p, today)).join('')}</div>` : `<div class="wb-empty">${activeEmpty}</div>`}
  </section>

  ${createModal(options)}`

  const script =
    createModalScript(Boolean(options.createOpen)) +
    `<script>
(function(){
  function closeAll(exclude){
    document.querySelectorAll('.qa-pop').forEach(function(p){
      if(p.getAttribute('data-qa-pop') !== exclude) p.classList.remove('open');
    });
  }
  document.addEventListener('click', function(e){
    if(e.target.closest('.qa > button[data-qa]')){
      var key = e.target.closest('button').getAttribute('data-qa');
      var pop = document.querySelector('[data-qa-pop="'+key+'"]');
      var isOpen = pop.classList.contains('open');
      closeAll(key);
      if(!isOpen) pop.classList.add('open');
      return;
    }
    if(!e.target.closest('.qa')) closeAll(null);
  });
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape') closeAll(null); });
})();
</script>`
  return shell('المشاريع', content, { active: 'projects', user: appUser, crumbs: 'Photography Pixel / المشاريع' }, script)
}

function statCard(label: string, icon: string, value: string, hint: string): string {
  return `
    <div class="stat">
      <div class="k">${shellIcon(icon, 15)}<span>${label}</span></div>
      <div class="v">${escapeHtml(value)}</div>
      <div class="h">${escapeHtml(hint)}</div>
    </div>`
}

function createModal(options: ProjectsListOptions): string {
  const clientOptions = options.clients
    .map((c) => `<option value="${c.id}"${c.id === options.createClientId ? ' selected' : ''}>${escapeHtml(c.name)}</option>`)
    .join('')
  const modelOptions = options.models
    .map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`)
    .join('')
  return `
  <div class="lm-modal${options.createOpen ? ' open' : ''}" id="create-project" role="dialog" aria-modal="true" aria-label="مشروع جديد">
    <div class="lm-modal-backdrop" data-close-modal="create-project"></div>
    <div class="lm-box">
      <div class="lm-head"><span class="ico-chip">${shellIcon('kanban', 18)}</span><span class="lm-title">مشروع جديد</span><button class="lm-close" type="button" data-close-modal="create-project" aria-label="إغلاق">${shellIcon('close', 18)}</button></div>
      <form method="post" action="/admin/projects">
        <input type="hidden" name="action" value="create">
        <label class="field"><span>اسم المشروع *</span><input type="text" name="name" required minlength="2" placeholder="مثال: جلسة الزفاف"></label>
        <label class="field"><span>العميل *</span><select name="client_id" required>${clientOptions}</select></label>
        <label class="field"><span>الموديل</span><select name="model_id"><option value="">اختر الموديل (اختياري)</option>${modelOptions}</select></label>
        <label class="field"><span>عدد الفيديوهات المخططة</span><input type="number" name="video_count" value="3" min="0" max="50"></label>
        <div class="actionbar"><button class="btn btn-primary" type="submit">إنشاء المشروع</button></div>
        <p class="hint" style="margin-top:.8rem">سيُنشأ مع اللقطات فيديو 01..0N تلقائياً على نفس جدول اللقطات — لا يتم إنشاء نظام لقطات منفصل.</p>
      </form>
    </div>
  </div>`
}

function createModalScript(open: boolean): string {
  return `<script>
(function(){
  var open = ${open ? 'true' : 'false'};
  function apply(){
    document.querySelectorAll('.lm-modal').forEach(function(m){ var id=m.id; var should=(id==='create-project'&&open); m.classList.toggle('open',should); });
  }
  document.addEventListener('click', function(e){
    var opener=e.target.closest('[data-open-modal]');
    if(opener){ open=(opener.getAttribute('data-open-modal')==='create-project'); apply(); return; }
    var closer=e.target.closest('[data-close-modal]');
    if(closer){ open=false; apply(); }
  });
  if(open) apply();
})();
</script>`
}

//----------------------------------------------------------------------------
// Workspace
//----------------------------------------------------------------------------

export type ProjectWorkspaceOptions = {
  notice?: string
  error?: string
  tab?: 'board' | 'details' | 'activity'
  openAddTask?: boolean
  openAddCard?: boolean
}

export type ProjectTabKey = NonNullable<ProjectWorkspaceOptions['tab']>

const TAB_KEYS: ProjectTabKey[] = ['board', 'details', 'activity']

export function renderProjectWorkspace(appUser: AppUserRow, detail: ProjectDetail, options: ProjectWorkspaceOptions = {}): string {
  const project = detail.project
  const tab: ProjectTabKey = options.tab && TAB_KEYS.includes(options.tab) ? options.tab : 'board'
  const archived = project.status === 'archived'
  const progress = projectProgress(detail)
  const inPlan = inPlanSlots(detail)
  const remaining = project.total_price !== null && project.advance !== null ? Math.max(0, project.total_price - project.advance) : null
  const doneTasks = detail.tasks.filter((t) => t.status === 'done').length

  const wsHead = `
    <header class="page-head ws-head">
      <div>
        <a class="back-link" href="/admin/projects">${shellIcon('arrowLeft', 16)} كل المشاريع</a>
        <div class="ws-title-row">
          <h1>${escapeHtml(project.name)}</h1>
          <span class="code-chip" dir="ltr">${escapeHtml(project.project_code)}</span>
          ${projectPill(project.status)}
        </div>
        <div class="chips-row">
          <span class="count-chip">${inPlan.length} فيديوهات</span>
          <span class="cnt-sep">·</span>
          <span class="count-chip">${progress.done} مكتملة</span>
          <span class="cnt-sep">·</span>
          <span class="count-chip">${doneTasks}/${detail.tasks.length} مهام</span>
          <span class="cnt-sep strong"></span>
          <a class="chip-link" href="/admin/clients/${project.client_id}">${shellIcon('user', 14)} ${detail.client ? escapeHtml(detail.client.name) : 'عميل'}</a>
          ${detail.model ? `<span class="chip-static">${shellIcon('users', 14)} ${escapeHtml(detail.model.name)}</span>` : ''}
          ${project.shoot_date ? `<span class="chip-static">${shellIcon('calendar', 14)} ${formatDateOnly(project.shoot_date)}${project.shoot_time ? ` · ${escapeHtml(project.shoot_time)}` : ''}</span>` : ''}
        </div>
      </div>
      <div class="ws-actions">
        <button class="btn btn-primary" type="button" data-open-modal="add-video">${shellIcon('plus', 15)} إضافة فيديو</button>
        <button class="btn btn-outline" type="button" data-open-modal="add-task">${shellIcon('plus', 15)} مهمة</button>
        ${detail.client ? `<a class="btn btn-outline" target="_blank" rel="noopener noreferrer" href="${escapeHtml(projectWaLink(detail.client.whatsapp_number, waParts(detail)))}">${shellIcon('whatsapp', 15)} واتساب</a>` : ''}
        <form method="post" action="/admin/projects/${project.id}">
          <input type="hidden" name="action" value="set_status">
          <input type="hidden" name="tab" value="${tab}">
          <select name="status" class="ws-status" onchange="this.form.submit()" aria-label="حالة المشروع">${projectStatusOptions(project.status, CANONICAL_PROJECT_STATUSES, PROJECT_STATUS_LABEL)}</select>
        </form>
        <div class="dmenu" data-dmenu>
          <button class="btn btn-subtle dmenu-trigger" type="button" data-dmenu-toggle aria-haspopup="true" aria-expanded="false" aria-label="المزيد">${shellIcon('menu', 15)}</button>
          <div class="dmenu-panel" role="menu">
            <form method="post" action="/admin/projects/${project.id}">
              <input type="hidden" name="action" value="${archived ? 'unarchive' : 'archive'}">
              <input type="hidden" name="tab" value="${tab}">
              <button class="dmenu-item" type="submit" role="menuitem">${shellIcon(archived ? 'refresh' : 'archive', 14)} ${archived ? 'إلغاء الأرشفة' : 'أرشفة المشروع'}</button>
            </form>
          </div>
        </div>
      </div>
    </header>
    <nav class="ws-seg" aria-label="أقسام المشروع">
      <a class="ws-seg-btn${tab === 'board' ? ' current' : ''}" href="?tab=board">${shellIcon('kanban', 15)} اللوحة <span class="n">${String(inPlan.length)}</span></a>
      <a class="ws-seg-btn${tab === 'details' ? ' current' : ''}" href="?tab=details">${shellIcon('activity', 15)} التفاصيل</a>
      <a class="ws-seg-btn${tab === 'activity' ? ' current' : ''}" href="?tab=activity">${shellIcon('clock', 15)} النشاط</a>
    </nav>
    ${options.notice ? alert('success', options.notice) : ''}
    ${options.error ? alert('error', options.error) : ''}`

  const body = tab === 'board'
    ? boardTab(detail, Boolean(options.openAddCard))
    : tab === 'details'
      ? detailsTab(detail, remaining)
      : activityTab(detail)

  const content = `${PROJECT_CSS}${wsHead}<div class="ws-body ws-tab-${tab}" id="ws-body">${body}</div>${workspaceModals(detail, options)}`
  const script = BOARD_SCRIPT + TASK_SCRIPT + MODAL_SCRIPT + CARD_SCRIPT + DMENU_SCRIPT + COPY_SCRIPT

  return shell(`مشروع ${project.name}`, content, {
    active: 'projects',
    user: appUser,
    crumbs: `Photography Pixel / المشاريع / ${project.name}`,
    bodyClass: 'ws-full',
  }, script)
}

function workspaceModals(detail: ProjectDetail, options: ProjectWorkspaceOptions): string {
  const openAddTask = Boolean(options.openAddTask)
  const datalist = `<datalist id="b-labels">${SLOT_LABEL_PRESETS.map((label) => `<option value="${escapeHtml(label)}"></option>`).join('')}</datalist>`
  return datalist + addVideoModal(detail) + taskModals(detail, openAddTask)
}

function addVideoModal(detail: ProjectDetail): string {
  const statusOptions = KANBAN_STATUSES.map((s) => `<option value="${s}"${s === 'todo' ? ' selected' : ''}>${KANBAN_LABEL[s]}</option>`).join('')
  return `
  <div class="lm-modal" id="add-video" role="dialog" aria-modal="true" aria-label="إضافة بطاقة فيديو">
    <div class="lm-modal-backdrop" data-close-modal="add-video"></div>
    <div class="lm-box">
      <div class="lm-head"><span class="ico-chip">${shellIcon('video', 18)}</span><span class="lm-title">إضافة بطاقة فيديو</span><button class="lm-close" type="button" data-close-modal="add-video" aria-label="إغلاق">${shellIcon('close', 18)}</button></div>
      <form method="post" action="/admin/projects/${detail.project.id}">
        <input type="hidden" name="action" value="add_slot">
        <input type="hidden" name="tab" value="board">
        <label class="field"><span>عنوان البطاقة</span><input type="text" name="title" placeholder="مثال: فيديو 04"></label>
        <label class="field"><span>ملاحظات</span><input type="text" name="notes" placeholder="اختياري"></label>
        <div class="form-grid">
          <label class="field"><span>تصنيف</span><input type="text" name="label" list="b-labels" placeholder="اختر تصنيف أو اكتب تصنيفاً مخصصاً"></label>
          <label class="field"><span>تاريخ الاستحقاق</span><input type="date" name="deadline"></label>
        </div>
        <label class="field"><span>العمود</span><select name="status">${statusOptions}</select></label>
        <div class="actionbar"><button class="btn btn-primary" type="submit">إضافة البطاقة</button><button class="btn btn-subtle" type="button" data-close-modal="add-video">إلغاء</button></div>
      </form>
    </div>
  </div>`
}

function waParts(detail: ProjectDetail) {
  const progress = projectProgress(detail)
  return {
    clientName: detail.client?.name ?? '',
    projectName: detail.project.name,
    modelName: detail.model?.name ?? null,
    videoCount: progress.count,
    shootDate: detail.project.shoot_date,
    shootTime: detail.project.shoot_time,
    location: detail.project.location,
    script: detail.project.script,
  }
}

//----------------------------------------------------------------------------
// Tab: overview
//----------------------------------------------------------------------------

function overviewTab(detail: ProjectDetail, remaining: number | null): string {
  const project = detail.project
  const progress = projectProgress(detail)
  const openTasks = detail.tasks.filter((t) => t.status !== 'done').length

  const modelOptions = detail.models
    .map((m) => `<option value="${m.id}"${m.id === project.model_id ? ' selected' : ''}>${escapeHtml(m.name)}</option>`)
    .join('')

  const paymentOptions = (['unpaid', 'partial', 'paid'] as const)
    .map((p) => `<option value="${p}"${p === project.payment_status ? ' selected' : ''}>${PAYMENT_STATUS_LABEL[p]}</option>`)
    .join('')

  const wa = detail.client ? projectWaLink(detail.client.whatsapp_number, waParts(detail)) : ''
  const modelWa =
    detail.model?.whatsapp_number && detail.model.id
      ? modelBookingWaLink(detail.model.whatsapp_number, {
          modelName: detail.model.name,
          clientName: detail.client?.name ?? '',
          videoCount: progress.count,
          script: project.script,
        })
      : ''

  return `
  <div class="grid-stats three">
    ${statCard('الفيديوهات', 'video', `${progress.done}/${progress.count}`, 'جاهز / مخططة')}
    ${statCard('المهام', 'check', `${detail.tasks.length - openTasks}/${detail.tasks.length}`, 'مكتملة / كل المهام')}
    ${statCard('الدفع', 'sparkle', PAYMENT_STATUS_LABEL[project.payment_status], remaining !== null ? `المتبقي ${formatMoney(remaining)}` : '')}
  </div>

  <div class="grid-2">
    <form class="card" method="post" action="/admin/projects/${project.id}">
      <input type="hidden" name="action" value="set_profile">
      <input type="hidden" name="tab" value="details">
      <h2 class="form-card-title">${shellIcon('edit', 16)} بيانات المشروع</h2>
      <div class="form-grid">
        <label class="field"><span>اسم المشروع</span><input type="text" name="name" value="${escapeHtml(project.name)}" required minlength="2"></label>
        <label class="field"><span>العميل</span><span class="linkbox" style="padding:.5rem .8rem"><a href="/admin/clients/${project.client_id}">${detail.client ? escapeHtml(detail.client.name) : '—'}</a><span class="hint" dir="ltr">${detail.client ? escapeHtml(detail.client.whatsapp_number) : ''}</span></span></label>
        <label class="field"><span>الموديل</span><select name="model_id"><option value="">بدون موديل</option>${modelOptions}</select></label>
        <label class="field"><span>عدد الفيديوهات المخططة</span><input type="number" name="video_count" value="${project.planned_video_count}" min="0" max="50"></label>
        <label class="field"><span>تاريخ التصوير</span><input type="date" name="shoot_date" value="${escapeHtml(project.shoot_date ?? '')}"></label>
        <label class="field"><span>ساعة التصوير</span><input type="text" name="shoot_time" value="${escapeHtml(project.shoot_time ?? '')}" placeholder="مثال: 10:00"></label>
        <label class="field"><span>المكان</span><input type="text" name="location" value="${escapeHtml(project.location ?? '')}" placeholder="الاستوديو أو المكان"></label>
        <label class="field"><span>حالة الدفع</span><select name="payment_status">${paymentOptions}</select></label>
        <label class="field"><span>المبلغ الإجمالي</span><input type="number" name="total_price" value="${project.total_price ?? ''}" min="0" step="0.01"></label>
        <label class="field"><span>السلفة المدفوعة</span><input type="number" name="advance" value="${project.advance ?? ''}" min="0" step="0.01"></label>
      </div>
      <label class="field"><span>سكربت التصوير (يُرسل مع رسائل واتساب)</span><textarea name="script" rows="4" placeholder="خطوات التصوير أو الجمل المطلوب إرسالها للعميل / الموديل…">${escapeHtml(project.script ?? '')}</textarea></label>
      <div class="actionbar"><button class="btn btn-primary" type="submit">حفظ التعديلات</button></div>
    </form>

    <div>
      <div class="card" style="margin-bottom:1rem">
        <h2 class="form-card-title">${shellIcon('lock', 16)} ملاحظات خاصة</h2>
        <form method="post" action="/admin/projects/${project.id}">
          <input type="hidden" name="action" value="set_profile">
          <input type="hidden" name="tab" value="details">
          <input type="hidden" name="name" value="${escapeHtml(project.name)}">
          <input type="hidden" name="model_id" value="${escapeHtml(project.model_id ?? '')}">
          <input type="hidden" name="video_count" value="${project.planned_video_count}">
          <input type="hidden" name="shoot_date" value="${escapeHtml(project.shoot_date ?? '')}">
          <input type="hidden" name="shoot_time" value="${escapeHtml(project.shoot_time ?? '')}">
          <input type="hidden" name="location" value="${escapeHtml(project.location ?? '')}">
          <input type="hidden" name="script" value="${escapeHtml(project.script ?? '')}">
          <input type="hidden" name="payment_status" value="${project.payment_status}">
          <input type="hidden" name="total_price" value="${project.total_price ?? ''}">
          <input type="hidden" name="advance" value="${project.advance ?? ''}">
          <label class="field"><span>ملاحظات المالك فقط — لا تظهر للعملاء</span><textarea name="notes" rows="4" placeholder="تفاصيل خاصة بالعقد، الأسعار، الاتفاقيات…">${escapeHtml(project.notes ?? '')}</textarea></label>
          <div class="actionbar"><button class="btn btn-subtle" type="submit">حفظ الملاحظات</button></div>
        </form>
      </div>

      <div class="card">
        <h2 class="form-card-title">${shellIcon('whatsapp', 16)} رسائل واتساب</h2>
        ${wa ? `
          <p class="muted" style="margin-bottom:.6rem">رسالة المشروع تُبنى من الحالة الحالية (الموديل، العميل، عدد الفيديوهات، التاريخ، المكان، السكربت) وتُحذف الأقسام الفارغة تلقائياً.</p>
          <div class="wa-text" dir="rtl">${escapeHtml(projectMessageText(waParts(detail)))}</div>
          <div class="actionbar">
            <a class="btn btn-success" target="_blank" rel="noopener noreferrer" href="${escapeHtml(wa)}">${shellIcon('whatsapp', 15)} فتح في واتساب</a>
            <button class="btn btn-subtle" type="button" data-copy="${escapeHtml(wa)}">${shellIcon('copy', 15)} نسخ الرابط</button>
            <form method="post" action="/admin/projects/${project.id}">
              <input type="hidden" name="action" value="record_sent">
              <input type="hidden" name="tab" value="details">
              <button class="btn btn-outline" type="submit">${shellIcon('check', 15)} تسجيل الإرسال</button>
            </form>
          </div>
        ` : `<p class="muted">لا يوجد رقم واتساب للعميل.</p>`}
        ${modelWa ? `
          <hr class="hr-subtle">
          <p class="muted" style="margin-bottom:.5rem">إشعار للموديل بجدولة التصوير:</p>
          <div class="actionbar">
            <a class="btn btn-subtle" target="_blank" rel="noopener noreferrer" href="${escapeHtml(modelWa)}">${shellIcon('whatsapp', 15)} إشعار الموديل</a>
          </div>` : ''}
        ${detail.client ? `
          <hr class="hr-subtle">
          <div class="actionbar">
            <a class="btn btn-subtle" target="_blank" rel="noopener noreferrer" href="${escapeHtml(clientContactWaLink(detail.client.whatsapp_number))}">${shellIcon('phone', 15)} تواصل مباشر</a>
          </div>` : ''}
      </div>
    </div>
  </div>`
}

//----------------------------------------------------------------------------
// Tab: videos (Trello-style board, Phase 4P)
//----------------------------------------------------------------------------

const SLOT_LABEL_PRESETS = [
  'بدون مونتاج',
  'تعديل شامل',
  'ألوان طبيعية',
  'ألوان مائلة',
  'تسليم سريع',
  'مراجعة العميل',
  'ثيم جلسة',
  'رييلز',
] as const

const SLOT_LABEL_COLORS = [
  '#e0533d',
  '#dea004',
  '#2f7d5a',
  '#24567d',
  '#362477',
  '#8a5a2a',
  '#c0437a',
  '#1f6b4a',
] as const

function slotLabelColor(label: string): string {
  let h = 0
  for (let i = 0; i < label.length; i += 1) h = (h * 31 + label.charCodeAt(i)) >>> 0
  return SLOT_LABEL_COLORS[h % SLOT_LABEL_COLORS.length] ?? '#2f7d5a'
}

function slotDeadline(dateStr: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (!m) return false
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return date < today
}

function boardTab(detail: ProjectDetail, openAddCard = false): string {
  const progress = projectProgress(detail)
  const inPlan = inPlanSlots(detail)
  const pausedCount = detail.slots.length - inPlan.length
  const byStatus = new Map<KanbanStatus, ProjectSlotDetail[]>()
  for (const status of KANBAN_STATUSES) byStatus.set(status, [])
  for (const item of inPlan) byStatus.get(item.slot.kanban_status)?.push(item)

  // per-card checklist progress from the project tasks that belong to a card
  const slotIds = new Set(inPlan.map((item) => item.slot.id))
  const slotStats = new Map<string, { done: number; total: number }>()
  for (const task of detail.tasks) {
    if (!task.client_video_slot_id || !slotIds.has(task.client_video_slot_id)) continue
    const entry = slotStats.get(task.client_video_slot_id) ?? { done: 0, total: 0 }
    entry.total += 1
    if (task.status === 'done') entry.done += 1
    slotStats.set(task.client_video_slot_id, entry)
  }

  const modelOptions = detail.models
    .map((m) => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)}</option>`)
    .join('')

  const filterStatusOptions = ['', ...KANBAN_STATUSES]
    .map((s) => `<option value="${s}"${s === '' ? ' selected' : ''}>${s === '' ? 'كل الأعمدة' : KANBAN_LABEL[s as KanbanStatus]}</option>`)
    .join('')

  const columns = KANBAN_STATUSES.map((status) => {
    const cards = (byStatus.get(status) ?? [])
      .sort((a, b) => a.slot.kanban_order - b.slot.kanban_order)
      .map((item) => boardCard(detail, item, status, slotStats))
      .join('')
    return `
      <section class="b-col" data-status="${status}" aria-label="${KANBAN_LABEL[status]}">
        <header class="b-col-head">
          <span class="kb-dot" style="background:${KANBAN_COLOR[status]}"></span>
          <span class="b-col-label">${KANBAN_LABEL[status]}</span>
          <span class="kb-count b-col-count">${(byStatus.get(status) ?? []).length}</span>
        </header>
        <div class="b-drop">${cards}</div>
        <footer class="b-addbar">
          <button class="b-add-btn" type="button" data-add-toggle="${status}" aria-label="إضافة بطاقة إلى ${KANBAN_LABEL[status]}">${shellIcon('plus', 14)} إضافة بطاقة</button>
          <form class="b-add-form" method="post" action="/admin/projects/${detail.project.id}"${status === 'todo' && openAddCard ? '' : ' hidden'}>
            <input type="hidden" name="action" value="add_slot">
            <input type="hidden" name="status" value="${status}">
            <input type="hidden" name="tab" value="board">
            <label class="field"><span>العنوان (اختياري)</span><input type="text" name="title"${status === 'todo' && openAddCard ? ' autofocus' : ''} placeholder="مثال: فيديو 04"></label>
            <label class="field"><span>ملاحظات</span><input type="text" name="notes"></label>
            <label class="field"><span>تصنيف</span><input type="text" name="label" list="b-labels" placeholder="اختر تصنيف أو اكتب تصنيفاً مخصصاً"></label>
            <label class="field"><span>تاريخ الاستحقاق</span><input type="date" name="deadline"></label>
            <div class="actionbar">
              <button class="btn btn-primary btn-sm" type="submit">إضافة</button>
              <button class="btn btn-subtle btn-sm" type="button" data-add-cancel="${status}">إلغاء</button>
            </div>
          </form>
        </footer>
      </section>`
  }).join('')

  return `
  <div class="b-toolbar">
    <div class="b-filters">
      <input id="bf-q" type="search" class="bf-input" placeholder="ابحث في البطاقات…" autocomplete="off" aria-label="بحث في البطاقات">
      <select id="bf-model" class="bf-input" aria-label="تصفية حسب الموديل"><option value="">كل الموديلات</option>${modelOptions}</select>
      <select id="bf-status" class="bf-input" aria-label="تصفية حسب العمود">${filterStatusOptions}</select>
      <select id="bf-delivery" class="bf-input" aria-label="تصفية حسب التوصيل">
        <option value="">كل حالات التوصيل</option>
        <option value="none">بدون تجهيز</option>
        <option value="prepared">مجهّز</option>
        <option value="uploaded">تم الرفع</option>
      </select>
      <button id="bf-clear" class="btn btn-subtle btn-sm" type="button">مسح التصفية</button>
    </div>
    <p class="muted">${progress.filled}/${progress.count} فيديو مرفوع — اسحب البطاقة بين الأعمدة أو انقر عليها لفتح التفاصيل.</p>
  </div>
  ${pausedCount ? `<div class="alert info">${pausedCount} فيديو خارج الخطة (مُجمّد) — عدّل "عدد الفيديوهات المخططة" من التفاصيل لإعادتها.</div>` : ''}
  <div class="b-root" id="b-root">
    <div class="b-board">${columns}</div>
  </div>`
}

function detailsTab(detail: ProjectDetail, remaining: number | null): string {
  const progress = projectProgress(detail)
  return `
  <div class="ws-details">
    ${overviewTab(detail, remaining)}
    <section class="ws-sec" id="ws-tasks">
      ${tasksBoard(detail)}
    </section>
    <section class="ws-sec" id="ws-delivery">
      <div class="sec-head">
        <span class="sico">${shellIcon('package', 17)}</span>
        <h2>التسليم والروابط</h2>
      </div>
      ${deliveryTab(detail, progress)}
    </section>
  </div>`
}

function boardCard(
  detail: ProjectDetail,
  item: ProjectSlotDetail,
  currentStatus: KanbanStatus,
  slotStats: Map<string, { done: number; total: number }>,
): string {
  const slot = item.slot
  const delivery = item.delivery
  const stats = slotStats.get(slot.id) ?? { done: 0, total: 0 }
  const hasThumb = Boolean(delivery?.hasVideo && detail.project.id && slot.id)
  const thumb = hasThumb
    ? `<img src="/admin/project-video-thumb?project=${detail.project.id}&slot=${slot.id}" alt="" loading="lazy" decoding="async" onerror="this.style.display='none'">`
    : ''
  const num = slot.title.replace(/\D/g, '')
  const statusOptions = projectStatusOptions(currentStatus, KANBAN_STATUSES, KANBAN_LABEL)
  const statePill = delivery ? statusBadge(delivery.status) : '<span class="badge st-pending">لم يُرفع بعد</span>'
  const deliveryInfo = delivery
    ? `${modeBadge(delivery.delivery_mode)}<span class="v-chip">${shellIcon('refresh', 12)} ن${delivery.versionCount}${delivery.activeVersion ? ` · أنشط v${delivery.activeVersion}` : ''}</span>`
    : ''
  const deliverAction = delivery
    ? `<a class="btn btn-text" href="/admin/deliveries/${delivery.id}" data-delivery-link="${delivery.id}">${shellIcon('package', 14)} التوصيل</a>`
    : `<form method="post" action="/admin/projects/${detail.project.id}">
         <input type="hidden" name="action" value="prepare_slot">
         <input type="hidden" name="slot_id" value="${slot.id}">
         <input type="hidden" name="tab" value="board">
         <button class="btn btn-text" type="submit">${shellIcon('upload', 14)} تجهيز الرابط</button>
       </form>`
  const label = slot.label ? `<span class="b-label" style="background:${slotLabelColor(slot.label)}">${escapeHtml(slot.label)}</span>` : ''
  const pauseBadge = slot.status === 'paused' ? '<span class="badge off">خارج الخطة</span>' : ''
  const deadlineChip = slot.deadline
    ? `<span class="b-deadline${slotDeadline(slot.deadline) ? ' soon' : ''}" title="تاريخ الاستحقاق">${shellIcon('calendar', 11)} ${formatDateOnly(slot.deadline)}</span>`
    : ''
  const metaParts = [
    detail.model ? `<span class="b-model">${shellIcon('users', 11)} ${escapeHtml(detail.model.name)}</span>` : '',
    slot.notes ? `<span class="b-note" title="${escapeHtml(slot.notes)}">${shellIcon('activity', 11)} ملاحظات</span>` : '',
    deadlineChip,
  ].filter(Boolean).join('<span class="b-dotsep"></span>')
  const checkBar = stats.total > 0
    ? `<div class="b-chk" title="مهام البطاقة"><div class="b-chk-track"><div class="b-chk-bar" style="width:${Math.round((stats.done / stats.total) * 100)}%"></div></div><span class="b-chk-n">${stats.done}/${stats.total}</span></div>`
    : ''

  return `
  <article class="b-card" draggable="true" data-card-trigger data-slot-id="${slot.id}" data-title="${escapeHtml(slot.title.toLowerCase())}" data-model="${escapeHtml((detail.model?.name ?? '').toLowerCase())}" data-delivery="${delivery ? delivery.status : 'none'}" data-uploaded="${delivery?.hasVideo ? '1' : '0'}" data-status="${currentStatus}">
    <div class="b-thumb" style="background:${KANBAN_GRADIENT[currentStatus]}">
      ${thumb || `<span class="b-num">فيديو ${num || ''}</span><span class="b-play">${shellIcon('play', 22)}</span>`}
    </div>
    <div class="b-body">
      ${label || pauseBadge ? `<div class="b-tags">${label}${pauseBadge}</div>` : ''}
      <div class="b-title">${escapeHtml(slot.title)}</div>
      <div class="b-meta">${metaParts || '<span>—</span>'}</div>
      ${checkBar}
      <div class="kb-states">${statePill}${deliveryInfo}</div>
      <div class="kb-actions">
        <select class="kb-move" onchange="boardMove(this, '${slot.id}')" aria-label="نقل البطاقة">${statusOptions}</select>
        <button class="btn btn-text" type="button" data-open-card="${slot.id}">${shellIcon('eye', 13)} التفاصيل</button>
      </div>
      <div class="kb-actions">${deliverAction}</div>
    </div>
  </article>`
}

//----------------------------------------------------------------------------
// Card detail modal (Trello-style card view, Phase 4P)
//----------------------------------------------------------------------------

function cardAssignees(card: CardDetail): { id: string; name: string }[] {
  return card.assignees.length
    ? card.assignees
    : [{ id: '', name: 'أنا' }]
}

export function renderCardDetailPartial(card: CardDetail): string {
  const slot = card.slot.slot
  const delivery = card.slot.delivery
  const projectId = card.project.id
  const done = card.tasks.filter((t) => t.status === 'done').length
  const total = card.tasks.length

  const statePill = delivery ? statusBadge(delivery.status) : '<span class="badge st-pending">لم يُرفع بعد</span>'
  const deliverPanel = delivery
    ? `
    <div class="cd-deliver">
      <div class="cd-deliver-head">${shellIcon('package', 15)} التوصيل <span style="margin-inline-start:auto">${statePill}</span></div>
      ${delivery.delivery_mode ? `<div>${modeBadge(delivery.delivery_mode)}${delivery.hasVideo ? `<span class="v-chip">${shellIcon('refresh', 12)} ن${delivery.versionCount}${delivery.activeVersion ? ` · أنشط v${delivery.activeVersion}` : ''}</span>` : ''}</div>` : ''}
      <div class="kb-actions"><a class="btn btn-outline btn-sm" href="/admin/deliveries/${delivery.id}" data-delivery-link="${delivery.id}">${shellIcon('external', 14)} فتح صفحة التوصيل</a></div>
    </div>`
    : `
    <div class="cd-deliver">
      <div class="cd-deliver-head">${shellIcon('package', 15)} التوصيل <span style="margin-inline-start:auto">${statePill}</span></div>
      <div class="kb-actions"><form method="post" action="/admin/projects/${projectId}"><input type="hidden" name="action" value="prepare_slot"><input type="hidden" name="slot_id" value="${slot.id}"><input type="hidden" name="tab" value="board"><button class="btn btn-primary btn-sm" type="submit" data-prepare-slot="${slot.id}">${shellIcon('upload', 14)} تجهيز الرابط</button></form></div>
    </div>`

  const checkRows = total
    ? card.tasks
        .map((task) => {
          const isDone = task.status === 'done'
          return `
          <li class="cd-task${isDone ? ' done' : ''}">
            <label class="cd-task-row">
              <input type="checkbox" class="cd-task-check"${isDone ? ' checked' : ''} data-task-id="${task.id}" onchange="cdTaskToggle(this, '${projectId}', '${task.id}')">
              <span class="cd-task-title">${escapeHtml(task.title)}</span>
            </label>
            <form method="post" action="/admin/projects/${projectId}" onsubmit="return confirm('حذف هذه المهمة؟')">
              <input type="hidden" name="action" value="delete_task">
              <input type="hidden" name="task_id" value="${task.id}">
              <input type="hidden" name="slot_id" value="${slot.id}">
              <input type="hidden" name="tab" value="board">
              <button class="btn btn-text danger" type="submit" aria-label="حذف المهمة">${shellIcon('trash', 13)}</button>
            </form>
          </li>`
        })
        .join('')
    : `<li class="hint cd-empty">لا مهام على هذه البطاقة بعد.</li>`

  const assigneeOptions = cardAssignees(card)
    .map((a) => `<option value="${a.id}"${a.id === '' ? ' selected' : ''}>${escapeHtml(a.name)}</option>`)
    .join('')

  const moveButtons = KANBAN_STATUSES.map((status) => {
    const current = status === slot.kanban_status
    return `<button class="cd-move${current ? ' current' : ''}" type="button" data-move-to="${status}" data-cd-move="${status}"${current ? ' disabled' : ''} onclick="cdMove('${slot.id}','${status}')">${KANBAN_LABEL[status]}</button>`
  }).join('')

  const activityRows = card.activity
    .slice(0, 20)
    .map((item) => {
      const desc = activityMetaDesc(item, {
        project: card.project,
        tasks: card.tasks,
        models: [],
        slots: [card.slot],
      } as unknown as ProjectDetail)
      return `<li class="act-row"><span class="act-tag">${escapeHtml(PROJECT_ACTIVITY_LABEL[item.type] ?? ACTIVITY_LABEL[item.type as keyof typeof ACTIVITY_LABEL] ?? item.type)}</span><span class="act-desc">${desc ? escapeHtml(desc) : ''}</span><span class="act-time">${formatTime(item.created_at)}</span></li>`
    })
    .join('')

  const revisions = card.revisions ?? []
  const openRevision = revisions.find((r) => r.status !== 'approved')
  const revisionRows = revisions
    .map((r) => {
      const advanceButtons = nextRevisionStatuses(r.status)
        .map((next) => {
          const label =
            next === 'in_progress' ? 'ابدأ التنفيذ' : next === 'pending_review' ? 'إرسال للمراجعة' : next === 'approved' ? 'اعتماد النسخة' : next
          return `<form method="post" action="/admin/projects/${projectId}" style="display:inline"><input type="hidden" name="action" value="set_revision"><input type="hidden" name="revision_id" value="${r.id}"><input type="hidden" name="status" value="${next}"><input type="hidden" name="slot_id" value="${slot.id}"><input type="hidden" name="tab" value="board"><button class="btn btn-subtle btn-sm" type="submit">${escapeHtml(label)}</button></form>`
        })
        .join('')
      const by = r.created_by ? (card.assignees.find((a) => a.id === r.created_by)?.name ?? r.created_by.slice(0, 8)) : '—'
      return `<li class="rv-row">
        <div class="rv-head"><span class="badge rv-${r.status}">V${r.version} · ${REVISION_STATUS_LABEL[r.status]}</span><span class="rv-time">${formatTime(r.requested_at)}</span></div>
        ${r.reason ? `<div class="rv-reason">${escapeHtml(r.reason)}</div>` : ''}
        <div class="rv-meta">بواسطة ${escapeHtml(by)}${r.resolved_at ? ` · اُعتمد ${formatTime(r.resolved_at)}` : ''}</div>
        ${advanceButtons ? `<div class="actionbar">${advanceButtons}</div>` : ''}
      </li>`
    })
    .join('')

  const revisionsPanel = `
    <div class="cd-section">
      <div class="cd-section-head">${shellIcon('refresh', 15)} دورات التعديل <span class="pill">النسخة الحالية v${slot.revision_version}</span></div>
      ${revisions.length > 0 ? `<ul class="rv-list">${revisionRows}</ul>` : `<p class="hint cd-empty">لا توجد دورات تعديل حتى الآن.</p>`}
      ${openRevision
        ? `<p class="hint cd-empty">هناك طلب تعديل مفتوح على هذه البطاقة.</p>`
        : `<form method="post" action="/admin/projects/${projectId}" class="cd-addtask">
             <input type="hidden" name="action" value="request_revision">
             <input type="hidden" name="slot_id" value="${slot.id}">
             <input type="hidden" name="tab" value="board">
             <div class="cd-addtask-row">
               <input type="text" name="reason" required minlength="2" placeholder="سبب طلب التعديل…" class="cd-addtask-input">
               <button class="btn btn-primary btn-sm" type="submit">${shellIcon('plus', 14)} طلب تعديل</button>
             </div>
           </form>`}
    </div>`

  return `
  <div class="cd-grid">
    <div class="cd-main">
      <h3 class="cd-title">${shellIcon('video', 17)} ${escapeHtml(slot.title)}</h3>
      <form method="post" action="/admin/projects/${projectId}" data-card-form>
        <input type="hidden" name="action" value="update_slot">
        <input type="hidden" name="slot_id" value="${slot.id}">
        <input type="hidden" name="tab" value="board">
        <label class="field"><span>عنوان البطاقة</span><input type="text" name="title" value="${escapeHtml(slot.title)}" required minlength="2"></label>
        <label class="field"><span>ملاحظات</span><textarea name="notes" rows="3" placeholder="تفاصيل التصوير أو المراجعة المطلوبة لهذا الفيديو…">${escapeHtml(slot.notes ?? '')}</textarea></label>
        <div class="form-grid">
          <label class="field"><span>تصنيف</span><input type="text" name="label" list="b-labels" value="${escapeHtml(slot.label ?? '')}" placeholder="بدون تصنيف"></label>
          <label class="field"><span>تاريخ الاستحقاق</span><input type="date" name="deadline" value="${escapeHtml(slot.deadline ?? '')}"></label>
        </div>
        <div class="actionbar"><button class="btn btn-primary btn-sm" type="submit">حفظ التعديلات</button></div>
      </form>

      <div class="cd-section">
        <div class="cd-section-head">${shellIcon('kanban', 15)} حالة البطاقة</div>
        <div class="cd-moves" role="group" aria-label="نقل البطاقة">${moveButtons}</div>
      </div>

      <div class="cd-section">
        <div class="cd-section-head">${shellIcon('check', 15)} قائمة المهام <span class="cd-chk-n" data-chk-count>${done}/${total}</span></div>
        <form method="post" action="/admin/projects/${projectId}" class="cd-addtask">
          <input type="hidden" name="action" value="add_task">
          <input type="hidden" name="slot_id" value="${slot.id}">
          <input type="hidden" name="tab" value="board">
          <div class="cd-addtask-row">
            <input type="text" name="title" required minlength="2" placeholder="عنوان مهمة جديدة…" class="cd-addtask-input">
            <select name="assignee_id" class="cd-addtask-assignee" aria-label="المسؤول">${assigneeOptions}</select>
            <button class="btn btn-primary btn-sm" type="submit">${shellIcon('plus', 14)} إضافة</button>
          </div>
        </form>
        <ul class="cd-tasks" data-checklist>${checkRows}</ul>
      </div>

      ${deliverPanel}

      ${revisionsPanel}
    </div>

    <aside class="cd-side">
      <div class="cd-section">
        <div class="cd-section-head">${shellIcon('activity', 15)} سجل البطاقة</div>
        <ul class="cd-activity">${activityRows || '<li class="hint">لا سجل بعد لهذه البطاقة.</li>'}</ul>
      </div>
    </aside>
  </div>`
}

//----------------------------------------------------------------------------
// Tab: tasks
//----------------------------------------------------------------------------

function tasksBoard(detail: ProjectDetail): string {
  const columns: { status: TaskStatus; label: string }[] = [
    { status: 'todo', label: 'جديدة' },
    { status: 'in_progress', label: 'قيد التنفيذ' },
    { status: 'done', label: 'مكتملة' },
  ]
  const assigneeName = new Map(detail.assignees.map((a) => [a.id, a.name]))
  const byStatus = new Map<TaskStatus, ProjectDetail['tasks']>()
  for (const c of columns) byStatus.set(c.status, [])

  const rowFor = (task: ProjectDetail['tasks'][number]) => {
    const cols = columns
      .map((c) => {
        if (c.status === task.status) return `<option value="${c.status}" selected>${c.label}</option>`
        return `<option value="${c.status}">${c.label}</option>`
      })
      .join('')
    return cols
  }

  for (const task of detail.tasks) {
    byStatus.get(task.status)?.push(task)
  }

  const columnHtml = columns
    .map((col) => {
      const cards = (byStatus.get(col.status) ?? [])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((task) => {
          const assignee = task.assignee_id ? assigneeName.get(task.assignee_id) : null
          const priorityClass = task.priority === 'high' ? ' pr-high' : task.priority === 'low' ? ' pr-low' : ' pr-med'
          const done = task.status === 'done'
          return `
          <div class="t-card${done ? ' done' : ''}">
            <div class="t-top">
              <span class="t-title">${escapeHtml(task.title)}</span>
              <span class="badge${priorityClass}">${TASK_PRIORITY_LABEL[task.priority]}</span>
            </div>
            <div class="t-meta">
              ${assignee ? `<span>${shellIcon('user', 12)} ${escapeHtml(assignee)}</span>` : `<span class="hint">بدون مسؤول</span>`}
              ${task.due_date ? `<span>${shellIcon('calendar', 12)} ${formatDateOnly(task.due_date)}</span>` : ''}
            </div>
            <div class="t-actions">
              <select class="kb-move" onchange="taskStatus(this, '${detail.project.id}', '${task.id}')" aria-label="حالة المهمة">${rowFor(task)}</select>
              <button class="btn btn-text" type="button" data-open-modal="edit-task-${task.id}">${shellIcon('edit', 13)} تعديل</button>
              <form method="post" action="/admin/projects/${detail.project.id}" onsubmit="return confirm('حذف هذه المهمة؟')">
                <input type="hidden" name="action" value="delete_task">
                <input type="hidden" name="task_id" value="${task.id}">
                <input type="hidden" name="tab" value="details">
                <button class="btn btn-text danger" type="submit">${shellIcon('trash', 13)}</button>
              </form>
            </div>
          </div>`
        })
        .join('')
      return `
      <section class="t-col" data-status="${col.status}">
        <header class="t-col-head"><span class="t-label">${col.label}</span><span class="t-count">${(byStatus.get(col.status) ?? []).length}</span></header>
        <div class="t-drop">${cards || '<p class="hint t-empty">لا مهام هنا</p>'}</div>
      </section>`
    })
    .join('')

  return `
  <div class="between" style="margin-bottom:.8rem">
    <p class="muted">مهام الفريق حول هذا المشروع (التصوير، المونتاج، التسليم…).</p>
    <button class="btn btn-primary" type="button" data-open-modal="add-task">${shellIcon('plus', 16)} مهمة جديدة</button>
  </div>
  <div class="t-root">
    <div class="t-board">${columnHtml}</div>
  </div>`
}

function taskModals(detail: ProjectDetail, openAddTask: boolean): string {
  const assigneeOptions = detail.assignees
    .map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`)
    .join('')
  const priorityOptions = (['low', 'medium', 'high'] as TaskPriority[])
    .map((p) => `<option value="${p}">${TASK_PRIORITY_LABEL[p]}</option>`)
    .join('')

  const editModals = detail.tasks
    .map((task) => {
      const sel = task.assignee_id ?? ''
      return `
      <div class="lm-modal" id="edit-task-${task.id}" role="dialog" aria-modal="true">
        <div class="lm-modal-backdrop" data-close-modal="edit-task-${task.id}"></div>
        <div class="lm-box">
          <div class="lm-head"><span class="ico-chip">${shellIcon('check', 18)}</span><span class="lm-title">تعديل المهمة</span><button class="lm-close" type="button" data-close-modal="edit-task-${task.id}">${shellIcon('close', 18)}</button></div>
          <form method="post" action="/admin/projects/${detail.project.id}">
            <input type="hidden" name="action" value="edit_task">
            <input type="hidden" name="task_id" value="${task.id}">
            <input type="hidden" name="tab" value="details">
            <label class="field"><span>العنوان</span><input type="text" name="title" value="${escapeHtml(task.title)}" required minlength="2"></label>
            <div class="form-grid">
              <label class="field"><span>الأولوية</span><select name="priority">${['low', 'medium', 'high']
                .map((p) => `<option value="${p}"${p === task.priority ? ' selected' : ''}>${TASK_PRIORITY_LABEL[p as TaskPriority]}</option>`)
                .join('')}</select></label>
              <label class="field"><span>تاريخ الاستحقاق</span><input type="date" name="due_date" value="${escapeHtml(task.due_date ?? '')}"></label>
            </div>
            <label class="field"><span>المسؤول</span><select name="assignee_id"><option value="">بدون مسؤول</option>${assigneeOptions.replaceAll('>' + escapeHtml(detail.assignees.find((a) => a.id === sel)?.name ?? '') + '</option>', '>').replace(`value="${sel}"`, `value="${sel}" selected`)}</select></label>
            <div class="actionbar"><button class="btn btn-primary" type="submit">حفظ</button></div>
          </form>
        </div>
      </div>`
    })
    .join('')

  return `
  <div class="lm-modal${openAddTask ? ' open' : ''}" id="add-task" role="dialog" aria-modal="true">
    <div class="lm-modal-backdrop" data-close-modal="add-task"></div>
    <div class="lm-box">
      <div class="lm-head"><span class="ico-chip">${shellIcon('check', 18)}</span><span class="lm-title">مهمة جديدة</span><button class="lm-close" type="button" data-close-modal="add-task">${shellIcon('close', 18)}</button></div>
      <form method="post" action="/admin/projects/${detail.project.id}">
        <input type="hidden" name="action" value="add_task">
        <input type="hidden" name="tab" value="details">
        <label class="field"><span>العنوان *</span><input type="text" name="title" required minlength="2" placeholder="مثال: رفع فيديو 03 بعد المونتاج"></label>
        <div class="form-grid">
          <label class="field"><span>الأولوية</span><select name="priority">${priorityOptions}</select></label>
          <label class="field"><span>تاريخ الاستحقاق</span><input type="date" name="due_date"></label>
        </div>
        <label class="field"><span>المسؤول</span><select name="assignee_id"><option value="">بدون مسؤول</option>${assigneeOptions}</select></label>
        <div class="actionbar"><button class="btn btn-primary" type="submit">إضافة المهمة</button></div>
      </form>
    </div>
  </div>

  ${editModals}`
}

//----------------------------------------------------------------------------
// Tab: delivery
//----------------------------------------------------------------------------

function deliveryTab(detail: ProjectDetail, progress: { count: number; done: number; filled: number }): string {
  const rows = inPlanSlots(detail)
    .map((item) => {
      const slot = item.slot
      const delivery = item.delivery
      return `<tr>
        <td><b>${escapeHtml(slot.title)}</b>${slot.notes ? `<div class="hint">${escapeHtml(slot.notes)}</div>` : ''}</td>
        <td>${delivery ? statusBadge(delivery.status) : '<span class="badge st-pending">غير جاهز</span>'}</td>
        <td>${delivery ? modeBadge(delivery.delivery_mode) : '—'}</td>
        <td>${delivery ? (delivery.hasVideo ? `${shellIcon('check', 13)} v${delivery.activeVersion}` : '—') : '—'}</td>
        <td>${delivery ? formatTime(delivery.created_at) : '—'}</td>
        <td>${delivery ? `<a class="btn btn-text" href="/admin/deliveries/${delivery.id}">${shellIcon('external', 14)} فتح التوصيل</a>` : `<form method="post" action="/admin/projects/${detail.project.id}"><input type="hidden" name="action" value="prepare_slot"><input type="hidden" name="slot_id" value="${slot.id}"><input type="hidden" name="tab" value="details"><button class="btn btn-text" type="submit">${shellIcon('upload', 14)} تجهيز</button></form>`}</td>
      </tr>`
    })
    .join('')

  const wa = detail.client ? projectWaLink(detail.client.whatsapp_number, waParts(detail)) : ''

  return `
  <div class="grid-2">
    <div class="panel">
      <div class="panel-head"><span class="ico-chip">${shellIcon('package', 18)}</span><h2>تسليم الفيديوهات</h2></div>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>الفيديو</th><th>الحالة</th><th>الوضع</th><th>الإصدار النشط</th><th>تاريخ التجهيز</th><th>الرابط</th></tr></thead>
        <tbody>${rows}</tbody>
        ${progress.filled} / ${progress.count} فيديو مرفوع
      </table></div>
    </div>
    <div class="card">
      <h2 class="form-card-title">${shellIcon('whatsapp', 16)} إرسال الروابط</h2>
      <p class="muted" style="margin-bottom:.8rem">يفتح واتساب برسالة جاهزة من بيانات المشروع الحالية (تُحذف الأقسام الفارغة).</p>
      ${wa ? `
        <div class="wa-text" dir="rtl">${escapeHtml(projectMessageText(waParts(detail)))}</div>
        <div class="actionbar">
          <a class="btn btn-success" target="_blank" rel="noopener noreferrer" href="${escapeHtml(wa)}">${shellIcon('whatsapp', 15)} فتح في واتساب</a>
          <button class="btn btn-subtle" type="button" data-copy="${escapeHtml(wa)}">${shellIcon('copy', 15)} نسخ الرابط</button>
        </div>
      ` : `<p class="muted">لا يوجد رقم واتساب للعميل.</p>`}
    </div>
  </div>`
}

//----------------------------------------------------------------------------
// Tab: activity
//----------------------------------------------------------------------------

function activityTab(detail: ProjectDetail): string {
  const rows = detail.activity
    .map((item) => {
      const label =
        item.kind === 'project'
          ? (PROJECT_ACTIVITY_LABEL[item.type] ?? item.type)
          : (ACTIVITY_LABEL[item.type as keyof typeof ACTIVITY_LABEL] ?? item.type)
      const meta = activityMetaDesc(item, detail)
      const icon = item.kind === 'project' ? 'activity' : 'package'
      return `
      <div class="activity-row">
        <span class="a-ico">${shellIcon(icon, 16)}</span>
        <div class="a-body"><div class="a-label">${escapeHtml(label)}</div>${meta ? `<div class="a-meta">${meta}</div>` : ''}</div>
        <span class="a-time">${formatTime(item.created_at)}</span>
      </div>`
    })
    .join('')

  return `
  <div class="panel">
    <div class="panel-head"><span class="ico-chip">${shellIcon('activity', 18)}</span><h2>سجل نشاط المشروع</h2></div>
    ${rows ? `<div class="activity-list">${rows}</div>` : `<p class="muted mini-empty">لا نشاط بعد — أول حدث يُسجل عند إنشاء المشروع.</p>`}
  </div>`
}

function activityMetaDesc(
  item: { kind: 'project' | 'delivery'; type: string; metadata: Record<string, unknown> | null },
  detail: ProjectDetail,
): string {
  const m = item.metadata ?? {}
  const metaStr = (value: unknown): string => (typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '')
  if (item.kind === 'delivery') {
    const slotTitle = m.slot_id ? '' : ''
    return slotTitle || ''
  }
  switch (item.type) {
    case 'status_changed':
      return `من "${PROJECT_STATUS_LABEL[m.from as ProjectStatus] ?? metaStr(m.from)}" إلى "${PROJECT_STATUS_LABEL[m.to as ProjectStatus] ?? metaStr(m.to)}"`
    case 'model_changed': {
      const nameOf = (idKey: 'from' | 'to') => {
        const id = m[idKey] as string | null
        return id ? detail.models.find((model) => model.id === id)?.name ?? id : 'بدون موديل'
      }
      return `من "${nameOf('from')}" إلى "${nameOf('to')}"`
    }
    case 'count_changed':
      return `من ${metaStr(m.from) || '—'} إلى ${metaStr(m.to) || '—'} فيديو`
    case 'slot_moved': {
      const slotTitle = detail.slots.find((s) => s.slot.id === m.slot_id)?.slot.title ?? ''
      return `${slotTitle}: "${KANBAN_LABEL[m.from as KanbanStatus] ?? metaStr(m.from)}" ← "${KANBAN_LABEL[m.to as KanbanStatus] ?? metaStr(m.to)}"`
    }
    case 'slot_created':
      return `${metaStr(m.title) || 'بطاقة جديدة'} (${KANBAN_LABEL[m.to as KanbanStatus] ?? metaStr(m.to)})`
    case 'slot_updated':
      return metaStr(m.title)
    case 'slot_paused':
      return `${metaStr(m.paused) || '0'} فيديو مجمد (الخطة أصبحت ${metaStr(m.count) || '—'})`
    case 'task_created':
    case 'task_updated':
    case 'task_status':
    case 'task_deleted':
      return metaStr(m.title)
    case 'project_archived':
      return m.from ? `كانت الحالة: "${PROJECT_STATUS_LABEL[m.from as ProjectStatus] ?? m.from}"` : ''
    case 'project_unarchived':
      return m.to ? `أصبحت الحالة: "${PROJECT_STATUS_LABEL[m.to as ProjectStatus] ?? m.to}"` : ''
    default:
      return ''
  }
}

//----------------------------------------------------------------------------
// Styles
//----------------------------------------------------------------------------

const PROJECT_CSS = `
<style>
  .code-chip{font-size:.72rem;font-weight:750;color:var(--text-muted);background:var(--bg-tertiary);border:1px solid var(--line-default);border-radius:var(--radius-full);padding:.1rem .55rem;white-space:nowrap;direction:ltr}
  .chips-row{display:flex;align-items:center;gap:.55rem;flex-wrap:wrap;margin-top:.55rem}
  .chip-link,.chip-static{display:inline-flex;align-items:center;gap:.35rem;padding:.28rem .7rem;border-radius:var(--radius-full);border:1px solid var(--line-default);background:var(--surface-elevated);font-size:.8rem;font-weight:650;color:var(--text-secondary);text-decoration:none!important}
  .chip-link:hover{background:var(--bg-tertiary)}
  .ws-actions{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap}
  .ws-status{padding:.55rem .8rem;border:1px solid var(--line-strong);border-radius:var(--radius-md);background:#fff;font-family:inherit;font-size:.9rem;font-weight:650;color:var(--text-primary);cursor:pointer}

  .count-chip{display:inline-flex;align-items:center;padding:.26rem .65rem;border-radius:var(--radius-full);background:var(--accent-light);color:var(--accent);font-size:.8rem;font-weight:800;white-space:nowrap}
  .cnt-sep{color:var(--text-subtle);font-size:.9rem}
  .cnt-sep.strong{display:none}
  .ws-title-row{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;margin-top:.3rem}
  .ws-head{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-bottom:.55rem}

  .ws-seg{display:flex;gap:.3rem;padding:.25rem;background:var(--bg-tertiary);border:1px solid var(--line-subtle);border-radius:var(--radius-lg);width:max-content;max-width:100%;overflow-x:auto;margin:0 0 .85rem}
  .ws-seg-btn{display:inline-flex;align-items:center;gap:.4rem;padding:.4rem .85rem;border-radius:var(--radius-md);color:var(--text-secondary);font-weight:700;font-size:.86rem;text-decoration:none!important;white-space:nowrap;transition:background var(--transition-fast),color var(--transition-fast)}
  .ws-seg-btn .n{font-size:.72rem;background:var(--surface-elevated);border:1px solid var(--line-default);border-radius:var(--radius-full);padding:.02rem .45rem;font-weight:750;color:var(--text-secondary)}
  .ws-seg-btn:hover{color:var(--text-primary);background:var(--surface-elevated)}
  .ws-seg-btn.current{background:var(--surface-elevated);color:var(--accent);box-shadow:var(--shadow-sm)}
  .ws-seg-btn.current .n{background:var(--accent-light);color:var(--accent);border-color:var(--accent-light)}

  .dmenu{position:relative}
  .dmenu-panel{position:absolute;inset-inline-end:0;top:calc(100% + .4rem);min-width:190px;background:var(--surface-elevated);border:1px solid var(--line-default);border-radius:var(--radius-lg);box-shadow:var(--shadow-md);padding:.35rem;display:none;z-index:40}
  .dmenu.open .dmenu-panel{display:block}
  .dmenu-item{display:flex;align-items:center;gap:.5rem;width:100%;padding:.5rem .7rem;border:0;background:transparent;border-radius:var(--radius-md);font-family:inherit;font-size:.86rem;font-weight:650;color:var(--text-primary);cursor:pointer;text-align:start}
  .dmenu-item:hover{background:var(--bg-tertiary)}
  .dmenu-trigger{display:inline-flex}

  .ppill{display:inline-flex;align-items:center;padding:.24rem .7rem;border-radius:var(--radius-full);font-size:.8rem;font-weight:750;border:1px solid transparent;white-space:nowrap}
  .pp-new{background:#E9E3F5;color:#5A44B0;border-color:#D5C9F0}
  .pp-contacted{background:#E6F0F9;color:#24567D;border-color:#C6D8EA}
  .pp-booked{background:#FBF0D9;color:#8A6A1F;border-color:#EFDCB0}
  .pp-shooting{background:#EAF2E7;color:#2F6B3E;border-color:#C9DCC4}
  .pp-editing{background:#F5EAE1;color:#9A5A2A;border-color:#E7D0BE}
  .pp-review{background:#EDE3F8;color:#6A3BA0;border-color:#D9C3F0}
  .pp-delivery{background:#E3EDF7;color:#1F5A9E;border-color:#C3D9EE}
  .pp-completed{background:rgba(47,125,90,.1);color:var(--success);border-color:rgba(47,125,90,.28)}
  .pp-archived{background:var(--bg-secondary);color:var(--text-muted);border-color:var(--line-strong)}

  .mini-prog{display:inline-flex;align-items:center;gap:.55rem;min-width:6rem}
  .mini-prog-track{flex:1;height:7px;border-radius:var(--radius-full);background:var(--bg-tertiary);overflow:hidden;min-width:3rem}
  .mini-prog-bar{height:100%;background:var(--gradient);border-radius:var(--radius-full)}
  .mini-prog-n{font-size:.78rem;font-weight:750;color:var(--text-muted);white-space:nowrap}
  .date-chip{display:inline-flex;align-items:center;gap:.35rem;padding:.25rem .7rem;border-radius:var(--radius-full);border:1px solid var(--line-default);background:var(--surface-elevated);color:var(--text-muted);font-size:.8rem;font-weight:650;white-space:nowrap}
  .date-chip.today{background:rgba(47,125,90,.1);color:var(--success);border-color:rgba(47,125,90,.28)}

  .ws-tabs{display:flex;gap:.35rem;flex-wrap:wrap;margin:0 0 1.2rem;border-bottom:1px solid var(--line-default)}
  .ws-tab{display:inline-flex;align-items:center;gap:.35rem;padding:.6rem .9rem;font-size:.92rem;font-weight:700;color:var(--text-muted);text-decoration:none!important;border-bottom:2px solid transparent;margin-bottom:-1px}
  .ws-tab .n{font-size:.72rem;background:var(--bg-tertiary);border-radius:var(--radius-full);padding:.05rem .5rem;font-weight:750;color:var(--text-secondary)}
  .ws-tab:hover{color:var(--text-primary);background:var(--bg-tertiary)}
  .ws-tab.current{color:var(--accent);border-bottom-color:var(--accent)}
  .ws-tab.current .n{background:var(--accent-light);color:var(--accent)}
  .hr-subtle{border:0;border-top:1px solid var(--line-subtle);margin:1rem 0}

  .wa-text{white-space:pre-wrap;background:var(--bg-primary);border:1px solid var(--line-default);border-radius:var(--radius-md);padding:.7rem .85rem;font-size:.86rem;color:var(--text-secondary);margin-bottom:.7rem;line-height:1.8}
  .badge.pr-high{background:rgba(179,71,63,.08);color:var(--error);border-color:rgba(179,71,63,.24)}
  .badge.pr-med{background:var(--bg-secondary);color:var(--text-secondary);border-color:var(--line-default)}
  .badge.pr-low{background:var(--bg-secondary);color:var(--text-muted);border-color:var(--line-default)}
  .v-chip{display:inline-flex;align-items:center;gap:.25rem;padding:.15rem .5rem;border-radius:var(--radius-full);background:var(--bg-secondary);color:var(--text-muted);font-size:.72rem;font-weight:700;white-space:nowrap}
  .btn-text.danger{color:var(--error)}
  .btn-text.danger:hover{background:rgba(179,71,63,.06)}

  /* Trello-style board (Phase 4P) — the ONLY element allowed to scroll horizontally */
  .b-toolbar{display:flex;align-items:center;justify-content:space-between;gap:.8rem;flex-wrap:wrap;margin-bottom:.8rem}
  .b-filters{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}
  .bf-input{padding:.5rem .7rem;border:1px solid var(--line-strong);border-radius:var(--radius-md);background:#fff;font-family:inherit;font-size:.85rem;color:var(--text-primary);min-width:0}
  #bf-q{width:min(240px,28vw)}
  .bf-input:focus{outline:2px solid var(--accent-light);outline-offset:1px}
  .b-root{width:100%;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;padding-bottom:.35rem}
  .b-board{display:flex;gap:.8rem;min-width:max-content}
  .b-col{flex:1 1 270px;min-width:260px;max-width:330px;background:var(--bg-secondary);border:1px solid var(--line-subtle);border-radius:var(--radius-lg);padding:.6rem;display:flex;flex-direction:column;transition:background var(--transition-fast),border-color var(--transition-fast)}
  .b-col.over{background:var(--accent-light);border-color:var(--accent)}
  .b-col-head{display:flex;align-items:center;gap:.45rem;padding:.15rem .25rem .5rem}
  .b-dot{width:9px;height:9px;border-radius:50%;flex:none}
  .b-col-label{font-weight:750;font-size:.85rem}
  .b-col-count{margin-inline-start:auto;background:var(--surface-elevated);border:1px solid var(--line-default);border-radius:var(--radius-full);font-size:.74rem;font-weight:750;color:var(--text-muted);padding:.05rem .5rem}
  .b-drop{display:flex;flex-direction:column;gap:.6rem;min-height:4rem;flex:1}
  .b-card{background:var(--surface-elevated);border:1px solid var(--line-default);border-radius:var(--radius-lg);box-shadow:var(--shadow-sm);overflow:hidden;cursor:grab;transition:transform var(--transition-fast),box-shadow var(--transition-fast)}
  .b-card:hover{box-shadow:var(--shadow-md)}
  .b-card.dragging{opacity:.55;transform:scale(.98)}
  .b-card *{cursor:grab}
  .b-thumb{position:relative;height:86px;display:flex;align-items:center;justify-content:center;overflow:hidden}
  .b-thumb img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
  .b-num{color:#fff;font-weight:800;font-size:1rem;text-shadow:0 1px 6px rgba(0,0,0,.35)}
  .b-play{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;background:rgba(20,18,26,.0)}
  .b-body{padding:.6rem .75rem .7rem;display:flex;flex-direction:column;gap:.45rem}
  .b-tags{display:flex;gap:.35rem;flex-wrap:wrap;align-items:center}
  .b-label{display:inline-flex;align-items:center;color:#fff;font-size:.68rem;font-weight:800;border-radius:var(--radius-sm);padding:.14rem .5rem;white-space:nowrap}
  .b-title{font-weight:750;font-size:.92rem}
  .b-meta{display:flex;align-items:center;gap:.45rem;flex-wrap:wrap;font-size:.74rem;color:var(--text-muted)}
  .b-meta span{display:inline-flex;align-items:center;gap:.25rem;min-width:0}
  .b-note{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:9rem}
  .b-dotsep{width:3px;height:3px;border-radius:50%;background:var(--text-muted);flex:none}
  .b-deadline{white-space:nowrap}
  .b-deadline.soon{color:var(--error);font-weight:700}
  .b-chk{display:flex;align-items:center;gap:.5rem}
  .b-chk-track{flex:1;height:6px;border-radius:var(--radius-full);background:var(--bg-tertiary);overflow:hidden}
  .b-chk-bar{height:100%;background:var(--gradient);border-radius:var(--radius-full)}
  .b-chk-n{font-size:.72rem;font-weight:800;color:var(--text-muted);white-space:nowrap}
  .b-addbar{padding-top:.5rem}
  .b-add-btn{display:flex;align-items:center;justify-content:center;gap:.4rem;width:100%;padding:.45rem .6rem;border:1px dashed var(--line-strong);border-radius:var(--radius-md);background:transparent;color:var(--text-muted);font-family:inherit;font-size:.8rem;font-weight:700;cursor:pointer;transition:background var(--transition-fast),color var(--transition-fast)}
  .b-add-btn:hover{background:var(--surface-elevated);color:var(--accent)}
  .b-add-form{display:flex;flex-direction:column;gap:.5rem;margin-top:.35rem}
  .b-add-form[hidden]{display:none!important}
  .b-add-form .field{margin:0}
  .b-add-form .field>span{font-size:.74rem}
  .b-add-form input,.b-add-form select{padding:.42rem .55rem;font-size:.8rem;border:1px solid var(--line-strong);border-radius:var(--radius-sm);background:#fff;font-family:inherit;color:var(--text-primary)}
  .b-add-form .form-grid{gap:.5rem}
  .b-add-form .actionbar{margin:0}
  .btn-sm{padding:.42rem .7rem;font-size:.8rem}

  .kb-states{display:flex;align-items:center;gap:.4rem;flex-wrap:wrap}
  .kb-actions{display:flex;align-items:center;gap:.4rem;flex-wrap:wrap}
  .kb-actions .btn{padding:.34rem .6rem;font-size:.78rem}
  .kb-move{padding:.38rem .55rem;border:1px solid var(--line-strong);border-radius:var(--radius-sm);background:#fff;font-size:.8rem;font-family:inherit;color:var(--text-primary);cursor:pointer}

  /* Phase 4P: full-viewport board layout */
  body.ws-full{height:100dvh;overflow:hidden}
  body.ws-full .dash-root{height:100dvh;grid-template-rows:minmax(0,1fr)}
  body.ws-full .dash-main{height:100dvh;overflow:hidden}
  body.ws-full .content{max-width:2200px;padding:1.1rem 1.25rem 1.25rem;display:flex;flex-direction:column;flex:1;min-height:0}
  body.ws-full .dash-foot{display:none}
  body.ws-full .ws-body{flex:1 1 auto;min-height:0;display:flex;flex-direction:column}
  body.ws-full .ws-tab-details,body.ws-full .ws-tab-activity{overflow-y:auto}
  body.ws-full .ws-tab-board .b-root{flex:1 1 auto;min-height:0;overflow-x:auto;overflow-y:hidden}
  body.ws-full .ws-tab-board .b-board{height:100%;align-items:stretch}
  body.ws-full .ws-tab-board .b-col{flex:0 0 280px;min-width:0;max-width:none;height:auto;max-height:100%}
  body.ws-full .ws-tab-board .b-drop{overflow-y:auto;min-height:0;flex:1 1 auto;overscroll-behavior:contain}
  .b-root{scroll-snap-type:x proximity}
  .b-col{scroll-snap-align:start}
  .b-ph{border-radius:var(--radius-lg);border:2px dashed var(--accent);background:var(--accent-light);flex:none}
  .b-toast{position:fixed;bottom:1.2rem;inset-inline:0;margin-inline:auto;width:max-content;max-width:min(92vw,420px);background:#2A2438;color:#fff;padding:.7rem 1.1rem;border-radius:var(--radius-lg);font-size:.86rem;font-weight:700;box-shadow:var(--shadow-lg);opacity:0;pointer-events:none;transition:opacity var(--transition-fast);z-index:80;text-align:center}
  .b-toast.show{opacity:1}
  body.b-dragging{user-select:none}
  body.b-dragging .b-card.dragging{cursor:grabbing}

  /* Card detail modal (Phase 4P) */
  .cd-box{width:min(880px,94vw)}
  .cd-loading{padding:2.4rem 1.4rem;text-align:center;color:var(--text-muted)}
  .cd-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,340px);gap:1.2rem;padding:.2rem .2rem .4rem}
  .cd-title{margin:0 0 .9rem;font-size:1.05rem;display:flex;align-items:center;gap:.5rem}
  .cd-section{margin-top:1.1rem}
  .cd-section-head{display:flex;align-items:center;gap:.4rem;font-weight:750;font-size:.88rem;margin-bottom:.55rem}
  .cd-moves{display:flex;flex-wrap:wrap;gap:.4rem}
  .cd-move{padding:.4rem .7rem;border:1px solid var(--line-strong);border-radius:var(--radius-full);background:var(--surface-elevated);font-family:inherit;font-size:.8rem;font-weight:700;color:var(--text-secondary);cursor:pointer}
  .cd-move:hover{background:var(--bg-tertiary)}
  .cd-move.current{background:var(--accent);color:#fff;border-color:var(--accent)}
  .cd-addtask-row{display:flex;gap:.5rem;align-items:center}
  .cd-addtask-input{flex:1;min-width:0;padding:.5rem .7rem;border:1px solid var(--line-strong);border-radius:var(--radius-md);font-family:inherit;font-size:.85rem}
  .cd-addtask-assignee{padding:.5rem .6rem;border:1px solid var(--line-strong);border-radius:var(--radius-md);background:#fff;font-family:inherit;font-size:.82rem}
  .cd-tasks{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.3rem}
  .cd-task{display:flex;align-items:center;gap:.5rem;padding:.4rem .5rem;border:1px solid var(--line-subtle);border-radius:var(--radius-md);background:var(--bg-primary)}
  .cd-task.done{opacity:.55}
  .cd-task.done .cd-task-title{text-decoration:line-through}
  .cd-task-row{display:flex;align-items:center;gap:.5rem;flex:1;min-width:0;cursor:pointer}
  .cd-task-check{width:16px;height:16px;accent-color:var(--success);cursor:pointer;flex:none}
  .cd-task-title{font-size:.88rem;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .cd-empty{list-style:none;padding:.4rem 0}
  .cd-deliver{border:1px solid var(--line-default);border-radius:var(--radius-lg);padding:.7rem .8rem;margin-top:1.1rem;display:flex;flex-direction:column;gap:.5rem;background:var(--surface-elevated)}
  .cd-deliver-head{display:flex;align-items:center;gap:.4rem;font-weight:750;font-size:.85rem}
  .cd-activity{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.35rem}
  .cd-activity .act-row{display:flex;flex-direction:column;gap:.1rem;padding:.35rem .4rem;border-radius:var(--radius-sm);background:var(--bg-primary);border:1px solid var(--line-subtle)}
  .cd-activity .act-tag{font-size:.76rem;font-weight:750}
  .cd-activity .act-desc{font-size:.74rem;color:var(--text-muted)}
  .cd-activity .act-time{font-size:.68rem;color:var(--text-muted);opacity:.8}
  .rv-list{list-style:none;margin:0 0 .5rem;padding:0;display:flex;flex-direction:column;gap:.45rem}
  .rv-row{display:flex;flex-direction:column;gap:.25rem;padding:.5rem .6rem;border:1px solid var(--line-subtle);border-radius:var(--radius-md);background:var(--bg-primary)}
  .rv-head{display:flex;align-items:center;justify-content:space-between;gap:.5rem;flex-wrap:wrap}
  .rv-reason{font-size:.82rem;color:var(--text-primary);line-height:1.5}
  .rv-time{font-size:.7rem;color:var(--text-muted)}
  .rv-meta{font-size:.7rem;color:var(--text-muted)}

  /* Task board */
  .t-root{width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:.35rem}
  .t-board{display:flex;gap:.8rem;min-width:max-content}
  .t-col{flex:1 1 240px;min-width:230px;max-width:300px;background:var(--bg-secondary);border:1px solid var(--line-subtle);border-radius:var(--radius-lg);padding:.6rem;display:flex;flex-direction:column}
  .t-col-head{display:flex;align-items:center;gap:.45rem;padding:.15rem .25rem .5rem}
  .t-label{font-weight:750;font-size:.85rem}
  .t-count{background:var(--surface-elevated);border:1px solid var(--line-default);border-radius:var(--radius-full);font-size:.74rem;font-weight:750;color:var(--text-muted);padding:.05rem .5rem}
  .t-drop{display:flex;flex-direction:column;gap:.55rem;min-height:3rem}
  .t-empty{text-align:center;padding:.9rem 0}
  .t-card{background:var(--surface-elevated);border:1px solid var(--line-default);border-radius:var(--radius-md);box-shadow:var(--shadow-sm);padding:.6rem .7rem;display:flex;flex-direction:column;gap:.45rem}
  .t-card.done{opacity:.6}
  .t-card.done .t-title{text-decoration:line-through}
  .t-top{display:flex;align-items:flex-start;justify-content:space-between;gap:.5rem}
  .t-title{font-weight:700;font-size:.9rem;min-width:0}
  .t-meta{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;font-size:.76rem;color:var(--text-muted)}
  .t-actions{display:flex;align-items:center;gap:.3rem;flex-wrap:wrap}
  .t-actions .btn{padding:.3rem .5rem;font-size:.76rem}
  .t-actions .kb-move{padding:.32rem .4rem;font-size:.76rem}

  @media (max-width:767px){
    .ws-actions{width:100%}
    .ws-status{flex:1}
    .ws-seg{width:100%}
    .ws-seg-btn{flex:1;justify-content:center}
    .dmenu-panel{min-width:170px}
    body.ws-full .dash-main{height:100dvh}
    body.ws-full .content{padding:.95rem .85rem 1rem}
    body.ws-full .ws-tab-board .b-col{flex-basis:min(82vw,280px)}
    .b-col{min-width:244px}
    .t-col{min-width:220px}
    .cd-grid{grid-template-columns:1fr;gap:.8rem}
    .lm-modal{padding:0}
    .cd-box{width:100vw;max-width:100vw;height:100dvh;max-height:100dvh;border-radius:0;overflow:auto;margin:0;flex:none}
    .cd-addtask-row{flex-wrap:wrap}
    .cd-addtask-row .btn{flex:1}
    #bf-q{width:100%}
  }
  @media (max-width:479px){
    .b-thumb{height:78px}
    .kb-actions .btn-text{flex:1}
    .cd-addtask-assignee{flex:1}
  }
</style>`

//----------------------------------------------------------------------------
// Scripts
//----------------------------------------------------------------------------

const MODAL_SCRIPT = `<script>
(function(){
  document.addEventListener('click', function(e){
    var opener=e.target.closest('[data-open-modal]');
    var closer=e.target.closest('[data-close-modal]');
    if(opener){ closeAll(); var id=opener.getAttribute('data-open-modal'); var m=document.getElementById(id); if(m)m.classList.add('open'); return; }
    if(closer){ var id=closer.getAttribute('data-close-modal'); var m=document.getElementById(id); if(m)m.classList.remove('open'); return; }
  });
  function closeAll(){ document.querySelectorAll('.lm-modal').forEach(function(m){m.classList.remove('open')}) }
  document.addEventListener('keydown', function(e){ if(e.key==='Escape'){ document.querySelectorAll('.lm-modal').forEach(function(m){m.classList.remove('open')}) } });
})();
</script>`

const DMENU_SCRIPT = `<script>
(function(){
  function closeMenus(){ document.querySelectorAll('.dmenu.open').forEach(function(d){ d.classList.remove('open'); }); }
  document.addEventListener('click', function(e){
    var btn=e.target.closest('[data-dmenu-toggle]');
    if(btn){
      e.preventDefault();
      e.stopPropagation();
      var wrap=btn.closest('.dmenu')||btn.parentElement;
      if(!wrap)return;
      if(wrap.classList.contains('open')){ wrap.classList.remove('open'); return; }
      closeMenus();
      wrap.classList.add('open');
      return;
    }
    if(!e.target.closest('.dmenu'))closeMenus();
  });
  document.addEventListener('keydown', function(e){ if(e.key==='Escape')closeMenus(); });
})();
</script>`

const BOARD_SCRIPT = `<script>
(function(){
  var root=document.getElementById('b-root');
  if(!root)return;
  var dragging=null;
  var draggingCard=null;
  var snapshot=null;
  var scrollRaf=0;

  function colFor(status){ return root.querySelector('.b-col[data-status="'+status+'"]'); }
  function findCard(id){ return root.querySelector('.b-card[data-slot-id="'+id+'"]'); }
  function cardsIn(col){
    var out=[];
    Array.prototype.forEach.call(col.querySelectorAll('.b-drop > .b-card'), function(c){
      var id=c.getAttribute('data-slot-id');
      if(id&&out.indexOf(id)===-1)out.push(id);
    });
    return out;
  }
  function refreshCounts(){
    Array.prototype.forEach.call(root.querySelectorAll('.b-col'), function(col){
      var visible=0;
      Array.prototype.forEach.call(col.querySelectorAll('.b-card'), function(c){ if(c.style.display!=='none')visible++; });
      var badge=col.querySelector('.b-col-count');
      if(badge)badge.textContent=String(visible);
    });
  }
  function showToast(msg){
    var t=document.getElementById('b-toast');
    if(!t){
      t=document.createElement('div');
      t.id='b-toast';
      t.className='b-toast';
      document.body.appendChild(t);
    }
    t.textContent=msg;
    t.classList.add('show');
    window.clearTimeout(showToast._t);
    showToast._t=window.setTimeout(function(){ t.classList.remove('show'); }, 4600);
  }
  function takeSnapshot(){
    var snap=[];
    Array.prototype.forEach.call(root.querySelectorAll('.b-board > .b-col'), function(col){
      Array.prototype.forEach.call(col.querySelectorAll('.b-drop > .b-card'), function(c){
        snap.push([c.getAttribute('data-slot-id'), col.getAttribute('data-status')]);
      });
    });
    return snap;
  }
  function restoreSnapshot(snap){
    if(!snap)return;
    var byId={};
    Array.prototype.forEach.call(root.querySelectorAll('.b-card'), function(c){ byId[c.getAttribute('data-slot-id')]=c; });
    Array.prototype.forEach.call(root.querySelectorAll('.b-board > .b-col'), function(col){
      var drop=col.querySelector('.b-drop');
      while(drop.firstChild)drop.removeChild(drop.firstChild);
    });
    snap.forEach(function(entry){
      var card=byId[entry[0]];
      var col=root.querySelector('.b-col[data-status="'+entry[1]+'"]');
      if(card&&col)col.querySelector('.b-drop').appendChild(card);
    });
    refreshCounts();
  }
  function applyMove(slotId,status,idx){
    var card=findCard(slotId);
    if(!card)return null;
    var col=colFor(status);
    if(!col)return null;
    var drop=col.querySelector('.b-drop');
    var list=cardsIn(col).filter(function(id){ return id!==slotId; });
    if(idx===null||idx===undefined||idx<0||idx>list.length)idx=list.length;
    list.splice(idx,0,slotId);
    var byId={};
    Array.prototype.forEach.call(root.querySelectorAll('.b-card'), function(c){ byId[c.getAttribute('data-slot-id')]=c; });
    while(drop.firstChild)drop.removeChild(drop.firstChild);
    Array.prototype.forEach.call(list, function(id){ if(byId[id])drop.appendChild(byId[id]); });
    card.setAttribute('data-status',status);
    card.style.display='';
    refreshCounts();
    return list;
  }
  function persistMove(slotId,status,order){
    var body=new URLSearchParams();
    body.append('action','move_slot');
    body.append('slot_id',slotId);
    body.append('status',status);
    body.append('tab','board');
    if(order&&order.length)body.append('order',order.join(','));
    return fetch(location.pathname,{
      method:'POST',
      headers:{ 'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8', 'X-Requested-With':'fetch' },
      credentials:'same-origin',
      body:body.toString()
    }).then(function(r){
      if(!r.ok)throw new Error('server '+r.status);
      return r;
    });
  }

  function findPlaceholder(col){
    var drop=col.querySelector('.b-drop');
    var ph=null;
    for(var i=0;i<drop.children.length;i++){
      var el=drop.children[i];
      if(el.nodeType===1&&el.className==='b-ph'){ ph=el; break; }
    }
    return ph;
  }
  function clearPlaceholder(){
    Array.prototype.forEach.call(root.querySelectorAll('.b-ph'), function(ph){ ph.remove(); });
  }
  function placePlaceholder(col,clientY){
    var drop=col.querySelector('.b-drop');
    var ph=findPlaceholder(col);
    if(!ph){
      ph=document.createElement('div');
      ph.className='b-ph';
      drop.appendChild(ph);
    }
    var h=draggingCard?Math.max(44,draggingCard.offsetHeight):56;
    ph.style.height=h+'px';
    var ids=cardsIn(col).filter(function(id){ return id!==dragging; });
    var idx=ids.length;
    for(var i=0;i<ids.length;i++){
      var card=findCard(ids[i]);
      if(!card)continue;
      var r=card.getBoundingClientRect();
      if(clientY<r.top+r.height/2){ idx=i; break; }
    }
    var ref=idx<ids.length?findCard(ids[idx]):null;
    if(ref){ if(ph.nextSibling!==ref)drop.insertBefore(ph,ref); }
    else if(ph!==drop.lastChild){ drop.appendChild(ph); }
    return idx;
  }
  function maybeAutoScroll(e){
    if(scrollRaf)return;
    scrollRaf=requestAnimationFrame(function(){
      scrollRaf=0;
      var rect=root.getBoundingClientRect();
      var rtl=(getComputedStyle(root).direction==='rtl');
      var step=14;
      if(e.clientX<rect.left+40){ root.scrollLeft+=(rtl?step:-step); }
      else if(e.clientX>rect.right-40){ root.scrollLeft+=(rtl?-step:step); }
      var col=e.target.closest?e.target.closest('.b-col'):null;
      if(!col){
        var over=document.querySelector('.b-col.over');
        if(over)col=over;
      }
      if(col){
        var drop=col.querySelector('.b-drop');
        var dr=drop.getBoundingClientRect();
        if(e.clientY<dr.top+34)drop.scrollTop-=16;
        else if(e.clientY>dr.bottom-34)drop.scrollTop+=16;
      }
    });
  }

  root.addEventListener('dragstart', function(e){
    var card=e.target.closest('.b-card');
    if(!card)return;
    dragging=card.getAttribute('data-slot-id');
    draggingCard=card;
    snapshot=takeSnapshot();
    e.dataTransfer.setData('text/plain', String(dragging));
    e.dataTransfer.effectAllowed='move';
    window.setTimeout(function(){ card.classList.add('dragging'); }, 0);
    document.body.classList.add('b-dragging');
  });
  root.addEventListener('dragend', function(e){
    var card=e.target.closest('.b-card');
    if(card)card.classList.remove('dragging');
    else if(draggingCard)draggingCard.classList.remove('dragging');
    clearPlaceholder();
    Array.prototype.forEach.call(root.querySelectorAll('.b-col'), function(c){ c.classList.remove('over') });
    if(!root.dataset.moved&&snapshot){
      restoreSnapshot(snapshot);
    }
    root.dataset.moved='';
    document.body.classList.remove('b-dragging');
    dragging=null; draggingCard=null; snapshot=null;
  });
  root.addEventListener('dragover', function(e){
    var col=e.target.closest('.b-col');
    if(!col)return;
    e.preventDefault();
    e.dataTransfer.dropEffect='move';
    Array.prototype.forEach.call(root.querySelectorAll('.b-col'), function(c){ c.classList.remove('over') });
    col.classList.add('over');
    placePlaceholder(col,e.clientY);
    maybeAutoScroll(e);
  });
  root.addEventListener('dragleave', function(e){
    var col=e.target.closest('.b-col');
    if(col)col.classList.remove('over');
  });
  root.addEventListener('drop', function(e){
    e.preventDefault();
    var col=e.target.closest('.b-col');
    if(!col||!dragging)return;
    var status=col.getAttribute('data-status');
    var idx=placePlaceholder(col,e.clientY);
    var order=applyMove(dragging,status,idx);
    clearPlaceholder();
    var snap=snapshot;
    var id=dragging;
    root.dataset.moved='1';
    dragging=null; draggingCard=null; snapshot=null;
    persistMove(id,status,order).catch(function(){
      restoreSnapshot(snap);
      showToast('تعذّر حفظ الترتيب على الخادم — أُعيدت البطاقة لمكانها.');
    });
  });

  window.boardMove=function(sel,slotId){
    var status=sel.value;
    var card=findCard(slotId);
    if(card&&card.getAttribute('data-status')===status&&!sel.dataset.force){ return; }
    applyMove(slotId,status);
    persistMove(slotId,status,cardsIn(colFor(status))).catch(function(){
      if(card)applyMove(slotId,card.getAttribute('data-status'));
      showToast('تعذّر حفظ النقل — أُعيدت البطاقة لحالتها السابقة.');
    });
  };

  root.addEventListener('click', function(e){
    var add=e.target.closest('[data-add-toggle]');
    var cancel=e.target.closest('[data-add-cancel]');
    if(add){
      var status=add.getAttribute('data-add-toggle');
      var col=colFor(status);
      var form=col?.querySelector('.b-add-form');
      if(form){
        form.hidden=!form.hidden;
        add.style.display=form.hidden?'':'none';
        if(!form.hidden){ var inp=form.querySelector('input[name="title"]')||form.querySelector('input'); if(inp)inp.focus(); }
      }
      return;
    }
    if(cancel){
      var cid=cancel.getAttribute('data-add-cancel');
      var cold=colFor(cid);
      if(cold){
        var f2=cold.querySelector('.b-add-form');
        var b2=cold.querySelector('[data-add-toggle]');
        if(f2)f2.hidden=true;
        if(b2)b2.style.display='';
      }
    }
  });

  var q=document.getElementById('bf-q');
  var fm=document.getElementById('bf-model');
  var fd=document.getElementById('bf-delivery');
  var fs=document.getElementById('bf-status');
  var fc=document.getElementById('bf-clear');
  function applyFilters(){
    var query=(q?.value||'').trim().toLowerCase();
    var model=(fm?.value||'').toLowerCase();
    var delivery=fd?.value||'';
    var status=fs?.value||'';
    Array.prototype.forEach.call(root.querySelectorAll('.b-card'), function(c){
      var show=true;
      if(query){ show=show&&(c.getAttribute('data-title')||'').indexOf(query)!==-1; }
      if(model){ show=show&&(c.getAttribute('data-model')||'')===model; }
      if(delivery){
        if(delivery==='none'){ show=show&&c.getAttribute('data-delivery')==='none'; }
        else if(delivery==='prepared'){ show=show&&c.getAttribute('data-delivery')!=='none'; }
        else if(delivery==='uploaded'){ show=show&&c.getAttribute('data-uploaded')==='1'; }
      }
      c.style.display=show?'':'none';
    });
    Array.prototype.forEach.call(root.querySelectorAll('.b-col'), function(col){
      var match=!status||col.getAttribute('data-status')===status;
      col.style.display=match?'':'none';
    });
    refreshCounts();
  }
  if(q)q.addEventListener('input',applyFilters);
  if(fm)fm.addEventListener('change',applyFilters);
  if(fd)fd.addEventListener('change',applyFilters);
  if(fs)fs.addEventListener('change',applyFilters);
  if(fc)fc.addEventListener('click',function(){
    if(q)q.value='';
    if(fm)fm.value='';
    if(fd)fd.value='';
    if(fs)fs.value='';
    applyFilters();
  });
})();
</script>`

const CARD_SCRIPT = `<script>
(function(){
  var PROJECT_ID=(location.pathname.match(/\\/admin\\/projects\\/([0-9a-fA-F-]{36})\\/?$/)||[])[1]||'';
  function esc(v){ return String(v).replace(/[&<>"']/g, function(c){ return c==='&'?'&amp;':c==='<'?'&lt;':c==='>'?'&gt;':c==='"'?'&quot;':'&#39;'; }); }

  function ensureModal(){
    var m=document.getElementById('cd-modal');
    if(m)return m;
    m=document.createElement('div');
    m.id='cd-modal';
    m.className='lm-modal';
    m.setAttribute('role','dialog');
    m.setAttribute('aria-modal','true');
    m.setAttribute('aria-label','تفاصيل البطاقة');
    m.innerHTML='<div class="lm-modal-backdrop" data-close-modal="cd-modal"></div><div class="lm-box cd-box" id="cd-box"></div>';
    document.body.appendChild(m);
    return m;
  }
  function openModal(){ var m=ensureModal(); m.classList.add('open'); return m; }
  function closeModal(){ var m=ensureModal(); m.classList.remove('open'); }

  function loadCard(slotId){
    var box=openModal().querySelector('#cd-box');
    box.innerHTML='<div class="cd-loading">جارٍ تحميل البطاقة…</div>';
    fetch(location.pathname+'?cd_card='+encodeURIComponent(slotId), { credentials:'same-origin' })
      .then(function(r){ if(!r.ok)throw new Error(String(r.status)); return r.text(); })
      .then(function(html){ box.innerHTML=html; })
      .catch(function(){ box.innerHTML='<p class="cd-loading">تعذّر تحميل البطاقة.</p>'; });
  }

  document.addEventListener('click', function(e){
    var btn=e.target.closest('button[data-card-open], a[data-card-open], [data-open-card]');
    if(btn){ e.preventDefault(); e.stopPropagation(); loadCard(btn.getAttribute('data-card-open')||btn.getAttribute('data-open-card')); return; }
    var card=e.target.closest('.b-card[data-card-trigger]');
    if(card){
      if(e.target.closest('select, button, a, input, textarea, form'))return;
      e.stopPropagation();
      loadCard(card.getAttribute('data-slot-id'));
      return;
    }
  });

  document.addEventListener('keydown', function(e){ if(e.key==='Escape')closeModal(); });

  window.cdMove=function(slotId,status){
    var f=document.createElement('form');
    f.method='post';
    f.action=location.pathname;
    var add=function(n,v){ var i=document.createElement('input'); i.type='hidden'; i.name=n; i.value=String(v); f.appendChild(i); };
    add('action','move_slot'); add('slot_id',slotId); add('status',status); add('tab','board');
    document.body.appendChild(f); f.submit();
  };

  window.cdTaskToggle=function(input,projectId,taskId){
    var row=input.closest('.cd-task');
    var body=new URLSearchParams();
    body.append('action','set_task');
    body.append('task_id',taskId);
    body.append('status',input.checked?'done':'todo');
    body.append('tab','board');
    fetch('/admin/projects/'+projectId,{
      method:'POST',
      headers:{ 'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8', 'X-Requested-With':'fetch' },
      credentials:'same-origin',
      body:body.toString()
    }).then(function(r){
      if(!r.ok)throw new Error('server '+r.status);
      if(row)row.classList.toggle('done',!!input.checked);
      var count=document.querySelector('#cd-box [data-chk-count]');
      if(count){
        var total=0, done=0;
        var box=document.getElementById('cd-box');
        Array.prototype.forEach.call(box?box.querySelectorAll('.cd-task-check'):[], function(cb){ total++; if(cb.checked)done++; });
        count.textContent=done+'/'+total;
      }
    }).catch(function(){ window.setTimeout(function(){ location.reload(); }, 60); });
  };
})();
</script>`

const TASK_SCRIPT = `<script>
window.taskStatus=function(sel,projectId,taskId){
  var f=document.createElement('form');
  f.method='post';
  f.action='/admin/projects/'+projectId;
  var add=function(n,v){ var i=document.createElement('input'); i.type='hidden'; i.name=n; i.value=String(v); f.appendChild(i) };
  add('action','set_task'); add('task_id',taskId); add('status',sel.value); add('tab','details');
  document.body.appendChild(f); f.submit();
};
</script>`

const WORKBENCH_CSS = `
<style>
  .code-chip{font-size:.72rem;font-weight:750;color:var(--text-muted);background:var(--bg-tertiary);border:1px solid var(--line-default);border-radius:var(--radius-full);padding:.1rem .55rem;white-space:nowrap;direction:ltr}
  .ppill{display:inline-flex;align-items:center;padding:.24rem .7rem;border-radius:var(--radius-full);font-size:.8rem;font-weight:750;border:1px solid transparent;white-space:nowrap}
  .pp-new{background:#E9E3F5;color:#5A44B0;border-color:#D5C9F0}
  .pp-contacted{background:#E6F0F9;color:#24567D;border-color:#C6D8EA}
  .pp-booked{background:#FBF0D9;color:#8A6A1F;border-color:#EFDCB0}
  .pp-shooting{background:#EAF2E7;color:#2F6B3E;border-color:#C9DCC4}
  .pp-editing{background:#F5EAE1;color:#9A5A2A;border-color:#E7D0BE}
  .pp-review{background:#EDE3F8;color:#6A3BA0;border-color:#D9C3F0}
  .pp-delivery{background:#E3EDF7;color:#1F5A9E;border-color:#C3D9EE}
  .pp-completed{background:rgba(47,125,90,.1);color:var(--success);border-color:rgba(47,125,90,.28)}
  .pp-archived{background:var(--bg-secondary);color:var(--text-muted);border-color:var(--line-strong)}

  .page-head{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-bottom:1.15rem}
  .page-head h1{font-size:1.5rem;margin:0 0 .2rem}
  .page-head .sub{margin:0;color:var(--text-muted);font-size:.92rem}
  .qas{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}
  .qa{position:relative;display:inline-block}
  .qa-pop{position:absolute;inset-inline-end:0;top:calc(100% + .4rem);width:min(320px,82vw);max-height:min(50vh,22rem);overflow:auto;background:var(--surface-elevated);border:1px solid var(--line-default);border-radius:var(--radius-lg);box-shadow:var(--shadow-md);padding:.4rem;display:none;z-index:60}
  .qa-pop.open{display:block}
  .qa-item{display:flex;align-items:center;justify-content:space-between;gap:.6rem;padding:.5rem .65rem;border-radius:var(--radius-md);text-decoration:none!important;color:var(--text-primary);font-size:.88rem;font-weight:650}
  .qa-item:hover{background:var(--bg-tertiary)}
  .qa-empty{padding:.7rem .8rem;color:var(--text-muted);font-size:.86rem;margin:0}

  .wd-nav{display:flex;align-items:center;justify-content:center;gap:1rem;flex-wrap:wrap;margin-bottom:1.15rem}
  .wd-nav-btn{display:inline-flex;align-items:center;padding:.42rem .85rem;border-radius:var(--radius-full);border:1px solid var(--line-default);background:var(--surface-elevated);color:var(--text-secondary);font-size:.82rem;font-weight:650;text-decoration:none!important}
  .wd-nav-btn:hover{background:var(--bg-tertiary)}
  .wd-nav-btn.accent{background:var(--gradient);color:#fff;border-color:transparent}
  .wd-nav-date{font-weight:800;font-size:.98rem;color:var(--text-primary);padding:.35rem .6rem}

  .wb-sec{margin-bottom:1.3rem}
  .wb-sec-head{display:flex;align-items:center;gap:.6rem;margin-bottom:.8rem}
  .wb-sec-head h2{font-size:1.02rem;font-weight:800;margin:0}
  .wb-count{font-size:.76rem;font-weight:800;color:var(--accent);background:var(--accent-light);padding:.15rem .6rem;border-radius:var(--radius-full)}
  .wb-empty{background:var(--surface-elevated);border:1px dashed var(--line-strong);border-radius:var(--radius-lg);padding:1.4rem 1.2rem;color:var(--text-muted);font-size:.9rem;text-align:center}

  .att-list{display:flex;flex-direction:column;gap:.6rem}
  .att-row{display:flex;align-items:center;gap:.8rem;background:var(--surface-elevated);border:1px solid var(--line-default);border-radius:var(--radius-lg);padding:.8rem .95rem}
  .att-row.lv-high{border-inline-start:4px solid var(--error)}
  .att-row.lv-due{border-inline-start:4px solid #D98A2B}
  .att-row.lv-ready{border-inline-start:4px solid var(--success)}
  .att-ico{flex:none;width:34px;height:34px;border-radius:var(--radius-md);display:inline-flex;align-items:center;justify-content:center}
  .att-row.lv-high .att-ico{background:rgba(179,71,63,.1);color:var(--error)}
  .att-row.lv-due .att-ico{background:rgba(217,138,43,.13);color:#B06A12}
  .att-row.lv-ready .att-ico{background:rgba(47,125,90,.1);color:var(--success)}
  .att-body{flex:1;min-width:0}
  .att-line{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;font-size:.9rem}
  .att-body p{margin:.15rem 0 0;color:var(--text-muted);font-size:.84rem}

  .wb-filter{display:inline-flex;align-items:center;gap:.45rem;padding:.42rem .85rem;border-radius:var(--radius-full);border:1px solid var(--line-default);background:var(--surface-elevated);color:var(--text-secondary);font-size:.84rem;font-weight:700;text-decoration:none!important;transition:background var(--transition-fast),transform .06s ease}
  .wb-filter:hover{background:var(--bg-tertiary)}
  .wb-filter.current{background:var(--gradient);color:#fff;border-color:transparent}
  .wb-filter .n{opacity:.8;font-weight:600}

  .wb-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:1rem}
  .wb-card{display:flex;flex-direction:column;gap:.72rem;background:var(--surface-elevated);border:1px solid var(--line-default);border-radius:var(--radius-xl);padding:1.15rem 1.2rem;box-shadow:var(--shadow-sm)}
  .wb-head{display:flex;align-items:flex-start;justify-content:space-between;gap:.6rem}
  .wb-id{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;min-width:0}
  .wb-name{font-size:1rem;font-weight:800;color:var(--text-primary);text-decoration:none!important}
  .wb-name:hover{color:var(--accent)}
  .wb-client{font-size:.85rem;color:var(--text-secondary);font-weight:650}
  .wb-meta{display:flex;flex-wrap:wrap;gap:.45rem 1rem;font-size:.8rem;color:var(--text-muted)}
  .wb-m{display:inline-flex;align-items:center;gap:.35rem}
  .wb-m.filled{color:var(--success)}
  .wb-prog{display:flex;align-items:center;gap:.6rem}
  .wb-bar{flex:1;height:8px;border-radius:var(--radius-full);background:var(--bg-tertiary);overflow:hidden}
  .wb-fill{height:100%;background:var(--gradient);border-radius:var(--radius-full)}
  .wb-prog-n{font-size:.78rem;font-weight:750;color:var(--text-muted);white-space:nowrap}
  .wb-brk{display:flex;flex-wrap:wrap;gap:.4rem}
  .kbrk{font-size:.72rem;font-weight:750;border-radius:var(--radius-full);padding:.16rem .55rem;border:1px solid var(--line-default);color:var(--text-muted)}
  .kbrk.none{background:var(--bg-secondary)}
  .kbrk.k-todo{background:#E9E3F5;color:#5A44B0;border-color:#D5C9F0}
  .kbrk.k-editing{background:#FBF0D9;color:#8A6A1F;border-color:#EFDCB0}
  .kbrk.k-review{background:#F5EAE1;color:#9A5A2A;border-color:#E7D0BE}
  .kbrk.k-ready{background:#EAF2E7;color:#2F6B3E;border-color:#C9DCC4}
  .kbrk.k-done{background:rgba(47,125,90,.1);color:var(--success);border-color:rgba(47,125,90,.28)}
  .wb-next{font-size:.8rem;color:var(--accent);background:var(--accent-light);border-radius:var(--radius-md);padding:.42rem .7rem}
  .wb-next-hint{color:var(--text-muted);font-weight:650}
  .wb-actions{display:flex;flex-wrap:wrap;gap:.45rem;margin-top:auto}
  .wb-actions .btn{flex:1;min-width:7rem}

  .up-list{display:flex;flex-direction:column}
  .up-row{display:grid;grid-template-columns:auto 1fr auto auto;align-items:center;gap:.9rem;padding:.75rem .4rem;border-bottom:1px solid var(--line-default);text-decoration:none!important;color:var(--text-primary)}
  .up-row:last-child{border-bottom:0}
  .up-row:hover{background:var(--bg-tertiary)}
  .up-date{display:flex;flex-direction:column;min-width:6.2rem}
  .up-date b{font-size:.9rem;color:var(--accent);font-weight:800}
  .up-date span{font-size:.76rem;color:var(--text-muted);white-space:nowrap}
  .up-main{min-width:0}
  .up-main b{font-size:.92rem;font-weight:750}
  .up-client,.up-loc{font-size:.82rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .up-loc{max-width:11rem}

  @media(max-width:860px){
    .up-row{grid-template-columns:auto 1fr;gap:.5rem .9rem}
    .up-client,.up-loc{grid-column:2;white-space:normal}
    .wb-grid{grid-template-columns:1fr}
    .qas{width:100%}
  }
</style>`