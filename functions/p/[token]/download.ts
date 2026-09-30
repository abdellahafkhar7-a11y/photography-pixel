import type { PagesFunction } from '@cloudflare/workers-types'
import { shareBaseUrl, type DeliveryEnv } from '../../_lib/env'
import { createServiceClient } from '../../_lib/supabase'
import { isValidTokenFormat, splitStableToken } from '../../_lib/tokens'
import {
  buildPrivateUrl,
  downloadTargetFor,
  gateDownload,
  itemForPosition,
  proxyR2Download,
  resolvePrivateDelivery,
} from '../_client'

type Route = PagesFunction<DeliveryEnv, 'token', Record<string, unknown>>

// Download is a GET so browsers can stream the file directly. Authorization
// runs server-side in gateDownload (status + token + 3-day window). The item
// parameter selects one video inside a multi-video delivery.
export const onRequestGet: Route = async (context) => {
  const token = String((context.params as { token: string }).token)
  const base = shareBaseUrl(context.env, context.request)
  const pageUrl = buildPrivateUrl(base, token)
  if (!isValidTokenFormat(splitStableToken(token).secret)) return Response.redirect(pageUrl, 302)

  const resolved = await resolvePrivateDelivery(context.env, token)
  if (resolved.kind !== 'ok') return Response.redirect(pageUrl, 302)
  const { delivery, videos } = resolved.data

  const itemQuery = context.request.url.includes('?') ? new URL(context.request.url).searchParams.get('item') : null
  const itemPos = itemQuery === null ? (videos.length > 0 ? 1 : null) : Number(itemQuery)
  const video = itemForPosition(videos, Number.isInteger(itemPos) ? itemPos : null)
  if (!video) return Response.redirect(pageUrl, 302)

  const service = createServiceClient(context.env)
  if (!service) return Response.redirect(pageUrl, 302)

  const gate = await gateDownload(service, delivery, video)
  if (!gate.ok) return Response.redirect(pageUrl, 302)

  const target = await downloadTargetFor(context.env, video)
  if (target.kind === 'presigned') return Response.redirect(target.url, 302)
  if (target.kind === 'redirect') return Response.redirect(target.url, 302)

  const key = video?.r2_original_key
  if (!key) return Response.redirect(pageUrl, 302)
  const streamed = await proxyR2Download(
    context.env,
    key,
    video?.original_filename ?? 'original.mp4',
    video?.mime_type ?? 'video/mp4',
  )
  return streamed ?? Response.redirect(pageUrl, 302)
}