import { recordActivity } from '../_lib/activities'
import type { ClientsRow, DeliveriesRow, DeliveryVideosRow } from '../_lib/db-types'
import { siteUrl, type DeliveryEnv } from '../_lib/env'
import { createServiceClient, type Db } from '../_lib/supabase'
import { hashPrivateToken, isValidTokenFormat } from '../_lib/tokens'
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
  clients: ClientsRow
  delivery_videos: DeliveryVideosRow[]
}

export type PrivateDelivery = {
  delivery: DeliveriesRow
  client: ClientsRow
  video: DeliveryVideosRow | null
}

export type ResolveResult = { kind: 'invalid' } | { kind: 'ok'; data: PrivateDelivery }

export async function resolvePrivateDelivery(
  env: DeliveryEnv,
  token: string,
): Promise<ResolveResult> {
  if (!isValidTokenFormat(token)) return { kind: 'invalid' }
  const service = createServiceClient(env)
  if (!service) return { kind: 'invalid' }
  const hash = await hashPrivateToken(token)
  const { data } = await service
    .from('deliveries')
    .select('*, clients(*), delivery_videos(*)')
    .eq('private_token_hash', hash)
    .maybeSingle<PrivatePayload>()
  if (!data) return { kind: 'invalid' }
  const video = (data.delivery_videos ?? []).find((item) => item.is_active === true) ?? null
  return { kind: 'ok', data: { delivery: data, client: data.clients, video } }
}

export function tokenIsActive(delivery: DeliveriesRow, now = Date.now()): boolean {
  if (!delivery.token_expires_at) return true
  return new Date(delivery.token_expires_at).getTime() > now
}

export function downloadAllowed(delivery: DeliveriesRow): boolean {
  return delivery.status === 'confirmed' || delivery.status === 'downloaded'
}

export function isExpired(delivery: DeliveriesRow): boolean {
  return delivery.status === 'expired'
}

export async function trackLinkOpen(service: Db, deliveryId: string): Promise<void> {
  await recordActivity(service, deliveryId, 'link_opened')
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
  if (data) await recordActivity(service, deliveryId, 'preview_viewed')
}

export type ConfirmResult = 'confirmed' | 'already' | 'expired' | 'error'

// Server-side confirmation with a guarded, race-safe transition. Replay after
// a successful confirm is harmless (returns already). Confirming an expired
// delivery is rejected.
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
    await recordActivity(service, deliveryId, 'video_confirmed')
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
  if (data) await recordActivity(service, deliveryId, 'delivery_expired', { auto: true })
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
  }

  await recordActivity(service, delivery.id, 'download_started', { isFirst })
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
    'الرابط غير صالح',
    `<div class="hero">
       <span class="logo">${brandLogo(30)}<span>Photography Pixel</span></span>
       <div class="sub">تسليم الفيديو</div>
     </div>
     <div class="client-body">
       <div class="card">
         <h1>الرابط غير صالح أو انتهت صلاحيته</h1>
         <p class="muted" style="margin-top:.5rem">هذا الرابط غير صالح أو تم استبداله. إذا كنت تواجه مشكلة في فتح الرابط، تواصل معنا مباشرة عبر واتساب.</p>
         <div class="actionbar">
           <a class="btn btn-success" href="${escapeHtml(wa)}" target="_blank" rel="noreferrer noopener">${icon('whatsapp')} تواصل عبر واتساب</a>
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

export function renderPrivatePage(
  base: string,
  token: string,
  data: PrivateDelivery,
  options: RenderPrivateOptions = {},
): string {
  const { delivery, client, video } = data
  const pageUrl = buildPrivateUrl(base, token)

  const isPortfolio = video?.source_type === 'portfolio'
  const expired = isExpired(delivery)
  const confirmed = confirmedState(delivery)

  let media = ''
  if (expired) {
    media = `<p class="muted">تمت أرشفة هذه النسخة في سجلّنا. يمكنك التواصل معنا للحصول على نسخة جديدة عند الحاجة.</p>`
  } else if (isPortfolio) {
    const url = video?.portfolio_url ?? ''
    media = `<div class="video-frame"><iframe src="${escapeHtml(url)}" title="الفيديو" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="width:100%;aspect-ratio:16/9;border:none;display:block"></iframe></div>`
  } else if (video?.r2_original_key) {
    media = `<div class="video-frame"><video controls preload="metadata" src="${escapeHtml(buildPrivateUrl(base, token, '/preview'))}"><p>متصفحك لا يدعم تشغيل الفيديو.</p></video></div>`
  } else {
    media = `<p class="muted">لا يوجد فيديو لعرضه حالياً.</p>`
  }

  let notice = ''
  if (expired) {
    notice = `<div class="alert error">انتهت صلاحية تحميل هذا الفيديو.</div>`
  } else if (confirmed) {
    notice = `<div class="alert success">تم تأكيد الفيديو — يمكنك الآن تحميل الجودة الأصلية.</div>`
    if (delivery.download_expires_at) {
      notice += `<div class="alert info">${icon('clock')} التحميل متاح حتى ${escapeHtml(formatDateTime(delivery.download_expires_at))}. بعدها يُحذف الملف الأصلي تلقائياً.</div>`
    }
  }
  if (options.confirmError) {
    notice += `<div class="alert error">${escapeHtml(options.confirmError)}</div>`
  }

  let actions = ''
  if (expired) {
    actions = `<a class="btn btn-success block" href="${escapeHtml(clientContactWaLink(SITE_WHATSAPP))}" target="_blank" rel="noreferrer noopener">${icon('whatsapp')} تواصل عبر واتساب</a>`
  } else if (confirmed) {
    actions = `<a class="btn btn-primary block" href="${escapeHtml(buildPrivateUrl(base, token, '/download'))}">${icon('download')} تحميل الجودة الأصلية</a>`
  } else {
    actions = `<form method="post" action="${escapeHtml(pageUrl)}" style="width:100%"><button type="submit" class="btn btn-primary block">${icon('check')} أؤكد الفيديو</button></form>`
  }

  const clientName = client.name.trim().length > 0 ? client.name.trim() : 'مرحباً'
  const statExpiry = delivery.download_expires_at ? formatDateTime(delivery.download_expires_at) : '—'

  return brandPage(
    'فيديو خاص',
    `<div class="hero">
       <span class="logo">${brandLogo(30)}<span>Photography Pixel</span></span>
       <div class="sub">تسليم فيديو خاص · ${escapeHtml(clientName)}</div>
     </div>
     <div class="client-body">
       <div class="card">
         <div class="between"><h1>فيديو خاص</h1>${statusBadgeHtml(delivery.status)}</div>
         <p class="muted" style="margin-top:.3rem">${sourcePillHtml(delivery.source_type)}</p>
         <div style="height:1rem"></div>
         ${media}
         ${notice}
         <div class="stat-grid">
           <div class="stat-cell"><div class="label">الحالة</div><div class="value">${statusBadgeHtml(delivery.status)}</div></div>
           <div class="stat-cell"><div class="label">تاريخ الإنشاء</div><div class="value">${formatDateTime(delivery.created_at)}</div></div>
           <div class="stat-cell"><div class="label">آخر موعد للتحميل</div><div class="value">${expired ? '—' : escapeHtml(statExpiry)}</div></div>
         </div>
         <div class="actionbar" style="margin-top:1.4rem">${actions}</div>
         ${confirmed && !expired ? `<p class="hint" style="margin-top:1rem">${icon('lock', 16)} الرابط مخصص لك — لا تشاركه مع أي شخص.</p>` : ''}
       </div>
       <div class="card">
         <div class="wa-row">${icon('whatsapp')} <span>هل لديك استفسار؟ يمكنك التواصل معنا مباشرة.</span></div>
         <div class="actionbar"><a class="btn btn-outline" href="${escapeHtml(clientContactWaLink(SITE_WHATSAPP))}" target="_blank" rel="noreferrer noopener">${icon('whatsapp')} فتح واتساب</a></div>
       </div>
     </div>${COPY_SCRIPT}`,
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