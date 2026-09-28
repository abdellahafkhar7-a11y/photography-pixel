import type { Db } from '../../_lib/supabase'
import type { ModelsRow } from '../../_lib/db-types'

//============================================================================
// Phase 4N — model workspace data. The models table is seeded from the site's
// /data/models.json (same names/photos) and is now a real entity the client
// workspace can reference. Loaders are read-only; mutations go through the
// owner-only POST handlers on /admin/models.
//============================================================================

export type ModelClientRef = {
  id: string
  name: string
  whatsapp_number: string
  video_slots_count: number
  created_at: string
}

export type ModelListItem = {
  model: ModelsRow
  clientCount: number
  slotCount: number
  activeVideos: number
  delivered: number
  pending: number
  latestClient: ModelClientRef | null
}

export async function loadModels(service: Db): Promise<ModelsRow[]> {
  const { data } = await service
    .from('models')
    .select('*')
    .order('name')
    .returns<ModelsRow[]>()
  return data ?? []
}

type ModelClientRow = {
  id: string
  name: string
  whatsapp_number: string
  model_id: string | null
  video_slots_count: number
  created_at: string
}

type SlotRow = { id: string; client_id: string; status: string }

type DeliveryRow = { id: string; client_id: string; status: string }

type VideoRow = { id: string; delivery_id: string; is_active: boolean }

export async function loadModelWorkspace(service: Db): Promise<ModelListItem[]> {
  const [modelsRes, clientsRes, slotsRes, deliveriesRes, videosRes] = await Promise.all([
    service
      .from('models')
      .select('*')
      .order('name')
      .returns<ModelsRow[]>(),
    service
      .from('clients')
      .select('id, name, whatsapp_number, model_id, video_slots_count, created_at')
      .returns<ModelClientRow[]>(),
    service
      .from('client_video_slots')
      .select('id, client_id, status')
      .returns<SlotRow[]>(),
    service
      .from('deliveries')
      .select('id, client_id, status')
      .returns<DeliveryRow[]>(),
    service
      .from('delivery_videos')
      .select('id, delivery_id, is_active')
      .returns<VideoRow[]>(),
  ])

  const clientsByModel = new Map<string, ModelClientRow[]>()
  for (const client of clientsRes.data ?? []) {
    const key = client.model_id ?? ''
    const list = clientsByModel.get(key) ?? []
    list.push(client)
    clientsByModel.set(key, list)
  }

  const slotsByClient = new Map<string, number>()
  for (const slot of slotsRes.data ?? []) {
    slotsByClient.set(slot.client_id, (slotsByClient.get(slot.client_id) ?? 0) + 1)
  }

  const activeVideosByClient = new Map<string, Set<string>>()
  const activeVideoIds = new Set<string>()
  for (const video of videosRes.data ?? []) {
    if (!video.is_active) continue
    activeVideoIds.add(video.delivery_id)
  }
  for (const delivery of deliveriesRes.data ?? []) {
    if (delivery.client_id && activeVideoIds.has(delivery.id)) {
      const set = activeVideosByClient.get(delivery.client_id) ?? new Set<string>()
      set.add(delivery.id)
      activeVideosByClient.set(delivery.client_id, set)
    }
  }

  const statusCountsByClient = new Map<string, { delivered: number; pending: number }>()
  const seed = (clientId: string) => {
    if (!statusCountsByClient.has(clientId)) {
      statusCountsByClient.set(clientId, { delivered: 0, pending: 0 })
    }
    return statusCountsByClient.get(clientId)!
  }
  for (const delivery of deliveriesRes.data ?? []) {
    if (!delivery.client_id) continue
    const counts = seed(delivery.client_id)
    if (delivery.status === 'downloaded' || delivery.status === 'expired') counts.delivered += 1
    if (delivery.status === 'pending' || delivery.status === 'preview_viewed') counts.pending += 1
  }

  return (modelsRes.data ?? []).map((model) => {
    const clients = clientsByModel.get(model.id) ?? []
    const modelClientIds = new Set(clients.map((client) => client.id))
    let slotCount = 0
    let activeVideos = 0
    let delivered = 0
    let pending = 0
    for (const client of clients) {
      slotCount += slotsByClient.get(client.id) ?? 0
      activeVideos += activeVideosByClient.get(client.id)?.size ?? 0
      const counts = statusCountsByClient.get(client.id)
      if (counts) {
        delivered += counts.delivered
        pending += counts.pending
      }
    }
    const latestClient = [...clients].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
    // Suppress unused-var when clients have no active videos at all.
    void modelClientIds
    return { model, clientCount: clients.length, slotCount, activeVideos, delivered, pending, latestClient }
  })
}

export type ModelWriteResult =
  | { ok: true; model: ModelsRow }
  | { ok: false; error: string }

export async function setModelWhatsapp(
  service: Db,
  modelId: string,
  whatsapp: string,
): Promise<ModelWriteResult> {
  const trimmed = whatsapp.trim()
  const { data, error } = await service
    .from('models')
    .update({ whatsapp_number: trimmed || null, updated_at: new Date().toISOString() })
    .eq('id', modelId)
    .select('*')
    .maybeSingle<ModelsRow>()
  if (error || !data) return { ok: false, error: 'تعذّر حفظ رقم الواتساب.' }
  return { ok: true, model: data }
}

export async function setModelAvailable(
  service: Db,
  modelId: string,
  available: boolean,
): Promise<ModelWriteResult> {
  const { data, error } = await service
    .from('models')
    .update({ available, updated_at: new Date().toISOString() })
    .eq('id', modelId)
    .select('*')
    .maybeSingle<ModelsRow>()
  if (error || !data) return { ok: false, error: 'تعذّر تحديث حالة الموديل.' }
  return { ok: true, model: data }
}