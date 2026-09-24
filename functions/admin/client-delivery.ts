import type { PagesFunction } from '@cloudflare/workers-types'
import type { Env } from './_lib/env'

type AdminFunction = PagesFunction<Env, never, Record<string, unknown>>

export const onRequest: AdminFunction = (context) => {
  const url = new URL(context.request.url)
  return Response.redirect(new URL('/admin/deliveries', url.origin).toString(), 302)
}