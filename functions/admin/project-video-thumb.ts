import type { PagesFunction } from '@cloudflare/workers-types'
import { createServiceClient } from '../_lib/supabase'
import { requireOwner, requireSession } from './_lib/auth'
import type { Env } from './_lib/env'
import { noStoreResponse, streamObject } from '../p/_media'

//============================================================================
// /admin/project-video-thumb?project={id}&slot={id} — serve the active
// delivery video's thumbnail from the private R2 bucket for the kanban cards.
// Only reachable behind a valid admin session; the bucket has no public access.
//============================================================================

type AdminFunction = PagesFunction<Env, never, Record<string, unknown>>

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const onRequestGet: AdminFunction = async (context) => {
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser
  const forbidden = requireOwner(appUser)
  if (forbidden) return forbidden

  const url = new URL(context.request.url)
  const projectId = url.searchParams.get('project') ?? ''
  const slotId = url.searchParams.get('slot') ?? ''
  if (!UUID_RE.test(projectId) || !UUID_RE.test(slotId)) return noStoreResponse(404)

  const service = createServiceClient(context.env)
  if (!service || !context.env.BUCKET) return noStoreResponse(404)

  // The slot must belong to this project (guards a cross-project id guess).
  const { data: slot } = await service
    .from('client_video_slots')
    .select('id')
    .eq('id', slotId)
    .eq('project_id', projectId)
    .maybeSingle<{ id: string }>()
  if (!slot) return noStoreResponse(404)

  // A slot owns at most one delivery (partial unique index).
  const { data: delivery } = await service
    .from('deliveries')
    .select('id')
    .eq('client_video_slot_id', slotId)
    .maybeSingle<{ id: string }>()
  if (!delivery) return noStoreResponse(404)

  const { data: video } = await service
    .from('delivery_videos')
    .select('r2_thumb_key')
    .eq('delivery_id', delivery.id)
    .eq('is_active', true)
    .maybeSingle<{ r2_thumb_key: string | null }>()
  const key = video?.r2_thumb_key
  if (!key) return noStoreResponse(404)

  const streamed = await streamObject(context.env.BUCKET, key, context.request, 'image/jpeg')
  return streamed ?? noStoreResponse(404)
}