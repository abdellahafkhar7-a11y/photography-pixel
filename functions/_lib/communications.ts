import type {
  CommunicationChannel,
  CommunicationDirection,
  CommunicationEntityType,
  CommunicationsRow,
} from './db-types'
import type { Db } from './supabase'

//============================================================================
// Phase 4R — Communication history.
// Pure ledger: CRM actions (record_sent, WhatsApp send from a delivery, client
// confirmation/release from the private page, revision requests, system
// transitions) write one immutable row each. No WhatsApp API is ever called —
// outgoing rows are recorded when the operator opens wa.me (or acknowledges a
// message). Content is never user-supplied beyond the admin's own message
// text. Authorization is server-side only.
//============================================================================

export type CommunicationInput = {
  channel: CommunicationChannel
  direction: CommunicationDirection
  entity_type: CommunicationEntityType
  entity_id?: string | null
  message?: string
  user_id?: string | null
}

export async function recordCommunication(
  service: Db,
  input: CommunicationInput,
): Promise<string | null> {
  const { data } = await service
    .from('communications')
    .insert({
      channel: input.channel,
      direction: input.direction,
      entity_type: input.entity_type,
      entity_id: input.entity_id ?? null,
      message: input.message ?? '',
      user_id: input.user_id ?? null,
    })
    .select('id')
    .single()
    .returns<{ id: string } | null>()
  return data ? data.id : null
}

export async function listCommunications(
  service: Db,
  entityType: CommunicationEntityType,
  entityIds: (string | null | undefined)[],
  limit = 30,
): Promise<CommunicationsRow[]> {
  const ids = [...new Set(entityIds.filter(Boolean) as string[])]
  if (ids.length === 0) return []
  const { data } = await service
    .from('communications')
    .select('*')
    .eq('entity_type', entityType)
    .in('entity_id', ids)
    .order('created_at', { ascending: false })
    .limit(limit)
    .returns<CommunicationsRow[]>()
  return data ?? []
}

export async function recentCommunications(
  service: Db,
  limit = 12,
): Promise<CommunicationsRow[]> {
  const { data } = await service
    .from('communications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
    .returns<CommunicationsRow[]>()
  return data ?? []
}