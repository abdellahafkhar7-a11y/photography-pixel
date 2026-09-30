import type { RevisionStatus, VideoRevisionsRow } from './db-types'
import type { Db } from './supabase'
import { recordCommunication } from './communications'
import { notifyOwner } from './notifications'

async function recordProjectActivity(
  service: Db,
  projectId: string,
  type: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await service.from('project_activity').insert({ project_id: projectId, type, metadata })
}

export const REVISION_STATUS_LABEL: Record<RevisionStatus, string> = {
  none: 'لا يوجد تعديل',
  requested: 'تعديل مطلوب',
  in_progress: 'قيد التعديل',
  pending_review: 'بانتظار المراجعة',
  approved: 'تمت الموافقة',
}

// Allowed transitions from a given revision status. Approved revisions are
// immutable (they carry resolved_at); 'none' means no open cycle.
export const REVISION_NEXT: Record<RevisionStatus, RevisionStatus[]> = {
  none: [],
  requested: ['in_progress'],
  in_progress: ['pending_review'],
  pending_review: ['in_progress', 'approved'],
  approved: [],
}

export function nextRevisionStatuses(status: RevisionStatus): RevisionStatus[] {
  return REVISION_NEXT[status] ?? []
}

export async function listSlotRevisions(service: Db, slotId: string): Promise<VideoRevisionsRow[]> {
  const { data } = await service
    .from('video_revisions')
    .select('*')
    .eq('client_video_slot_id', slotId)
    .order('created_at', { ascending: false })
    .returns<VideoRevisionsRow[]>()
  return data ?? []
}

export type RequestRevisionInput = {
  slotId: string
  projectId: string
  userId: string
  reason: string
  slotTitle?: string
}

export type RevisionWriteResult = { ok: true; id: string } | { ok: false; error: string }

// Opens a new append-only revision cycle: version = last version + 1, status
// 'requested'. The slot's revision_version is only advanced when a revision is
// approved, so V counts on the card stay in sync with accepted cuts.
export async function requestRevision(
  service: Db,
  input: RequestRevisionInput,
): Promise<RevisionWriteResult> {
  const reason = input.reason.trim()
  if (reason.length < 2) return { ok: false, error: 'اكتب سبب طلب التعديل.' }

  const { data: versions } = await service
    .from('video_revisions')
    .select('version')
    .eq('client_video_slot_id', input.slotId)
    .order('created_at', { ascending: false })
    .limit(1)
    .returns<{ version: number }[]>()
  const version = (versions && versions.length > 0 ? versions[0]?.version ?? 0 : 0) + 1

  const { data, error } = await service
    .from('video_revisions')
    .insert({
      client_video_slot_id: input.slotId,
      project_id: input.projectId,
      version,
      status: 'requested',
      reason,
      created_by: input.userId,
    })
    .select('id')
    .single()
    .returns<{ id: string } | null>()
  if (error || !data) return { ok: false, error: 'تعذّر تسجيل طلب التعديل.' }

  const title = input.slotTitle?.trim() ?? `الفيديو V${version}`
  await recordProjectActivity(service, input.projectId, 'revision_requested', {
    slot_id: input.slotId,
    revision_id: data.id,
    version,
    reason,
  })
  await notifyOwner(service, {
    type: 'revision_requested',
    title: `طلب تعديل: ${title}`,
    message: reason,
    entity_type: 'project',
    entity_id: input.projectId,
  })
  await recordCommunication(service, {
    channel: 'internal',
    direction: 'system',
    entity_type: 'task',
    entity_id: input.slotId,
    message: `طلب تعديل V${version} — ${reason}`,
    user_id: input.userId,
  })
  return { ok: true, id: data.id }
}

export type SetRevisionInput = {
  revisionId: string
  status: RevisionStatus
  userId: string
  slotTitle?: string
}

// Moves an open revision along the allowed path. Approving also advances the
// slot's revision_version (now the accepted cut number).
export async function setRevisionStatus(
  service: Db,
  input: SetRevisionInput,
): Promise<RevisionWriteResult> {
  const { data: revision } = await service
    .from('video_revisions')
    .select('id, client_video_slot_id, project_id, version, status')
    .eq('id', input.revisionId)
    .maybeSingle<{
      id: string
      client_video_slot_id: string
      project_id: string
      version: number
      status: RevisionStatus
    }>()
  if (!revision) return { ok: false, error: 'طلب التعديل غير موجود.' }

  const allowed = nextRevisionStatuses(revision.status)
  if (!allowed.includes(input.status)) {
    return { ok: false, error: 'نقل حالة غير مسموح في دورة التعديل.' }
  }

  const now = new Date().toISOString()
  const { error } = await service
    .from('video_revisions')
    .update({ status: input.status, resolved_at: input.status === 'approved' ? now : null })
    .eq('id', input.revisionId)
  if (error) return { ok: false, error: 'تعذّر تحديث حالة التعديل.' }

  if (input.status === 'approved') {
    await service
      .from('client_video_slots')
      .update({ revision_version: revision.version })
      .eq('id', revision.client_video_slot_id)
    const title = input.slotTitle?.trim() ?? `الفيديو V${revision.version}`
    await recordProjectActivity(service, revision.project_id, 'revision_approved', {
      slot_id: revision.client_video_slot_id,
      revision_id: revision.id,
      version: revision.version,
    })
    await notifyOwner(service, {
      type: 'revision_completed',
      title: `تم اعتماد النسخة V${revision.version} — ${title}`,
      message: 'أُغلقت دورة التعديل واعتُمدت النسخة.',
      entity_type: 'project',
      entity_id: revision.project_id,
    })
    await recordCommunication(service, {
      channel: 'internal',
      direction: 'system',
      entity_type: 'task',
      entity_id: revision.client_video_slot_id,
      message: `اعتُمدت النسخة V${revision.version} من التعديل.`,
      user_id: input.userId,
    })
  }

  return { ok: true, id: revision.id }
}