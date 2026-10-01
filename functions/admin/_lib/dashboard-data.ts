import type { Db } from '../../_lib/supabase'
import { listNotifications } from '../../_lib/notifications'
import type { NotificationsRow, CommunicationChannel, CommunicationDirection, DeliveryActivityType, DeliveryStatus } from '../../_lib/db-types'
import type { RoleKey } from './types'
import { ACTIVITY_LABEL } from '../deliveries/_helpers'

//============================================================================
// Phase 4B (+6O) — Dashboard Home data loader.
// Read-only aggregation over the existing Phase 2 Client Delivery schema
// (clients / deliveries / delivery_activity) plus app_users, and (since 4O)
// the projects table for the projects + today's-shoots stats.
// Uses the canonical service client + row types from functions/_lib.
//============================================================================

export type DeliveryStatusCounts = Record<DeliveryStatus, number>

export type DashboardActivity = {
  id: string
  type: DeliveryActivityType
  label: string
  clientName: string | null
  createdAt: string
}

export type DashboardClient = {
  id: string
  name: string
  whatsappNumber: string
  createdAt: string
}

export type DashboardShoot = {
  id: string
  name: string
  projectCode: string
  clientName: string | null
  shootTime: string | null
}

export type DashboardCommunication = {
  id: string
  channel: CommunicationChannel
  direction: CommunicationDirection
  message: string
  createdAt: string
}

export type DashboardExpiringLink = {
  id: string
  clientName: string | null
  trigger: 'link' | 'download'
  expiresAt: string
}

export type DashboardNotifications = {
  unread: number
  items: NotificationsRow[]
}

export type DashboardData = {
  clientsCount: number
  deliveriesCount: number
  teamCount: number | null
  projectsCount: number
  todayShoots: DashboardShoot[]
  statusCounts: DeliveryStatusCounts
  recentActivity: DashboardActivity[]
  recentClients: DashboardClient[]
  notifications: DashboardNotifications
  recentCommunications: DashboardCommunication[]
  expiringLinks: DashboardExpiringLink[]
}

export const DELIVERY_STATUS_ORDER: readonly DeliveryStatus[] = [
  'pending',
  'preview_viewed',
  'confirmed',
  'download_available',
  'downloaded',
  'expired',
]

const RECENT_ACTIVITY_LIMIT = 8
const RECENT_CLIENTS_LIMIT = 5
const RECENT_COMMUNICATIONS_LIMIT = 6
const RECENT_NOTIFICATIONS_LIMIT = 6
const DEADLINE_SCAN_LIMIT = 250
const EXPIRING_WINDOW_MS = 72 * 60 * 60 * 1000

type ActivityRow = {
  id: string
  type: DeliveryActivityType
  created_at: string
  deliveries: { clients: { name: string } | null } | null
}

type ClientRow = {
  id: string
  name: string
  whatsapp_number: string
  created_at: string
}

type ProjectShootRow = {
  id: string
  name: string
  project_code: string
  shoot_date: string | null
  shoot_time: string | null
  status: string
  clients: { name: string } | null
}

type CommunicationRow = {
  id: string
  channel: CommunicationChannel
  direction: CommunicationDirection
  message: string
  created_at: string
}

type DeliveryDeadlineRow = {
  id: string
  status: string
  token_expires_at: string | null
  download_expires_at: string | null
  archived_at: string | null
  clients: { name: string } | null
}

function emptyStatusCounts(): DeliveryStatusCounts {
  return {
    pending: 0,
    preview_viewed: 0,
    confirmed: 0,
    download_available: 0,
    downloaded: 0,
    expired: 0,
  }
}

export function emptyDashboardData(): DashboardData {
  return {
    clientsCount: 0,
    deliveriesCount: 0,
    teamCount: null,
    projectsCount: 0,
    todayShoots: [],
    statusCounts: emptyStatusCounts(),
    recentActivity: [],
    recentClients: [],
    notifications: { unread: 0, items: [] },
    recentCommunications: [],
    expiringLinks: [],
  }
}

export async function loadDashboardData(
  service: Db,
  role: RoleKey,
  userId: string | null,
): Promise<DashboardData> {
  // Owner dashboard statistics count CLIENT DELIVERIES only. A Coordinator
  // temporary share is a different workflow and must never inflate them.
  const statusQuery = service
    .from('deliveries')
    .select('status')
    .eq('share_kind', 'client_delivery')
    .returns<{ status: DeliveryStatus }[]>()

  const clientsCountQuery = service
    .from('clients')
    .select('*', { count: 'exact', head: true })

  const activityQuery = service
    .from('delivery_activity')
    .select('id, type, created_at, deliveries ( clients ( name ) )')
    .order('created_at', { ascending: false })
    .limit(RECENT_ACTIVITY_LIMIT)
    .returns<ActivityRow[]>()

  const recentClientsQuery = service
    .from('clients')
    .select('id, name, whatsapp_number, created_at')
    .order('created_at', { ascending: false })
    .limit(RECENT_CLIENTS_LIMIT)
    .returns<ClientRow[]>()

  const projectsQuery = service
    .from('projects')
    .select('*', { count: 'exact', head: true })

  const projectsListQuery = service
    .from('projects')
    .select('id, name, project_code, shoot_date, shoot_time, status, clients ( name )')
    .returns<ProjectShootRow[]>()

  const commQuery = service
    .from('communications')
    .select('id, channel, direction, message, created_at')
    .order('created_at', { ascending: false })
    .limit(RECENT_COMMUNICATIONS_LIMIT)
    .returns<CommunicationRow[]>()

  const deadlineQuery = service
    .from('deliveries')
    .select('id, status, token_expires_at, download_expires_at, archived_at, clients ( name )')
    .eq('share_kind', 'client_delivery')
    .neq('status', 'expired')
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(DEADLINE_SCAN_LIMIT)
    .returns<DeliveryDeadlineRow[]>()

  // Team size is owner-only data and is only queried for owners.
  const teamCountPromise: PromiseLike<{ count: number | null }> =
    role === 'owner'
      ? service
          .from('app_users')
          .select('*', { count: 'exact', head: true })
          .then((res) => ({ count: res.count }))
      : Promise.resolve({ count: null })

  // The notifications widget is scoped to the signed-in user (like the bell).
  const notificationsPromise =
    userId && service
      ? listNotifications(service, userId, RECENT_NOTIFICATIONS_LIMIT)
      : Promise.resolve({ unread: 0, items: [] })

  const [statusRes, clientsRes, activityRes, recentClientsRes, projectsRes, projectsListRes, teamRes, commRes, deadlineRes, notifications] =
    await Promise.all([
      statusQuery,
      clientsCountQuery,
      activityQuery,
      recentClientsQuery,
      projectsQuery,
      projectsListQuery,
      teamCountPromise,
      commQuery,
      deadlineQuery,
      notificationsPromise,
    ])

  const statusCounts = emptyStatusCounts()
  let deliveriesCount = 0
  for (const row of statusRes.data ?? []) {
    deliveriesCount += 1
    statusCounts[row.status] += 1
  }

  const recentActivity: DashboardActivity[] = (activityRes.data ?? []).map((row) => ({
    id: row.id,
    type: row.type,
    label: ACTIVITY_LABEL[row.type] ?? row.type,
    clientName: row.deliveries?.clients?.name ?? null,
    createdAt: row.created_at,
  }))

  const recentClients: DashboardClient[] = (recentClientsRes.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    whatsappNumber: row.whatsapp_number,
    createdAt: row.created_at,
  }))

  const today = todayCasablanca()
  const todayShoots: DashboardShoot[] = (projectsListRes.data ?? [])
    .filter((row) => row.shoot_date === today && row.status !== 'archived')
    .map((row) => ({
      id: row.id,
      name: row.name,
      projectCode: row.project_code,
      clientName: row.clients?.name ?? null,
      shootTime: row.shoot_time,
    }))

  const recentCommunications: DashboardCommunication[] = (commRes.data ?? []).map((row) => ({
    id: row.id,
    channel: row.channel,
    direction: row.direction,
    message: row.message,
    createdAt: row.created_at,
  }))

  // Expiring-soon links: any usable (non-expired, non-archived) delivery whose
  // private-link expiry OR active 3-day download window ends within 72h.
  const now = Date.now()
  const expiringLinks: DashboardExpiringLink[] = []
  for (const row of deadlineRes.data ?? []) {
    if (row.token_expires_at) {
      const remaining = new Date(row.token_expires_at).getTime() - now
      if (remaining > 0 && remaining <= EXPIRING_WINDOW_MS) {
        expiringLinks.push({ id: row.id, clientName: row.clients?.name ?? null, trigger: 'link', expiresAt: row.token_expires_at })
      }
    }
    if (row.download_expires_at && row.status !== 'downloaded') {
      const remaining = new Date(row.download_expires_at).getTime() - now
      if (remaining > 0 && remaining <= EXPIRING_WINDOW_MS) {
        expiringLinks.push({ id: row.id, clientName: row.clients?.name ?? null, trigger: 'download', expiresAt: row.download_expires_at })
      }
    }
  }
  expiringLinks.sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime())

  return {
    clientsCount: clientsRes.count ?? 0,
    deliveriesCount,
    teamCount: role === 'owner' ? (teamRes.count ?? 0) : null,
    projectsCount: projectsRes.count ?? 0,
    todayShoots,
    statusCounts,
    recentActivity,
    recentClients,
    notifications,
    recentCommunications,
    expiringLinks,
  }
}

function todayCasablanca(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Casablanca',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}