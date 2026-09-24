import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { CookieBag, parseCookieHeader } from './cookies'
import { hasSupabaseConfig, type Env } from './env'
import type { Database } from './types'

export type Db = SupabaseClient<Database>

export type ServerClients = {
  supabase: Db
  service: Db
  bag: CookieBag
}

export function createServerClients(request: Request, env: Env): ServerClients | null {
  if (!hasSupabaseConfig(env)) return null
  const initialCookies = parseCookieHeader(request.headers.get('Cookie'))
  const bag = new CookieBag()
  const supabase = createServerClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return initialCookies
      },
      setAll(cookiesToSet, headers) {
        bag.addAll(cookiesToSet)
        bag.mergeHeaders(headers)
      },
    },
  })
  const service = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return { supabase, service, bag }
}