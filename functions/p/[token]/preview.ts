import type { PagesFunction } from '@cloudflare/workers-types'
import type { DeliveryEnv } from '../../_lib/env'
import { createServiceClient } from '../../_lib/supabase'
import { isValidTokenFormat } from '../../_lib/tokens'
import { resolvePrivateDelivery, tokenIsActive, expireDeliveryIfDue } from '../_client'
import { noStoreResponse, streamObject } from '../_media'

type Route = PagesFunction<DeliveryEnv, 'token', Record<string, unknown>>

export const onRequestGet: Route = async (context) => {
  const token = String((context.params as { token: string }).token)
  if (!isValidTokenFormat(token)) return noStoreResponse(404)

  const resolved = await resolvePrivateDelivery(context.env, token)
  if (resolved.kind !== 'ok') return noStoreResponse(404)
  const { delivery, video } = resolved.data
  if (!tokenIsActive(delivery)) return noStoreResponse(404)

  // Block playback for expired deliveries; R2 deletion (if any) only happens
  // in the cleanup job.
  if (delivery.status === 'expired') return noStoreResponse(410)
  if (
    delivery.download_expires_at &&
    new Date(delivery.download_expires_at).getTime() <= Date.now()
  ) {
    const service = createServiceClient(context.env)
    if (service) await expireDeliveryIfDue(service, delivery.id)
    return noStoreResponse(410)
  }

  if (video?.source_type === 'portfolio') {
    const target = video.portfolio_url ?? ''
    if (!target) return noStoreResponse(404)
    return Response.redirect(target, 302)
  }

  const key = video?.r2_preview_key ?? video?.r2_original_key
  if (!key || !context.env.BUCKET) return noStoreResponse(404)
  const streamed = await streamObject(context.env.BUCKET, key, context.request, 'video/mp4')
  return streamed ?? noStoreResponse(404)
}