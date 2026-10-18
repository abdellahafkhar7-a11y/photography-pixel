import type { PagesFunction } from '@cloudflare/workers-types'
import { applySecurityHeaders } from '../_lib/security-headers'
import { applyCookies } from './_lib/cookies'
import type { Env } from './_lib/env'
import { createServerClients } from './_lib/supabase'

export const onRequest: PagesFunction<Env, never, Record<string, unknown>> = async (
  context,
) => {
  const clients = createServerClients(context.request, context.env)
  if (clients) {
    context.data.supabase = clients.supabase
    context.data.service = clients.service
    context.data.bag = clients.bag
  }
  const response = await context.next()
  // Pages `_headers` does not apply to Function responses, so every admin
  // response (HTML, redirects, JSON, avatar images, 405s) gets the baseline
  // security headers here. No CSP: admin pages load Bamboo thumbnails and other
  // resources the public-site policy does not cover, so a tailored admin policy
  // must be verified against staging before it is enabled.
  const secured = applySecurityHeaders(response)
  if (clients) return applyCookies(secured, clients.bag)
  return secured
}