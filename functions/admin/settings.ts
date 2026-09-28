import type { PagesFunction } from '@cloudflare/workers-types'
import { html, readAdminData, requireSession } from './_lib/auth'
import type { Env } from './_lib/env'
import {
  PROFILE_AVATAR_MAX_BYTES,
  PROFILE_NAME_MAX_CHARS,
  avatarObjectKey,
  detectImageType,
  imageMime,
  normalizeProfileName,
  profileInitials,
} from './_lib/profile'
import { sameOrigin } from './_lib/security'
import { shell, shellIcon, escapeHtml } from './_lib/shell'
import type { AppUserRow, AppUsersUpdate } from './_lib/types'
import type { Db } from './_lib/supabase'

//============================================================================
// /admin/settings — personal profile settings.
//
// Identity model:
//   - display name  -> app_users.full_name (reused, no new column)
//   - avatar        -> private R2 object key app_users.avatar_key
//                      (avatars/{user-id}/profile.{jpg|png|webp}),
//                      served only via /admin/avatar behind a session.
//   - email         -> read-only account email (never changeable here).
//
// Every write is scoped to the authenticated user's own row (id === self)
// and goes through the service role exactly like the rest of the admin API.
// A user can never touch another user's name/avatar here — team management
// stays in /admin/team (owner-only).
//============================================================================

type AdminFunction = PagesFunction<Env, never, Record<string, unknown>>
type AdminContext = Parameters<AdminFunction>[0]

function settingsJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  })
}

async function readJson(context: AdminContext): Promise<Record<string, unknown> | null> {
  try {
    const body = await context.request.json()
    if (body === null || typeof body !== 'object') return null
    return body as Record<string, unknown>
  } catch {
    return null
  }
}

//--------------------------------------------------------------------------
// GET — profile page
//--------------------------------------------------------------------------

export const onRequestGet: AdminFunction = async (context) => {
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser
  return html(renderSettings(appUser))
}

const SETTINGS_STYLES = `
<style>
  .settings-col{width:100%;max-width:46rem;display:flex;flex-direction:column;gap:1.1rem}
  .profile-avatar-row{display:flex;align-items:center;gap:1.2rem;flex-wrap:wrap;margin-bottom:1.4rem}
  .avatar-preview{width:84px;height:84px;border-radius:var(--radius-full);font-size:1.6rem;flex:none;box-shadow:var(--shadow-md)}
  .profile-avatar-actions{display:flex;flex-direction:column;align-items:flex-start;gap:.5rem}
  .profile-avatar-actions .row{row-gap:.5rem}
  .email-kbd{direction:ltr;text-align:left;background:var(--bg-secondary);border:1px solid var(--line-default);border-radius:var(--radius-md);padding:.68rem .85rem;color:var(--text-secondary);font-size:.95rem;word-break:break-all}
</style>`

function avatarPreviewMarkup(user: AppUserRow): string {
  if (user.avatar_key) {
    return `<img class="avatar avatar-img avatar-preview" src="/admin/avatar?id=${encodeURIComponent(user.id)}" alt="" width="84" height="84" decoding="async">`
  }
  return `<span class="avatar avatar-preview" aria-hidden="true">${escapeHtml(profileInitials(user))}</span>`
}

function renderSettings(user: AppUserRow): string {
  const initials = escapeHtml(profileInitials(user))
  const hasAvatar = Boolean(user.avatar_key)
  const removeBtn = `<button type="button" class="btn btn-danger" id="avatar-remove"${hasAvatar ? '' : ' hidden'}>${shellIcon('trash', 16)}<span>إزالة الصورة</span></button>`
  const content = `
    ${SETTINGS_STYLES}
    <div class="page-head">
      <div><h1>الإعدادات</h1><div class="sub">إدارة ملفك الشخصي وإعدادات الحساب.</div></div>
    </div>
    <div id="profile-status" class="alert" role="status" hidden></div>
    <div class="settings-col">
      <section class="card">
        <div class="form-card-title" style="margin-bottom:1.2rem">الملف الشخصي</div>
        <form id="profile-form">
          <div class="profile-avatar-row">
            <div class="avatar-preview-wrap" id="avatar-box" data-initials-text="${initials}">${avatarPreviewMarkup(user)}</div>
            <div class="profile-avatar-actions">
              <div class="row">
                <button type="button" class="btn btn-subtle" id="avatar-pick">${shellIcon('upload', 16)}<span>تغيير الصورة</span></button>
                ${removeBtn}
              </div>
              <span class="hint">JPG · PNG · WEBP — بحد أقصى 5 ميجابايت</span>
              <input type="file" id="avatar-input" accept="image/jpeg,image/png,image/webp" hidden>
            </div>
          </div>
          <div class="field">
            <label for="profile-name">الاسم</label>
            <input type="text" id="profile-name" name="name" value="${escapeHtml(user.full_name ?? '')}" placeholder="Abdellah Afkhar" maxlength="${PROFILE_NAME_MAX_CHARS}" autocomplete="name">
            <span class="hint">الاسم الظاهر في لوحة التحكم بدلاً من البريد الإلكتروني.</span>
          </div>
          <div class="field">
            <label for="profile-email">البريد الإلكتروني</label>
            <div class="email-kbd" id="profile-email" aria-label="البريد الإلكتروني">${escapeHtml(user.email)}</div>
            <span class="hint">بريد تسجيل الدخول — لا يمكن تغييره من هنا.</span>
          </div>
          <div class="actionbar">
            <button type="submit" class="btn btn-primary" id="profile-save">حفظ التغييرات</button>
          </div>
        </form>
      </section>

      <section class="card">
        <div class="form-card-title">الحساب / الأمان</div>
        <p class="muted">إدارة كلمة المرور وجلسات الدخول والمصادقة تُدار بشكل منفصل ولا يمكن تغييرها من هنا.</p>
      </section>
    </div>`

  return shell('الإعدادات', content, {
    active: 'settings',
    user,
    crumbs: 'Photography Pixel / الإعدادات',
  }, SETTINGS_SCRIPT)
}

//--------------------------------------------------------------------------
// POST — the authenticated user edits only their own profile
//--------------------------------------------------------------------------

export const onRequestPost: AdminFunction = async (context) => {
  if (!sameOrigin(context.request)) return settingsJson({ ok: false, error: 'طلب غير صالح.' }, 403)
  const appUser = await requireSession(context)
  if (appUser instanceof Response) {
    return settingsJson({ ok: false, error: 'غير مصرح.' }, appUser.status)
  }
  const data = readAdminData(context)
  if (!data) return settingsJson({ ok: false, error: 'النظام غير مهيأ.' }, 500)

  const action = context.request.headers.get('x-action')
  if (action === 'save-profile') return handleSaveProfile(context, data.service, appUser)
  if (action === 'upload-avatar') return handleUploadAvatar(context, data.service, appUser)
  return settingsJson({ ok: false, error: 'إجراء غير معروف.' }, 400)
}

async function handleSaveProfile(
  context: AdminContext,
  service: Db,
  appUser: AppUserRow,
): Promise<Response> {
  const body = await readJson(context)
  const rawName = typeof body?.name === 'string' ? body.name : ''
  const name = normalizeProfileName(rawName)
  if (name === null) {
    return settingsJson(
      { ok: false, error: `الاسم غير صالح — أقصر من ${PROFILE_NAME_MAX_CHARS} حرفاً وبدون رموز خاصة.` },
      400,
    )
  }
  const removeAvatar = body?.removeAvatar === true

  const patch: AppUsersUpdate = { full_name: name }
  if (removeAvatar) patch.avatar_key = null

  const { error } = await service.from('app_users').update(patch).eq('id', appUser.id)
  if (error) return settingsJson({ ok: false, error: 'تعذّر حفظ الاسم.' }, 500)

  if (removeAvatar && appUser.avatar_key && context.env.BUCKET) {
    await context.env.BUCKET.delete(appUser.avatar_key).catch(() => undefined)
  }
  return settingsJson({ ok: true })
}

async function handleUploadAvatar(
  context: AdminContext,
  service: Db,
  appUser: AppUserRow,
): Promise<Response> {
  const bucket = context.env.BUCKET
  if (!bucket) return settingsJson({ ok: false, error: 'تخزين الصور غير مهيأ.' }, 500)
  if (context.request.headers.get('content-length') === '0') {
    return settingsJson({ ok: false, error: 'الملف فارغ.' }, 400)
  }

  const bytes = new Uint8Array(await context.request.arrayBuffer())
  if (bytes.length === 0) return settingsJson({ ok: false, error: 'الملف فارغ.' }, 400)
  if (bytes.length > PROFILE_AVATAR_MAX_BYTES) {
    return settingsJson({ ok: false, error: 'حجم الصورة يتجاوز 5 ميجابايت.' }, 400)
  }

  // Server-side validation: sniff the magic bytes, never trust the browser MIME.
  const type = detectImageType(bytes)
  if (!type) return settingsJson({ ok: false, error: 'نوع الصورة غير مدعوم — استخدم JPG أو PNG أو WEBP.' }, 400)

  const key = avatarObjectKey(appUser.id, type)
  try {
    await bucket.put(key, bytes, { httpMetadata: { contentType: imageMime(type) } })
  } catch {
    return settingsJson({ ok: false, error: 'تعذّر حفظ الصورة.' }, 500)
  }

  const { error: updateError } = await service.from('app_users').update({ avatar_key: key }).eq('id', appUser.id)
  if (updateError) {
    await bucket.delete(key).catch(() => undefined)
    return settingsJson({ ok: false, error: 'تعذّر ربط الصورة بالملف الشخصي.' }, 500)
  }

  const previous = appUser.avatar_key
  if (previous && previous !== key) {
    // The extension may have changed (png -> jpg): drop the stale object.
    await bucket.delete(previous).catch(() => undefined)
  }
  return settingsJson({ ok: true, key })
}

const SETTINGS_SCRIPT = `<script>(function(){
  var form=document.getElementById('profile-form');
  var input=document.getElementById('avatar-input');
  var pick=document.getElementById('avatar-pick');
  var removeBtn=document.getElementById('avatar-remove');
  var box=document.getElementById('avatar-box');
  var status=document.getElementById('profile-status');
  var save=document.getElementById('profile-save');
  if(!form||!input||!pick||!box||!status||!save){ return; }
  var file=null; var removeRequested=false; var busy=false;
  var initials=box.getAttribute('data-initials-text')||'م';
  function setStatus(text,kind){ status.hidden=false; status.textContent=text; status.className='alert '+kind; }
  function renderInitials(){ box.innerHTML='<span class="avatar avatar-preview" aria-hidden="true">'+initials+'</span>'; }
  pick.addEventListener('click',function(){ input.click(); });
  input.addEventListener('change',function(){
    var f=input.files && input.files[0];
    if(!f){ return; }
    if(!/^image\\/(jpeg|png|webp)$/.test(f.type)){ setStatus('نوع الصورة غير مدعوم — استخدم JPG أو PNG أو WEBP.','error'); input.value=''; return; }
    if(f.size>${PROFILE_AVATAR_MAX_BYTES}){ setStatus('حجم الصورة يتجاوز 5 ميجابايت.','error'); input.value=''; return; }
    var url=URL.createObjectURL(f);
    box.innerHTML='';
    var img=document.createElement('img');
    img.className='avatar avatar-img avatar-preview'; img.src=url; img.alt=''; box.appendChild(img);
    file=f;
    if(removeRequested){ removeRequested=false; removeBtn.hidden=false; }
  });
  removeBtn.addEventListener('click',function(){
    file=null; input.value=''; removeRequested=true; removeBtn.hidden=true;
    renderInitials();
  });
  form.addEventListener('submit',function(e){
    e.preventDefault();
    if(busy){ return; }
    busy=true; save.disabled=true; save.textContent='جارٍ الحفظ…';
    function done(){ save.disabled=false; save.textContent='حفظ التغييرات'; busy=false; }
    (async function(){
      try {
        if(file){
          var up=await fetch('/admin/settings',{method:'POST',headers:{'x-action':'upload-avatar','Content-Type':file.type},body:file});
          var upj=await up.json();
          if(!upj.ok){ done(); setStatus(upj.error||'فشل رفع الصورة.','error'); return; }
        }
        var name=document.getElementById('profile-name').value||'';
        var res=await fetch('/admin/settings',{method:'POST',headers:{'Content-Type':'application/json','x-action':'save-profile'},body:JSON.stringify({name:name,removeAvatar:removeRequested})});
        var j=await res.json();
        if(!j.ok){ done(); setStatus(j.error||'تعذّر حفظ التغييرات.','error'); return; }
        setStatus('تم حفظ التغييرات.','success');
        setTimeout(function(){ location.reload(); },450);
      } catch(err){
        done(); setStatus('تعذّر الاتصال بالخادم.','error');
      }
    })();
  });
})();</script>`