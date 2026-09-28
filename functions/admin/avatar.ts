import type { PagesFunction } from '@cloudflare/workers-types'
import { readAdminData, requireSession } from './_lib/auth'
import type { Env } from './_lib/env'
import { noStoreResponse, streamObject } from '../p/_media'

//============================================================================
// /admin/avatar?id={user-id} — serve a profile avatar from the private R2
// bucket. Only reachable behind a valid admin session; the bucket itself has
// no public access. `id` defaults to the authenticated user.
//============================================================================

type AdminFunction = PagesFunction<Env, never, Record<string, unknown>>

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function mimeForKey(key: string): string {
  if (key.endsWith('.png')) return 'image/png'
  if (key.endsWith('.webp')) return 'image/webp'
  return 'image/jpeg'
}

export const onRequestGet: AdminFunction = async (context) => {
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser

  const url = new URL(context.request.url)
  const rawId = url.searchParams.get('id') ?? appUser.id
  if (!UUID_RE.test(rawId)) return noStoreResponse(404)

  const data = readAdminData(context)
  if (!data) return noStoreResponse(404)

  const { data: row, error } = await data.service
    .from('app_users')
    .select('avatar_key')
    .eq('id', rawId)
    .maybeSingle()
  if (error || !row?.avatar_key?.startsWith('avatars/')) {
    return noStoreResponse(404)
  }
  if (!context.env.BUCKET) return noStoreResponse(404)

  const streamed = await streamObject(context.env.BUCKET, row.avatar_key, context.request, mimeForKey(row.avatar_key))
  return streamed ?? noStoreResponse(404)
}