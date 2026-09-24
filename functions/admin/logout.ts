import type { PagesFunction } from '@cloudflare/workers-types'
import { readAdminData } from './_lib/auth'
import type { Env } from './_lib/env'

export const onRequest: PagesFunction<Env, never, Record<string, unknown>> = async (
  context,
) => {
  const data = readAdminData(context)
  if (data) await data.supabase.auth.signOut()
  const url = new URL(context.request.url)
  return Response.redirect(new URL('/admin/login', url.origin).toString(), 303)
}