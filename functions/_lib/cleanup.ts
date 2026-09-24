import { recordActivity } from './activities'
import { hasSupabaseConfig, type DeliveryEnv } from './env'
import { createServiceClient, type Db } from './supabase'

export type CleanupResult = {
  claimed: number
  originalsDeleted: number
  errors: string[]
}

type VideoBundle = {
  id: string
  version: number
  is_active: boolean | null
  source_type: string | null
  r2_original_key: string | null
  original_deleted_at: string | null
}

// Idempotent, version-safe cleanup:
//   1. Claim due deliveries atomically (guarded UPDATE) so concurrent runs
//      can never double-expire or double-delete.
//   2. Delete ONLY the active version's R2 original.
//   3. Record original_deleted + delivery_expired.
//   4. Self-heal pass for deliveries already marked expired whose original
//      delete was interrupted (e.g. a previous run failed after the claim).
export async function runCleanup(
  env: DeliveryEnv,
  log: (message: string) => void = () => undefined,
): Promise<CleanupResult> {
  const result: CleanupResult = { claimed: 0, originalsDeleted: 0, errors: [] }
  if (!hasSupabaseConfig(env)) {
    result.errors.push('Supabase configuration is missing')
    return result
  }
  const service = createServiceClient(env)
  if (!service) {
    result.errors.push('Supabase service client could not be created')
    return result
  }
  const now = new Date().toISOString()
  const videoSelect =
    'delivery_videos(id,version,is_active,source_type,r2_original_key,original_deleted_at)'

  // --- Pass 1: deliveries whose download window has ended -------------------
  const { data: due, error: dueError } = await service
    .from('deliveries')
    .select(`id, ${videoSelect}`)
    .in('status', ['confirmed', 'download_available', 'downloaded'])
    .not('download_expires_at', 'is', null)
    .lte('download_expires_at', now)
  if (dueError) {
    result.errors.push(`select due deliveries: ${dueError.message}`)
  } else if (due) {
    for (const delivery of due) {
      let claimed: boolean
      try {
        claimed = await claimExpired(service, delivery.id, now)
      } catch (err) {
        result.errors.push(String(err))
        continue
      }
      if (!claimed) continue // already moved by a concurrent run/route
      result.claimed += 1
      const video = activeR2Video(delivery.delivery_videos)
      if (video?.r2_original_key && !video.original_deleted_at) {
        const deleted = await deleteOriginal(service, env, delivery.id, video)
        if (deleted.ok) result.originalsDeleted += 1
        else result.errors.push(deleted.error)
      }
      await recordActivity(service, delivery.id, 'delivery_expired', { auto: true })
    }
  }

  // --- Pass 2: self-heal — expired but original still present --------------
  const { data: stuck, error: stuckError } = await service
    .from('deliveries')
    .select(`id, ${videoSelect}`)
    .eq('status', 'expired')
    .limit(100)
  if (stuckError) {
    result.errors.push(`select stuck deliveries: ${stuckError.message}`)
  } else if (stuck) {
    for (const delivery of stuck) {
      const video = activeR2Video(delivery.delivery_videos)
      if (!video?.r2_original_key || video.original_deleted_at) continue
      const deleted = await deleteOriginal(service, env, delivery.id, video)
      if (deleted.ok) result.originalsDeleted += 1
      else result.errors.push(deleted.error)
    }
  }

  log(`cleanup: claimed=${result.claimed} originalsDeleted=${result.originalsDeleted}`)
  return result
}

function activeR2Video(videos: VideoBundle[] | null | undefined): VideoBundle | null | undefined {
  if (!videos) return undefined
  return videos.find(
    (video) => video.is_active === true && video.source_type === 'r2' && video.r2_original_key,
  )
}

// Atomic claim: only a delivery that is still in a downloadable state AND past
// its download window can flip to expired. Returns false if the delivery is
// no longer claimable (already expired / timer reset / concurrent claim).
async function claimExpired(service: Db, deliveryId: string, now: string): Promise<boolean> {
  const { data, error } = await service
    .from('deliveries')
    .update({ status: 'expired', expired_at: now })
    .eq('id', deliveryId)
    .in('status', ['confirmed', 'download_available', 'downloaded'])
    .not('download_expires_at', 'is', null)
    .lte('download_expires_at', now)
    .select('id')
    .maybeSingle()
  if (error) throw new Error(`claim delivery ${deliveryId}: ${error.message}`)
  return Boolean(data)
}

async function deleteOriginal(
  service: Db,
  env: DeliveryEnv,
  deliveryId: string,
  video: VideoBundle,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = video.r2_original_key
  if (!key) return { ok: false, error: 'active r2 video has no original key' }
  if (!env.BUCKET) {
    return { ok: false, error: 'R2 bucket binding is missing (object not deleted)' }
  }
  try {
    await env.BUCKET.delete(key)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `R2 delete ${key}: ${message}` }
  }
  const { error: markError } = await service
    .from('delivery_videos')
    .update({ original_deleted_at: new Date().toISOString() })
    .eq('id', video.id)
    .is('original_deleted_at', null)
  if (markError) {
    return { ok: false, error: `mark video deleted ${video.id}: ${markError.message}` }
  }
  await recordActivity(service, deliveryId, 'original_deleted', {
    videoId: video.id,
    version: video.version,
    objectKey: key,
  })
  return { ok: true }
}