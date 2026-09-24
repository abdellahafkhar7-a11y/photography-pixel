import type { Db } from '../../_lib/supabase'
import type { DeliveryActivityType, DeliveryStatus } from '../../_lib/db-types'
import type { RoleKey } from './types'
import { ACTIVITY_LABEL } from '../deliveries/_helpers'

//============================================================================
// Phase 4B — Dashboard Home data loader.
// Read-only aggregation over the existing Phase 2 Client Delivery schema
// (clients / deliveries / delivery_activity) plus app_users. Uses the
// canonical service client + row types from functions/_lib (the same ones
// the Client Delivery module uses). No new tables, models, or abstractions.
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

export type DashboardData = {
  clientsCount: number
  deliveriesCount: number
  teamCount: number | null
  statusCounts: DeliveryStatusCounts
  recentActivity: DashboardActivity[]
  recentClients: DashboardClient[]
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
    statusCounts: emptyStatusCounts(),
    recentActivity: [],
    recentClients: [],
  }
}

export async function loadDashboardData(service: Db, role: RoleKey): Promise<DashboardData> {
  const statusQuery = service
    .from('deliveries')
    .select('status')
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

  // Team size is owner-only data and is only queried for owners.
  const teamCountPromise: PromiseLike<{ count: number | null }> =
    role === 'owner'
      ? service
          .from('app_users')
          .select('*', { count: 'exact', head: true })
          .then((res) => ({ count: res.count }))
      : Promise.resolve({ count: null })

  const [statusRes, clientsRes, activityRes, recentClientsRes, teamRes] = await Promise.all([
    statusQuery,
    clientsCountQuery,
    activityQuery,
    recentClientsQuery,
    teamCountPromise,
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

  return {
    clientsCount: clientsRes.count ?? 0,
    deliveriesCount,
    teamCount: role === 'owner' ? (teamRes.count ?? 0) : null,
    statusCounts,
    recentActivity,
    recentClients,
  }
}