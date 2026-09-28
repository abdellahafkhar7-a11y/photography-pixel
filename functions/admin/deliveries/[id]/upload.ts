import type { PagesFunction } from '@cloudflare/workers-types'
import { requireOwner, requireSession } from '../../_lib/auth'
import { sameOrigin } from '../../_lib/security'
import { siteUrl, type DeliveryEnv } from '../../../_lib/env'
import { recordActivity } from '../../../_lib/activities'
import { MAX_UPLOAD_BYTES, UPLOAD_PART_SIZE, maxUploadParts, originalKey } from '../../../_lib/r2'
import { detectMime, displayName, safeDecode } from '../../../_lib/upload-meta'
import { renderDeliveryUpload } from '../../_lib/delivery-views'
import type { AppUserRow } from '../../_lib/types'
import {
  adminHtml,
  isValidUuid,
  loadDeliveryDetail,
  serviceFrom,
} from '../_helpers'
import { renderDetailPage } from './index'
import type { Db } from '../../../_lib/supabase'

type Route = PagesFunction<DeliveryEnv, never, Record<string, unknown>>

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  })
}

function jsonError(message: string, status = 400): Response {
  return jsonResponse({ ok: false, error: message }, status)
}

//----------------------------------------------------------------------------
// Shared finalize step: promote the uploaded object to the active version and
// reset the delivery lifecycle for a fresh start. The private link STAYS
// stable (Phase 4L) — the token is never rotated on version upload.
//
// One delivery may hold several distinct videos (items). The `item` query
// selects the target: ?item=add creates a NEW video, ?item=<pos> replaces that
// item's active version, and no parameter keeps the legacy single-video
// behaviour (insert/replace item 1).
//----------------------------------------------------------------------------

export type UploadTarget =
  | { mode: 'add'; itemPos: number; version: number }
  | { mode: 'replace'; itemPos: number; version: number }
  | { mode: 'legacy'; itemPos: number; version: number }

function itemFromQuery(url: string): 'add' | number | undefined {
  if (!url.includes('?')) return undefined
  const raw = new URL(url).searchParams.get('item')
  if (raw === null) return undefined
  if (raw === 'add') return 'add'
  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : undefined
}

function computeTarget(
  detail: LoadedDetail,
  item: 'add' | number | undefined,
): { ok: true; target: UploadTarget } | { ok: false; error: string } {
  const videos = detail.delivery_videos ?? []
  const positions = [...new Set(videos.map((video) => video.item_pos))]
  const maxItemPos = positions.length > 0 ? Math.max(...positions) : 0

  if (item === 'add') {
    return { ok: true, target: { mode: 'add', itemPos: maxItemPos + 1, version: 1 } }
  }
  if (item === undefined) {
    const firstActive = videos.find((video) => video.is_active)
    const itemPos = firstActive?.item_pos ?? 1
    const versions = videos.filter((video) => video.item_pos === itemPos)
    const version = versions.reduce((max, video) => Math.max(max, video.version), 0) + 1
    return { ok: true, target: { mode: firstActive ? 'replace' : 'legacy', itemPos, version } }
  }
  const versionsOfItem = videos.filter((video) => video.item_pos === item)
  if (versionsOfItem.length === 0) return { ok: false, error: 'الفيديو المحدد غير موجود.' }
  const version = versionsOfItem.reduce((max, video) => Math.max(max, video.version), 0) + 1
  return { ok: true, target: { mode: 'replace', itemPos: item, version } }
}

function describeItem(item: 'add' | number | undefined): { title: string; sub: string } {
  if (item === 'add') {
    return {
      title: 'إضافة فيديو جديد',
      sub: 'يُضاف الفيديو كعنصر جديد في نفس التوصيل — الرابط الخاص يبقى كما هو ويضم كل الفيديوهات.',
    }
  }
  if (typeof item === 'number') {
    return {
      title: `رفع نسخة جديدة للفيديو ${item}`,
      sub: 'تُوقف النسخة السابقة لهذا الفيديو فقط، مع بقاء بقية الفيديوهات والرابط الخاص كما هي.',
    }
  }
  return { title: 'رفع نسخة جديدة من الفيديو', sub: '' }
}

async function finalizeUpload(
  service: Db,
  appUser: AppUserRow,
  base: string,
  detail: LoadedDetail,
  key: string,
  filename: string,
  mime: string,
  size: number,
  item: 'add' | number | undefined,
): Promise<Response> {
  const targetResult = computeTarget(detail, item)
  if (!targetResult.ok) return jsonError(targetResult.error)
  const { target } = targetResult

  // Replacements only ever deactivate the previous active row of THAT item (or
  // every active row in legacy mode). Old rows keep their own lifecycle state;
  // the new active row starts fresh. Adding a video never touches the others.
  if (target.mode === 'add') {
    const existing = (detail.delivery_videos ?? []).some((video) => video.item_pos === target.itemPos)
    if (existing) return jsonError('عنصر الفيديو غير صالح.', 400)
  } else if (target.mode === 'replace') {
    const { error: deactivateError } = await service
      .from('delivery_videos')
      .update({ is_active: false })
      .eq('delivery_id', detail.id)
      .eq('item_pos', target.itemPos)
      .eq('is_active', true)
    if (deactivateError) return jsonError('تعذّر تحديث النسخ السابقة.', 500)
  } else {
    const { error: deactivateError } = await service
      .from('delivery_videos')
      .update({ is_active: false })
      .eq('delivery_id', detail.id)
      .eq('is_active', true)
    if (deactivateError) return jsonError('تعذّر تحديث النسخ السابقة.', 500)
  }

  const { error: insertError } = await service.from('delivery_videos').insert({
    delivery_id: detail.id,
    item_pos: target.itemPos,
    version: target.version,
    source_type: 'r2',
    r2_original_key: key,
    r2_preview_key: null,
    r2_thumb_key: null,
    original_filename: filename,
    mime_type: mime,
    size_bytes: size,
    created_by: appUser.id,
  })
  if (insertError) return jsonError('تعذّر حفظ النسخة.', 500)

  // Phase 4L: the private link is STABLE across versions — the token is NOT
  // rotated. We only reset the delivery lifecycle to a fresh start, so the
  // next client confirmation/download belongs to this new video.
  const { error: resetError } = await service
    .from('deliveries')
    .update({
      status: 'pending',
      confirmed_at: null,
      downloaded_at: null,
      download_expires_at: null,
      expired_at: null,
    })
    .eq('id', detail.id)
  if (resetError) return jsonError('تعذّر تفعيل النسخة الجديدة.', 500)

  if (target.mode === 'add') await recordActivity(service, detail.id, 'reuploaded', { item: target.itemPos, version: 1 })
  else if (target.version > 1) await recordActivity(service, detail.id, 'reuploaded', { item: target.itemPos, version: target.version })

  const updated = await loadDeliveryDetail(service, detail.id)
  const notice =
    target.mode === 'add'
      ? 'تمت إضافة الفيديو إلى التوصيل. أصبح الرابط يضم كل الفيديوهات.'
      : target.version > 1
        ? `تم رفع النسخة ${target.version} للفيديو ${target.itemPos}. أُوقفت النسخ السابقة له، وأعاد النظام حالة التوصيل إلى البداية مع بقاء الرابط الخاص نفسه.`
        : 'تم رفع الفيديو. أصبح الرابط جاهزاً للإرسال إلى العميل.'
  const pageHtml = renderDetailPage(appUser, base, updated ?? detail, { notice })
  return jsonResponse({ ok: true, html: pageHtml })
}

//----------------------------------------------------------------------------
// Authorization + delivery validation for every upload action.
//----------------------------------------------------------------------------

type AuthContext = Parameters<Route>[0]
type LoadedDetail = NonNullable<Awaited<ReturnType<typeof loadDeliveryDetail>>>

async function authorizeAndLoad(
  context: AuthContext,
): Promise<
  | { ok: true; service: Db; appUser: AppUserRow; base: string; detail: LoadedDetail }
  | { ok: false; response: Response }
> {
  if (!sameOrigin(context.request)) return { ok: false, response: jsonError('طلب غير صالح.', 403) }
  const appUser = await requireSession(context)
  if (appUser instanceof Response) {
    return { ok: false, response: jsonResponse({ ok: false, error: 'غير مصرح.' }, appUser.status) }
  }
  const forbidden = requireOwner(appUser)
  if (forbidden) {
    return { ok: false, response: jsonResponse({ ok: false, error: 'غير مصرح.' }, forbidden.status) }
  }

  const id = (context.params as { id?: string }).id ?? ''
  if (!isValidUuid(id)) return { ok: false, response: jsonError('معرّف غير صالح.') }
  const service = serviceFrom(context)
  if (!service) return { ok: false, response: jsonError('النظام غير مهيأ.', 500) }
  const detail = await loadDeliveryDetail(service, id)
  if (!detail) return { ok: false, response: jsonError('التوصيل غير موجود.', 404) }
  if (detail.source_type !== 'r2') {
    return { ok: false, response: jsonError('توصيل المعرض العام لا يُرفع له ملفات.', 400) }
  }
  const base = siteUrl(context.env, context.request)
  return { ok: true, service, appUser, base, detail }
}

//----------------------------------------------------------------------------
// GET — the upload page.
//----------------------------------------------------------------------------

export const onRequestGet: Route = async (context) => {
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser
  const forbidden = requireOwner(appUser)
  if (forbidden) return forbidden

  const id = (context.params as { id?: string }).id ?? ''
  if (!isValidUuid(id)) return adminHtml(renderDeliveryUpload(appUser, id, true, undefined, 'معرّف غير صالح.'))
  const service = serviceFrom(context)
  if (!service) return adminHtml(renderDeliveryUpload(appUser, id, true, undefined, 'النظام غير مهيأ.'))
  const detail = await loadDeliveryDetail(service, id)
  if (!detail) return adminHtml(renderDeliveryUpload(appUser, id, true, undefined, 'التوصيل غير موجود.'))
  if (detail.source_type !== 'r2') {
    return adminHtml(
      renderDeliveryUpload(
        appUser,
        id,
        true,
        undefined,
        'توصيل "المعرض العام" لا يُرفع له ملفات — فيديوهاته منشورة أصلاً على الموقع.',
      ),
    )
  }
  const hasVideo = (detail.delivery_videos ?? []).length > 0
  const item = itemFromQuery(context.request.url)
  const { title, sub } = describeItem(item)
  return adminHtml(renderDeliveryUpload(appUser, id, hasVideo, undefined, undefined, title, sub, item))
}

//----------------------------------------------------------------------------
// POST — upload protocol (real, streaming, up to 1 GB, with progress/cancel).
// Actions are dispatched by the `x-action` header:
//   init     JSON { filename, mime, size }             -> multipart session
//   part     raw bytes (<= UPLOAD_PART_SIZE) + x-part, x-key, x-upload-id
//   complete JSON { uploadId, key, parts:[{n,etag}], size } -> finalize
//   abort    JSON { uploadId, key }                    -> cancel session
//   stream   raw bytes (entire file; emulator fallback)
// Owner-only + same-origin everywhere; the browser never sees R2 credentials.
//----------------------------------------------------------------------------

export const onRequestPost: Route = async (context) => {
  const action = context.request.headers.get('x-action')
  const auth = await authorizeAndLoad(context)
  if (!auth.ok) return auth.response
  const { service, appUser, base, detail } = auth
  const env = context.env
  const item = itemFromQuery(context.request.url)

  switch (action) {
    case 'init':
      return handleInit(context, env, detail, item)
    case 'part':
      return handlePart(context, env)
    case 'complete':
      return handleComplete(context, env, service, appUser, base, detail, item)
    case 'abort':
      return handleAbort(context, env)
    case 'stream':
      return handleStream(context, env, service, appUser, base, detail, item)
    default:
      return jsonError('إجراء غير معروف.', 400)
  }
}

async function handleInit(
  context: AuthContext,
  env: DeliveryEnv,
  detail: LoadedDetail,
  item: 'add' | number | undefined,
): Promise<Response> {
  let body: { filename?: string; mime?: string; size?: number }
  try {
    body = await context.request.json()
  } catch {
    return jsonError('بيانات غير صالحة.')
  }
  const rawName = body.filename ?? 'original.mp4'
  const filename = displayName(rawName)
  const rawSize = Number(body.size)
  if (!Number.isFinite(rawSize) || rawSize <= 0) return jsonError('الملف فارغ.')
  if (rawSize > MAX_UPLOAD_BYTES) {
    return jsonError('حجم الملف يتجاوز الحد الأقصى 1 جيجابايت.')
  }
  const mime = detectMime(body.mime ?? '', filename)
  if (!mime) {
    return jsonError('نوع الملف غير مدعوم — ارفع فيديو (mp4, mov, webm, mkv ...).')
  }
  if (!env.BUCKET) return jsonError('مخزن R2 غير مهيأ — لا يمكن تخزين الملف الخاص.', 500)

  const targetResult = computeTarget(detail, item)
  if (!targetResult.ok) return jsonError(targetResult.error)
  const { target } = targetResult
  const key = originalKey(detail.id, target.itemPos, target.version, rawName)

  try {
    const multipart = await env.BUCKET.createMultipartUpload(key, {
      httpMetadata: { contentType: mime },
    })
    return jsonResponse({
      ok: true,
      mode: 'multipart',
      uploadId: multipart.uploadId,
      key,
      partSize: UPLOAD_PART_SIZE,
      maxParts: maxUploadParts(),
    })
  } catch {
    // Emulator / bucket without multipart support: stream the whole file
    // (never buffered whole-file in memory).
    return jsonResponse({ ok: true, mode: 'stream', key })
  }
}

async function handlePart(context: AuthContext, env: DeliveryEnv): Promise<Response> {
  const uploadId = context.request.headers.get('x-upload-id') ?? ''
  const key = context.request.headers.get('x-key') ?? ''
  const partNumber = Number(context.request.headers.get('x-part') ?? '0')
  const partCount = Number(context.request.headers.get('x-part-count') ?? '0')
  if (!uploadId || !key || !Number.isInteger(partNumber) || partNumber < 1 || partNumber > maxUploadParts()) {
    return jsonError('بيانات جزء غير صالحة.')
  }
  if (!Number.isInteger(partCount) || partCount < 1 || partCount > maxUploadParts()) {
    return jsonError('عدد أجزاء غير صالح.')
  }
  if (!env.BUCKET) return jsonError('مخزن R2 غير مهيأ.', 500)

  const buffer = await context.request.arrayBuffer()
  if (buffer.byteLength > UPLOAD_PART_SIZE) return jsonError('حجم الجزء يتجاوز الحد المسموح.')

  try {
    const multipart = env.BUCKET.resumeMultipartUpload(key, uploadId)
    const part = await multipart.uploadPart(partNumber, buffer)
    return jsonResponse({ ok: true, etag: part.etag })
  } catch {
    return jsonError('تعذّر حفظ الجزء.', 500)
  }
}

async function handleComplete(
  context: AuthContext,
  env: DeliveryEnv,
  service: Db,
  appUser: AppUserRow,
  base: string,
  detail: LoadedDetail,
  item: 'add' | number | undefined,
): Promise<Response> {
  let body: { uploadId?: string; key?: string; parts?: { n: number; etag: string }[]; size?: number; filename?: string }
  try {
    body = await context.request.json()
  } catch {
    return jsonError('بيانات غير صالحة.')
  }
  const { uploadId, key, parts, size } = body
  if (!uploadId || !key || !Array.isArray(parts) || parts.length === 0 || parts.length > maxUploadParts()) {
    return jsonError('بيانات مكتمل الرفع غير صالحة.')
  }
  if (typeof size !== 'number' || size <= 0 || size > MAX_UPLOAD_BYTES) {
    return jsonError('حجم الملف غير صالح.')
  }
  if (!env.BUCKET) return jsonError('مخزن R2 غير مهيأ.', 500)
  const seen = new Set<number>()
  for (const part of parts) {
    if (!Number.isInteger(part.n) || part.n < 1 || part.n > maxUploadParts() || seen.has(part.n)) {
      return jsonError('قائمة الأجزاء غير صالحة.')
    }
    if (typeof part.etag !== 'string' || part.etag.length === 0) return jsonError('بيانات الأجزاء ناقصة.')
    seen.add(part.n)
  }
  const bucket = env.BUCKET

  try {
    const multipart = bucket.resumeMultipartUpload(key, uploadId)
    await multipart.complete(parts.map((part) => ({ partNumber: part.n, etag: part.etag })))
  } catch {
    return jsonError('تعذّر إنهاء الرفع.', 500)
  }

  const object = await bucket.get(key)
  const filename = displayName(body.filename ?? (key.split('/').pop() ?? 'original.mp4'))
  const mime = object?.httpMetadata?.contentType ?? 'video/mp4'
  const objectSize = object?.size ?? size
  return finalizeUpload(service, appUser, base, detail, key, filename, mime, objectSize, item)
}

async function handleAbort(context: AuthContext, env: DeliveryEnv): Promise<Response> {
  let body: { uploadId?: string; key?: string }
  try {
    body = await context.request.json()
  } catch {
    return jsonError('بيانات غير صالحة.')
  }
  if (!body.uploadId || !body.key) return jsonError('بيانات ناقصة.')
  if (!env.BUCKET) return jsonError('مخزن R2 غير مهيأ.', 500)
  try {
    const multipart = env.BUCKET.resumeMultipartUpload(body.key, body.uploadId)
    await multipart.abort()
  } catch {
    // already aborted or unknown session — treat as success
  }
  return jsonResponse({ ok: true })
}

async function handleStream(
  context: AuthContext,
  env: DeliveryEnv,
  service: Db,
  appUser: AppUserRow,
  base: string,
  detail: LoadedDetail,
  item: 'add' | number | undefined,
): Promise<Response> {
  const filename = displayName(safeDecode(context.request.headers.get('x-filename') ?? 'original.mp4'))
  const rawSize = Number(context.request.headers.get('x-size') ?? '0')
  if (!Number.isFinite(rawSize) || rawSize <= 0 || rawSize > MAX_UPLOAD_BYTES) {
    return jsonError('حجم الملف غير صالح (الحد الأقصى 1 جيجابايت).')
  }
  const mime = detectMime(context.request.headers.get('x-mime') ?? '', filename)
  if (!mime) return jsonError('نوع الملف غير مدعوم — ارفع فيديو (mp4, mov, webm, mkv ...).')
  if (!env.BUCKET) return jsonError('مخزن R2 غير مهيأ.', 500)
  const bucket = env.BUCKET

  const targetResult = computeTarget(detail, item)
  if (!targetResult.ok) return jsonError(targetResult.error)
  const { target } = targetResult
  const key = originalKey(detail.id, target.itemPos, target.version, filename)

  try {
    await bucket.put(key, context.request.body, {
      httpMetadata: { contentType: mime },
    })
  } catch {
    return jsonError('تعذّر تخزين الملف.', 500)
  }
  return finalizeUpload(service, appUser, base, detail, key, filename, mime, rawSize, item)
}