import type { PagesFunction } from '@cloudflare/workers-types'
import { requireSession } from '../_lib/auth'
import { sameOrigin } from '../_lib/security'
import { shareBaseUrl, type DeliveryEnv } from '../../_lib/env'
import {
  createDelivery,
  loadPortfolioCatalog,
  normalizeClientLabel,
  serviceFrom,
} from '../deliveries/_helpers'
import { renderMobileNew } from './_lib/mobile-views'

//============================================================================
// /admin/m/new — Phase 5A mobile delivery creation.
//
// This is a PRESENTATION-ONLY endpoint: the flow is the shared
// createDelivery() from functions/admin/deliveries/_helpers, so the token is
// generated and hashed, the link is the stable /p/<identifier>-<secret>, the
// 72h window still starts on the client's first download, and the audit
// triggers fire exactly as they do for the admin form. There is no second
// business-logic path here.
//
// The mobile flow asks for a client NAME only. WhatsApp is never required:
// the name is stored on deliveries.client_label and shown by the admin as the
// delivery's client name. Coordinator RBAC is inherited from requireSession()
// (any active team member) — creation itself is not owner-only.
//============================================================================

type Route = PagesFunction<DeliveryEnv, never, Record<string, unknown>>

/** A single request can never try to build an unbounded delivery. */
const MAX_MOBILE_VIDEOS = 200

/**
 * Phase 5A (real-device refinement) — a Coordinator-created mobile link is
 * time-boxed to 24 hours and view-only. The window is stored on the delivery
 * row (deliveries.token_expires_at) so every client endpoint enforces it
 * server-side; the countdown in the app is cosmetic only.
 */
const MOBILE_LINK_TTL_MS = 24 * 60 * 60 * 1000

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

function page(appUser: Awaited<ReturnType<typeof requireSession>>, state: { error?: string; name?: string; mode?: string }): Response {
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
  let body: { name?: unknown; mode?: unknown; videos?: unknown } = {}
  let isJson = false
  const contentType = context.request.headers.get('content-type') ?? ''
  try {
    if (contentType.includes('application/json')) {
      isJson = true
      body = (await context.request.json()) ?? {}
    } else {
      const form = await context.request.formData()
      body = {
        name: form.get('name'),
        mode: form.get('mode'),
        videos: form.getAll('videos'),
      }
    }
  } catch {
    return jsonResponse({ error: 'تعذّر قراءة البيانات.' }, 400)
  }

  const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : ''
  const videos = Array.isArray(body.videos)
    ? body.videos.filter((item): item is string => typeof item === 'string')
    : []

  // The mobile client link is always view-only: the client's viewing page must
  // never expose a download, and VIEW_ONLY is what downloadAllowed() gates on
  // server-side. A posted mode is ignored rather than trusted.
  const mode = 'VIEW_ONLY'

  const failure = (error: string, name2 = name) =>
    isJson ? jsonResponse({ error }, 400) : page(appUser, { error, name: name2, mode })

  // The name is the ONLY client field in the mobile flow.
  const label = normalizeClientLabel(name)
  if (!label.ok) return failure(label.error)
  if (videos.length === 0) return failure('اختر فيديو واحداً على الأقل من الأعمال.')
  // No artificial limit on picking videos, only a sanity ceiling so one request
  // can never try to build an unbounded delivery.
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
    clientLabel: label.value,
    allowClientLess: true,
    mode,
    linkTtlMs: MOBILE_LINK_TTL_MS,
    base: shareBaseUrl(context.env, context.request),
  })

  if (!result.ok) {
    if (isJson) return jsonResponse({ error: result.error, reason: result.reason }, result.status)
    return page(appUser, { error: result.error, name, mode })
  }

  return jsonResponse({
    ok: true,
    deliveryId: result.deliveryId,
    link: result.link,
    identifier: result.identifier,
    clientName: result.clientLabel || result.clientName,
    mode: result.mode,
    videoCount: result.videoCount,
    createdAt: new Date().toISOString(),
    // The exact server-computed instant the link stops working.
    expiresAt: result.expiresAt,
  })
}
