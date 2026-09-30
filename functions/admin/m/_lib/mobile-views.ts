import { escapeHtml, shellIcon } from '../../_lib/shell'
import { profileDisplayName } from '../../_lib/profile'
import { thumbUrlFor } from '../../_lib/bamboo'
import type { DeliveryStatus } from '../../../_lib/db-types'
import type { AppUserRow } from '../../_lib/types'
import { backLink, mobilePage } from '../../_lib/mobile-shell'
import type { PortfolioOption } from '../../deliveries/_helpers'
import type { MobileDeliveryRow, MobileHomeStats, MobileNotification } from './mobile-data'

//============================================================================
// Phase 5A — Mobile Team Workspace views (presentation only).
// Every screen is a server-rendered page for the same authenticated data the
// admin uses. Progressive enhancement: the pages render and are usable as
// plain HTML; small inline scripts add the app-like selection, preview sheet
// and the locally stored private link. No client-side security decisions are
// made here — the server re-validates everything.
//============================================================================

const STATUS_LABEL: Record<DeliveryStatus, string> = {
  pending: 'بانتظار العميل',
  preview_viewed: 'فُتحت المعاينة',
  confirmed: 'مؤكد',
  download_available: 'التحميل متاح',
  downloaded: 'تم التحميل',
  expired: 'منتهي',
}

const STATUS_TONE: Record<DeliveryStatus, string> = {
  pending: '',
  preview_viewed: 'accent',
  confirmed: 'accent',
  download_available: 'ok',
  downloaded: 'ok',
  expired: 'err',
}

export type MobileFilter = 'all' | 'active' | 'downloaded' | 'expired'

export function statusGroup(status: DeliveryStatus): Exclude<MobileFilter, 'all'> {
  if (status === 'expired') return 'expired'
  if (status === 'downloaded') return 'downloaded'
  return 'active'
}

function fmtDate(iso: string): string {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return ''
  const diff = Date.now() - t
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'الآن'
  if (mins < 60) return `منذ ${mins} د`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `منذ ${hours} س`
  const days = Math.floor(hours / 24)
  if (days < 30) return `منذ ${days} يوم`
  return new Date(iso).toLocaleDateString('ar-MA', { day: 'numeric', month: 'short', year: 'numeric' })
}

function roleLabel(appUser: AppUserRow): string {
  return appUser.role_key === 'owner' ? 'صاحب الموقع' : 'منسّق'
}

//----------------------------------------------------------------------------
// Shared client scripts
//----------------------------------------------------------------------------

const SCRIPT_BASE = `
const M = {
  sel: (function(){ try { return JSON.parse(localStorage.getItem('m.selection.v1') || '[]') } catch (e) { return [] } })(),
  links: (function(){ try { return JSON.parse(localStorage.getItem('m.links.v1') || '{}') } catch (e) { return {} } })(),
  saveSel: function(v){ this.sel = v; try { localStorage.setItem('m.selection.v1', JSON.stringify(v)) } catch (e) {} },
  clearSel: function(){ this.sel = []; try { localStorage.removeItem('m.selection.v1') } catch (e) {} },
  saveLink: function(id, entry){ this.links[id] = entry; try { localStorage.setItem('m.links.v1', JSON.stringify(this.links)) } catch (e) {} },
  toast: function(msg){
    var old = document.querySelector('.m-toast');
    if (old) old.remove();
    var el = document.createElement('div');
    el.className = 'm-toast';
    el.setAttribute('role', 'status');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function(){ el.remove(); }, 2600);
  },
  copy: function(text){
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function(res, reject){
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        var ok = document.execCommand('copy');
        ta.remove();
        ok ? resolve() : reject(new Error('copy failed'));
      } catch (err) { ta.remove(); reject(err); }
    });
  },
  // Bamboo Cloud serves its public embed player; the poster comes from the
  // same provider so nothing is rehosted.
  preview: function(url, title){
    var sheet = document.getElementById('m-sheet');
    if (!sheet) return;
    var frame = document.getElementById('m-sheet-frame');
    var head = document.getElementById('m-sheet-title');
    if (frame) { frame.src = url; frame.title = title || ''; }
    if (head) head.textContent = title || 'معاينة الفيديو';
    sheet.classList.add('open');
    document.body.style.overflow = 'hidden';
  },
  closeSheet: function(){
    var sheet = document.getElementById('m-sheet');
    if (sheet) sheet.classList.remove('open');
    var frame = document.getElementById('m-sheet-frame');
    if (frame) frame.src = 'about:blank';
    document.body.style.overflow = '';
  }
};
document.addEventListener('click', function(ev){
  var closer = ev.target.closest('[data-sheet-close]');
  if (closer) { ev.preventDefault(); M.closeSheet(); }
  var prev = ev.target.closest('[data-preview]');
  if (prev) {
    ev.preventDefault();
    ev.stopPropagation();
    M.preview(prev.getAttribute('data-preview'), prev.getAttribute('data-preview-title') || '');
  }
});
document.addEventListener('keydown', function(ev){ if (ev.key === 'Escape') M.closeSheet(); });
`

function sheetHtml(): string {
  return `
<div class="m-sheet" id="m-sheet" role="dialog" aria-modal="true" aria-labelledby="m-sheet-title">
  <div class="m-sheet-top">
    <span class="m-sheet-title" id="m-sheet-title">معاينة الفيديو</span>
    <button class="m-sheet-close" type="button" data-sheet-close aria-label="إغلاق">${shellIcon('close', 18)}</button>
  </div>
  <div class="m-sheet-body">
    <div class="m-inner">
      <iframe class="m-player" id="m-sheet-frame" src="about:blank" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen title="معاينة الفيديو"></iframe>
      <p class="m-muted" style="margin-top:.8rem">المعاينة تُشغَّل من المصدر الرسمي (Bamboo Cloud). الفيديو لا يُنزَّل أو يُخزَّن هنا.</p>
    </div>
  </div>
</div>`
}

//----------------------------------------------------------------------------
// Home — /admin/m
//----------------------------------------------------------------------------

function statTile(value: number, label: string, tone: string): string {
  return `<div class="m-kv" style="flex-direction:column;align-items:flex-start;gap:.15rem;flex:1;min-width:0">
    <span class="m-hero-title" style="font-size:1.3rem;color:${tone}">${value}</span>
    <span class="m-tiny">${label}</span>
  </div>`
}

function deliveryRow(row: MobileDeliveryRow): string {
  const tone = STATUS_TONE[row.status]
  return `
  <article class="m-drow" data-delivery="${row.id}">
    <span class="m-drow-ico">${shellIcon('package', 20)}</span>
    <div class="m-drow-body">
      <div class="m-drow-name">${escapeHtml(row.name)}</div>
      <div class="m-drow-meta">
        <span class="m-pill ${tone}">${STATUS_LABEL[row.status] ?? row.status}</span>
        <span class="m-pill">${row.videoCount} فيديو</span>
        <span class="m-pill">${fmtDate(row.createdAt)}</span>
      </div>
      <div class="m-drow-actions">
        <button class="m-btn m-btn-ghost" type="button" data-copy-for="${row.id}" disabled>${shellIcon('copy', 16)} نسخ الرابط</button>
        <a class="m-btn m-btn-ghost" href="#" data-open-for="${row.id}" aria-disabled="true" hidden>${shellIcon('external', 16)} فتح</a>
      </div>
      <div class="m-drow-link" data-link-for="${row.id}" hidden></div>
    </div>
  </article>`
}

export function renderMobileHome(
  appUser: AppUserRow,
  stats: MobileHomeStats,
  recent: MobileDeliveryRow[],
  unread: number,
): string {
  const content = `
  <section class="m-card">
    <div class="m-eyebrow">${roleLabel(appUser)}</div>
    <h2 class="m-hero-title" style="margin-top:.2rem">أهلاً، ${escapeHtml(profileDisplayName(appUser))}</h2>
    <p class="m-muted" style="margin-top:.3rem">أنشئ رابط تسليم للعميل في خطوات بسيطة: اختر الفيديوهات، اكتب الاسم، وشارك الرابط.</p>
    <div style="display:flex;gap:.2rem;margin-top:1rem">
      ${statTile(stats.active, 'نشط', 'var(--m-accent)')}
      ${statTile(stats.delivered, 'تم التحميل', 'var(--m-success)')}
      ${statTile(stats.expired, 'منتهي', 'var(--m-muted)')}
      ${statTile(stats.videos, 'فيديو', 'var(--m-blue)')}
    </div>
  </section>

  <div class="m-tiles">
    <a class="m-tile" href="/admin/m/new">
      <span class="m-tile-ico">${shellIcon('link', 21)}</span>
      <span class="m-tile-t">تسليم جديد</span>
      <span class="m-tile-s">اسم العميل + فيديوهاتك → رابط واحد</span>
    </a>
    <a class="m-tile" href="/admin/m/portfolio">
      <span class="m-tile-ico alt">${shellIcon('video', 21)}</span>
      <span class="m-tile-t">الأعمال</span>
      <span class="m-tile-s">تصفّح معرض الفيديوهات واختر ما تريد</span>
    </a>
    <a class="m-tile" href="/admin/m/deliveries">
      <span class="m-tile-ico alt">${shellIcon('package', 21)}</span>
      <span class="m-tile-t">التسليمات</span>
      <span class="m-tile-s">${stats.total} توصيل — الحالة ونسخ الرابط</span>
    </a>
    <a class="m-tile" href="/admin/m/more">
      <span class="m-tile-ico alt">${shellIcon('bell', 21)}</span>
      <span class="m-tile-t">المزيد</span>
      <span class="m-tile-s">${unread > 0 ? `${unread} إشعار غير مقروء` : 'الإشعارات والحساب'}</span>
    </a>
  </div>

  <h2 class="m-section-title">${shellIcon('clock', 17)} آخر التوصيلات</h2>
  ${recent.length > 0 ? recent.map(deliveryRow).join('') : '<div class="m-card m-empty">لا توجد توصيلات بعد. ابدأ بتوصيل جديد من الزر بالأعلى.</div>'}`

  const script = `<script>${SCRIPT_BASE}
${LINK_SCRIPT}</script>`

  return mobilePage({
    title: 'الرئيسية',
    user: appUser,
    tab: 'home',
    subtitle: `${stats.active} توصيل نشط`,
    content,
    scripts: script,
    unread,
  })
}

//----------------------------------------------------------------------------
// Portfolio picker — /admin/m/portfolio
//----------------------------------------------------------------------------

export type MobilePortfolioCategory = { key: string; label: string; count: number }

export function renderMobilePortfolio(
  appUser: AppUserRow,
  options: PortfolioOption[],
  categories: MobilePortfolioCategory[],
  activeCategory: string,
  query: string,
  unread: number,
): string {
  const trimmedQuery = query.trim()
  const needle = trimmedQuery.toLowerCase()
  const visible = options.filter((option) => {
    if (activeCategory && option.category !== activeCategory) return false
    if (!needle) return true
    return option.category.toLowerCase().includes(needle) || option.url.toLowerCase().includes(needle)
  })

  const chips = [
    `<a class="m-chip ${activeCategory ? '' : 'on'}" href="/admin/m/portfolio">الكل <span class="n">${options.length}</span></a>`,
    ...categories.map(
      (category) =>
        `<a class="m-chip ${category.key === activeCategory ? 'on' : ''}" href="/admin/m/portfolio?cat=${encodeURIComponent(category.key)}">${escapeHtml(category.label)} <span class="n">${category.count}</span></a>`,
    ),
  ].join('')

  const grid = visible
    .map((option, index) => {
      const thumb = thumbUrlFor(option.url, 480, 270)
      const title = `${option.category} · فيديو ${index + 1}`
      const poster = thumb
        ? `<img src="${escapeHtml(thumb)}" alt="" loading="lazy" decoding="async" width="480" height="270">`
        : ''
      return `
      <div class="m-vcard" data-url="${escapeHtml(option.url)}" data-title="${escapeHtml(title)}">
        <button class="m-sheet-close" type="button" data-preview="${escapeHtml(option.url)}" data-preview-title="${escapeHtml(title)}" aria-label="معاينة ${escapeHtml(title)}" style="position:absolute;bottom:2.9rem;inset-inline-end:.45rem;z-index:3;width:34px;height:34px;border:none">${shellIcon('play', 15)}</button>
        <label class="m-vpick-label">
          <input type="checkbox" name="videos" value="${escapeHtml(option.url)}" data-title="${escapeHtml(title)}">
          <span class="m-vthumb">
            ${poster}
            <span class="m-vplay"><span>${shellIcon('play', 16)}</span></span>
          </span>
          <span class="m-vcheck">${shellIcon('check', 15)}</span>
          <span class="m-vcheck-num"></span>
          <span class="m-vbody">
            <span class="m-vtitle">${escapeHtml(option.category)}</span>
            <span class="m-vcat">فيديو ${index + 1}</span>
          </span>
        </label>
      </div>`
    })
    .join('')

  const content = `
  <form class="m-search" method="get" action="/admin/m/portfolio" role="search">
    <span class="m-search-ico">${shellIcon('search', 19)}</span>
    <input class="m-input" type="search" name="q" value="${escapeHtml(trimmedQuery)}" placeholder="ابحث في الأعمال…" autocomplete="off" enterkeyhint="search">
    <button type="submit" aria-label="بحث">${shellIcon('refresh', 18)}</button>
  </form>
  <div class="m-chips" role="tablist" aria-label="الأقسام">${chips}</div>
  <p class="m-muted" style="margin:.4rem .1rem .2rem">${visible.length} فيديو — اضغط على الفيديو لتحديده، ويمكنك اختيار أكثر من فيديو.</p>
  ${visible.length > 0 ? `<div class="m-vgrid">${grid}</div>` : '<div class="m-card m-empty">لا توجد نتائج مطابقة.</div>'}
  <div class="m-pickbar" id="m-pickbar">
    <span class="m-pick-count" id="m-pick-count">0 فيديو محدد<small>اختر الفيديوهات التي تريد إرسالها</small></span>
    <button class="m-btn m-btn-quiet" type="button" id="m-pick-clear">مسح</button>
    <a class="m-btn m-btn-primary" href="/admin/m/new" id="m-pick-next">${shellIcon('arrowLeft', 17)} التالي</a>
  </div>`

  const script = `<script>${SCRIPT_BASE}
${PICK_SCRIPT}</script>${sheetHtml()}`

  return mobilePage({
    title: 'الأعمال',
    user: appUser,
    tab: 'portfolio',
    subtitle: 'اختر فيديوهات التسليم',
    leading: backLink('/admin/m'),
    content,
    scripts: script,
    unread,
    bodyClass: 'm-picking',
  })
}

const PICK_SCRIPT = `
var cards = Array.prototype.slice.call(document.querySelectorAll('.m-vcard'));
var bar = document.getElementById('m-pickbar');
var countEl = document.getElementById('m-pick-count');
function selectedCards(){
  return cards.filter(function(c){ var i = c.querySelector('input'); return i && i.checked; });
}
function paint(){
  var sel = selectedCards();
  cards.forEach(function(c){
    var input = c.querySelector('input');
    if (!input) return;
    c.classList.toggle('sel', input.checked);
    var num = c.querySelector('.m-vcheck-num');
    if (num) {
      var at = sel.indexOf(c);
      num.textContent = at >= 0 ? String(at + 1) : '';
    }
  });
  if (countEl) {
    countEl.firstChild.nodeValue = sel.length + ' فيديو محدد';
    var sub = countEl.querySelector('small');
    if (sub) sub.textContent = sel.length === 1 ? 'يمكنك اختيار المزيد' : 'الترتيب حسب ترتيب الضغط';
  }
  if (bar) bar.classList.toggle('show', sel.length > 0);
}
// Restore a selection made in a previous step (e.g. back from the form).
cards.forEach(function(c){
  var input = c.querySelector('input');
  if (!input) return;
  if (M.sel.some(function(s){ return s && s.url === input.value; })) input.checked = true;
  input.addEventListener('change', function(){
    var all = selectedCards();
    if (input.checked) M.sel.push({ url: input.value, title: input.getAttribute('data-title') || '' });
    else M.sel = M.sel.filter(function(s){ return s && s.url !== input.value; });
    M.saveSel(M.sel);
    paint();
  });
});
paint();
var next = document.getElementById('m-pick-next');
if (next) {
  next.addEventListener('click', function(ev){
    ev.preventDefault();
    var sel = selectedCards();
    if (sel.length === 0) { M.toast('اختر فيديو واحداً على الأقل'); return; }
    M.saveSel(sel.map(function(c){
      var i = c.querySelector('input');
      return { url: i.value, title: i.getAttribute('data-title') || '' };
    }));
    window.location.href = '/admin/m/new';
  });
}
var clear = document.getElementById('m-pick-clear');
if (clear) {
  clear.addEventListener('click', function(ev){
    ev.preventDefault();
    cards.forEach(function(c){ var i = c.querySelector('input'); if (i) i.checked = false; });
    M.clearSel();
    paint();
  });
}
// Live filter: keeps the current selection untouched while narrowing the list.
var search = document.querySelector('.m-search input[type=search]');
if (search) {
  var apply = function(){
    var q = search.value.trim().toLowerCase();
    cards.forEach(function(c){
      var hit = !q || (c.getAttribute('data-title') || '').toLowerCase().indexOf(q) >= 0 || (c.getAttribute('data-url') || '').toLowerCase().indexOf(q) >= 0;
      c.style.display = hit ? '' : 'none';
    });
  };
  search.addEventListener('input', apply);
  if (search.value) apply();
  search.addEventListener('keydown', function(ev){ if (ev.key === 'Enter') { ev.preventDefault(); apply(); } });
}
`

// The delivery link is shown once, right after creation. The server never
// stores it in a recoverable form, so the app keeps it on this device only.
function successSheetHtml(): string {
  return `
<div class="m-sheet" id="m-done" role="dialog" aria-modal="true" aria-labelledby="m-done-title">
  <div class="m-sheet-top">
    <span class="m-sheet-title" id="m-done-title">تم إنشاء رابط التسليم بنجاح</span>
    <a class="m-sheet-close" href="/admin/m/deliveries" aria-label="إغلاق">${shellIcon('close', 18)}</a>
  </div>
  <div class="m-sheet-body">
    <div class="m-inner">
      <div class="m-ok-badge">${shellIcon('check', 30)}</div>
      <h2 class="m-hero-title">الرابط جاهز للمشاركة</h2>
      <p class="m-muted" style="margin-top:.35rem">أرسله للعميل <strong data-done-name></strong> عبر أي تطبيق مراسلة.</p>
      <div class="m-linkbox" style="margin-top:1rem"><span style="flex:1" data-done-link></span></div>
      <div class="m-actions" style="margin-top:1rem">
        <button class="m-btn m-btn-primary m-btn-lg m-btn-block" type="button" data-done-copy>${shellIcon('copy', 18)} نسخ الرابط</button>
      </div>
      <div class="m-actions-row" style="margin-top:.6rem">
        <a class="m-btn m-btn-ghost m-btn-block" href="#" target="_blank" rel="noopener" data-done-open>${shellIcon('external', 17)} فتح الرابط</a>
      </div>
      <section class="m-card" style="margin-top:1.1rem" data-done-meta></section>
      <p class="m-tiny" style="text-align:center;margin-top:.8rem">حُفظ الرابط على هذا الجهاز. انسخه وأرسله للعميل بنفسك — لا يُرسل الموقع أي رسالة تلقائياً.</p>
      <div class="m-actions" style="margin-top:.9rem">
        <a class="m-btn m-btn-ghost m-btn-block" href="/admin/m/deliveries">${shellIcon('package', 17)} إلى التسليمات</a>
        <a class="m-btn m-btn-quiet m-btn-block" href="/admin/m/new">تسليم جديد آخر</a>
      </div>
    </div>
  </div>
</div>`
}

//----------------------------------------------------------------------------
// Create delivery — /admin/m/new
//----------------------------------------------------------------------------

export function renderMobileNew(
  appUser: AppUserRow,
  state: { error?: string; name?: string; mode?: string },
  unread: number,
): string {
  const content = `
  <section class="m-card">
    <div class="m-eyebrow">${shellIcon('link', 14)} رابط واحد لكل الفيديوهات</div>
    <h2 class="m-hero-title" style="margin-top:.3rem">بيانات العميل</h2>
    <p class="m-muted" style="margin-top:.3rem">الاسم فقط يكفي. لا نطلب واتساب ولا بريداً ولا العنوان.</p>
    ${state.error ? `<div class="m-alert error" role="alert">${escapeHtml(state.error)}</div>` : ''}
    <form id="m-new-form" method="post" action="/admin/m/new" novalidate>
      <label class="m-field">
        <span>اسم العميل</span>
        <input class="m-input" type="text" name="name" id="m-name" value="${escapeHtml(state.name ?? '')}" placeholder="مثال: سارة بنعلي" maxlength="80" autocomplete="name" enterkeyhint="done" required>
      </label>
    </form>
  </section>
  <section class="m-card">
    <div class="m-eyebrow">${shellIcon('video', 14)} الفيديوهات</div>
    <h2 class="m-hero-title" style="margin-top:.3rem">الفيديوهات المختارة <span class="m-tiny" id="m-sel-count"></span></h2>
    <p class="m-muted" style="margin-top:.3rem">كل الفيديوهات المختارة تُرسل في رابط واحد للعميل.</p>
    <div id="m-sel-list" class="m-list"></div>
    <p class="m-tiny" id="m-sel-empty" style="margin-top:.4rem">لم تختر فيديوهات بعد.</p>
    <a class="m-btn m-btn-ghost m-btn-block" href="/admin/m/portfolio" style="margin-top:.6rem">${shellIcon('video', 17)} اختيار فيديوهات</a>
  </section>
  <section class="m-card">
    <div class="m-field">
      <span>وضع الرابط</span>
      <div class="m-list">
        <div class="m-list-row">
          <span class="m-list-ico">${shellIcon('eye', 18)}</span>
          <span>معاينة فقط — بدون تحميل</span>
          <span class="m-chip on" aria-hidden="true">${shellIcon('lock', 13)} 24 ساعة</span>
        </div>
      </div>
      <p class="m-tiny" style="margin-top:.35rem">العميل يشاهد الفيديوهات فقط، والرابط يتوقف تلقائياً بعد 24 ساعة من إنشائه.</p>
    </div>
    <div class="m-actions" style="margin-top:1.1rem">
      <button class="m-btn m-btn-primary m-btn-lg m-btn-block" type="submit" id="m-submit" form="m-new-form">${shellIcon('check', 18)} إنشاء رابط التسليم</button>
    </div>
    <p class="m-tiny" style="text-align:center;margin-top:.9rem">${shellIcon('lock', 13)} يُحفظ الرابط على هذا الجهاز فقط، ويظهر مرة واحدة عند الإنشاء.</p>
  </section>
  ${successSheetHtml()}`

  const script = `<script>${SCRIPT_BASE}
${NEW_SCRIPT}</script>`

  return mobilePage({
    title: 'تسليم جديد',
    user: appUser,
    tab: 'portfolio',
    subtitle: 'اسم العميل وفيديوهاته ورابط واحد',
    leading: backLink('/admin/m/portfolio'),
    content,
    scripts: script,
    unread,
  })
}

const NEW_SCRIPT = `
var form = document.getElementById('m-new-form');
var listEl = document.getElementById('m-sel-list');
var emptyEl = document.getElementById('m-sel-empty');
var countEl = document.getElementById('m-sel-count');
var submit = document.getElementById('m-submit');

function paintSelection(){
  if (!listEl) return;
  listEl.innerHTML = '';
  M.sel.forEach(function(item, index){
    var row = document.createElement('div');
    var ico = document.createElement('span');
    ico.className = 'm-list-ico';
    ico.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5.5" width="13" height="13" rx="2.6"/><path d="m16 10.5 5-3.2v9.4l-5-3.2"/></svg>';
    var label = document.createElement('span');
    label.textContent = (index + 1) + '. ' + (item.title || 'فيديو من المعرض');
    var rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'm-btn m-btn-quiet';
    rm.textContent = 'إزالة';
    rm.addEventListener('click', function(){
      M.sel = M.sel.filter(function(s){ return s.url !== item.url; });
      M.saveSel(M.sel);
      paintSelection();
    });
    row.appendChild(ico);
    row.appendChild(label);
    row.appendChild(rm);
    listEl.appendChild(row);
  });
  if (emptyEl) emptyEl.hidden = M.sel.length > 0;
  if (countEl) countEl.textContent = M.sel.length ? '(' + M.sel.length + ')' : '';
  if (submit) submit.disabled = M.sel.length === 0;
}
paintSelection();

function fail(message){
  var box = form.querySelector('.m-alert.error');
  if (!box) {
    box = document.createElement('div');
    box.className = 'm-alert error';
    box.setAttribute('role', 'alert');
    form.insertBefore(box, form.firstChild);
  }
  box.textContent = message;
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

form.addEventListener('submit', function(ev){
  ev.preventDefault();
  var name = document.getElementById('m-name').value.trim().replace(/\s+/g, ' ');
  if (name.length < 2) { fail('أدخل اسم العميل (حرفان على الأقل).'); return; }
  if (M.sel.length === 0) { fail('اختر فيديو واحداً على الأقل من الأعمال.'); return; }
  submit.disabled = true;
  submit.textContent = 'جارٍ إنشاء الرابط…';
  fetch('/admin/m/new', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name, videos: M.sel.map(function(s){ return s.url; }) })
  }).then(function(res){
    return res.json().then(function(data){ return { ok: res.ok, data: data }; });
  }).then(function(result){
    if (!result.ok) {
      fail(result.data && result.data.error ? result.data.error : 'تعذّر إنشاء الرابط.');
      submit.disabled = false;
      submit.textContent = 'إنشاء رابط التسليم';
      return;
    }
    M.saveLink(result.data.deliveryId, {
      link: result.data.link,
      name: name,
      videos: result.data.videoCount,
      mode: result.data.mode,
      at: result.data.createdAt
    });
    M.clearSel();
    showSuccess(result.data, name);
  }).catch(function(){
    fail('تعذّر الاتصال بالخادم. تحقق من الشبكة وحاول مجدداً.');
    submit.disabled = false;
    submit.textContent = 'إنشاء رابط التسليم';
  });
});

function showSuccess(data, name){
  var sheet = document.getElementById('m-done');
  if (!sheet) return;
  var linkEl = sheet.querySelector('[data-done-link]');
  var nameEl = sheet.querySelector('[data-done-name]');
  var metaEl = sheet.querySelector('[data-done-meta]');
  if (linkEl) linkEl.textContent = data.link;
  if (nameEl) nameEl.textContent = name;
  if (metaEl) {
    metaEl.innerHTML =
      '<div class="m-kv"><span class="k">العميل</span><span class="v">' + esc(name) + '</span></div>' +
      '<div class="m-kv"><span class="k">عدد الفيديوهات</span><span class="v">' + (data.videoCount || 0) + '</span></div>' +
      '<div class="m-kv"><span class="k">الوضع</span><span class="v">معاينة فقط — بدون تحميل</span></div>' +
      '<div class="m-kv"><span class="k">الرمز</span><span class="v" style="direction:ltr">' + esc(data.identifier) + '</span></div>' +
      '<div class="m-kv"><span class="k">ينتهي في</span><span class="v">' + esc(data.expiresAt ? fmtStamp(data.expiresAt) : '—') + '</span></div>';
  }
  sheet.classList.add('open');
  document.body.style.overflow = 'hidden';
  var copyBtn = sheet.querySelector('[data-done-copy]');
  if (copyBtn) {
    copyBtn.addEventListener('click', function(){
      M.copy(data.link).then(function(){ M.toast('تم نسخ الرابط'); }).catch(function(){ M.toast('تعذّر النسخ — انسخ الرابط يدوياً'); });
    });
  }
  var openBtn = sheet.querySelector('[data-done-open]');
  if (openBtn) openBtn.href = data.link;
}
function esc(value){
  var d = document.createElement('div');
  d.textContent = value == null ? '' : String(value);
  return d.innerHTML;
}
function fmtStamp(value){
  var d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  var pad = function(n){ return n < 10 ? '0' + n : String(n); };
  return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + ' — ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
`

//----------------------------------------------------------------------------
// Deliveries — /admin/m/deliveries
//----------------------------------------------------------------------------

export function renderMobileDeliveries(
  appUser: AppUserRow,
  rows: MobileDeliveryRow[],
  filter: { q: string; status: MobileFilter },
  unread: number,
): string {
  const q = filter.q.trim().toLowerCase()
  const visible = rows.filter((row) => {
    if (filter.status !== 'all' && statusGroup(row.status) !== filter.status) return false
    if (!q) return true
    return (
      row.name.toLowerCase().includes(q) ||
      (row.clientVisibleId ?? '').toLowerCase().includes(q) ||
      row.id.toLowerCase().includes(q)
    )
  })

  const chip = (value: MobileFilter, label: string) => {
    const count = value === 'all' ? rows.length : rows.filter((r) => statusGroup(r.status) === value).length
    const href = `/admin/m/deliveries?status=${value}${q ? `&q=${encodeURIComponent(filter.q)}` : ''}`
    return `<a class="m-chip ${filter.status === value ? 'on' : ''}" href="${href}">${label} <span class="n">${count}</span></a>`
  }

  const content = `
  <form class="m-search" method="get" action="/admin/m/deliveries" role="search">
    <span class="m-search-ico">${shellIcon('search', 19)}</span>
    <input class="m-input" type="search" name="q" value="${escapeHtml(filter.q)}" placeholder="ابحث باسم العميل…" autocomplete="off" enterkeyhint="search">
    <button type="submit" aria-label="بحث">${shellIcon('refresh', 18)}</button>
  </form>
  <div class="m-chips">
    ${chip('all', 'الكل')}${chip('active', 'نشط')}${chip('downloaded', 'تم التحميل')}${chip('expired', 'منتهي')}
  </div>
  <p class="m-muted" style="margin:.4rem .1rem .7rem">${visible.length} توصيل</p>
  ${visible.length > 0 ? visible.map(deliveryRow).join('') : '<div class="m-card m-empty">لا توجد توصيلات مطابقة.</div>'}
  <div class="m-actions" style="margin-top:1rem">
    <a class="m-btn m-btn-primary m-btn-block" href="/admin/m/new">${shellIcon('plus', 18)} توصيل جديد</a>
  </div>`

  const script = `<script>${SCRIPT_BASE}
${LINK_SCRIPT}</script>`

  return mobilePage({
    title: 'التسليمات',
    user: appUser,
    tab: 'deliveries',
    subtitle: `${rows.length} توصيل`,
    content,
    scripts: script,
    unread,
  })
}

// Applies the locally stored private links to the delivery rows: a link can
// only be re-opened on a device that stored it at creation time, and the UI
// says so plainly when it is not available.
const LINK_SCRIPT = `
Array.prototype.forEach.call(document.querySelectorAll('[data-delivery]'), function(row){
  var id = row.getAttribute('data-delivery');
  var entry = M.links[id];
  if (!entry || !entry.link) return;
  var copy = row.querySelector('[data-copy-for="' + id + '"]');
  var open = row.querySelector('[data-open-for="' + id + '"]');
  var link = row.querySelector('[data-link-for="' + id + '"]');
  if (copy) {
    copy.disabled = false;
    copy.addEventListener('click', function(){
      M.copy(entry.link).then(function(){ M.toast('تم نسخ الرابط'); }).catch(function(){ M.toast('تعذّر النسخ — انسخ الرابط يدوياً'); });
    });
  }
  if (open) {
    open.hidden = false;
    open.removeAttribute('aria-disabled');
    open.href = entry.link;
  }
  if (link) {
    link.hidden = false;
    link.textContent = entry.link;
  }
});
`

//----------------------------------------------------------------------------
// More — /admin/m/more
//----------------------------------------------------------------------------

export function renderMobileMore(
  appUser: AppUserRow,
  notifications: MobileNotification[],
  unread: number,
): string {
  const notifRows = notifications.length
    ? notifications
        .slice(0, 6)
        .map(
          (item) => `
      <div>
        <span class="m-list-ico">${shellIcon(item.read ? 'check' : 'bell', 17)}</span>
        <span style="flex:1;min-width:0">
          <span style="display:block">${escapeHtml(item.title)}</span>
          <span class="m-tiny">${escapeHtml(item.body || fmtDate(item.createdAt))}</span>
        </span>
      </div>`,
        )
        .join('')
    : '<div class="m-empty m-tiny">لا توجد إشعارات.</div>'

  const content = `
  <section class="m-card" style="display:flex;align-items:center;gap:.8rem">
    <span class="m-avatar">${appUser.avatar_key ? `<img src="/admin/avatar?id=${encodeURIComponent(appUser.id)}" alt="" width="44" height="44" decoding="async">` : escapeHtml(profileDisplayName(appUser).slice(0, 1))}</span>
    <span style="min-width:0">
      <span style="display:block;font-weight:800;font-size:1rem;overflow-wrap:anywhere">${escapeHtml(profileDisplayName(appUser))}</span>
      <span class="m-tiny">${roleLabel(appUser)}</span>
    </span>
  </section>

  <h2 class="m-section-title">${shellIcon('bell', 17)} الإشعارات${unread > 0 ? ` <span class="m-pill accent">${unread} جديد</span>` : ''}</h2>
  <section class="m-card"><div class="m-list">${notifRows}</div></section>

  <h2 class="m-section-title">${shellIcon('settings', 17)} التطبيق</h2>
  <section class="m-card">
    <div class="m-list">
      <a href="/admin"><span class="m-list-ico">${shellIcon('grid', 18)}</span><span style="flex:1">لوحة التحكم الكاملة</span>${shellIcon('arrowLeft', 16)}</a>
      <a href="/admin/m/deliveries"><span class="m-list-ico">${shellIcon('package', 18)}</span><span style="flex:1">كل التسليمات</span>${shellIcon('arrowLeft', 16)}</a>
      <a href="/admin/m/portfolio"><span class="m-list-ico">${shellIcon('video', 18)}</span><span style="flex:1">معرض الأعمال</span>${shellIcon('arrowLeft', 16)}</a>
    </div>
  </section>

  <h2 class="m-section-title">${shellIcon('lock', 17)} الخصوصية</h2>
  <section class="m-card">
    <p class="m-muted">أسماء العملاء والروابط التي تنشئها تبقى على هذا الجهاز. صورة الملف الشخصي ومعلومات الحساب تُدار من لوحة التحكم.</p>
  </section>

  <div class="m-actions" style="margin-top:1.2rem">
    <a class="m-btn m-btn-ghost m-btn-block" href="/admin/logout" style="color:var(--m-error)">${shellIcon('logout', 18)} تسجيل الخروج</a>
  </div>
  <p class="m-tiny" style="text-align:center;margin-top:1rem">${escapeHtml(roleLabel(appUser))} · Photography Pixel</p>`

  return mobilePage({
    title: 'المزيد',
    user: appUser,
    tab: 'more',
    subtitle: unread > 0 ? `${unread} إشعار غير مقروء` : 'الحساب والإشعارات',
    content,
    unread,
  })
}
