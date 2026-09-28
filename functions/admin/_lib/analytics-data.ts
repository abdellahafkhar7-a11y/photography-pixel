import type { Db } from '../../_lib/supabase'
import type { DeliveryActivityType, DeliveryStatus } from '../../_lib/db-types'
import { ACTIVITY_LABEL } from '../deliveries/_helpers'
import { DELIVERY_STATUS_ORDER } from './dashboard-data'

//============================================================================
// Phase 4H — Analytics data loader. Read-only, real data only: every number
// comes from the existing `deliveries` / `delivery_activity` / `clients`
// tables. Completion rate is derived from real status values; monthly buckets
// come from real created_at dates. Nothing is fabricated.
//============================================================================

export type AnalyticsStatusRow = {
  status: DeliveryStatus
  label: string
  count: number
  share: number
}

export type AnalyticsEventRow = {
  type: string
  label: string
  count: number
}

export type AnalyticsData = {
  clientsCount: number
  deliveriesCount: number
  statusCounts: Partial<Record<DeliveryStatus, number>>
  completionRate: number | null
  downloadsCompleted: number
  downloadsStarted: number
  linksOpened: number
  previewsViewed: number
  videosConfirmed: number
  statusRows: AnalyticsStatusRow[]
  eventRows: AnalyticsEventRow[]
  monthlyRows: { month: string; label: string; count: number }[]
  recentActivity: { id: string; type: DeliveryActivityType; label: string; clientName: string | null; createdAt: string }[]
}

export function emptyAnalyticsData(): AnalyticsData {
  return {
    clientsCount: 0,
    deliveriesCount: 0,
    statusCounts: {},
    completionRate: null,
    downloadsCompleted: 0,
    downloadsStarted: 0,
    linksOpened: 0,
    previewsViewed: 0,
    videosConfirmed: 0,
    statusRows: [],
    eventRows: [],
    monthlyRows: [],
    recentActivity: [],
  }
}

const MONTH_LABEL = new Intl.DateTimeFormat('ar-MA', {
  month: 'long',
  year: 'numeric',
  numberingSystem: 'latn',
  timeZone: 'Africa/Casablanca',
})

type ActivityRow = {
  id: string
  type: DeliveryActivityType
  created_at: string
  deliveries: { clients: { name: string } | null } | null
}

export async function loadAnalyticsData(service: Db): Promise<AnalyticsData> {
  const statusRes = await service
    .from('deliveries')
    .select('created_at, status')
    .returns<{ created_at: string; status: DeliveryStatus }[]>()

  const activityRes = await service
    .from('delivery_activity')
    .select('id, type, created_at, deliveries ( clients ( name ) )')
    .order('created_at', { ascending: false })
    .limit(100)
    .returns<ActivityRow[]>()

  const clientsCountRes = await service
    .from('clients')
    .select('*', { count: 'exact', head: true })

  const statusCounts: Partial<Record<DeliveryStatus, number>> = {}
  const monthly = new Map<string, number>()
  let deliveriesCount = 0

  for (const row of statusRes.data ?? []) {
    deliveriesCount += 1
    statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1
    const monthKey = row.created_at.slice(0, 7)
    monthly.set(monthKey, (monthly.get(monthKey) ?? 0) + 1)
  }

  const counts: Partial<Record<DeliveryActivityType, number>> = {}
  const recentActivity: AnalyticsData['recentActivity'] = []
  for (const row of activityRes.data ?? []) {
    counts[row.type] = (counts[row.type] ?? 0) + 1
    if (recentActivity.length < 8) {
      recentActivity.push({
        id: row.id,
        type: row.type,
        label: ACTIVITY_LABEL[row.type] ?? row.type,
        clientName: row.deliveries?.clients?.name ?? null,
        createdAt: row.created_at,
      })
    }
  }

  const completed =
    (statusCounts.confirmed ?? 0) +
    (statusCounts.download_available ?? 0) +
    (statusCounts.downloaded ?? 0)
  const completionRate =
    deliveriesCount > 0 ? Math.round((completed / deliveriesCount) * 100) : null

  const statusRows: AnalyticsStatusRow[] = DELIVERY_STATUS_ORDER.map((status) => {
    const count = statusCounts[status] ?? 0
    return {
      status,
      label: status,
      count,
      share: deliveriesCount > 0 ? Math.round((count / deliveriesCount) * 1000) / 10 : 0,
    }
  })

  const eventTypeLabels: DeliveryActivityType[] = [
    'delivery_created',
    'link_opened',
    'preview_viewed',
    'video_confirmed',
    'download_started',
    'download_completed',
    'delivery_expired',
    'reuploaded',
    'version_created',
    'original_deleted',
  ]
  const eventRows = eventTypeLabels
    .map((type) => ({ type, label: ACTIVITY_LABEL[type] ?? type, count: counts[type] ?? 0 }))
    .filter((row) => row.count > 0)

  const monthlyRows = [...monthly.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => {
      const date = new Date(`${month}-01T00:00:00Z`)
      return {
        month,
        label: Number.isNaN(date.getTime()) ? month : MONTH_LABEL.format(date),
        count,
      }
    })

  return {
    clientsCount: clientsCountRes.count ?? 0,
    deliveriesCount,
    statusCounts,
    completionRate,
    downloadsCompleted: counts.download_completed ?? 0,
    downloadsStarted: counts.download_started ?? 0,
    linksOpened: counts.link_opened ?? 0,
    previewsViewed: counts.preview_viewed ?? 0,
    videosConfirmed: counts.video_confirmed ?? 0,
    statusRows,
    eventRows,
    monthlyRows,
    recentActivity,
  }
}