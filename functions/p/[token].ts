import type { PagesFunction } from '@cloudflare/workers-types'
import { shareBaseUrl, type DeliveryEnv } from '../_lib/env'
import { createServiceClient } from '../_lib/supabase'
import { isValidTokenFormat, splitStableToken } from '../_lib/tokens'
import {
  expireDeliveryIfDue,
  markPreviewViewed,
  privatePageResponse,
  renderInvalidOrExpiredLinkPage,
  renderPrivatePage,
  resolvePrivateDelivery,
  tokenIsActive,
  trackLinkOpen,
} from './_client'

type Route = PagesFunction<DeliveryEnv, 'token', Record<string, unknown>>

export const onRequestGet: Route = async (context) => {
  const token = String((context.params as { token: string }).token)
  const invalid = renderInvalidOrExpiredLinkPage(context.env, context.request)
  if (!isValidTokenFormat(splitStableToken(token).secret)) return invalid

  const resolved = await resolvePrivateDelivery(context.env, token)
  if (resolved.kind !== 'ok') return invalid
  const { delivery } = resolved.data
  if (!tokenIsActive(delivery)) return invalid

  // A delivery whose download window has ended is dead: flip it and serve the
  // same generic dead-link page (never a stale "download available" UI).
  if (
    delivery.download_expires_at &&
    new Date(delivery.download_expires_at).getTime() <= Date.now() &&
    (delivery.status === 'confirmed' ||
      delivery.status === 'download_available' ||
      delivery.status === 'downloaded')
  ) {
    const service = createServiceClient(context.env)
    if (service) await expireDeliveryIfDue(service, delivery.id)
    return invalid
  }

  const service = createServiceClient(context.env)
  if (!service) return invalid

  await trackLinkOpen(service, delivery.id)
  await markPreviewViewed(service, delivery.id)

  // Re-resolve so the rendered badge reflects the preview_viewed transition.
  const fresh = await resolvePrivateDelivery(context.env, token)
  const data = fresh.kind === 'ok' ? fresh.data : resolved.data
  const base = shareBaseUrl(context.env, context.request)
  return privatePageResponse(renderPrivatePage(base, token, data))
}

// The client confirmation handshake was removed: the /p page has no form, no
// button and no intermediate step. Downloads are plain <a href="/download">
// links that start immediately. Nothing on this page is state-changing for the
// client any more, so every POST is refused rather than leaving a
// state-mutating endpoint with no UI in front of it.
export const onRequestPost: Route = () =>
  new Response(null, { status: 405, headers: { Allow: 'GET' } })