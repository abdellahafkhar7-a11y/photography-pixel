import type { AppUserRow } from './types'
import type { DeliveryActivityType, DeliveryStatus } from '../../_lib/db-types'
import type { DashboardData } from './dashboard-data'
import { DELIVERY_STATUS_ORDER } from './dashboard-data'
import type { PortfolioCategory } from './portfolio-data'
import { thumbUrlFor } from './bamboo'
import { COPY_SCRIPT } from '../../_lib/brand'
import type { RouteKey } from './shell'
import {
  escapeHtml,
  loginPage,
  panel,
  placeholderBody,
  roleLabel,
  shell,
  shellIcon,
  statCard,
} from './shell'

export { escapeHtml }

const ERROR_MESSAGES: Record<string, string> = {
  invalid: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
  disabled: 'هذا الحساب غير مفعّل. تواصل مع صاحب الموقع.',
  missing: 'أدخل البريد الإلكتروني وكلمة المرور.',
  invalid_origin: 'طلب غير صالح، حاول مرة أخرى.',
  not_configured: 'نظام تسجيل الدخول غير مُهيأ بعد.',
  disabled_redirect: 'تم تسجيل خروجك لأن الحساب غير مفعّل.',
}

export function renderLogin(error?: string): string {
  const code = error ?? 'invalid'
  return loginPage(ERROR_MESSAGES[code] ?? ERROR_MESSAGES.invalid)
}

const DATE_TIME = new Intl.DateTimeFormat('ar-MA', {
  dateStyle: 'medium',
  timeStyle: 'short',
  numberingSystem: 'latn',
  timeZone: 'Africa/Casablanca',
})

const DATE_ONLY = new Intl.DateTimeFormat('ar-MA', {
  dateStyle: 'medium',
  numberingSystem: 'latn',
  timeZone: 'Africa/Casablanca',
})

const DATE_FULL = new Intl.DateTimeFormat('ar-MA', {
  dateStyle: 'full',
  numberingSystem: 'latn',
  timeZone: 'Africa/Casablanca',
})

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : DATE_TIME.format(date)
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : DATE_ONLY.format(date)
}

const DELIVERY_STATUS_LABEL: Record<DeliveryStatus, string> = {
  pending: 'قيد الانتظار',
  preview_viewed: 'تمت المشاهدة',
  confirmed: 'تم التأكيد',
  download_available: 'متاح للتحميل',
  downloaded: 'تم التحميل',
  expired: 'منتهي',
}

const ACTIVITY_ICON: Partial<Record<DeliveryActivityType, string>> = {
  delivery_created: 'package',
  version_created: 'package',
  reuploaded: 'package',
  link_opened: 'eye',
  preview_viewed: 'eye',
  video_confirmed: 'sparkle',
  download_started: 'package',
  download_completed: 'package',
  delivery_expired: 'clock',
  original_deleted: 'package',
}

function miniEmpty(message: string, actionHtml = ''): string {
  return `<div class="mini-empty"><p class="muted">${escapeHtml(message)}</p>${actionHtml}</div>`
}

function deliverySummary(data: DashboardData): string {
  if (data.deliveriesCount === 0) {
    return miniEmpty(
      'لا توجد عمليات تسليم حالياً',
      `<a class="btn btn-primary" href="/admin/deliveries/new">${shellIcon('plus', 16)} إنشاء تسليم</a>`,
    )
  }
  const rows = DELIVERY_STATUS_ORDER.map((status) => {
    const count = data.statusCounts[status]
    return `<div class="status-row"><span class="dot st-${status}" aria-hidden="true"></span><span class="s-label">${DELIVERY_STATUS_LABEL[status]}</span><span class="s-count">${count}</span></div>`
  }).join('')
  return `<div class="status-list">${rows}</div>`
}

function activityList(data: DashboardData): string {
  if (data.recentActivity.length === 0) return miniEmpty('لا توجد أنشطة حديثة')
  return `<div class="activity-list">${data.recentActivity
    .map((item) => {
      const iconName = ACTIVITY_ICON[item.type] ?? 'activity'
      const meta = item.clientName ? `<div class="a-meta">العميل: ${escapeHtml(item.clientName)}</div>` : ''
      return `<div class="activity-row"><span class="a-ico" aria-hidden="true">${shellIcon(iconName, 16)}</span><div class="a-body"><div class="a-label">${escapeHtml(item.label)}</div>${meta}</div><time class="a-time">${escapeHtml(formatDateTime(item.createdAt))}</time></div>`
    })
    .join('')}</div>`
}

function clientList(data: DashboardData): string {
  if (data.recentClients.length === 0) return miniEmpty('لا توجد بيانات بعد')
  return `<div class="client-list">${data.recentClients
    .map((client) => {
      const initial = escapeHtml(client.name.trim().slice(0, 1).toLocaleUpperCase('ar') || '؟')
      return `<div class="client-row"><span class="c-avatar" aria-hidden="true">${initial}</span><div class="c-body"><div class="c-name">${escapeHtml(client.name)}</div><div class="c-wa">+${escapeHtml(client.whatsappNumber)}</div></div><time class="c-time">${escapeHtml(formatDate(client.createdAt))}</time></div>`
    })
    .join('')}</div>`
}

function projectList(data: DashboardData): string {
  if (data.todayShoots.length === 0) {
    return miniEmpty(
      'لا توجد جلسات اليوم',
      `<a class="btn btn-subtle" href="/admin/projects">${shellIcon('kanban', 15)} كل المشاريع</a>`,
    )
  }
  return `<div class="client-list">${data.todayShoots
    .map((shoot) => {
      const initial = escapeHtml(shoot.name.trim().slice(0, 1).toLocaleUpperCase('ar') || '؟')
      return `<div class="client-row"><span class="c-avatar" aria-hidden="true">${initial}</span><div class="c-body"><div class="c-name">${escapeHtml(shoot.name)} <span style="font-size:.7rem;font-weight:750;color:var(--text-muted);background:var(--bg-tertiary);border:1px solid var(--line-default);border-radius:999px;padding:.05rem .5rem;white-space:nowrap;direction:ltr">${escapeHtml(shoot.projectCode)}</span></div><div class="c-wa">${shoot.clientName ? `العميل: ${escapeHtml(shoot.clientName)}` : ''}${shoot.shootTime ? ` · ${escapeHtml(shoot.shootTime)}` : ''}</div></div><a class="btn btn-text" href="/admin/projects/${shoot.id}">فتح</a></div>`
    })
    .join('')}</div>`
}

export function renderDashboard(appUser: AppUserRow, data: DashboardData): string {
  const name = appUser.full_name ?? appUser.email
  const isOwner = appUser.role_key === 'owner'
  const role = isOwner ? 'owner' : 'coordinator'

  const teamCard = isOwner ? statCard('أعضاء الفريق', 'team', String(data.teamCount ?? 0)) : ''
  const statsClass = isOwner ? 'grid-stats' : 'grid-stats three'

  const quickActions = [
    `<a class="btn btn-primary" href="/admin/deliveries/new">${shellIcon('plus', 15)}<span>إنشاء تسليم عميل</span></a>`,
    `<a class="btn btn-subtle" href="/admin/portfolio">${shellIcon('briefcase', 15)}<span>عرض الأعمال</span></a>`,
    isOwner
      ? `<a class="btn btn-subtle" href="/admin/clients">${shellIcon('user', 15)}<span>العملاء</span></a>`
      : '',
    isOwner
      ? `<a class="btn btn-subtle" href="/admin/team">${shellIcon('team', 15)}<span>الفريق</span></a>`
      : '',
  ]
    .filter(Boolean)
    .join('')

  const content = `
    <div class="welcome">
      <div>
        <h2>مرحبا، ${escapeHtml(name)} 👋</h2>
        <div class="sub">هذه نظرة سريعة على نشاط Photography Pixel.</div>
      </div>
      <div class="welcome-side">
        <span class="pill ${role}">${roleLabel(appUser.role_key)}</span>
        <span class="date-chip">${shellIcon('calendar', 15)} ${escapeHtml(DATE_FULL.format(new Date()))}</span>
      </div>
    </div>

    <div class="${statsClass}">
      ${statCard('العملاء', 'user', String(data.clientsCount))}
      ${statCard('المشاريع', 'briefcase', String(data.projectsCount), data.projectsCount ? 'غير متضمنة الأرشيف' : 'بدأ بإنشاء أول مشروع')}
      ${statCard('تسليمات العملاء', 'package', String(data.deliveriesCount))}
      ${teamCard}
    </div>

    <div class="grid-2">
      ${panel('ملخص تسليم العملاء', 'package', deliverySummary(data), {
        action:
          data.deliveriesCount > 0
            ? `<a class="section-link" href="/admin/deliveries">عرض كل التسليمات</a>`
            : '',
      })}
      ${panel('النشاط الأخير', 'activity', activityList(data), {})}
    </div>

    <div class="grid-2" style="margin-top:1rem">
      ${panel('جلسات اليوم', 'calendar', projectList(data), {
        action: data.todayShoots.length > 0 ? `<a class="section-link" href="/admin/projects">كل المشاريع</a>` : '',
      })}
      ${panel('أحدث العملاء', 'user', clientList(data), {
        action: isOwner ? `<a class="section-link" href="/admin/clients">عرض جميع العملاء</a>` : '',
      })}
    </div>

    <div class="grid-2" style="margin-top:1rem">
      ${panel('إجراءات سريعة', 'sparkle', `<div class="qrow">${quickActions}</div>`, {})}
      <div class="card shortcut" style="margin-top:0">
        <span class="ico-chip">${shellIcon('image', 18)}</span>
        <div class="sc-body"><h2>الأعمال</h2><p class="muted">استكشف أعمال المعرض وملخص المحتوى.</p></div>
        <div class="sc-actions"><a class="btn btn-subtle" href="/admin/portfolio">${shellIcon('arrowLeft', 15)}<span>استكشف Portfolio</span></a></div>
      </div>
    </div>`

  return shell('لوحة التحكم', content, {
    active: 'dashboard',
    user: appUser,
    crumbs: 'Photography Pixel / لوحة التحكم',
  })
}

export type PortfolioCard = {
  url: string
  categoryKey: string
  categoryLabel: string
  title: string
  thumb: string
  index: number
}

export type PortfolioViewOptions = {
  q?: string
  cat?: string
}

const PLAYER_SCRIPT = `<script>(function(){
var modal=document.getElementById('vmodal');
var frame=document.getElementById('vmodal-frame');
var title=document.getElementById('vmodal-title');
function open(url,t){if(!modal)return;frame.setAttribute('src',url);if(title)title.textContent=t;modal.classList.add('open');document.body.style.overflow='hidden';modal.setAttribute('aria-hidden','false')}
function close(){if(!modal)return;frame.setAttribute('src','');modal.classList.remove('open');document.body.style.overflow='';modal.setAttribute('aria-hidden','true')}
document.addEventListener('click',function(e){
  var play=e.target.closest('[data-play]');var closer=e.target.closest('[data-close]');
  if(play){e.preventDefault();open(play.getAttribute('data-play'),play.getAttribute('data-title')||'')}
  else if(closer){close()}
});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&modal&&modal.classList.contains('open'))close()});
})();</script>`

const CREATE_LINK_SCRIPT = `<script>(function(){
var m=document.getElementById('lmmodal');
var errEl=document.getElementById('lm-error');
var doneTitle=document.getElementById('lm-done-title');
var doneCat=document.getElementById('lm-done-cat');
var doneLink=document.getElementById('lm-done-link');
var doneCopy=document.getElementById('lm-done-copy');
var openBtn=document.getElementById('lm-done-open');
var delBtn=document.getElementById('lm-done-delivery');
var waToggle=document.getElementById('lm-wa-toggle');
var waPanel=document.getElementById('lm-wa-panel');
var waGo=document.getElementById('lm-wa-open');
var waErr=document.getElementById('lm-wa-error');
var cliToggle=document.getElementById('lm-client-toggle');
var cliPanel=document.getElementById('lm-client-panel');
var cliName=document.getElementById('lm-client-name');
var cliWa=document.getElementById('lm-client-wa');
var cliSave=document.getElementById('lm-client-save');
var cliErr=document.getElementById('lm-client-error');
var cliSaved=document.getElementById('lm-client-saved');
var lastBtn=null;
var current={url:'',title:'',cat:'',link:'',deliveryId:'',whatsapp:'',clientName:''};
if(!m)return;
function normWa(s){var d=(s||'').replace(/\\D/g,'');if(d.length===10&&d.charAt(0)==='0')return '212'+d.slice(1);return d}
function buildWa(number,link){return 'https://wa.me/'+encodeURIComponent(number)+'?text='+encodeURIComponent('السلام عليكم، هذا هو الرابط الخاص بالفيديو ديالك من Photography Pixel:\\n\\n'+link+'\\n\\nيمكنك مشاهدة الفيديو وتأكيده من خلال الرابط.')}
function setBusy(b){if(!lastBtn)return;lastBtn.disabled=b;lastBtn.textContent=b?'يتم الإنشاء...':'إنشاء رابط'}
function closeModal(){
  m.classList.remove('open');m.setAttribute('aria-hidden','true');
  errEl.hidden=true;waPanel.hidden=true;cliPanel.hidden=true;
  cliErr.textContent='';cliSaved.hidden=true;
  setBusy(false);lastBtn=null;
}
function showDone(){
  doneTitle.textContent=current.title;
  doneCat.textContent=current.cat;
  doneLink.textContent=current.link;
  doneCopy.setAttribute('data-copy',current.link);
  openBtn.setAttribute('href',current.link);
  delBtn.setAttribute('href','/admin/deliveries/'+encodeURIComponent(current.deliveryId));
  waErr.textContent='';errEl.hidden=true;waPanel.hidden=true;cliPanel.hidden=true;
  cliName.value='';cliWa.value='';
  cliErr.textContent='';cliSaved.hidden=true;
  m.classList.add('open');m.setAttribute('aria-hidden','false');
  try{window.navigator.clipboard.writeText(current.link)}catch(e){}
  setBusy(false);
}
function openError(message){errEl.textContent=message;errEl.hidden=false;m.classList.add('open');m.setAttribute('aria-hidden','false');setBusy(false)}
document.addEventListener('click',function(e){
  var b=e.target.closest('[data-create-link]');
  if(b){
    e.preventDefault();
    current={url:b.getAttribute('data-create-link')||'',title:b.getAttribute('data-title')||'فيديو',cat:b.getAttribute('data-cat')||'',link:'',deliveryId:'',whatsapp:'',clientName:''};
    setBusy(false);lastBtn=b;setBusy(true);
    var fd=new FormData();
    fd.append('source_type','portfolio');
    fd.append('portfolio_url',current.url);
    fetch('/admin/deliveries/new',{method:'POST',headers:{Accept:'application/json'},body:fd})
      .then(function(r){return r.json().catch(function(){return {ok:false}}) })
      .then(function(data){
        current.link=data.link||'';current.deliveryId=data.deliveryId||'';current.whatsapp=data.whatsapp||'';current.clientName=data.clientName||'';
        if(!data.ok||!current.link){openError((data&&data.error)||'تعذّر إنشاء الرابط.');return}
        showDone();
      }).catch(function(){openError('تعذّر الاتصال، حاول مرة أخرى.')});
    return;
  }
  if(e.target.closest('[data-close-link]')){closeModal();return}
  if(waToggle&&e.target.closest('#lm-wa-toggle')){e.preventDefault();waPanel.hidden=!waPanel.hidden;return}
  if(waGo&&e.target.closest('#lm-wa-open')){
    e.preventDefault();
    var n=normWa(document.getElementById('lm-wa-number').value);
    waErr.textContent='';
    if(n.length<10){waErr.textContent='أدخل رقم واتساب صحيح، مثال: 0663493003';return}
    window.open(buildWa(n,current.link),'_blank','noreferrer noopener');
    return;
  }
  if(cliToggle&&e.target.closest('#lm-client-toggle')){e.preventDefault();cliPanel.hidden=!cliPanel.hidden;return}
  if(cliSave&&e.target.closest('#lm-client-save')){saveClient();return}
});
async function saveClient(){
  if(!current.deliveryId)return;
  cliErr.textContent='';cliSaved.hidden=true;
  var name=(cliName.value||'').trim();var wa=(cliWa.value||'').trim();
  if(name.length<2){cliErr.textContent='أدخل اسم العميل (حرفان على الأقل).';return}
  if(normWa(wa).length<10){cliErr.textContent='أدخل رقم واتساب صحيح، مثال: 0663493003';return}
  cliSave.disabled=true;cliSave.textContent='يتم الحفظ...';
  try{
    var fd=new FormData();fd.append('action','set_client');fd.append('name',name);fd.append('whatsapp',wa);
    var res=await fetch('/admin/deliveries/'+encodeURIComponent(current.deliveryId),{method:'POST',body:fd});
    var html=await res.text();
    var ok=res.status===200&&/<div class="alert success"/.test(html)&&!/<div class="alert error"/.test(html);
    if(ok){
      current.clientName=name;current.whatsapp=normWa(wa);
      document.getElementById('lm-wa-number').value=wa;
      cliSaved.hidden=false;
    }else{cliErr.textContent='تعذّر حفظ بيانات العميل.'}
  }catch(err){cliErr.textContent='تعذّر الاتصال، حاول مرة أخرى.'}
  cliSave.disabled=false;cliSave.textContent='حفظ بيانات العميل';
}
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&m.classList.contains('open'))closeModal()});
})();</script>`

function portfolioCardHtml(card: PortfolioCard): string {
  return `<article class="vcard">
    <button type="button" class="vthumb" data-play="${escapeHtml(card.url)}" data-title="${escapeHtml(card.title)}" aria-label="تشغيل ${escapeHtml(card.title)}">
      ${card.thumb ? `<img src="${escapeHtml(card.thumb)}" alt="" loading="lazy" decoding="async">` : ''}
      <span class="vplay"><span class="play-chip">${shellIcon('play', 24)}</span></span>
    </button>
    <div class="vbody">
      <div class="vmeta"><span class="vt">${escapeHtml(card.title)}</span><span class="hint">${escapeHtml(card.categoryLabel)}</span></div>
      <div class="vactions">
        <button type="button" class="btn btn-primary" data-create-link="${escapeHtml(card.url)}" data-title="${escapeHtml(card.title)}" data-cat="${escapeHtml(card.categoryLabel)}" title="إنشاء رابط تسليم مباشر لهذا الفيديو">${shellIcon('link', 14)} إنشاء رابط</button>
        <a class="btn btn-subtle" href="/${escapeHtml(card.categoryKey === 'shoting' ? 'shooting' : card.categoryKey)}" target="_blank" rel="noreferrer noopener" title="فتح صفحة القسم العامة">${shellIcon('external', 14)} عام</a>
      </div>
    </div>
  </article>`
}

export function renderPortfolio(
  appUser: AppUserRow,
  categories: PortfolioCategory[],
  options: PortfolioViewOptions = {},
): string {
  const totalVideos = categories.reduce((sum, category) => sum + category.videos.length, 0)
  const withVideos = categories.filter((category) => category.videos.length > 0).length

  const query = (options.q ?? '').trim().toLowerCase()
  const cat = options.cat ?? ''

  const cards: PortfolioCard[] = []
  for (const category of categories) {
    category.videos.forEach((url, index) => {
      const title = `فيديو ${String(index + 1).padStart(2, '0')}`
      cards.push({
        url,
        categoryKey: category.key,
        categoryLabel: category.label,
        title,
        thumb: thumbUrlFor(url),
        index,
      })
    })
  }

  const filtered = cards.filter((card) => {
    if (cat && card.categoryKey !== cat) return false
    if (query) {
      const haystack = `${card.title} ${card.categoryLabel} ${card.categoryKey}`.toLowerCase()
      if (!haystack.includes(query)) return false
    }
    return true
  })

  const activeCategory = categories.find((category) => category.key === cat) ?? null

  const pills = categories
    .map((category) => {
      const href = category.videos.length === 0 ? `/admin/portfolio` : `/admin/portfolio?cat=${encodeURIComponent(category.key)}`
      const current = category.key === cat && category.videos.length > 0
      const cls = current ? 'pcat-pill current' : 'pcat-pill'
      return `<a class="${cls}" href="${href}">${escapeHtml(category.label)} <span class="n">${category.videos.length}</span></a>`
    })
    .join('')

  const categoryMeta = activeCategory
    ? `<p class="hint" style="margin-bottom:1rem">${escapeHtml(activeCategory.description || activeCategory.subtitle || '')} · <span dir="ltr">data/${escapeHtml(activeCategory.txtFile)}</span></p>`
    : ''

  const grid =
    filtered.length === 0
      ? `<div class="card"><div class="mini-empty"><p class="muted">لا توجد فيديوهات مطابقة.</p><a class="btn btn-subtle" href="/admin/portfolio">إعادة تعيين</a></div></div>`
      : `<div class="vcard-grid">${filtered.map(portfolioCardHtml).join('')}</div>`

  const filterBar = `<form method="get" action="/admin/portfolio" class="filter-bar" role="search">
    <label class="field" style="min-width:16rem;flex:1"><span>بحث في المعرض</span>
      <input type="search" name="q" value="${escapeHtml(options.q ?? '')}" placeholder="ابحث في الفيديوهات والأقسام">
    </label>
    <label class="field" style="min-width:13rem"><span>القسم</span>
      <select name="cat">
        <option value="">كل الأقسام</option>
        ${categories.map((category) => `<option value="${escapeHtml(category.key)}"${category.key === cat ? ' selected' : ''}>${escapeHtml(category.label)} (${category.videos.length})</option>`).join('')}
      </select>
    </label>
    <button class="btn btn-subtle" type="submit">${shellIcon('filter', 15)} تصفية</button>
    <a class="btn btn-text" href="/admin/portfolio">إعادة تعيين</a>
  </form>`

  const content = `
    <div class="page-head">
      <div><h1>الأعمال</h1><p class="sub">معرض الفيديوهات الحقيقي المنشور على الموقع — تشغيل مباشر وإنشاء رابط تسليم.</p></div>
      <div class="row">
        ${appUser.role_key === 'owner' ? `<a class="btn btn-primary" href="/admin/uploads">${shellIcon('upload', 15)} رفع فيديو جديد</a>` : ''}
        <a class="btn btn-subtle" href="/admin/deliveries/new">${shellIcon('plus', 15)} توصيل جديد</a>
      </div>
    </div>
    <div class="grid-stats three">
      ${statCard('الأقسام', 'grid', String(categories.length))}
      ${statCard('أقسام بفيديوهات', 'video', String(withVideos))}
      ${statCard('إجمالي الفيديوهات', 'play', String(totalVideos))}
    </div>
    <div class="card" style="margin-bottom:1rem">
      ${filterBar}
      <div class="pcat-row" style="margin-top:1rem;margin-bottom:0">${pills}</div>
    </div>
    ${categoryMeta}
    ${grid}
    <div class="vmodal" id="vmodal" role="dialog" aria-modal="true" aria-hidden="true">
      <div class="vmodal-backdrop" data-close></div>
      <div class="vmodal-box">
        <div class="vmodal-head"><span class="vm-title" id="vmodal-title">الفيديو</span><button class="vmodal-close" type="button" data-close aria-label="إغلاق">${shellIcon('close', 17)}</button></div>
        <iframe class="vmodal-frame" id="vmodal-frame" title="مشغّل الفيديو" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
      </div>
    </div>
    <div class="lm-modal" id="lmmodal" role="dialog" aria-modal="true" aria-hidden="true">
      <div class="lm-modal-backdrop" data-close-link></div>
      <div class="lm-box">
        <div class="lm-head">
          <span class="lm-title" id="lm-title">رابط خاص جاهز</span>
          <button class="lm-close" type="button" data-close-link aria-label="إغلاق">${shellIcon('close', 17)}</button>
        </div>
        <div id="lm-done">
          <div class="lm-chip" style="margin-bottom:0">
            <span class="lm-chip-ico">${shellIcon('video', 18)}</span>
            <div style="min-width:0">
              <div class="lm-chip-name" id="lm-done-title"></div>
              <div class="lm-chip-cat" id="lm-done-cat"></div>
            </div>
          </div>
          <div class="lm-linkbox" style="margin-top:.8rem"><span dir="ltr" id="lm-done-link"></span><button type="button" class="btn btn-subtle copy" id="lm-done-copy" data-copy="">${shellIcon('copy', 15)} نسخ الرابط</button></div>
          <p class="hint" style="margin-top:.5rem">الرابط يظهر مرة واحدة فقط — سجّله قبل إغلاق النافذة.</p>
          <div class="actionbar" style="margin-top:1rem">
            <a class="btn btn-outline" id="lm-done-open" href="#" target="_blank" rel="noreferrer noopener">${shellIcon('external', 15)} فتح الرابط</a>
            <a class="btn btn-subtle" id="lm-done-delivery" href="#">${shellIcon('package', 15)} صفحة التوصيل</a>
          </div>
          <div style="height:.1rem;border-top:1px solid var(--line-default);margin:1.1rem 0 .2rem"></div>
          <div>
            <button class="btn btn-success block" type="button" id="lm-wa-toggle">${shellIcon('whatsapp', 15)} إرسال عبر واتساب</button>
            <div id="lm-wa-panel" hidden>
              <label class="field" style="margin-top:.8rem"><span>رقم واتساب العميل</span>
                <input type="tel" id="lm-wa-number" placeholder="0663493003" dir="ltr" autocomplete="off">
                <span class="hint">تُفتح رسالة واتساب تحتوي الرابط الخاص فقط.</span>
              </label>
              <div class="actionbar"><button class="btn btn-success" type="button" id="lm-wa-open">${shellIcon('whatsapp', 15)} فتح واتساب</button></div>
              <p class="lm-error" id="lm-wa-error"></p>
            </div>
          </div>
          <div style="margin-top:.7rem">
            <button class="btn btn-outline block" type="button" id="lm-client-toggle">${shellIcon('user', 15)} إضافة بيانات العميل (اختياري)</button>
            <div id="lm-client-panel" hidden>
              <div class="grid2" style="margin-top:.8rem">
                <label class="field"><span>اسم العميل</span><input type="text" id="lm-client-name" placeholder="مثال: سارة أمين" autocomplete="off"></label>
                <label class="field"><span>رقم الواتساب</span><input type="tel" id="lm-client-wa" placeholder="0663493003" dir="ltr" autocomplete="off"><span class="hint">اختياري — يُحفظ ويرتبط بالتوصيل.</span></label>
              </div>
              <div class="actionbar"><button class="btn btn-subtle" type="button" id="lm-client-save">${shellIcon('check', 15)} حفظ بيانات العميل</button></div>
              <p class="alert success" style="margin-top:.7rem" id="lm-client-saved" hidden>تم حفظ بيانات العميل وربطها بالتوصيل.</p>
              <p class="lm-error" id="lm-client-error"></p>
            </div>
          </div>
        </div>
        <p class="lm-error" id="lm-error" hidden></p>
      </div>
    </div>${PLAYER_SCRIPT}${CREATE_LINK_SCRIPT}${COPY_SCRIPT}`

  return shell('الأعمال', content, {
    active: 'portfolio',
    user: appUser,
    crumbs: 'Photography Pixel / الأعمال',
  })
}

export function renderPlaceholder(appUser: AppUserRow, active: RouteKey): string {
  const copy = placeholderBody(active, 'ستُفعّل هذه الوحدة في المراحل القادمة، وسيظهر هنا محتوى حي.')
  return shell(copyTitle(active), copy, {
    active,
    user: appUser,
    crumbs: `Photography Pixel / ${copyTitle(active)}`,
  })
}

function copyTitle(active: RouteKey): string {
  switch (active) {
    case 'portfolio':
      return 'الأعمال'
    case 'models':
      return 'الموديلات'
    case 'ugc':
      return 'UGC'
    case 'media-buyer':
      return 'Media Buyer'
    case 'voice-over':
      return 'التعليق الصوتي'
    case 'equipment':
      return 'المعدات'
    case 'clients':
      return 'العملاء'
    case 'analytics':
      return 'التحليلات'
    case 'settings':
      return 'الإعدادات'
    default:
      return 'لوحة التحكم'
  }
}