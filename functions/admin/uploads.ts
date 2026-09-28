import type { PagesFunction } from '@cloudflare/workers-types'
import { requireOwner, requireSession } from './_lib/auth'
import { sameOrigin } from './_lib/security'
import { siteUrl, type DeliveryEnv } from '../_lib/env'
import { generatePrivateToken, hashPrivateToken } from '../_lib/tokens'
import { MAX_UPLOAD_BYTES, UPLOAD_PART_SIZE, maxUploadParts, originalKey } from '../_lib/r2'
import { detectMime, displayName, safeDecode } from '../_lib/upload-meta'
import { renderUploadWizard } from './_lib/delivery-views'
import { adminHtml, isValidUuid, resolveClient, serviceFrom, stableClientVisibleId } from './deliveries/_helpers'
import { noStoreResponse, streamObject } from '../p/_media'

//============================================================================
// /admin/uploads — standalone "رفع فيديو جديد" wizard (Phase 4J).
//
// The browser uploads the private video FIRST (same real streaming protocol
// as the per-delivery uploader), staged under a generated delivery id. Only
// AFTER the upload and the client data entry does 'create' build the delivery
// row + version + fresh private link. Owner-only (private r2 source).
//
//   begin    JSON { filename, mime, size }                     -> multipart session
//   part     raw bytes + x-part/x-key/x-upload-id/x-part-count  -> { ok, etag }
//   complete JSON { uploadId, key, parts, size, filename, deliveryId } -> { ok, ...file }
//   abort    JSON { uploadId, key }
//   stream   raw bytes (emulator fallback) + x-delivery-id
//   create   JSON { deliveryId, key, filename, mime, sizeBytes, name, whatsapp } -> { ok, link, token }
//============================================================================

type Route = PagesFunction<DeliveryEnv, never, Record<string, unknown>>
type AuthContext = Parameters<Route>[0]

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

// The staged upload lives under originals/{deliveryId}/1/1/... — the same key
// we will reference from the delivery_videos row when the delivery is created.
function keyBelongsToDelivery(key: string, deliveryId: string): boolean {
  return key.startsWith(`originals/${deliveryId}/`)
}

export const onRequestGet: Route = async (context) => {
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser
  const forbidden = requireOwner(appUser)
  if (forbidden) return forbidden

  // Owner-only R2 preview of the just-uploaded staged file (used by the
  // wizard's success step). The key is opaque and the route keeps the same
  // authorization as the wizard itself.
  const params = new URL(context.request.url).searchParams
  if (params.get('action') === 'preview') {
    const key = params.get('key') ?? ''
    if (!key.startsWith('originals/') || !context.env.BUCKET) return noStoreResponse(404)
    const streamed = await streamObject(context.env.BUCKET, key, context.request, 'video/mp4')
    return streamed ?? noStoreResponse(404)
  }

  return adminHtml(renderUploadWizard(appUser))
}

export const onRequestPost: Route = async (context) => {
  if (!sameOrigin(context.request)) return jsonError('طلب غير صالح.', 403)
  const appUser = await requireSession(context)
  if (appUser instanceof Response) {
    return jsonResponse({ ok: false, error: 'غير مصرح.' }, appUser.status)
  }
  const forbidden = requireOwner(appUser)
  if (forbidden) return jsonResponse({ ok: false, error: 'غير مصرح.' }, forbidden.status)

  const service = serviceFrom(context)
  if (!service) return jsonError('النظام غير مهيأ.', 500)
  const env = context.env
  const base = siteUrl(context.env, context.request)

  const action = context.request.headers.get('x-action')
  switch (action) {
    case 'begin':
      return handleBegin(context, env)
    case 'part':
      return handlePart(context, env)
    case 'complete':
      return handleComplete(context, env)
    case 'abort':
      return handleAbort(context, env)
    case 'stream':
      return handleStream(context, env)
    case 'create':
      return handleCreate(context, env, appUser.id, base)
    default:
      return jsonError('إجراء غير معروف.', 400)
  }
}

async function handleBegin(context: AuthContext, env: DeliveryEnv): Promise<Response> {
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
  if (rawSize > MAX_UPLOAD_BYTES) return jsonError('حجم الملف يتجاوز الحد الأقصى 1 جيجابايت.')
  const mime = detectMime(body.mime ?? '', filename)
  if (!mime) return jsonError('نوع الملف غير مدعوم — ارفع فيديو (mp4, mov, webm, mkv ...).')
  if (!env.BUCKET) return jsonError('مخزن R2 غير مهيأ — لا يمكن تخزين الملف الخاص.', 500)

  // The delivery row does not exist yet; reserve its id now so the R2 key is
  // already final and 'create' can bind the row to the same key later.
  const deliveryId = crypto.randomUUID()
  const key = originalKey(deliveryId, 1, 1, rawName)

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
      deliveryId,
      sizeBytes: rawSize,
    })
  } catch {
    return jsonResponse({ ok: true, mode: 'stream', key, deliveryId, sizeBytes: rawSize })
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

async function handleComplete(context: AuthContext, env: DeliveryEnv): Promise<Response> {
  let body: {
    uploadId?: string
    key?: string
    parts?: { n: number; etag: string }[]
    size?: number
    filename?: string
    deliveryId?: string
  }
  try {
    body = await context.request.json()
  } catch {
    return jsonError('بيانات غير صالحة.')
  }
  const { uploadId, key, parts, size, deliveryId } = body
  if (!uploadId || !key || !Array.isArray(parts) || parts.length === 0 || parts.length > maxUploadParts()) {
    return jsonError('بيانات مكتمل الرفع غير صالحة.')
  }
  if (typeof size !== 'number' || size <= 0 || size > MAX_UPLOAD_BYTES) {
    return jsonError('حجم الملف غير صالح.')
  }
  if (!isValidUuid(deliveryId ?? '') || !keyBelongsToDelivery(key, deliveryId ?? '')) {
    return jsonError('معرّف الرفع غير صالح.', 400)
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

  try {
    const multipart = env.BUCKET.resumeMultipartUpload(key, uploadId)
    await multipart.complete(parts.map((part) => ({ partNumber: part.n, etag: part.etag })))
  } catch {
    return jsonError('تعذّر إنهاء الرفع.', 500)
  }

  const object = await env.BUCKET.get(key)
  if (!object) return jsonError('تعذّر التحقق من الملف.', 500)
  const filename = displayName(body.filename ?? (key.split('/').pop() ?? 'original.mp4'))
  const mime = object.httpMetadata?.contentType ?? 'video/mp4'
  return jsonResponse({
    ok: true,
    deliveryId,
    key,
    filename,
    mime,
    sizeBytes: object.size ?? size,
  })
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

async function handleStream(context: AuthContext, env: DeliveryEnv): Promise<Response> {
  const filename = displayName(safeDecode(context.request.headers.get('x-filename') ?? 'original.mp4'))
  const rawSize = Number(context.request.headers.get('x-size') ?? '0')
  const deliveryId = context.request.headers.get('x-delivery-id') ?? ''
  if (!Number.isFinite(rawSize) || rawSize <= 0 || rawSize > MAX_UPLOAD_BYTES) {
    return jsonError('حجم الملف غير صالح (الحد الأقصى 1 جيجابايت).')
  }
  if (!isValidUuid(deliveryId)) return jsonError('معرّف الرفع غير صالح.', 400)
  const mime = detectMime(context.request.headers.get('x-mime') ?? '', filename)
  if (!mime) return jsonError('نوع الملف غير مدعوم — ارفع فيديو (mp4, mov, webm, mkv ...).')
  if (!env.BUCKET) return jsonError('مخزن R2 غير مهيأ.', 500)
  const key = originalKey(deliveryId, 1, 1, filename)

  try {
    await env.BUCKET.put(key, context.request.body, {
      httpMetadata: { contentType: mime },
    })
  } catch {
    return jsonError('تعذّر تخزين الملف.', 500)
  }
  return jsonResponse({
    ok: true,
    deliveryId,
    key,
    filename,
    mime,
    sizeBytes: rawSize,
  })
}

async function handleCreate(
  context: AuthContext,
  env: DeliveryEnv,
  userId: string,
  base: string,
): Promise<Response> {
  let body: {
    deliveryId?: string
    key?: string
    filename?: string
    mime?: string
    sizeBytes?: number
    name?: string
    whatsapp?: string
    delivery_mode?: string
  }
  try {
    body = await context.request.json()
  } catch {
    return jsonError('بيانات غير صالحة.')
  }
  const deliveryId = body.deliveryId ?? ''
  const key = body.key ?? ''
  if (!isValidUuid(deliveryId) || !keyBelongsToDelivery(key, deliveryId)) {
    return jsonError('معرّف الرفع غير صالح.', 400)
  }
  const sizeBytes = Number(body.sizeBytes)
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_UPLOAD_BYTES) {
    return jsonError('حجم الملف غير صالح (الحد الأقصى 1 جيجابايت).')
  }
  const filename = displayName(body.filename ?? 'original.mp4')
  const mime = detectMime(body.mime ?? '', filename)
  if (!mime) return jsonError('نوع الملف غير مدعوم — ارفع فيديو (mp4, mov, webm, mkv ...).')
  if (!env.BUCKET) return jsonError('مخزن R2 غير مهيأ.', 500)

  const service = serviceFrom(context)!
  const clientResult = await resolveClient(service, userId, null, body.name ?? '', body.whatsapp ?? '')
  if (!clientResult.ok) return jsonResponse({ ok: false, error: clientResult.error }, 400)

  // The file must actually exist under this key (upload completed).
  const head = await env.BUCKET.head(key)
  if (!head) return jsonError('لم يُرفَع الفيديو بعد — ارفع الملف أولاً.', 400)

  const token = generatePrivateToken()
  const hash = await hashPrivateToken(token)
  const now = new Date().toISOString()
  const mode: 'VIEW_ONLY' | 'VIEW_AND_DOWNLOAD' =
    body.delivery_mode === 'VIEW_ONLY' ? 'VIEW_ONLY' : 'VIEW_AND_DOWNLOAD'
  const identifier = stableClientVisibleId(clientResult.client.whatsapp_number, deliveryId)

  const { error: deliveryError } = await service.from('deliveries').insert({
    id: deliveryId,
    client_id: clientResult.client.id,
    created_by: userId,
    source_type: 'r2',
    delivery_mode: mode,
    client_visible_id: identifier,
    private_token_hash: hash,
    token_created_at: now,
  })
  if (deliveryError) return jsonError('تعذّر إنشاء التوصيل.', 500)

  const { error: videoError } = await service.from('delivery_videos').insert({
    delivery_id: deliveryId,
    item_pos: 1,
    version: 1,
    source_type: 'r2',
    r2_original_key: key,
    r2_preview_key: null,
    r2_thumb_key: null,
    original_filename: filename,
    mime_type: mime,
    size_bytes: sizeBytes,
    created_by: userId,
  })
  if (videoError) return jsonError('تعذّر حفظ النسخة.', 500)

  return jsonResponse({
    ok: true,
    deliveryId,
    link: `${base}/p/${identifier}-${token}`,
    identifier,
    clientName: clientResult.client.name,
    whatsapp: clientResult.client.whatsapp_number,
  })
}