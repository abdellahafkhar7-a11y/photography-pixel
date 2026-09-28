import type { R2Bucket } from '@cloudflare/workers-types'

export type Env = {
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_ROLE_KEY: string
  BUCKET?: R2Bucket
}

export function hasSupabaseConfig(env: Env): boolean {
  return Boolean(
    env.SUPABASE_URL && env.SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY,
  )
}