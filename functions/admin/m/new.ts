import type { PagesFunction } from '@cloudflare/workers-types'
import { requireSession } from '../_lib/auth'
import { sameOrigin } from '../_lib/security'
import { shareBaseUrl, type DeliveryEnv } from '../../_lib/env'
import {
  createDelivery,
  loadPortfolioCatalog,
  serviceFrom,
  TEMPORARY_SHARE_TTL_MS,
} from '../deliveries/_helpers'
import { renderMobileNew } from './_lib/mobile-views'

//============================================================================
// /admin/m/new — Phase 5A COORDINATOR TEMPORARY SHARE creation.
//
// This is NOT Client Delivery. It creates one throwaway share link and nothing
// else:
//
//   الأعمال -> اختر فيديو -> إنشاء رابط -> نسخ الرابط
//
// There is no client name, no client record, no confirmation handshake and no
// download. The link is view-only and valid for exactly 24 hours, after which
// it dies on its own without any coordinator cleanup.
//
// The row is still written through the shared createDelivery() helper so the
// token generation/hashing, the stable /p/<identifier>-<secret> link format and
// the audit triggers are identical to every other private link — but the row is
// marked share_kind='temporary_share', which is what keeps it out of the Owner
// Client Delivery system (no client, no /admin/deliveries row, no statistics).
// There is no second business-logic path here.
//
// Coordinator RBAC is inherited from requireSession().
//============================================================================

type Route = PagesFunction<DeliveryEnv, never, Record<string, unknown>>

/** A single request can never try to build an unbounded share. */
const MAX_MOBILE_VIDEOS = 200

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

function page(appUser: Awaited<ReturnType<typeof requireSession>>, state: { error?: string }): Response {
  if (appUser instanceof Response) return appUser
  return new Response(renderMobileNew(appUser, state, 0), {
    status: state.error ? 400 : 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}

export const onRequestGet: Route = async (context) => {
  return page(await requireSession(context), {})
}

export const onRequestPost: Route = async (context) => {
  if (!sameOrigin(context.request)) return jsonResponse({ error: 'طلب غير صالح.' }, 403)
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser

  const service = serviceFrom(context)
  if (!service) return jsonResponse({ error: 'الخدمة غير مهيأة.' }, 503)

  // The app posts JSON; a plain form post (progressive enhancement fallback)
  // is accepted too and re-renders the page with the error inline.
  let body: { videos?: unknown } = {}
  let isJson = false
  const contentType = context.request.headers.get('content-type') ?? ''
  try {
    if (contentType.includes('application/json')) {
      isJson = true
      body = (await context.request.json()) ?? {}
    } else {
      const form = await context.request.formData()
      body = { videos: form.getAll('videos') }
    }
  } catch {
    return jsonResponse({ error: 'تعذّر قراءة البيانات.' }, 400)
  }

  const videos = Array.isArray(body.videos)
    ? body.videos.filter((item): item is string => typeof item === 'string')
    : []

  const failure = (error: string) =>
    isJson ? jsonResponse({ error }, 400) : page(appUser, { error })

  // The ONLY inputs are the selected portfolio videos. No name, no phone.
  if (videos.length === 0) return failure('اختر فيديو واحداً على الأقل من الأعمال.')
  // No artificial limit on picking videos, only a sanity ceiling so one request
  // can never try to build an unbounded share.
  if (videos.length > MAX_MOBILE_VIDEOS) {
    return failure(`الحد الأقصى في الطلب الواحد ${MAX_MOBILE_VIDEOS} فيديو.`)
  }

  const catalog = await loadPortfolioCatalog(context)
  const result = await createDelivery({
    service,
    actorId: appUser.id,
    isOwner: appUser.role_key === 'owner',
    source: 'portfolio',
    portfolioUrls: videos,
    portfolio: catalog,
    clientId: '',
    name: '',
    whatsapp: '',
    clientLabel: '',
    allowClientLess: true,
    mode: 'VIEW_ONLY',
    // Marked as a Coordinator temporary share, not an Owner Client Delivery.
    shareKind: 'temporary_share',
    linkTtlMs: TEMPORARY_SHARE_TTL_MS,
    base: shareBaseUrl(context.env, context.request),
  })

  if (!result.ok) {
    if (isJson) return jsonResponse({ error: result.error, reason: result.reason }, result.status)
    return page(appUser, { error: result.error })
  }

  return jsonResponse({
    ok: true,
    deliveryId: result.deliveryId,
    link: result.link,
    identifier: result.identifier,
    mode: result.mode,
    shareKind: result.shareKind,
    videoCount: result.videoCount,
    createdAt: new Date().toISOString(),
    // The exact server-computed instant the link stops working.
    expiresAt: result.expiresAt,
  })
}
