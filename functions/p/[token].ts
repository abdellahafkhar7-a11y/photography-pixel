import type { PagesFunction } from '@cloudflare/workers-types'
import { siteUrl, type DeliveryEnv } from '../_lib/env'
import { createServiceClient } from '../_lib/supabase'
import { isValidTokenFormat } from '../_lib/tokens'
import {
  confirmDelivery,
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
  if (!isValidTokenFormat(token)) return invalid

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
  const base = siteUrl(context.env, context.request)
  return privatePageResponse(renderPrivatePage(base, token, data))
}

export const onRequestPost: Route = async (context) => {
  const token = String((context.params as { token: string }).token)
  const invalid = renderInvalidOrExpiredLinkPage(context.env, context.request)
  if (!isValidTokenFormat(token)) return invalid

  const resolved = await resolvePrivateDelivery(context.env, token)
  if (resolved.kind !== 'ok') return invalid
  const { delivery } = resolved.data
  if (!tokenIsActive(delivery)) return invalid

  const service = createServiceClient(context.env)
  if (!service) return invalid

  const base = siteUrl(context.env, context.request)
  const result = await confirmDelivery(service, delivery.id)

  if (result === 'confirmed' || result === 'already') {
    const fresh = await resolvePrivateDelivery(context.env, token)
    const data = fresh.kind === 'ok' ? fresh.data : resolved.data
    return privatePageResponse(renderPrivatePage(base, token, data))
  }
  if (result === 'expired') {
    const fresh = await resolvePrivateDelivery(context.env, token)
    const data = fresh.kind === 'ok' ? fresh.data : resolved.data
    return privatePageResponse(renderPrivatePage(base, token, data))
  }
  return privatePageResponse(
    renderPrivatePage(base, token, resolved.data, {
      confirmError: 'تعذّر إتمام التأكيد، حاول مرة أخرى.',
    }),
  )
}