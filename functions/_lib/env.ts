import type { R2Bucket } from '@cloudflare/workers-types'

export type DeliveryEnv = {
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_ROLE_KEY: string
  BUCKET?: R2Bucket
  SITE_URL?: string
  R2_ENDPOINT?: string
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
  R2_REGION?: string
  CLEANUP_SECRET?: string
}

export function hasSupabaseConfig(env: Partial<DeliveryEnv>): boolean {
  return Boolean(
    env.SUPABASE_URL && env.SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY,
  )
}

export function siteUrl(env: DeliveryEnv, request?: Request): string {
  if (env.SITE_URL) return env.SITE_URL.replace(/\/$/, '')
  if (request) return new URL(request.url).origin
  return 'http://localhost:8788'
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0'])

/**
 * Origin for links that get handed to somebody else (client share links).
 *
 * A link copied from a phone must work on the CLIENT's device, so the host the
 * coordinator is actually on has to win over SITE_URL. SITE_URL is routinely a
 * loopback/dev value (http://localhost:8788), and a link built from it is dead
 * the moment it leaves the machine that created it. On a real deployment the
 * request origin already equals SITE_URL, so this changes nothing in production.
 */
export function shareBaseUrl(env: DeliveryEnv, request?: Request): string {
  if (request) {
    try {
      const { origin, hostname } = new URL(request.url)
      if (!LOOPBACK_HOSTS.has(hostname)) return origin
    } catch {
      // Malformed request URL — fall back to the configured site URL.
    }
  }
  return siteUrl(env, request)
}

export function hasR2Bucket(env: DeliveryEnv): env is DeliveryEnv & { BUCKET: R2Bucket } {
  return Boolean(env.BUCKET)
}