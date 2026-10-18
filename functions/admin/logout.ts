import type { PagesFunction } from '@cloudflare/workers-types'
import { readAdminData } from './_lib/auth'
import type { Env } from './_lib/env'

// Logout is reached by a plain GET link in the admin nav, so it must be a
// top-level same-site navigation — never a cross-site request an attacker can
// trigger (CSRF-logout). Browsers tag requests with `Sec-Fetch-Site`; accept
// only `same-origin` and `none` (typed URL / bookmark). Older browsers fall back
// to an `Origin`/`Referer` origin check; with no signal at all we refuse rather
// than let an unknown caller force a sign-out.
function isSameSiteNavigation(request: Request): boolean {
  const site = request.headers.get('Sec-Fetch-Site')
  if (site) return site === 'same-origin' || site === 'none'
  const source = request.headers.get('Origin') ?? request.headers.get('Referer')
  if (!source) return false
  try {
    return new URL(source).origin === new URL(request.url).origin
  } catch {
    return false
  }
}

export const onRequest: PagesFunction<Env, never, Record<string, unknown>> = async (
  context,
) => {
  const url = new URL(context.request.url)
  const login = new URL('/admin/login', url.origin).toString()
  if (!isSameSiteNavigation(context.request)) {
    return new Response('طلب غير صالح.', {
      status: 403,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  }
  const data = readAdminData(context)
  if (data) await data.supabase.auth.signOut()
  return Response.redirect(login, 303)
}