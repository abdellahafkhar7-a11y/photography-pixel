import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './db-types'

export type Db = SupabaseClient<Database>

export function createServiceClient(env: {
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
}): Db | null {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}