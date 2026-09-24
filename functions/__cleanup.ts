import type { PagesFunction } from '@cloudflare/workers-types'
import { hasSupabaseConfig, type DeliveryEnv } from './_lib/env'
import { runCleanup, type CleanupResult } from './_lib/cleanup'
import { timingSafeEqual } from './_lib/tokens'
import { requireSession, requireOwner } from './admin/_lib/auth'

type Route = PagesFunction<DeliveryEnv, never, Record<string, unknown>>

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

function hasSecret(context: Parameters<Route>[0]): boolean {
  const provided =
    context.request.headers.get('x-cleanup-secret') ??
    context.request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const expected = context.env.CLEANUP_SECRET
  if (!expected || !provided) return false
  return timingSafeEqual(provided, expected)
}

// Guarded cleanup endpoint. Two legitimate callers:
//   1. The scheduled cron Worker (CLEANUP_SECRET over x-cleanup-secret).
//   2. The owner, signed in on the admin panel (owner session).
export const onRequestPost: Route = async (context) => {
  if (!hasSupabaseConfig(context.env)) return json({ ok: false, error: 'not_configured' }, 503)
  const now = new Date()
  const minIntervalSeconds = 30
  const since = Number(context.request.headers.get('x-cleanup-since') ?? '0')
  if (context.request.headers.has('x-cleanup-since')) {
    if (!Number.isFinite(since) || since <= 0) {
      return json({ ok: false, error: 'invalid_since' }, 400)
    }
    if (now.getTime() - since < minIntervalSeconds * 1000) {
      return json({ ok: false, error: 'too_soon' }, 429)
    }
  }

  if (hasSecret(context)) {
    const result: CleanupResult = await runCleanup(context.env, (line) => console.log(line))
    return json({ ok: true, result })
  }

  const appUser = await requireSession(context)
  if (appUser instanceof Response) return json({ ok: false, error: 'unauthorized' }, 401)
  const forbidden = requireOwner(appUser)
  if (forbidden) return json({ ok: false, error: 'forbidden' }, 403)

  const result: CleanupResult = await runCleanup(context.env, (line) => console.log(line))
  return json({ ok: true, result })
}

export const onRequestGet: Route = () => json({ ok: false, error: 'method_not_allowed' }, 405)