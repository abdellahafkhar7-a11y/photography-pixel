import type { PagesFunction } from '@cloudflare/workers-types'
import type { DeliveryEnv } from '../../_lib/env'
import { isValidTokenFormat } from '../../_lib/tokens'
import { resolvePrivateDelivery, tokenIsActive } from '../_client'
import { noStoreResponse, streamObject } from '../_media'

type Route = PagesFunction<DeliveryEnv, 'token', Record<string, unknown>>

export const onRequestGet: Route = async (context) => {
  const token = String((context.params as { token: string }).token)
  if (!isValidTokenFormat(token)) return noStoreResponse(404)

  const resolved = await resolvePrivateDelivery(context.env, token)
  if (resolved.kind !== 'ok') return noStoreResponse(404)
  const { delivery, video } = resolved.data
  if (!tokenIsActive(delivery) || delivery.status === 'expired') {
    return noStoreResponse(404)
  }

  const key = video?.r2_thumb_key
  if (!key || !context.env.BUCKET) return noStoreResponse(404)
  const streamed = await streamObject(context.env.BUCKET, key, context.request, 'image/jpeg')
  return streamed ?? noStoreResponse(404)
}