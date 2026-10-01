import { escapeHtml, shellIcon } from '../../_lib/shell'
import { profileDisplayName } from '../../_lib/profile'
import { thumbUrlFor } from '../../_lib/bamboo'
import type { AppUserRow } from '../../_lib/types'
import { backLink, mobilePage } from '../../_lib/mobile-shell'
import type { PortfolioOption } from '../../deliveries/_helpers'
import type { MobileNotification } from './mobile-data'

/**
 * Fixed product rule for a Coordinator temporary share, mirrored from the server
 * constant TEMPORARY_SHARE_TTL_MS so the UI never implies a different window
 * than the one the server actually enforces.
 */
export const TEMPORARY_SHARE_HOURS = 24

//============================================================================
// Phase 5A — Mobile Team Workspace views (presentation only).
//
// The Coordinator app is TEMPORARY VIDEO SHARING. Screens here are limited to:
//   الرئيسية   how the app works + entry points
//   الأعمال     the public portfolio, with multi-select
//   المزيد      own notifications + own account
// There is no delivery list, no delivery history and no client anywhere in this
// app; those belong to the Owner Client Delivery system.
//
// Every screen is a server-rendered page for the same authenticated data the
// admin uses. Progressive enhancement: the pages render and are usable as plain
// HTML; small inline scripts add the app-like selection and the success sheet.
// No client-side security decisions are made here — the server re-validates
// everything.
//============================================================================

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

export function renderMobileHome(appUser: AppUserRow, unread: number): string {
  const content = `
  <section class="m-card">
    <div class="m-eyebrow">${roleLabel(appUser)}</div>
    <h2 class="m-hero-title" style="margin-top:.2rem">أهلاً، ${escapeHtml(profileDisplayName(appUser))}</h2>
    <p class="m-muted" style="margin-top:.3rem">مشاركة فيديوهات في خطوات بسيطة: افتح الأعمال، اختر الفيديو، أنشئ الرابط، وشاركه.</p>
  </section>

  <div class="m-tiles">
    <a class="m-tile" href="/admin/m/portfolio">
      <span class="m-tile-ico">${shellIcon('video', 21)}</span>
      <span class="m-tile-t">الأعمال</span>
      <span class="m-tile-s">تصفّح معرض الفيديوهات واختر ما تريد</span>
    </a>
    <a class="m-tile" href="/admin/m/new">
      <span class="m-tile-ico alt">${shellIcon('link', 21)}</span>
      <span class="m-tile-t">إنشاء رابط</span>
      <span class="m-tile-s">فيديوهاتك → رابط مشاهدة واحد</span>
    </a>
    <a class="m-tile" href="/admin/m/more">
      <span class="m-tile-ico alt">${shellIcon('bell', 21)}</span>
      <span class="m-tile-t">المزيد</span>
      <span class="m-tile-s">${unread > 0 ? `${unread} إشعار غير مقروء` : 'الإشعارات والحساب'}</span>
    </a>
  </div>

  <h2 class="m-section-title">${shellIcon('lock', 17)} كيف يعمل الرابط</h2>
  <div class="m-card">
    <p class="m-muted" style="margin:.2rem 0 .8rem">${escapeHtml(`الرابط صالح ${TEMPORARY_SHARE_HOURS} ساعة من إنشائه فقط، ويختفي بعدها تلقائياً — بدون أي متابعة أو تنظيف منك.`)}</p>
    <ol class="m-steps">
      <li class="m-step"><span class="m-step-n">1</span><span class="m-step-t">افتح <strong>الأعمال</strong> واختر الفيديو.</span></li>
      <li class="m-step"><span class="m-step-n">2</span><span class="m-step-t">اضغط <strong>إنشاء رابط</strong>.</span></li>
      <li class="m-step"><span class="m-step-n">3</span><span class="m-step-t"><strong>انسخ الرابط</strong> وشاركه.</span></li>
    </ol>
    <p class="m-muted" style="margin-top:.8rem">الزائر يشاهد فقط. لا تحميل ولا تأكيد — الرابط شخصي ولا يُربط بعميل.</p>
  </div>`

  const script = `<script>${SCRIPT_BASE}</script>`

  return mobilePage({
    title: 'الرئيسية',
    user: appUser,
    tab: 'home',
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
    subtitle: 'اختر الفيديوهات للمشاركة',
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

// Success after creating a temporary share.
//
// Phase 5A requirement: the coordinator sees ONLY the confirmation, the link
// and two buttons. There is no client name, no video count, no mode row, no
// identifier, no expiry timestamp and no link to a delivery list — because
// there is no delivery record on the coordinator's side at all.
function successSheetHtml(): string {
  return `
<div class="m-sheet" id="m-done" role="dialog" aria-modal="true" aria-labelledby="m-done-title">
  <div class="m-sheet-body">
    <div class="m-inner">
      <div class="m-ok-badge">${shellIcon('check', 30)}</div>
      <h2 class="m-hero-title" id="m-done-title">تم إنشاء الرابط</h2>
      <div class="m-linkbox" style="margin-top:1rem"><span style="flex:1" data-done-link></span></div>
      <div class="m-actions" style="margin-top:1rem">
        <button class="m-btn m-btn-primary m-btn-lg m-btn-block" type="button" data-done-copy>${shellIcon('copy', 18)} نسخ الرابط</button>
      </div>
      <div class="m-actions-row" style="margin-top:.6rem">
        <a class="m-btn m-btn-ghost m-btn-block" href="#" target="_blank" rel="noopener" data-done-open>${shellIcon('external', 17)} فتح الرابط</a>
      </div>
      <div class="m-actions" style="margin-top:.9rem">
        <a class="m-btn m-btn-quiet m-btn-block" href="/admin/m/new">إنشاء رابط آخر</a>
      </div>
    </div>
  </div>
</div>`
}

//----------------------------------------------------------------------------
// Create temporary share — /admin/m/new
//----------------------------------------------------------------------------

export function renderMobileNew(
  appUser: AppUserRow,
  state: { error?: string },
  unread: number,
): string {
  const content = `
  <section class="m-card">
    <div class="m-eyebrow">${shellIcon('link', 14)} رابط واحد لكل الفيديوهات</div>
    <h2 class="m-hero-title" style="margin-top:.3rem">إنشاء رابط</h2>
    <p class="m-muted" style="margin-top:.3rem">لا اسم ولا بيانات عميل. الرابط للمشاهدة فقط.</p>
    ${state.error ? `<div class="m-alert error" role="alert">${escapeHtml(state.error)}</div>` : ''}
    <form id="m-new-form" method="post" action="/admin/m/new" novalidate></form>
  </section>
  <section class="m-card">
    <div class="m-eyebrow">${shellIcon('video', 14)} الفيديوهات</div>
    <h2 class="m-hero-title" style="margin-top:.3rem">الفيديوهات المختارة <span class="m-tiny" id="m-sel-count"></span></h2>
    <p class="m-muted" style="margin-top:.3rem">كل الفيديوهات المختارة تُجمع في رابط واحد للمشاهدة.</p>
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
          <span class="m-chip on" aria-hidden="true">${shellIcon('lock', 13)} ${TEMPORARY_SHARE_HOURS} ساعة</span>
        </div>
      </div>
      <p class="m-tiny" style="margin-top:.35rem">${escapeHtml(`المشاهد يشاهد الفيديوهات فقط، والرابط يتوقف تلقائياً بعد ${TEMPORARY_SHARE_HOURS} ساعة من إنشائه — بدون أي تنظيف منك.`)}</p>
    </div>
    <div class="m-actions" style="margin-top:1.1rem">
      <button class="m-btn m-btn-primary m-btn-lg m-btn-block" type="submit" id="m-submit" form="m-new-form">${shellIcon('check', 18)} إنشاء رابط</button>
    </div>
    <p class="m-tiny" style="text-align:center;margin-top:.9rem">${shellIcon('lock', 13)} يُحفظ الرابط على هذا الجهاز فقط، ويظهر مرة واحدة عند الإنشاء.</p>
  </section>
  ${successSheetHtml()}`

  const script = `<script>${SCRIPT_BASE}
${NEW_SCRIPT}</script>`

  return mobilePage({
    title: 'إنشاء رابط',
    user: appUser,
    tab: 'portfolio',
    subtitle: 'فيديوهاتك في رابط واحد',
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
  if (M.sel.length === 0) { fail('اختر فيديو واحداً على الأقل من الأعمال.'); return; }
  submit.disabled = true;
  submit.textContent = 'جارٍ إنشاء الرابط…';
  fetch('/admin/m/new', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Videos only. No client identity is collected or sent.
    body: JSON.stringify({ videos: M.sel.map(function(s){ return s.url; }) })
  }).then(function(res){
    return res.json().then(function(data){ return { ok: res.ok, data: data }; });
  }).then(function(result){
    if (!result.ok) {
      fail(result.data && result.data.error ? result.data.error : 'تعذّر إنشاء الرابط.');
      submit.disabled = false;
      submit.textContent = 'إنشاء رابط';
      return;
    }
    M.saveLink(result.data.deliveryId, {
      link: result.data.link,
      videos: result.data.videoCount,
      mode: result.data.mode,
      shareKind: result.data.shareKind,
      at: result.data.createdAt
    });
    M.clearSel();
    showSuccess(result.data);
  }).catch(function(){
    fail('تعذّر الاتصال بالخادم. تحقق من الشبكة وحاول مجدداً.');
    submit.disabled = false;
    submit.textContent = 'إنشاء رابط';
  });
});

// Only the confirmation, the link and the two buttons — per the Phase 5A spec.
function showSuccess(data){
  var sheet = document.getElementById('m-done');
  if (!sheet) return;
  var linkEl = sheet.querySelector('[data-done-link]');
  if (linkEl) linkEl.textContent = data.link;
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
      <a href="/admin/m/portfolio"><span class="m-list-ico">${shellIcon('video', 18)}</span><span style="flex:1">معرض الأعمال</span>${shellIcon('arrowLeft', 16)}</a>
    </div>
  </section>

  <h2 class="m-section-title">${shellIcon('lock', 17)} الخصوصية</h2>
  <section class="m-card">
    <p class="m-muted">${escapeHtml(`لا يطلب التطبيق أسماء أو بيانات عملاء. الروابط التي تنشئها تبقى على هذا الجهاز فقط، وتتحول إلى وضع غير فعال تلقائياً بعد ${TEMPORARY_SHARE_HOURS} ساعة.`)} صورة الملف الشخصي ومعلومات الحساب تُدار من لوحة التحكم.</p>
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
