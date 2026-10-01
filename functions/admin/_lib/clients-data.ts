import type { Db } from '../../_lib/supabase'
import type { DeliveryEnv } from '../../_lib/env'
import type {
  ClientsRow,
  ClientStatus,
  ClientVideoSlotsRow,
  DeliveryActivityType,
  DeliveryMode,
  DeliverySourceType,
  DeliveryStatus,
  KanbanStatus,
  ModelsRow,
  PaymentStatus,
  ProjectStatus,
  SlotStatus,
} from '../../_lib/db-types'
import { normalizeWhatsapp, isValidWhatsapp } from '../../_lib/whatsapp'
import { generatePrivateToken, hashPrivateToken } from '../../_lib/tokens'
import { recordActivity } from '../../_lib/activities'
import { stableClientVisibleId } from '../deliveries/_helpers'

//============================================================================
// Phase 4F + Phase 4L + Phase 4N — clients data: live list, detail (with the
// model workspace: Video Slots / Script / Delivery), create and status.
//
// Slot rule: `video_slots_count` is PLANNING ONLY. It drives which slots are
// "in plan" (position <= count) and which are "paused" (position > count).
// Reducing the count NEVER deletes slots, deliveries or R2 files — a reduced
// slot simply becomes paused and any content it already has stays reachable.
// Each slot owns at most one current delivery (partial unique index), created
// lazily from the client workspace on the first "upload" action.
//============================================================================

export type ClientListItem = {
  client: ClientsRow
  model: ModelRefRow | null
  deliveryCount: number
  slotCount: number
  filledSlots: number
  latestDelivery: { status: DeliveryStatus; created_at: string } | null
}

export type ClientDelivery = {
  id: string
  source_type: DeliverySourceType
  status: DeliveryStatus
  delivery_mode: DeliveryMode
  client_visible_id: string | null
  archived_at: string | null
  created_at: string
  confirmed_at: string | null
  downloaded_at: string | null
  download_expires_at: string | null
  expired_at: string | null
  client_video_slot_id: string | null
}

export type ClientActivity = {
  id: string
  delivery_id: string
  type: DeliveryActivityType
  metadata: Record<string, unknown> | null
  created_at: string
}

export type ClientSlotDetail = {
  slot: ClientVideoSlotsRow
  delivery: {
    id: string
    status: DeliveryStatus
    delivery_mode: DeliveryMode
    client_visible_id: string | null
    archived_at: string | null
    created_at: string
    hasVideo: boolean
  } | null
}

export type ClientProjectSummary = {
  id: string
  name: string
  project_code: string
  status: ProjectStatus
  planned_video_count: number
  shoot_date: string | null
  shoot_time: string | null
  payment_status: PaymentStatus
  total_price: number | null
  advance: number | null
  updated_at: string
  byStatus: Record<KanbanStatus, number>
}

export type ClientDetail = {
  client: ClientsRow
  model: ModelsRow | null
  slots: ClientSlotDetail[]
  deliveryCount: number
  activeVersionCount: number
  deliveries: ClientDelivery[]
  activity: ClientActivity[]
  projects: ClientProjectSummary[]
}

type ModelRefRow = { id: string; name: string; photo: string | null }

export async function listClients(
  service: Db,
  filter: { status?: ClientStatus | ''; modelId?: string } = {},
): Promise<ClientListItem[]> {
  const [clientsRes, deliveriesRes, slotsRes, videosRes, modelsRes] = await Promise.all([
    service
      .from('clients')
      .select('*')
      .order('name')
      .returns<ClientsRow[]>(),
    service
      .from('deliveries')
      .select('id, client_id, status, created_at')
      // Client rows count CLIENT DELIVERIES only. A Coordinator temporary
      // share has no client at all, and must never be counted as one.
      .eq('share_kind', 'client_delivery')
      .returns<{ id: string; client_id: string | null; status: DeliveryStatus; created_at: string }[]>(),
    service
      .from('client_video_slots')
      .select('client_id')
      .returns<{ client_id: string }[]>(),
    service
      .from('delivery_videos')
      .select('delivery_id')
      .eq('is_active', true)
      .returns<{ delivery_id: string }[]>(),
    service.from('models').select('id, name, photo').returns<ModelRefRow[]>(),
  ])

  const modelsById = new Map((modelsRes.data ?? []).map((model) => [model.id, model]))
  const slotCounts = new Map<string, number>()
  for (const slot of slotsRes.data ?? []) {
    slotCounts.set(slot.client_id, (slotCounts.get(slot.client_id) ?? 0) + 1)
  }
  const videosByDelivery = new Map<string, number>()
  for (const video of videosRes.data ?? []) {
    videosByDelivery.set(video.delivery_id, (videosByDelivery.get(video.delivery_id) ?? 0) + 1)
  }
  const filledByClient = new Map<string, number>()
  for (const delivery of deliveriesRes.data ?? []) {
    if (delivery.client_id && videosByDelivery.has(delivery.id)) {
      filledByClient.set(delivery.client_id, (filledByClient.get(delivery.client_id) ?? 0) + 1)
    }
  }

  const counts = new Map<string, number>()
  const latest = new Map<string, { status: DeliveryStatus; created_at: string }>()
  for (const row of deliveriesRes.data ?? []) {
    if (!row.client_id) continue
    counts.set(row.client_id, (counts.get(row.client_id) ?? 0) + 1)
    const existing = latest.get(row.client_id)
    if (!existing || row.created_at > existing.created_at) {
      latest.set(row.client_id, { status: row.status, created_at: row.created_at })
    }
  }

  const all = clientsRes.data ?? []
  const items = all
    .map((client) => ({
      client,
      model: client.model_id ? (modelsById.get(client.model_id) ?? null) : null,
      deliveryCount: counts.get(client.id) ?? 0,
      slotCount: slotCounts.get(client.id) ?? 0,
      filledSlots: filledByClient.get(client.id) ?? 0,
      latestDelivery: latest.get(client.id) ?? null,
    }))
    .filter(({ client }) =>
      filter.modelId ? client.model_id === filter.modelId : true,
    )

  if (filter.status === 'active' || filter.status === 'archived') {
    // PostgREST can't reliably narrow an enum in some linked configs, and we
    // already hold the full set, so sort-first + cheap in-memory filter here.
    return items.filter(({ client }) => client.status === filter.status)
  }
  return items.sort((a, b) =>
    a.client.status === b.client.status
      ? (a.client.name ?? '').localeCompare(b.client.name ?? '', 'ar')
      : a.client.status === 'active'
        ? -1
        : 1,
  )
}

export async function loadModelsOptions(service: Db): Promise<ModelRefRow[]> {
  const { data } = await service
    .from('models')
    .select('id, name, photo')
    .order('name')
    .returns<ModelRefRow[]>()
  return data ?? []
}

export async function loadClientDetail(
  service: Db,
  clientId: string,
): Promise<ClientDetail | null> {
  const { data: client } = await service
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .maybeSingle<ClientsRow>()
  if (!client) return null

  const [model, deliveries, slots, projects] = await Promise.all([
    client.model_id
      ? service
          .from('models')
          .select('*')
          .eq('id', client.model_id)
          .maybeSingle<ModelsRow>()
          .then((r) => r.data ?? null)
      : Promise.resolve<ModelsRow | null>(null),
    service
      .from('deliveries')
      .select(
        'id, source_type, status, delivery_mode, client_visible_id, archived_at, created_at, confirmed_at, downloaded_at, download_expires_at, expired_at, client_video_slot_id',
      )
      .eq('client_id', clientId)
      // Defensive: the client_id predicate already excludes temporary shares
      // (they are forced to NULL), but the workflow is stated explicitly so a
      // future bug cannot surface a Coordinator share inside a client page.
      .eq('share_kind', 'client_delivery')
      .order('created_at', { ascending: false })
      .returns<ClientDelivery[]>(),
    service
      .from('client_video_slots')
      .select('*')
      .eq('client_id', clientId)
      .order('position')
      .returns<ClientVideoSlotsRow[]>(),
    service
      .from('projects')
      .select(
        'id, name, project_code, status, planned_video_count, shoot_date, shoot_time, payment_status, total_price, advance, updated_at',
      )
      .eq('client_id', clientId)
      .order('updated_at', { ascending: false })
      .returns<
        Omit<ClientProjectSummary, 'byStatus'>[]
      >(),
  ])

  const projectRows = projects?.data ?? []
  const emptyCounts = (): Record<KanbanStatus, number> => ({ todo: 0, editing: 0, review: 0, ready: 0, done: 0 })
  const byStatus = new Map<string, Record<KanbanStatus, number>>()
  if (projectRows.length > 0) {
    const { data: slotRows } = await service
      .from('client_video_slots')
      .select('project_id, kanban_status')
      .in(
        'project_id',
        projectRows.map((p) => p.id),
      )
      .returns<{ project_id: string; kanban_status: KanbanStatus }[]>()
    for (const slot of slotRows ?? []) {
      if (!slot.project_id) continue
      const counts = byStatus.get(slot.project_id) ?? emptyCounts()
      counts[slot.kanban_status] += 1
      byStatus.set(slot.project_id, counts)
    }
  }
  const projectList: ClientProjectSummary[] = projectRows.map((p) => ({
    ...p,
    byStatus: byStatus.get(p.id) ?? emptyCounts(),
  }))

  const deliveryList = deliveries?.data ?? []
  const deliveryIds = deliveryList.map((d) => d.id)
  const activeVideosByDelivery = new Map<string, number>()
  let activeVersionCount = 0
  if (deliveryIds.length > 0) {
    const { data: versionRes } = await service
      .from('delivery_videos')
      .select('delivery_id, id')
      .in('delivery_id', deliveryIds)
      .eq('is_active', true)
      .returns<{ delivery_id: string; id: string }[]>()
    for (const video of versionRes ?? []) {
      activeVideosByDelivery.set(video.delivery_id, (activeVideosByDelivery.get(video.delivery_id) ?? 0) + 1)
      activeVersionCount += 1
    }
  }

  const slotList = slots?.data ?? []
  const deliveryBySlot = new Map<string, ClientSlotDetail['delivery']>()
  for (const delivery of deliveryList) {
    if (!delivery.client_video_slot_id) continue
    deliveryBySlot.set(delivery.client_video_slot_id, {
      id: delivery.id,
      status: delivery.status,
      delivery_mode: delivery.delivery_mode,
      client_visible_id: delivery.client_visible_id,
      archived_at: delivery.archived_at,
      created_at: delivery.created_at,
      hasVideo: (activeVideosByDelivery.get(delivery.id) ?? 0) > 0,
    })
  }
  const slotsDetail: ClientSlotDetail[] = slotList.map((slot) => ({
    slot,
    delivery: deliveryBySlot.get(slot.id) ?? null,
  }))

  let activity: ClientActivity[] = []
  if (deliveryIds.length > 0) {
    const { data } = await service
      .from('delivery_activity')
      .select('id, delivery_id, type, metadata, created_at')
      .in('delivery_id', deliveryIds)
      .order('created_at', { ascending: false })
      .limit(100)
      .returns<ClientActivity[]>()
    activity = data ?? []
  }

  return {
    client,
    model,
    slots: slotsDetail,
    deliveryCount: deliveryList.length,
    activeVersionCount,
    deliveries: deliveryList,
    activity,
    projects: projectList,
  }
}

//----------------------------------------------------------------------------
// Profile / plan (model, slot count, delivery mode, script)
//----------------------------------------------------------------------------

export type ClientProfileInput = {
  modelId: string | null
  count: number
  mode: DeliveryMode
  script: string
}

// Reconcile the planned slots with the requested count. Slots are NEVER
// deleted: positions beyond the count are just paused, and re-including a
// paused slot returns it to planned (or active when a delivery already exists)
// without touching its content.
async function reconcileSlots(
  service: Db,
  clientId: string,
  count: number,
): Promise<void> {
  const { data: existing } = await service
    .from('client_video_slots')
    .select('id, position, status, client_id')
    .eq('client_id', clientId)
    .is('project_id', null)
    .returns<{ id: string; position: number; status: SlotStatus; client_id: string }[]>()
  const byPosition = new Map((existing ?? []).map((slot) => [slot.position, slot]))

  const slotDeliveryStatus = new Map<string, DeliveryStatus>()
  {
    const positions = [...byPosition.keys()]
    if (positions.length > 0) {
      const { data: deliveries } = await service
        .from('deliveries')
        .select('status, client_video_slot_id')
        .in('client_video_slot_id', [...byPosition.values()].map((s) => s.id))
        .returns<{ status: DeliveryStatus; client_video_slot_id: string | null }[]>()
      for (const delivery of deliveries ?? []) {
        if (delivery.client_video_slot_id) {
          slotDeliveryStatus.set(delivery.client_video_slot_id, delivery.status)
        }
      }
    }
  }

  const upserts: { client_id: string; position: number; title: string; status: SlotStatus; project_id: null }[] = []
  const updates: { id: string; patch: { status: SlotStatus; updated_at: string } }[] = []
  for (let position = 1; position <= count; position += 1) {
    const slot = byPosition.get(position)
    if (!slot) {
      upserts.push({ client_id: clientId, project_id: null, position, title: `فيديو ${position}`, status: 'planned' })
    } else if (slot.status === 'paused') {
      updates.push({
        id: slot.id,
        patch: {
          status: slotDeliveryStatus.has(slot.id) ? 'active' : 'planned',
          updated_at: new Date().toISOString(),
        },
      })
    }
  }
  for (const [position, slot] of byPosition) {
    if (position > count && slot.status !== 'paused') {
      updates.push({ id: slot.id, patch: { status: 'paused', updated_at: new Date().toISOString() } })
    }
  }

  if (upserts.length > 0) await service.from('client_video_slots').insert(upserts)
  for (const update of updates) {
    await service.from('client_video_slots').update(update.patch).eq('id', update.id)
  }
}

export async function setClientProfile(
  service: Db,
  clientId: string,
  input: ClientProfileInput,
): Promise<ClientWriteResult> {
  const safeCount = Number.isInteger(input.count) && input.count >= 0 && input.count <= 50 ? input.count : 0
  const mode: DeliveryMode =
    input.mode === 'VIEW_ONLY' ? 'VIEW_ONLY' : 'VIEW_AND_DOWNLOAD'
  const { data, error } = await service
    .from('clients')
    .update({
      model_id: input.modelId ?? null,
      video_slots_count: safeCount,
      delivery_mode: mode,
      script: input.script.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', clientId)
    .select('*')
    .single<ClientsRow>()
  if (error || !data) return { ok: false, error: 'تعذّر حفظ ملف العميل.' }
  await reconcileSlots(service, clientId, safeCount)
  return { ok: true, client: data }
}

//----------------------------------------------------------------------------
// Create / status
//----------------------------------------------------------------------------

export type ClientCreateInput = {
  name: string
  whatsapp: string
  userId: string
  profile: ClientProfileInput
}

export type ClientWriteResult =
  | { ok: true; client: ClientsRow }
  | { ok: false; error: string }

export async function createClient(
  service: Db,
  input: ClientCreateInput,
): Promise<ClientWriteResult> {
  const trimmedName = input.name.trim()
  if (trimmedName.length < 2) return { ok: false, error: 'أدخل اسم العميل (حرفان على الأقل).' }
  if (!isValidWhatsapp(input.whatsapp)) {
    return { ok: false, error: 'أدخل رقم واتساب صحيح، مثال: 0663493003' }
  }
  const normalized = normalizeWhatsapp(input.whatsapp)

  const { data: existing } = await service
    .from('clients')
    .select('*')
    .eq('whatsapp_number', normalized)
    .maybeSingle<ClientsRow>()
  if (existing) {
    if (existing.status === 'archived') {
      const { data: reactivated, error } = await service
        .from('clients')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select('*')
        .single<ClientsRow>()
      if (error || !reactivated) return { ok: false, error: 'تعذّر إعادة تنشيط العميل.' }
      await setClientProfile(service, existing.id, input.profile)
      return { ok: true, client: reactivated }
    }
    await setClientProfile(service, existing.id, input.profile)
    return { ok: true, client: existing }
  }

  const safeCount = Number.isInteger(input.profile.count) && input.profile.count >= 0 && input.profile.count <= 50 ? input.profile.count : 0
  const mode: DeliveryMode =
    input.profile.mode === 'VIEW_ONLY' ? 'VIEW_ONLY' : 'VIEW_AND_DOWNLOAD'

  const { data: created, error } = await service
    .from('clients')
    .insert({
      name: trimmedName,
      whatsapp_number: normalized,
      status: 'active',
      model_id: input.profile.modelId ?? null,
      video_slots_count: safeCount,
      delivery_mode: mode,
      script: input.profile.script.trim() || null,
      created_by: input.userId,
    })
    .select('*')
    .single<ClientsRow>()
  if (error || !created) return { ok: false, error: 'تعذّر حفظ بيانات العميل.' }

  await reconcileSlots(service, created.id, safeCount)
  return { ok: true, client: created }
}

export async function setClientStatus(
  service: Db,
  clientId: string,
  status: ClientStatus,
): Promise<ClientWriteResult> {
  const { data, error } = await service
    .from('clients')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', clientId)
    .select('*')
    .single<ClientsRow>()
  if (error || !data) return { ok: false, error: 'تعذّر تحديث حالة العميل.' }
  return { ok: true, client: data }
}

//----------------------------------------------------------------------------
// Owner-only client deletion
//
// This is deliberately NOT a blind cascade. Deleting a client row would
// silently take real CRM data with it, so the impact is inspected first and the
// delete is refused whenever the client is still connected to something the
// owner would lose:
//
//   * projects / payments / CRM data  -> refuse, archive instead
//   * video slots (and their revision history) -> refuse, they cascade
//   * client deliveries               -> counted, and deleted only for the
//                                         OWNER workflow (share_kind)
//   * coordinator temporary shares    -> NEVER touched (no client_id, and the
//                                         share_kind filter excludes them even
//                                         if that ever changes)
//   * public portfolio videos         -> never touched; a portfolio-backed
//                                         delivery has no R2 object at all
//----------------------------------------------------------------------------

export type ClientDeleteImpact = {
  projects: number
  slots: number
  deliveries: number
  videos: number
  r2Keys: string[]
}

export type ClientDeleteResult =
  | { ok: true; clientId: string; deletedDeliveries: number; deletedVideos: number; deletedR2Keys: number }
  | { ok: false; reason: 'has_projects' | 'has_slots' | 'not_found' | 'failed'; error: string; impact?: ClientDeleteImpact }

/** Inspects everything a delete would affect, without changing anything. */
export async function inspectClientDeletion(
  service: Db,
  clientId: string,
): Promise<ClientDeleteImpact | null> {
  const client = await service.from('clients').select('id').eq('id', clientId).maybeSingle<{ id: string }>()
  if (!client.data) return null

  const [projects, slots, deliveries] = await Promise.all([
    service.from('projects').select('id').eq('client_id', clientId).returns<{ id: string }[]>(),
    service
      .from('client_video_slots')
      .select('id')
      .eq('client_id', clientId)
      .returns<{ id: string }[]>(),
    // share_kind is the guard that keeps the two workflows apart: an Owner
    // Client Delivery is deletable, a Coordinator temporary share never is.
    service
      .from('deliveries')
      .select('id')
      .eq('client_id', clientId)
      .eq('share_kind', 'client_delivery')
      .returns<{ id: string }[]>(),
  ])

  const deliveryIds = (deliveries.data ?? []).map((d) => d.id)
  let videos = 0
  const r2Keys: string[] = []
  if (deliveryIds.length > 0) {
    const videosRes = await service
      .from('delivery_videos')
      .select('id, r2_original_key, source_type')
      .in('delivery_id', deliveryIds)
      .returns<{ id: string; r2_original_key: string | null; source_type: string | null }[]>()
    for (const row of videosRes.data ?? []) {
      videos += 1
      // Only a private R2 original is ever a deletion candidate. A portfolio
      // video references a PUBLIC CDN url and must never be touched.
      if (row.source_type === 'r2' && row.r2_original_key) r2Keys.push(row.r2_original_key)
    }
  }

  return {
    projects: projects.data?.length ?? 0,
    slots: slots.data?.length ?? 0,
    deliveries: deliveryIds.length,
    videos,
    r2Keys,
  }
}

export async function deleteClient(
  service: Db,
  env: DeliveryEnv,
  clientId: string,
): Promise<ClientDeleteResult> {
  const impact = await inspectClientDeletion(service, clientId)
  if (!impact) return { ok: false, reason: 'not_found', error: 'العميل غير موجود.' }

  // Refuse rather than cascade: projects carry the CRM/payment record.
  if (impact.projects > 0) {
    return {
      ok: false,
      reason: 'has_projects',
      impact,
      error: `هذا العميل مرتبط بـ ${impact.projects} مشروع في سجل الأعمال، وحذفه سيمسح بيانات المشاريع والدفعات. استخدم «أرشفة» بدل الحذف.`,
    }
  }
  // Video slots cascade into video revisions; keep that history intact.
  if (impact.slots > 0) {
    return {
      ok: false,
      reason: 'has_slots',
      impact,
      error: `هذا العميل مرتبط بـ ${impact.slots} مساحة فيديو (مع كل نسخها السابقة)، وحذفه سيمسحها. استخدم «أرشفة» بدل الحذف.`,
    }
  }

  const deliveryIds = (
    (
      await service
        .from('deliveries')
        .select('id')
        .eq('client_id', clientId)
        .eq('share_kind', 'client_delivery')
        .returns<{ id: string }[]>()
    ).data ?? []
  ).map((row) => row.id)

  let deletedVideos = 0
  if (deliveryIds.length > 0) {
    // Videos and activity go first so the audit trail is removed with the
    // delivery rather than left dangling.
    await service.from('delivery_activity').delete().in('delivery_id', deliveryIds)
    const videoRows = await service
      .from('delivery_videos')
      .select('id')
      .in('delivery_id', deliveryIds)
      .returns<{ id: string }[]>()
    await service.from('delivery_videos').delete().in('delivery_id', deliveryIds)
    deletedVideos = videoRows.data?.length ?? 0

    const { error: deliveryError } = await service.from('deliveries').delete().in('id', deliveryIds)
    if (deliveryError) {
      return { ok: false, reason: 'failed', error: `تعذّر حذف التوصيلات المرتبطة: ${deliveryError.message}`, impact }
    }
  }

  // R2 originals for THIS client only, and only ones we just proved belong to
  // the deliveries being removed. Anything shared with another delivery or part
  // of the public portfolio is not in this list.
  let deletedR2Keys = 0
  for (const key of impact.r2Keys) {
    const shared = await service
      .from('delivery_videos')
      .select('id, delivery_id, deliveries ( client_id )')
      .eq('r2_original_key', key)
      .returns<{ id: string; delivery_id: string | null; deliveries: { client_id: string | null } | null }[]>()
    const stillReferenced = (shared.data ?? []).filter(
      (row) => row.delivery_id !== null && !deliveryIds.includes(row.delivery_id),
    )
    if (stillReferenced.length > 0) continue
    try {
      await env.BUCKET?.delete(key)
      deletedR2Keys += 1
    } catch (err) {
      return {
        ok: false,
        reason: 'failed',
        error: `تعذّر حذف ملف من التخزين: ${String(err)}`,
        impact,
      }
    }
  }

  const { error: clientError } = await service.from('clients').delete().eq('id', clientId)
  if (clientError) {
    return { ok: false, reason: 'failed', error: `تعذّر حذف العميل: ${clientError.message}`, impact }
  }

  return { ok: true, clientId, deletedDeliveries: deliveryIds.length, deletedVideos, deletedR2Keys }
}

//----------------------------------------------------------------------------
// Slot -> delivery (lazy, delivery-per-slot, keeps the private-link model)
//----------------------------------------------------------------------------

export type SlotDeliveryResult =
  | { ok: true; deliveryId: string; token: string; identifier: string }
  | { ok: true; existing: true; deliveryId: string }
  | { ok: false; error: string }

// Creates the slot's delivery the first time the owner asks to prepare/upload
// it. The mode comes from the client's delivery_mode at that moment and the
// stable link keeps the existing /p/<identifier>-<secret> format. Returning
// the fresh token once lets us render the private link exactly like the
// deliveries creation page.
export async function createSlotDelivery(
  service: Db,
  input: { clientId: string; slotId: string; userId: string; whatsapp: string },
): Promise<SlotDeliveryResult> {
  const existing = await service
    .from('deliveries')
    .select('id, status')
    .eq('client_id', input.clientId)
    .eq('client_video_slot_id', input.slotId)
    .maybeSingle<{ id: string; status: DeliveryStatus }>()
  if (existing.data) return { ok: true, existing: true, deliveryId: existing.data.id }

  const client = await service
    .from('clients')
    .select('id, whatsapp_number, delivery_mode')
    .eq('id', input.clientId)
    .maybeSingle<{ id: string; whatsapp_number: string; delivery_mode: DeliveryMode }>()
  if (!client.data) return { ok: false, error: 'العميل غير موجود.' }

  const slot = await service
    .from('client_video_slots')
    .select('id')
    .eq('id', input.slotId)
    .maybeSingle<{ id: string }>()
  if (!slot.data) return { ok: false, error: 'اللقطة غير موجودة.' }

  const token = generatePrivateToken()
  const hash = await hashPrivateToken(token)
  const now = new Date().toISOString()
  const deliveryId = crypto.randomUUID()
  const identifier = stableClientVisibleId(input.whatsapp || client.data.whatsapp_number, deliveryId)

  const { data: delivery, error } = await service
    .from('deliveries')
    .insert({
      id: deliveryId,
      client_id: input.clientId,
      created_by: input.userId,
      source_type: 'r2',
      delivery_mode: client.data.delivery_mode,
      client_video_slot_id: input.slotId,
      client_visible_id: identifier,
      private_token_hash: hash,
      token_created_at: now,
    })
    .select('id')
    .single<{ id: string }>()
  if (error || !delivery) return { ok: false, error: 'تعذّر تجهيز اللقطة.' }

  await service
    .from('client_video_slots')
    .update({ status: 'active', updated_at: now })
    .eq('id', input.slotId)
  await recordActivity(service, delivery.id, 'delivery_created', { via: 'client_workspace', slot_id: input.slotId })
  return { ok: true, deliveryId: delivery.id, token, identifier }
}