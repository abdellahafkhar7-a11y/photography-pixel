import type { AppUserRow } from './types'
import { escapeHtml, shell, shellIcon, statCard } from './shell'
import { modeBadge, sourcePill, statusBadge } from './delivery-views'
import { ACTIVITY_LABEL } from '../deliveries/_helpers'
import { modelBookingWaLink } from '../../_lib/whatsapp'
import type { ClientDetail, ClientListItem } from './clients-data'
import type { DeliveryMode, PaymentStatus, ProjectStatus } from '../../_lib/db-types'
import { PROJECT_STATUS_LABEL } from './projects-data'

//============================================================================
// Phase 4F + Phase 4L + Phase 4N — Clients list + client workspace (Videos
// Slots / Script / Delivery / model WhatsApp booking message).
//============================================================================

const DATE_TIME = new Intl.DateTimeFormat('ar-MA', {
  dateStyle: 'medium',
  timeStyle: 'short',
  numberingSystem: 'latn',
  timeZone: 'Africa/Casablanca',
})

const KANBAN_ORDER = ['todo', 'editing', 'review', 'ready', 'done'] as const

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : DATE_TIME.format(date)
}

function waLink(whatsapp: string): string {
  if (!whatsapp) return '—'
  return `<a dir="ltr" href="https://wa.me/${encodeURIComponent(whatsapp)}" target="_blank" rel="noreferrer noopener">+${escapeHtml(whatsapp)}</a>`
}

function clientStatusPill(status: string | undefined): string {
  if (status === 'archived') return `<span class="badge st-expired">مؤرشف</span>`
  return `<span class="badge st-download">نشط</span>`
}

export type ModelOption = { id: string; name: string; photo: string | null }

export type ClientsListOptions = {
  query?: string
  status?: 'active' | 'archived' | ''
  modelId?: string
  models?: ModelOption[]
  profile?: { name: string; whatsapp: string; modelId: string; count: string; mode: DeliveryMode; script: string }
  notice?: string
  error?: string
}

const STATUS_FILTERS: { value: '' | 'active' | 'archived'; label: string }[] = [
  { value: '', label: 'الكل' },
  { value: 'active', label: 'نشط' },
  { value: 'archived', label: 'مؤرشف' },
]

const MODE_OPTIONS: { value: DeliveryMode; label: string; hint: string }[] = [
  { value: 'VIEW_AND_DOWNLOAD', label: 'عرض وتحميل', hint: 'يشاهد ويؤكد، ثم يُطلق صاحب الموقع التحميل (3 أيام).' },
  { value: 'VIEW_ONLY', label: 'عرض فقط', hint: 'يشاهد ويؤكد فقط — لا تحميل للأصل أبداً.' },
]

function modelBadge(model: ModelOption | null | undefined): string {
  if (!model) return '<span class="muted">—</span>'
  return `<span style="display:inline-flex;align-items:center;gap:.4rem"><span style="font-weight:700">${escapeHtml(model.name)}</span>${model.photo ? `<img src="${escapeHtml(model.photo)}" alt="" style="width:26px;height:34px;object-fit:cover;border-radius:6px">` : ''}</span>`
}

function modelSelect(
  name: string,
  models: ModelOption[],
  selectedId: string,
  allowEmpty: boolean,
): string {
  const options = models.map(
    (model) =>
      `<option value="${model.id}"${model.id === selectedId ? ' selected' : ''}>${escapeHtml(model.name)}</option>`,
  )
  const empty = allowEmpty ? `<option value="">بدون موديل</option>` : ''
  return `<select name="${name}">${empty}${options.join('')}</select>`
}

function modeSelect(selected: DeliveryMode): string {
  return MODE_OPTIONS.map(
    (m) => `<option value="${m.value}"${m.value === selected ? ' selected' : ''}>${m.label}</option>`,
  ).join('')
}

//----------------------------------------------------------------------------
// List
//----------------------------------------------------------------------------

export function renderClients(
  appUser: AppUserRow,
  items: ClientListItem[],
  options: ClientsListOptions = {},
): string {
  const query = (options.query ?? '').trim().toLowerCase()
  const queryDigits = query.replace(/\D/g, '')
  const statusFilter = options.status ?? ''
  const modelFilter = options.modelId ?? ''
  const models = options.models ?? []
  const filtered = query
    ? items.filter(({ client }) => {
        const name = (client.name ?? '').toLowerCase()
        const wa = client.whatsapp_number
        return name.includes(query) || (queryDigits.length > 0 && wa.includes(queryDigits))
      })
    : items

  const totalDeliveries = items.reduce((sum, item) => sum + item.deliveryCount, 0)
  const totalSlots = items.reduce((sum, item) => sum + item.slotCount, 0)

  // Owner-only delete control. It is a <details> panel rather than a bare button
  // so the impact is always visible before it can be submitted, and the impact
  // numbers themselves come from the server (action=inspect_delete) rather than
  // being guessed in the browser.
  const clientDeleteControl = (clientId: string, clientName: string): string => `
    <details class="client-delete">
      <summary class="btn btn-text" style="color:var(--error);cursor:pointer;list-style:none">${shellIcon('ban', 15)} حذف</summary>
      <form method="post" action="/admin/clients" class="card" style="margin-top:.4rem;padding:.7rem;min-width:16rem">
        <input type="hidden" name="action" value="delete">
        <input type="hidden" name="client_id" value="${escapeHtml(clientId)}">
        <p class="hint" style="margin:0 0 .5rem">حذف نهائي. يُحذف ما يخص توصيلات هذا العميل فقط، ولا يمس فيديوهات المعرض العام ولا روابط المشاركة المؤقتة.</p>
        <p class="hint" data-impact-for="${escapeHtml(clientId)}" style="margin:0 0 .5rem">جارٍ فحص الارتباطات…</p>
        <label class="field"><span>اكتب اسم العميل للتأكيد: ${escapeHtml(clientName)}</span>
          <input type="text" name="confirm" required autocomplete="off" placeholder="${escapeHtml(clientName)}">
        </label>
        <div class="actionbar">
          <button class="btn btn-subtle" type="button" data-cancel-delete>إلغاء</button>
          <button class="btn btn-primary" type="submit" style="background:var(--error);border-color:var(--error)" data-delete-submit disabled>تأكيد الحذف</button>
        </div>
      </form>
    </details>`

  const clientDeleteScript = `<script>(function(){
    function closestPanel(node){ var el=node; while(el&&el.tagName!=='DETAILS'){el=el.parentElement} return el }
    Array.prototype.forEach.call(document.querySelectorAll('[data-impact-for]'), function(node){
      var id=node.getAttribute('data-impact-for');
      var details=closestPanel(node);
      if(!details||details.dataset.loaded==='1') return;
      details.dataset.loaded='1';
      var body=new URLSearchParams(); body.set('action','inspect_delete'); body.set('client_id',id);
      fetch('/admin/clients',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body.toString()})
        .then(function(res){return res.json()})
        .then(function(d){
          if(d&&d.error){ node.textContent=d.error; return }
          var parts=[];
          parts.push(d.projects+' مشروع');
          parts.push(d.slots+' مساحة فيديو');
          parts.push(d.deliveries+' توصيل');
          parts.push(d.videos+' فيديو');
          if(d.r2Keys&&d.r2Keys.length) parts.push(d.r2Keys.length+' ملف خاص');
          node.textContent='سيُحذف: '+parts.join(' · ');
          var blocked=d.projects>0||d.slots>0;
          var submit=details.querySelector('[data-delete-submit]');
          if(blocked){ node.textContent+=' — الحذف مرفوض لهذه الحالة، استخدم الأرشفة.'; if(submit) submit.disabled=true }
        })
        .catch(function(){ node.textContent='تعذّر فحص الارتباطات — حدّث الصفحة.' });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-cancel-delete]'), function(btn){
      btn.addEventListener('click', function(){ var d=closestPanel(btn); if(d) d.removeAttribute('open') });
    });
  })();<\/script>`

  const rows =
    filtered.length === 0
      ? `<tr><td colspan="8"><p class="muted" style="padding:.5rem 0">لا يوجد عملاء مطابقون.</p></td></tr>`
      : filtered
          .map(
            ({ client, model, deliveryCount, slotCount, filledSlots, latestDelivery }) => `<tr${client.status === 'archived' ? ' class="row-muted"' : ''}>
              <td><a href="/admin/clients/${client.id}"><strong>${escapeHtml(client.name || '—')}</strong></a></td>
              <td>${modelBadge(model)}</td>
              <td>${waLink(client.whatsapp_number)}</td>
              <td>${clientStatusPill(client.status)}</td>
              <td>${slotCount > 0 ? `${filledSlots}<span class="hint" style="display:block">من أصل ${slotCount} — ${client.video_slots_count} في الخطة</span>` : '<span class="muted">—</span>'}</td>
              <td>${deliveryCount}</td>
              <td>${latestDelivery ? `${statusBadge(latestDelivery.status)}<br><span class="hint">${escapeHtml(formatDateTime(latestDelivery.created_at))}</span>` : '—'}</td>
              <td>
                <span style="display:inline-flex;gap:.35rem;align-items:center;flex-wrap:wrap">
                  <a class="btn btn-subtle" href="/admin/clients/${client.id}">${shellIcon('eye', 15)} فتح</a>
                  ${clientDeleteControl(client.id, client.name ?? '')}
                </span>
              </td>
            </tr>`,
          )
          .join('')

  const filterBar = `<form method="get" action="/admin/clients" class="filter-bar" role="search">
    <label class="field" style="min-width:13rem;flex:1"><span>بحث</span>
      <input type="search" name="q" value="${escapeHtml(options.query ?? '')}" placeholder="اسم العميل أو رقم الواتساب">
    </label>
    <label class="field" style="min-width:9rem"><span>الحالة</span>
      <select name="status">
        ${STATUS_FILTERS.map((s) => `<option value="${s.value}"${s.value === statusFilter ? ' selected' : ''}>${s.label}</option>`).join('')}
      </select>
    </label>
    <label class="field" style="min-width:9rem"><span>الموديل</span>
      <select name="model">${modelSelect('model', models, modelFilter, true)}</select>
    </label>
    <button class="btn btn-subtle" type="submit">${shellIcon('search', 15)} بحث</button>
    <a class="btn btn-text" href="/admin/clients">إعادة تعيين</a>
  </form>`

  const profile = options.profile
  const addForm = `<div class="card" style="margin-bottom:1rem">
    <h2 class="form-card-title">طلب تصوير جديد</h2>
    <form method="post" action="/admin/clients" class="grid2" style="gap:1rem;align-items:end">
      <label class="field"><span>اسم العميل</span>
        <input type="text" name="name" value="${escapeHtml(profile?.name ?? '')}" placeholder="مثال: سارة أمين" autocomplete="off" required>
      </label>
      <label class="field"><span>رقم الواتساب</span>
        <input type="tel" name="whatsapp" value="${escapeHtml(profile?.whatsapp ?? '')}" placeholder="0663493003" dir="ltr" autocomplete="off" required>
        <span class="hint">يُستخدم لتوحيد العميل وتحديد معرّف رابطه الثابت.</span>
      </label>
      <label class="field"><span>الموديل</span>
        ${modelSelect('model_id', models, profile?.modelId ?? '', true)}
      </label>
      <label class="field"><span>عدد الفيديوهات المخططة</span>
        <input type="number" name="video_count" min="0" max="50" value="${escapeHtml(profile?.count ?? '1')}" style="width:6rem">
        <span class="hint">تبقى الفيديوهات المرفوعة محفوظة حتى عند خفض العدد.</span>
      </label>
      <label class="field"><span>وضع التوصيل الافتراضي</span>
        <select name="delivery_mode">${modeSelect(profile?.mode ?? 'VIEW_AND_DOWNLOAD')}</select>
      </label>
      <label class="field" style="min-width:100%"><span>سيناريو التصوير / السكربت (اختياري)</span>
        <textarea name="script" rows="3" placeholder="ملاحظات الجلسة: الملابس، الإكسسوار، الديكور، الإخراج…">${escapeHtml(profile?.script ?? '')}</textarea>
        <span class="hint">فقرات تُضاف إلى رسالة الواتساب الموجهة للموديل عند التسجيل.</span>
      </label>
      <div class="actionbar">
        <button class="btn btn-primary" type="submit" name="action" value="create">${shellIcon('plus', 15)} تسجيل الطلب</button>
      </div>
    </form>
  </div>`

  const alerts = [
    options.notice ? `<div class="alert success">${escapeHtml(options.notice)}</div>` : '',
    options.error ? `<div class="alert error">${escapeHtml(options.error)}</div>` : '',
  ].join('')

  const content = `
    <div class="page-head">
      <div><h1>العملاء</h1><p class="sub">سير العمل: عميل ← موديل ← فيديوهات ← سكربت ← توصيل برابط خاص لكل فيديو.</p></div>
    </div>
    ${alerts}
    <div class="grid-stats three">
      ${statCard('إجمالي العملاء', 'users', String(items.length))}
      ${statCard('اللقطات المخططة', 'video', String(totalSlots))}
      ${statCard('إجمالي التوصيلات', 'package', String(totalDeliveries))}
    </div>
    ${addForm}
    <div class="card" style="margin-bottom:1rem">${filterBar}</div>
    <div class="card"><div class="table-wrap"><table class="tbl">
      <thead><tr><th>الاسم</th><th>الموديل</th><th>واتساب</th><th>الحالة</th><th>فيديوهات</th><th>التوصيلات</th><th>آخر توصيل</th><th>إجراء</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div></div>`

  return shell(
    'العملاء',
    content,
    {
      active: 'clients',
      user: appUser,
      crumbs: 'Photography Pixel / العملاء',
    },
    clientDeleteScript,
  )
}

//----------------------------------------------------------------------------
// Client workspace (detail)
//----------------------------------------------------------------------------

function sharedLink(dir: string): string {
  return `<span dir="ltr" style="color:var(--muted)">${escapeHtml(`${dir}••••••••••••`)}</span>`
}

const SLOT_STATUS_LABEL: Record<string, string> = {
  planned: 'لقطة مخططة',
  active: 'في الخطة',
  paused: 'خارج الخطة',
}

function slotStatusPill(status: string): string {
  if (status === 'paused') return `<span class="badge st-expired">${SLOT_STATUS_LABEL[status]}</span>`
  if (status === 'active') return `<span class="badge st-download">${SLOT_STATUS_LABEL[status]}</span>`
  return `<span class="badge st-pending">${SLOT_STATUS_LABEL[status]}</span>`
}

function slotVideoPill(hasVideo: boolean, hasDelivery: boolean): string {
  if (!hasDelivery) return `<span class="badge st-pending">لا فيديو بعد</span>`
  return hasVideo
    ? `<span class="badge st-downloaded">فيديو مرفوع</span>`
    : `<span class="badge st-pending">بانتظار الرفع</span>`
}

function slotCard(
  index: number,
  slot: ClientDetail['slots'][number],
  isArchived: boolean,
): string {
  const { slot: row, delivery } = slot
  const actions =
    !delivery
      ? isArchived
        ? `<span class="muted" style="font-size:.8rem">أعد تنشيط العميل أولاً.</span>`
        : `<form method="post">
             <input type="hidden" name="slot_id" value="${row.id}">
             <button class="btn btn-primary" type="submit" name="action" value="upload_slot">${shellIcon('link', 15)} تحضير الرابط + الفيديو</button>
           </form>`
      : `<div class="actionbar" style="flex-wrap:wrap;gap:.4rem">
           <a class="btn btn-subtle" href="/admin/deliveries/${delivery.id}">${shellIcon('eye', 15)} فتح التوصيل</a>
           <a class="btn btn-text" href="/admin/deliveries/${delivery.id}/upload">${shellIcon('upload', 15)} رفع الفيديو</a>
         </div>`
  const linkCell = delivery
    ? delivery.client_visible_id
      ? `<div style="margin-top:.5rem">${sharedLink(delivery.client_visible_id)}<span class="hint" style="display:block">${statusBadge(delivery.status)}</span></div>`
      : ''
    : `<div class="hint" style="margin-top:.5rem">يُنشأ الرابط الخاص عند تحضير اللقطة.</div>`

  return `<div class="card">
    <div class="slot-head" style="display:flex;align-items:center;justify-content:space-between;gap:.5rem;margin-bottom:.5rem">
      <strong>${shellIcon('video', 16)} اللقطة ${index}${row.title !== `فيديو ${index}` ? ` — ${escapeHtml(row.title)}` : ''}</strong>
      ${slotStatusPill(row.status)}
    </div>
    <div class="row" style="gap:.4rem">${slotVideoPill(delivery?.hasVideo ?? false, delivery !== null)}${delivery ? modeBadge(delivery.delivery_mode) : ''}</div>
    ${linkCell}
    <div style="margin-top:.7rem">${actions}</div>
  </div>`
}

function projectStatusPill(status: ProjectStatus): string {
  if (status === 'archived') return `<span class="badge st-expired">مؤرشف</span>`
  if (status === 'completed') return `<span class="badge st-download">مكتمل</span>`
  return `<span class="badge st-pending">${escapeHtml(PROJECT_STATUS_LABEL[status] ?? status)}</span>`
}

function paymentPill(payment: PaymentStatus | null): string {
  if (!payment || payment === 'unpaid') return '<span class="badge st-expired">غير مدفوع</span>'
  if (payment === 'paid') return '<span class="badge st-download">مدفوع بالكامل</span>'
  return '<span class="badge st-pending">دفعة أولى</span>'
}

function clientProjectsPanel(detail: ClientDetail): string {
  const { client, projects } = detail
  const active = projects.filter((p) => p.status !== 'archived').length
  const stats = [
    statCard('مشاريع نشطة', 'kanban', String(active), 'من غير الأرشيف'),
    statCard('بموعد محدد', 'calendar', String(projects.filter((p) => p.shoot_date).length), 'جلسة مقررة'),
  ].join('')
  const rows =
    projects.length === 0
      ? `<p class="muted" style="padding:.4rem 0">لا توجد مشاريع لهذا العميل — أنشئ أول مشروع بالزر أدناه.</p>`
      : `<div class="table-wrap"><table class="tbl">
          <thead><tr><th>المشروع</th><th>الحالة</th><th>الخطة</th><th>اللوحة</th><th>موعد الجلسة</th><th>الدفع</th><th>إجراء</th></tr></thead>
          <tbody>${projects
            .map(
              (p) => `<tr${p.status === 'archived' ? ' class="row-muted"' : ''}>
                <td><a href="/admin/projects/${p.id}"><strong>${escapeHtml(p.name)}</strong></a> <span style="font-size:.72rem;font-weight:750;color:var(--text-muted);background:var(--bg-tertiary);border:1px solid var(--line-default);border-radius:999px;padding:.1rem .55rem;white-space:nowrap;direction:ltr">${escapeHtml(p.project_code)}</span></td>
                <td>${projectStatusPill(p.status)}</td>
                <td>${p.planned_video_count} ${p.planned_video_count === 1 ? 'فيديو' : 'فيديوهات'}</td>
                <td>
                  <span style="display:inline-flex;gap:.3rem;align-items:center">
                    ${KANBAN_ORDER.map((key) => {
                      const c = p.byStatus[key]
                      const idx = KANBAN_ORDER.indexOf(key)
                      return `<span style="min-width:1.5rem;text-align:center;border-radius:999px;padding:.05rem .45rem;font-size:.72rem;font-weight:750;background:${['#ECEFF1', '#F7E1C8', '#F7E1C8', '#FFF3D6', '#DDEBDD'][idx]};color:${['#546E7A', '#9A6B00', '#9A6B00', '#9A6B00', '#2E7D32'][idx]}">${c}</span>`
                    }).join('')}
                  </span>
                </td>
                <td>${p.shoot_date ? `${escapeHtml(p.shoot_date)}${p.shoot_time ? ` <span class="hint">${escapeHtml(p.shoot_time)}</span>` : ''}` : '—'}</td>
                <td>${paymentPill(p.payment_status)}</td>
                <td><a class="btn btn-text" href="/admin/projects/${p.id}">فتح</a></td>
              </tr>`,
            )
            .join('')}
          </tbody></table></div>`
  return `
  <div class="card">
    <div class="panel-head" style="display:flex;align-items:center;justify-content:space-between;gap:.5rem;flex-wrap:wrap">
      <h2 class="form-card-title" style="margin:0">مشاريع العميل (${projects.length})</h2>
      <div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap">
        ${stats}
        <a class="btn btn-primary" href="/admin/projects?new=1&client_id=${encodeURIComponent(client.id)}">${shellIcon('plus', 15)} مشروع جديد</a>
      </div>
    </div>
    ${rows}
  </div>`
}

export function renderClientWorkspace(
  appUser: AppUserRow,
  detail: ClientDetail,
  models: ModelOption[],
  options: { notice?: string; error?: string } = {},
): string {
  const { client, model, slots, deliveries, activity, deliveryCount, activeVersionCount } = detail
  const isArchived = client.status === 'archived'
  const backLink = `<a class="btn btn-subtle" href="/admin/clients">${shellIcon('arrowLeft', 15)} العملاء</a>`

  const alerts = [
    options.notice ? `<div class="alert success">${escapeHtml(options.notice)}</div>` : '',
    options.error ? `<div class="alert error">${escapeHtml(options.error)}</div>` : '',
  ].join('')

  const slotsGrid =
    slots.length === 0
      ? `<p class="muted" style="padding:.4rem 0">لا توجد فيديوهات مخططة — اضبط عدد الفيديوهات أدناه ثم اضغط «حفظ الخطة».</p>`
      : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(235px,1fr));gap:.75rem">
          ${slots.map((slotItem, index) => slotCard(index + 1, slotItem, isArchived)).join('')}
        </div>`

  const modeField = MODE_OPTIONS.map(
    (m) => `<label class="card" style="cursor:pointer;display:block;margin-top:0">
      <input type="radio" name="delivery_mode" value="${m.value}"${client.delivery_mode === m.value ? ' checked' : ''} style="margin-inline-end:.45rem">
      <strong>${m.label}</strong><span class="muted" style="display:block">${m.hint}</span>
    </label>`,
  ).join('')

  const messageToModel = model
    ? model.whatsapp_number
      ? `<a class="btn btn-success" href="${modelBookingWaLink(model.whatsapp_number, {
          modelName: model.name,
          clientName: client.name,
          videoCount: client.video_slots_count,
          script: client.script,
        })}" target="_blank" rel="noreferrer noopener">${shellIcon('phone', 15)} رسالة الحجز للموديل</a>`
      : `<span class="hint" style="color:var(--error)">لم يُحدد رقم واتساب هذا الموديل — أضفه من صفحة الموديلات.</span>`
    : ''

  const deliveryRows =
    deliveries.length === 0
      ? `<tr><td colspan="8"><p class="muted" style="padding:.5rem 0">لا توجد توصيلات لهذا العميل.</p></td></tr>`
      : deliveries
          .map((d) => {
            const link = d.client_visible_id ? sharedLink(d.client_visible_id) : '—'
            return `<tr${d.archived_at ? ' class="row-muted"' : ''}>
              <td>${sourcePill(d.source_type)}</td>
              <td>${modeBadge(d.delivery_mode)}</td>
              <td>${statusBadge(d.status)}</td>
              <td>${link}</td>
              <td>${escapeHtml(formatDateTime(d.created_at))}</td>
              <td>${d.confirmed_at ? escapeHtml(formatDateTime(d.confirmed_at)) : '—'}</td>
              <td>${d.downloaded_at ? escapeHtml(formatDateTime(d.downloaded_at)) : '—'}</td>
              <td><a class="btn btn-text" href="/admin/deliveries/${d.id}">فتح</a></td>
            </tr>`
          })
          .join('')

  const activityRows =
    activity.length === 0
      ? `<tr><td colspan="3"><p class="muted" style="padding:.5rem 0">لا يوجد نشاط بعد.</p></td></tr>`
      : activity
          .map(
            (event) => `<tr>
              <td>${escapeHtml(ACTIVITY_LABEL[event.type] ?? event.type)}</td>
              <td><a class="btn btn-text" href="/admin/deliveries/${event.delivery_id}">${escapeHtml(event.delivery_id.slice(0, 8))}</a></td>
              <td>${escapeHtml(formatDateTime(event.created_at))}</td>
            </tr>`,
          )
          .join('')

  const content = `
    <div class="page-head">
      <div>
        <h1>${escapeHtml(client.name || '—')} ${clientStatusPill(client.status)}</h1>
        <div class="row" style="margin-top:.45rem;flex-wrap:wrap">
          <span class="muted" dir="ltr">${waLink(client.whatsapp_number)}</span>
          ${model ? `<span class="badge" style="background:var(--accent-soft,#ece7f9);color:#4c3a86">${shellIcon('user', 14)} ${escapeHtml(model.name)}</span>` : ''}
          <a class="btn btn-success" href="https://wa.me/${encodeURIComponent(client.whatsapp_number)}" target="_blank" rel="noreferrer noopener">${shellIcon('whatsapp', 15)} واتساب</a>
        </div>
      </div>
      ${backLink}
    </div>
    ${alerts}
    <div class="card">
      <h2 class="form-card-title">خدمة العميل — الخطة، الموديل، الوضع والسكربت</h2>
      <div class="stat-grid">
        <div class="stat-cell"><div class="label">الاسم</div><div class="value">${escapeHtml(client.name || '—')}</div></div>
        <div class="stat-cell"><div class="label">واتساب</div><div class="value" dir="ltr">${escapeHtml(client.whatsapp_number || '—')}</div></div>
        <div class="stat-cell"><div class="label">الموديل</div><div class="value">${model ? escapeHtml(model.name) : '—'}</div></div>
        <div class="stat-cell"><div class="label">فيديوهات مخططة</div><div class="value">${client.video_slots_count}</div></div>
        <div class="stat-cell"><div class="label">مرفوعة / مفعّلة</div><div class="value">${activeVersionCount}</div></div>
        <div class="stat-cell"><div class="label">الوضع الافتراضي</div><div class="value">${modeBadge(client.delivery_mode)}</div></div>
        <div class="stat-cell"><div class="label">التوصيلات</div><div class="value">${deliveryCount}</div></div>
        <div class="stat-cell"><div class="label">تاريخ الإضافة</div><div class="value">${escapeHtml(formatDateTime(client.created_at))}</div></div>
      </div>
      <form method="post" class="grid2" style="gap:1rem;margin-top:1rem">
        <input type="hidden" name="action" value="set_profile">
        <label class="field"><span>الموديل</span>
          ${modelSelect('model_id', models, model?.id ?? '', true)}
        </label>
        <label class="field"><span>عدد الفيديوهات المخططة</span>
          <input type="number" name="video_count" min="0" max="50" value="${client.video_slots_count}" style="width:6rem">
          <span class="hint">خفض العدد يوقف اللقطات الزائدة دون حذف أي فيديو مرفوع.</span>
        </label>
        <label class="field" style="min-width:100%"><span>وضع التوصيل الافتراضي للفيديوهات الجديدة</span>
          <div class="grid2" style="gap:.6rem">${modeField}</div>
          <span class="hint">الوضع يُطبق على الفيديوهات الجديدة فقط — التوصيلات القائمة تحتفظ بوضعها.</span>
        </label>
        <label class="field" style="min-width:100%"><span>سيناريو التصوير / السكربت</span>
          <textarea name="script" rows="4" placeholder="ملاحظات الجلسة…">${escapeHtml(client.script ?? '')}</textarea>
          <span class="hint">يظهر في رسالة الحجز الموجهة إلى الموديل — ولا يُرسل إن تُرك فارغاً.</span>
        </label>
        <div class="actionbar">
          <button class="btn btn-primary" type="submit">${shellIcon('check', 15)} حفظ الخطة</button>
          ${messageToModel}
          ${isArchived
            ? `<form method="post" onsubmit="return confirm('إعادة تنشيط هذا العميل؟')"><button class="btn btn-text" type="submit" name="action" value="reactivate">${shellIcon('refresh', 15)} إعادة التنشيط</button></form>`
            : `<form method="post" onsubmit="return confirm('أرشفة هذا العميل؟ تبقى توصيلاته وروابطه الخاصة تعمل.')"><button class="btn btn-text" type="submit" name="action" value="archive">${shellIcon('archive', 15)} أرشفة العميل</button></form>`}
        </div>
      </form>
    </div>
    <div class="card">
      <h2 class="form-card-title">فيديوهات الخدمة (${slots.length})</h2>
      ${slotsGrid}
    </div>
    ${clientProjectsPanel(detail)}
    <div class="card">
      <h2 class="form-card-title">التوصيلات (${deliveries.length})</h2>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>المصدر</th><th>الوضع</th><th>الحالة</th><th>الرابط الثابت</th><th>تاريخ الإنشاء</th><th>التأكيد</th><th>التحميل</th><th>إجراء</th></tr></thead>
        <tbody>${deliveryRows}</tbody>
      </table></div>
    </div>
    <div class="card">
      <h2 class="form-card-title">سجل النشاط</h2>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>الحدث</th><th>التوصيل</th><th>التاريخ</th></tr></thead>
        <tbody>${activityRows}</tbody>
      </table></div>
    </div>`

  return shell('خدمة العميل', content, {
    active: 'clients',
    user: appUser,
    crumbs: `Photography Pixel / العملاء / ${client.name}`,
  })
}