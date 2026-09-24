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

export function hasR2Bucket(env: DeliveryEnv): env is DeliveryEnv & { BUCKET: R2Bucket } {
  return Boolean(env.BUCKET)
}