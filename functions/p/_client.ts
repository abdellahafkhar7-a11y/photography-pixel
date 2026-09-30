import { recordActivity } from '../_lib/activities'
import { recordCommunication } from '../_lib/communications'
import type { ClientsRow, DeliveriesRow, DeliveryVideosRow, DeliveryVideosUpdate } from '../_lib/db-types'
import { siteUrl, type DeliveryEnv } from '../_lib/env'
import { createServiceClient, type Db } from '../_lib/supabase'
import { hashPrivateToken, isValidTokenFormat, splitStableToken } from '../_lib/tokens'
import { createR2PresignedUrl, contentDispositionHeader } from '../_lib/r2'
import { clientContactWaLink } from '../_lib/whatsapp'
import {
  brandPage,
  brandLogo,
  escapeHtml,
  formatDateTime,
  icon,
  statusBadgeHtml,
  sourcePillHtml,
  COPY_SCRIPT,
} from '../_lib/brand'

export const SITE_WHATSAPP = '212663493003'

export type PrivatePayload = DeliveriesRow & {
  clients: ClientsRow | null
  delivery_videos: DeliveryVideosRow[]
}

export type PrivateDelivery = {
  delivery: DeliveriesRow
  client: ClientsRow | null
  video: DeliveryVideosRow | null
  videos: DeliveryVideosRow[]
  identifier: string | null
}

export type ResolveResult = { kind: 'invalid' } | { kind: 'ok'; data: PrivateDelivery }

// Active items: one active version per item position, ordered by position.
// This is the full video set the private link exposes — the client page shows
// every active item, and /preview?item=N + /download?item=N select from it.
export function activeVideos(payload: PrivatePayload): DeliveryVideosRow[] {
  const active = (payload.delivery_videos ?? []).filter((item) => item.is_active === true)
  active.sort((a, b) => a.item_pos - b.item_pos || b.version - a.version)
  return active
}

export async function resolvePrivateDelivery(
  env: DeliveryEnv,
  token: string,
): Promise<ResolveResult> {
  // Phase 4L: the token segment may carry a cosmetic /p/<identifier>-<secret>
  // prefix. Only the secret is a credential — parse it off and hash that alone.
  const { identifier, secret } = splitStableToken(token)
  if (!isValidTokenFormat(secret)) return { kind: 'invalid' }
  const service = createServiceClient(env)
  if (!service) return { kind: 'invalid' }
  const hash = await hashPrivateToken(secret)
  const { data } = await service
    .from('deliveries')
    .select('*, clients(*), delivery_videos(*)')
    .eq('private_token_hash', hash)
    .maybeSingle<PrivatePayload>()
  if (!data) return { kind: 'invalid' }
  const videos = activeVideos(data)
  const video = videos[0] ?? null
  return { kind: 'ok', data: { delivery: data, client: data.clients, video, videos, identifier } }
}

/**
 * Phase 5A mobile Coordinator link. Marked purely from stored columns so no
 * migration or new column is needed: a client-less delivery that carries a
 * coordinator-typed name, is view-only, and has a hard link lifetime.
 *
 * These links get the simple viewing page: no download, and no "confirm the
 * videos" handshake (that stays for the classic admin/client flow).
 */
export function isCoordinatorMobileLink(delivery: DeliveriesRow): boolean {
  return (
    delivery.client_id === null &&
    typeof delivery.client_label === 'string' &&
    delivery.client_label.trim().length > 0 &&
    delivery.delivery_mode === 'VIEW_ONLY' &&
    typeof delivery.token_expires_at === 'string'
  )
}

/** Name typed by the coordinator in the mobile flow, else the real client. */
export function privateDeliveryClientName(
  delivery: DeliveriesRow,
  client: ClientsRow | null,
): string {
  const fromClient = client && typeof client.name === 'string' ? client.name.trim() : ''
  if (fromClient) return fromClient
  return typeof delivery.client_label === 'string' ? delivery.client_label.trim() : ''
}

export function tokenIsActive(delivery: DeliveriesRow, now = Date.now()): boolean {
  if (!delivery.token_expires_at) return true
  return new Date(delivery.token_expires_at).getTime() > now
}

export function downloadAllowed(delivery: DeliveriesRow): boolean {
  // VIEW_ONLY deliveries never expose the original, regardless of status.
  if (delivery.delivery_mode === 'VIEW_ONLY') return false
  // The original is only downloadable after the owner EXPLICITLY releases it.
  // Confirmation alone never releases the file (Phase 4J workflow).
  return delivery.status === 'download_available' || delivery.status === 'downloaded'
}

export function isExpired(delivery: DeliveriesRow): boolean {
  return delivery.status === 'expired'
}

export async function trackLinkOpen(service: Db, deliveryId: string): Promise<void> {
  await recordActivity(service, deliveryId, 'link_opened')
  await recordCommunication(service, {
    channel: 'system',
    direction: 'inbound',
    entity_type: 'delivery',
    entity_id: deliveryId,
    message: 'فتح العميل رابط الفيديو الخاص.',
  })
}

// First open of a valid link moves pending -> preview_viewed (guarded, so a
// repeated open never re-triggers the transition or double-logs it).
export async function markPreviewViewed(service: Db, deliveryId: string): Promise<void> {
  const { data } = await service
    .from('deliveries')
    .update({ status: 'preview_viewed' })
    .eq('id', deliveryId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle<{ id: string }>()
  if (data) {
    await recordActivity(service, deliveryId, 'preview_viewed')
    await recordCommunication(service, {
      channel: 'system',
      direction: 'inbound',
      entity_type: 'delivery',
      entity_id: deliveryId,
      message: 'عرض العميل معاينة الفيديوهات الخاصة.',
    })
  }
}

export type ConfirmResult = 'confirmed' | 'already' | 'expired' | 'error'

// The active version row set is mirrored per item: every lifecycle timestamp is
// copied onto each delivery's active items together (one per item position), so
// per-delivery state stays self-contained in the version history.
export async function setActiveVersionColumn(
  service: Db,
  deliveryId: string,
  column: 'confirmed_at' | 'download_released_at' | 'downloaded_at' | 'download_expires_at' | 'expired_at',
  value: string | null,
): Promise<void> {
  const patch: DeliveryVideosUpdate = { [column]: value }
  await service
    .from('delivery_videos')
    .update(patch)
    .eq('delivery_id', deliveryId)
    .eq('is_active', true)
}

export async function confirmDelivery(service: Db, deliveryId: string): Promise<ConfirmResult> {
  const now = new Date().toISOString()
  const { data: claimed, error } = await service
    .from('deliveries')
    .update({ status: 'confirmed', confirmed_at: now })
    .eq('id', deliveryId)
    .in('status', ['pending', 'preview_viewed'])
    .select('id')
    .maybeSingle<{ id: string }>()
  if (error) return 'error'
  if (claimed) {
    await setActiveVersionColumn(service, deliveryId, 'confirmed_at', now)
    await recordActivity(service, deliveryId, 'video_confirmed')
    await recordCommunication(service, {
      channel: 'system',
      direction: 'inbound',
      entity_type: 'delivery',
      entity_id: deliveryId,
      message: 'أكّد العميل استلام الفيديوهات.',
    })
    return 'confirmed'
  }
  const { data: current } = await service
    .from('deliveries')
    .select('status')
    .eq('id', deliveryId)
    .maybeSingle<{ status: DeliveriesRow['status'] }>()
  if (!current) return 'error'
  if (current.status === 'expired') return 'expired'
  return 'already'
}

// Eager server-side expiry used by the download/preview gates. Only flips the
// DB state (and only when the window really ended); R2 deletion is exclusively
// the cleanup job's responsibility.
export async function expireDeliveryIfDue(
  service: Db,
  deliveryId: string,
  nowIso = new Date().toISOString(),
): Promise<void> {
  const { data } = await service
    .from('deliveries')
    .update({ status: 'expired', expired_at: nowIso })
    .eq('id', deliveryId)
    .in('status', ['confirmed', 'download_available', 'downloaded'])
    .not('download_expires_at', 'is', null)
    .lte('download_expires_at', nowIso)
    .select('id')
    .maybeSingle<{ id: string }>()
  if (data) {
    await setActiveVersionColumn(service, deliveryId, 'expired_at', nowIso)
    await recordActivity(service, deliveryId, 'delivery_expired', { auto: true })
    await recordCommunication(service, {
      channel: 'system',
      direction: 'system',
      entity_type: 'delivery',
      entity_id: deliveryId,
      message: 'انتهت مهلة تحميل الفيديوهات تلقائياً.',
    })
  }
}

export type DownloadGate =
  | { ok: true; isFirst: boolean }
  | { ok: false; reason: 'not_allowed' | 'expired' | 'deleted' }

export const DOWNLOAD_WINDOW_MS = 3 * 24 * 60 * 60 * 1000

// Authorization gate for the download endpoint. Enforces status, expiry and
// token liveness, enrolls the first download (which alone starts the 3-day
// window) and records the download activity. The caller then either redirects
// to a short-lived presigned R2 URL or streams the object.
export async function gateDownload(
  service: Db,
  delivery: DeliveriesRow,
  video: DeliveryVideosRow | null,
): Promise<DownloadGate> {
  if (!tokenIsActive(delivery)) return { ok: false, reason: 'expired' }
  if (delivery.download_expires_at) {
    const due = new Date(delivery.download_expires_at).getTime()
    if (due <= Date.now()) {
      await expireDeliveryIfDue(service, delivery.id)
      return { ok: false, reason: 'expired' }
    }
  }
  if (!downloadAllowed(delivery)) return { ok: false, reason: 'not_allowed' }
  if (video?.source_type === 'r2' && !video.r2_original_key) {
    return { ok: false, reason: 'deleted' }
  }

  let isFirst = false
  if (!delivery.downloaded_at && !delivery.download_expires_at) {
    const now = new Date()
    const expires = new Date(now.getTime() + DOWNLOAD_WINDOW_MS)
    const { data, error } = await service
      .from('deliveries')
      .update({
        status: 'downloaded',
        downloaded_at: now.toISOString(),
        download_expires_at: expires.toISOString(),
      })
      .eq('id', delivery.id)
      .is('downloaded_at', null)
      .select('id')
      .maybeSingle<{ id: string }>()
    if (error) return { ok: false, reason: 'not_allowed' }
    isFirst = Boolean(data)
    if (isFirst) {
      await setActiveVersionColumn(service, delivery.id, 'downloaded_at', now.toISOString())
      await setActiveVersionColumn(service, delivery.id, 'download_expires_at', expires.toISOString())
    }
  }

  await recordActivity(service, delivery.id, 'download_started', { isFirst })
  await recordCommunication(service, {
    channel: 'system',
    direction: 'inbound',
    entity_type: 'delivery',
    entity_id: delivery.id,
    message: isFirst ? 'بدأ العميل تنزيل الفيديو (فتُح البرنامج لمدة 3 أيام).' : 'بدء تنزيل إضافي من العميل.',
  })
  return { ok: true, isFirst }
}

export type DownloadTarget =
  | { kind: 'redirect'; url: string }
  | { kind: 'presigned'; url: string }
  | { kind: 'proxy' }

// Decide how the original is delivered. Portfolio originals stay on Bamboo
// (a direct open is the "download"; there is no R2 object). Private r2
// originals use a 5-minute presigned URL when R2 access keys are configured,
// and fall back to streaming through the authorized function otherwise.
export async function downloadTargetFor(
  env: DeliveryEnv,
  video: DeliveryVideosRow | null,
): Promise<DownloadTarget> {
  if (video?.source_type === 'portfolio') {
    const target = video.portfolio_url ?? ''
    return { kind: 'redirect', url: target }
  }
  const key = video?.r2_original_key
  if (!key || !env.BUCKET) return { kind: 'proxy' }
  const signed = await createR2PresignedUrl(env, key, 300)
  if (signed) return { kind: 'presigned', url: signed }
  return { kind: 'proxy' }
}

export async function proxyR2Download(
  env: DeliveryEnv,
  key: string,
  filename: string,
  contentType: string,
): Promise<Response | null> {
  const bucket = env.BUCKET
  if (!bucket) return null
  const object = await bucket.get(key)
  if (!object) return null
  return new Response(object.body, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(object.size),
      'Content-Disposition': contentDispositionHeader(filename),
      'Cache-Control': 'private, no-store',
    },
  })
}

//----------------------------------------------------------------------------
// Client-facing pages
//----------------------------------------------------------------------------

export function buildPrivateUrl(base: string, token: string, suffix = ''): string {
  return `${base}/p/${token}${suffix}`
}

export function renderInvalidOrExpiredLinkPage(env: DeliveryEnv, request: Request): Response {
  const base = siteUrl(env, request)
  const wa = clientContactWaLink(SITE_WHATSAPP)
  const page = brandPage(
    'انتهت صلاحية الرابط',
    `<div class="hero">
       <span class="logo">${brandLogo(30)}<span>Photography Pixel</span></span>
       <div class="sub">تسليم الفيديو</div>
     </div>
     <div class="client-body">
       <div class="card">
         <h1>انتهت صلاحية هذا الرابط</h1>
         <p class="muted" style="margin-top:.5rem">الرابط للعرض فقط لمدة 24 ساعة من إنشائه، أو تم استبداله. تواصل معنا لإعادة فتح الرابط.</p>
         <div class="actionbar">
           <a class="btn btn-success" href="${escapeHtml(wa)}" target="_blank" rel="noreferrer noopener">${icon('whatsapp')} تواصل معنا لإعادة فتح الرابط</a>
           <a class="btn btn-subtle" href="${escapeHtml(base)}">${icon('arrowLeft')} زيارة الموقع</a>
         </div>
       </div>
     </div>`,
  )
  return new Response(page, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex',
    },
  })
}

type RenderPrivateOptions = {
  confirmError?: string
}

// 1-based selection of an active item by its position inside the delivery
// (the public index used by /preview?item=N and /download?item=N).
export function itemForPosition(
  videos: DeliveryVideosRow[],
  itemPos: number | null,
): DeliveryVideosRow | null {
  const list = videos ?? []
  if (!itemPos || !Number.isInteger(itemPos) || itemPos < 1 || itemPos > list.length) return null
  return list[itemPos - 1] ?? null
}

export function renderPrivatePage(
  base: string,
  token: string,
  data: PrivateDelivery,
  options: RenderPrivateOptions = {},
): string {
  const { delivery, client, videos, video } = data
  const pageUrl = buildPrivateUrl(base, token)
  const items = videos.length > 0 ? videos : video ? [video] : []

  const expired = isExpired(delivery)
  const viewOnly = delivery.delivery_mode === 'VIEW_ONLY'
  // Phase 5A mobile links are a pure viewing experience: no originals and no
  // client-side "confirm" handshake. The classic admin/client flow is
  // untouched and keeps its confirm → release → download behaviour.
  const mobileLink = isCoordinatorMobileLink(delivery)
  // confirmed = the client confirmed but the owner has NOT released the
  // originals yet (locked). canDownload = the owner released them (or the
  // client already downloaded) and the shared window is running. VIEW_ONLY
  // deliveries never expose originals at all.
  const locked = delivery.status === 'confirmed'
  const canDownload = confirmedState(delivery) && !viewOnly

  // Each active item renders as its own preview block. R2 previews stream
  // through the authorized /preview endpoint (watermarked overlay in CSS); the
  // private R2 object URL is never exposed to the page.
  let media = ''
  if (expired) {
    media = `<p class="muted">انتهت صلاحية هذا التوصيل وحُذفت النسخ الأصلية من سجلّنا. يمكنك التواصل معنا للحصول على نسخة جديدة عند الحاجة.</p>`
  } else if (items.length === 0) {
    media = `<p class="muted">لا يوجد فيديو لعرضه حالياً.</p>`
  } else {
    const renderedItems = items
      .map((item, index) => {
        const number = index + 1
        const heading = items.length > 1
          ? `<div class="video-item-head"><span class="video-item-n">${number}</span><span>الفيديو ${number}</span>${item.version > 1 ? `<span class="pill video-item-pill">النسخة ${item.version}</span>` : ''}</div>`
          : ''
        const body =
          item.source_type === 'portfolio'
            ? `<div class="video-frame vertical"><iframe src="${escapeHtml(item.portfolio_url ?? '')}" title="الفيديو ${number}" draggable="false" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope" allowfullscreen></iframe><div class="pp-pattern-watermark" aria-hidden="true"></div></div>`
            : item.r2_original_key
              ? `<div class="video-frame vertical"><video controls preload="metadata" playsinline webkit-playsinline draggable="false" disablepictureinpicture controlslist="nofullscreen nodownload noplaybackrate nopic" src="${escapeHtml(buildPrivateUrl(base, token, `/preview?item=${number}`))}"><p>متصفحك لا يدعم تشغيل الفيديو.</p></video><div class="pp-pattern-watermark" aria-hidden="true"></div></div>`
              : `<p class="muted">الملف غير متاح حالياً.</p>`
        return `<div class="video-item">${heading}${body}</div>`
      })
      .join('')
    // 9:16 tiles sit in a 2-column grid on desktop, single column on phones.
    media = items.length > 1 ? `<div class="video-grid">${renderedItems}</div>` : renderedItems
    media += `<script>(function(){var fr=document.querySelectorAll('.video-frame'),vd=document.querySelectorAll('.video-frame video');function block(e){e.preventDefault();return false}function esc(){for(var i=0;i<vd.length;i++){var el=vd[i];if(document.fullscreenElement===el||document.webkitFullscreenElement===el){var x=document.exitFullscreen||document.webkitExitFullscreen;if(x)x.call(document)}}}for(var j=0;j<fr.length;j++){fr[j].addEventListener('contextmenu',block,true);fr[j].addEventListener('dragstart',block,true)}for(var k=0;k<vd.length;k++){vd[k].setAttribute('draggable','false');vd[k].addEventListener('enterpictureinpicture',block,true)}document.addEventListener('fullscreenchange',esc);document.addEventListener('webkitfullscreenchange',esc)})();<\/script>`
  }

  let notice = ''
  if (expired) {
    notice = `<div class="alert error">انتهت صلاحية هذا الرابط — تواصل معنا لإعادة فتحه.</div>`
  } else if (mobileLink) {
    notice = `<div class="alert info">${icon('clock')} هذا الرابط للعرض فقط، ويتوقف تلقائياً بعد 24 ساعة من إنشائه.</div>`
  } else if (canDownload) {
    notice = `<div class="alert success">${icon('check')} التحميل متاح — يمكنك الآن الحصول على الجودة الأصلية.</div>`
    if (delivery.download_expires_at) {
      notice += `<div class="alert info">${icon('clock')} <span class="countdown" data-expires="${escapeHtml(delivery.download_expires_at)}">التحميل متاح حتى ${escapeHtml(formatDateTime(delivery.download_expires_at))}</span></div>`
    }
  } else if (locked) {
    notice = viewOnly
      ? `<div class="alert success">تم تأكيد الفيديوهات بنجاح — هذا الرابط للعرض فقط.</div>`
      : `<div class="alert success">تم تأكيد الفيديوهات بنجاح — في انتظار إطلاق التحميل من فريق Photography Pixel.</div>`
  } else {
    notice = `<div class="confirm-note"><b>الفيديوهات جاهزة للمراجعة.</b> شاهد الفيديوهات ثم اضغط «أؤكد الفيديوهات» عند الانتهاء.</div>`
  }
  if (options.confirmError) {
    notice += `<div class="alert error">${escapeHtml(options.confirmError)}</div>`
  }

  // Live countdown for the link lifetime and the download window (purely
  // presentational — the real expiry gates stay server-side on /download,
  // /preview, /thumb and the /p page itself).
  const countdownScript = `<script>(function(){function fmt(ms){if(ms<=0)return null;var s=Math.floor(ms/1000),d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60),sec=s%60;if(d>0)return d+' يوم '+(h>0?h+' س ':'')+m+' د';if(h>0)return h+' س '+m+' د';return m+' د '+sec+' ث'}var dl=document.querySelector('[data-expires]');if(dl){function tickDl(){var end=Date.parse(dl.getAttribute('data-expires'));if(isNaN(end))return;var r=fmt(end-Date.now());if(r){dl.textContent=r+' قبل انتهاء التحميل'}else{dl.textContent='انتهى وقت التحميل — تواصل معنا عبر واتساب';var a=dl.closest('.alert');if(a)a.className='alert error'}}tickDl();setInterval(tickDl,1000)}var lk=document.querySelector('[data-link-expires]');if(lk){function tickLk(){var end=Date.parse(lk.getAttribute('data-link-expires'));if(isNaN(end))return;var r=fmt(end-Date.now());if(r){lk.textContent='يتبقى '+r}else{lk.textContent='انتهت صلاحية الرابط'}};tickLk();setInterval(tickLk,1000)}})();<\/script>`

  const downloadForItem = (item: DeliveryVideosRow, number: number): string => {
    const label = items.length > 1 ? `تحميل الفيديو ${number}` : 'تحميل الفيديو الأصلي'
    const suffix = items.length > 1 ? `/download?item=${number}` : '/download'
    if (item.source_type === 'portfolio') return `<a class="btn btn-primary block" href="${escapeHtml(buildPrivateUrl(base, token, suffix))}">${icon('download')} ${label}</a>`
    if (!item.r2_original_key) return `<p class="hint" style="text-align:center;margin-top:.2rem">${icon('ban', 16)} الملف الأصلي محذوف — تواصل معنا عبر واتساب.</p>`
    return `<a class="btn btn-primary block" href="${escapeHtml(buildPrivateUrl(base, token, suffix))}">${icon('download')} ${label}</a>`
  }

  let actions = ''
  if (expired) {
    actions = `<a class="btn btn-success block" href="${escapeHtml(clientContactWaLink(SITE_WHATSAPP))}" target="_blank" rel="noreferrer noopener">${icon('whatsapp')} تواصل عبر واتساب</a>`
  } else if (mobileLink) {
    // No confirm button and no download button — the mobile workflow never asks
    // the client to do anything but watch.
    actions = `<p class="hint" style="text-align:center;margin-top:.2rem">${icon('eye', 16)} هذه الفيديوهات محفوظة لك — استمتع بالمشاهدة</p>`
  } else if (canDownload) {
    actions = items
      .map((item, index) => downloadForItem(item, index + 1))
      .join('<div style="height:.6rem"></div>')
  } else if (locked) {
    actions = viewOnly
      ? `<p class="hint" style="text-align:center;margin-top:.2rem">${icon('check', 16)} تم تأكيد الفيديوهات — شكراً لثقتك</p>`
      : `<p class="hint" style="text-align:center;margin-top:.2rem">${icon('lock', 16)} بانتظار إطلاق التحميل من المصوّر</p>`
  } else {
    actions = `<form method="post" action="${escapeHtml(pageUrl)}" style="width:100%"><button type="submit" class="btn btn-primary block">${icon('check')} أؤكد الفيديوهات</button></form>`
  }

  const clientName = privateDeliveryClientName(delivery, client)
  const heroSub = clientName ? `تسليم فيديو خاص · ${clientName}` : 'تسليم فيديو خاص'
  const statExpiry = viewOnly
    ? '—'
    : delivery.download_expires_at
      ? formatDateTime(delivery.download_expires_at)
      : '—'
  // Remaining link validity is presentational; /p, /preview, /thumb and
  // /download all reject an expired token server-side.
  const linkExpiry = delivery.token_expires_at
    ? `<div class="stat-cell"><div class="label">ينتهي الرابط في</div><div class="value"><span class="countdown" data-link-expires="${escapeHtml(delivery.token_expires_at)}">${escapeHtml(formatDateTime(delivery.token_expires_at))}</span></div></div>`
    : ''
  // A mobile link is never "waiting" for anything — it is simply ready to watch.
  const statusBadge = mobileLink && delivery.status !== 'expired'
    ? '<span class="badge st-preview_viewed">جاهز للمشاهدة</span>'
    : statusBadgeHtml(delivery.status)

  return brandPage(
    'فيديو خاص',
    `<div class="hero">
       <span class="logo">${brandLogo(30)}<span>Photography Pixel</span></span>
       <div class="sub">${escapeHtml(heroSub)}</div>
     </div>
     <div class="client-body">
       <div class="card">
         <div class="between"><h1>${mobileLink ? 'هذا هو الفيديو الخاص بك' : 'فيديو خاص'}</h1>${statusBadge}</div>
         <p class="muted" style="margin-top:.3rem">${sourcePillHtml(delivery.source_type)}</p>
         <div style="height:1rem"></div>
         ${media}
         ${notice}
         <div class="stat-grid">
           <div class="stat-cell"><div class="label">الحالة</div><div class="value">${statusBadge}</div></div>
           <div class="stat-cell"><div class="label">عدد الفيديوهات</div><div class="value">${items.length === 0 ? '—' : String(items.length)}</div></div>
           <div class="stat-cell"><div class="label">تاريخ الإنشاء</div><div class="value">${formatDateTime(delivery.created_at)}</div></div>
           ${linkExpiry || `<div class="stat-cell"><div class="label">آخر موعد للتحميل</div><div class="value">${expired ? '—' : escapeHtml(statExpiry)}</div></div>`}
         </div>
         <div class="actionbar" style="margin-top:1.4rem">${actions}</div>
         ${!expired && (mobileLink || locked || canDownload) ? `<p class="hint" style="margin-top:1rem">${icon('lock', 16)} الرابط مخصص لك — لا تشاركه مع أي شخص.</p>` : ''}
       </div>
       <div class="card">
         <div class="wa-row">${icon('whatsapp')} <span>هل لديك استفسار؟ يمكنك التواصل معنا مباشرة.</span></div>
         <div class="actionbar"><a class="btn btn-outline" href="${escapeHtml(clientContactWaLink(SITE_WHATSAPP))}" target="_blank" rel="noreferrer noopener">${icon('whatsapp')} فتح واتساب</a></div>
       </div>
     </div>${countdownScript}${COPY_SCRIPT}`,
  )
}

export function confirmedState(delivery: DeliveriesRow): boolean {
  return downloadAllowed(delivery)
}

export function privatePageResponse(html: string): Response {
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex',
    },
  })
}