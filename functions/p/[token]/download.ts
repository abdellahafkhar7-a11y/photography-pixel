import type { PagesFunction } from '@cloudflare/workers-types'
import { siteUrl, type DeliveryEnv } from '../../_lib/env'
import { createServiceClient } from '../../_lib/supabase'
import { isValidTokenFormat } from '../../_lib/tokens'
import {
  buildPrivateUrl,
  downloadTargetFor,
  gateDownload,
  proxyR2Download,
  resolvePrivateDelivery,
} from '../_client'

type Route = PagesFunction<DeliveryEnv, 'token', Record<string, unknown>>

// Download is a GET so browsers can stream the file directly. Authorization
// runs server-side in gateDownload (status + token + 3-day window).
export const onRequestGet: Route = async (context) => {
  const token = String((context.params as { token: string }).token)
  const base = siteUrl(context.env, context.request)
  const pageUrl = buildPrivateUrl(base, token)
  if (!isValidTokenFormat(token)) return Response.redirect(pageUrl, 302)

  const resolved = await resolvePrivateDelivery(context.env, token)
  if (resolved.kind !== 'ok') return Response.redirect(pageUrl, 302)
  const { delivery, video } = resolved.data

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