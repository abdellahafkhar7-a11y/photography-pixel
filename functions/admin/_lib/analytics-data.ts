import type { Db } from '../../_lib/supabase'
import type { DeliveryActivityType, DeliveryStatus } from '../../_lib/db-types'
import { ACTIVITY_LABEL } from '../deliveries/_helpers'
import { DELIVERY_STATUS_ORDER } from './dashboard-data'

//============================================================================
// Phase 4R — Analytics 2.0 data loader.
// Read-only, real data only. Every number comes from existing tables
// (deliveries / delivery_activity / clients / projects / client_video_slots /
// models). Completion is derived from real status values; ranges come from
// real created_at dates. Nothing is fabricated.
//
// The optional date range (AnalyticsRange) scopes time-bound series
// (deliveries created, events, projects + clients created).
// Production-video counts are CURRENT state (kanban_status today) because the
// schema has no per-transition timestamps — the UI labels them as "الحالة
// الحالية" to stay honest, and docs call this out as a limitation.
//============================================================================

export type AnalyticsRange = { key: string; from: string | null; to: string | null; label: string }

const RANGE_LABEL: Record<string, string> = {
  all: 'كل الفترات',
  today: 'اليوم',
  week: 'آخر 7 أيام',
  month: 'آخر 30 يوم',
  year: 'آخر 12 شهراً',
  custom: 'فترة مخصصة',
}

export function parseRange(params: URLSearchParams): AnalyticsRange {
  const key = params.get('range') ?? 'all'
  const today = casablancaDayKey()
  const addDays = (days: number): string => {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() + days)
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
      d.getUTCDate(),
    ).padStart(2, '0')}`
  }
  let from: string | null = null
  let to: string | null = null
  if (key === 'today') {
    from = today
    to = today
  } else if (key === 'week') {
    from = addDays(-6)
    to = today
  } else if (key === 'month') {
    from = addDays(-29)
    to = today
  } else if (key === 'year') {
    from = addDays(-364)
    to = today
  } else if (key === 'custom') {
    const oneValid = regexpForCustom(params.get('from'))
    const twoValid = regexpForCustom(params.get('to'))
    if (oneValid && twoValid && oneValid > twoValid) {
      from = twoValid
      to = oneValid
    } else {
      from = oneValid
      to = twoValid
    }
    if (!from && !to) from = addDays(-29)
    if (from && !to) to = from
    if (!from && to) from = addDays(-29)
  }
  const label = RANGE_LABEL[key] ?? RANGE_LABEL.all ?? 'كل الفترات'
  return { key, from, to, label }
}

const CUSTOM_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function regexpForCustom(value: string | null): string | null {
  return value && CUSTOM_DATE_RE.test(value) ? value : null
}

function casablancaDayKey(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Casablanca',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

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

export type TopClientRow = {
  id: string
  name: string
  whatsapp_number: string
  projects: number
  videos: number
  deliveries: number
}

export type TopModelRow = {
  id: string
  name: string
  projects: number
  videos: number
  upcomingSessions: number
}

export type AnalyticsData = {
  // Phase 4H block (kept for compatibility)
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

  // Phase 4R Analytics 2.0 block
  range: AnalyticsRange
  production: {
    projectsTotal: number
    projectsCreatedInRange: number
    videosTotal: number
    kanbanRows: { key: string; label: string; count: number }[]
    projectPills: { status: string; label: string; count: number }[]
  }
  crm: {
    totalClients: number
    newClientsInRange: number
    returningClients: number
    activeClients: number
    archivedClients: number
    topClients: TopClientRow[]
  }
  delivery: { releasedCount: number; downloadedCount: number; expiredCount: number }
  models: {
    totalModels: number
    modelsUsed: number
    topModels: TopModelRow[]
  }
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
    range: { key: 'all', from: null, to: null, label: 'كل الفترات' },
    production: { projectsTotal: 0, projectsCreatedInRange: 0, videosTotal: 0, kanbanRows: [], projectPills: [] },
    crm: { totalClients: 0, newClientsInRange: 0, returningClients: 0, activeClients: 0, archivedClients: 0, topClients: [] },
    delivery: { releasedCount: 0, downloadedCount: 0, expiredCount: 0 },
    models: { totalModels: 0, modelsUsed: 0, topModels: [] },
  }
}

const MONTH_LABEL = new Intl.DateTimeFormat('ar-MA', {
  month: 'long',
  year: 'numeric',
  numberingSystem: 'latn',
  timeZone: 'Africa/Casablanca',
})

const KANBAN_LABEL: Record<string, string> = {
  todo: 'في الانتظار',
  editing: 'قيد التعديل',
  review: 'قيد المراجعة',
  ready: 'جاهز',
  done: 'مكتمل',
}

const PROJECT_STATUS_LABEL: Record<string, string> = {
  new: 'جديد',
  contacted: 'تم التواصل',
  booked: 'مؤكد',
  shooting: 'جلسة تصوير',
  editing: 'قيد التعديل',
  review: 'قيد المراجعة',
  delivery: 'تسليم',
  completed: 'مكتمل',
  archived: 'مؤرشف',
}

type ActivityRow = {
  id: string
  type: DeliveryActivityType
  created_at: string
  deliveries: { clients: { name: string } | null } | null
}

export async function loadAnalyticsData(service: Db, params?: URLSearchParams): Promise<AnalyticsData> {
  const range = params ? parseRange(params) : { key: 'all', from: null, to: null, label: 'كل الفترات' }
  const fromIso = range.from ? `${range.from}T00:00:00.000Z` : null
  const toIsoExclusive = range.to ? `${range.to}T23:59:59.999Z` : null

  const inRange = (iso: string): boolean => {
    if (!fromIso && !toIsoExclusive) return true
    if (fromIso && iso < fromIso) return false
    if (toIsoExclusive && iso > toIsoExclusive) return false
    return true
  }

  // Owner analytics measure CLIENT DELIVERIES. Coordinator temporary shares are
  // excluded so they cannot distort volume, conversion or status breakdowns.
  const statusRes = await service
    .from('deliveries')
    .select('created_at, status')
    .eq('share_kind', 'client_delivery')
    .returns<{ created_at: string; status: DeliveryStatus }[]>()

  const activityRes = await service
    .from('delivery_activity')
    .select('id, type, created_at, deliveries ( clients ( name ) )')
    .order('created_at', { ascending: false })
    .limit(200)
    .returns<ActivityRow[]>()

  const [modelsCountRes, projectsRes, slotsRes, clientsRes] = await Promise.all([
    service.from('models').select('id', { count: 'exact', head: true }),
    service
      .from('projects')
      .select('id, client_id, model_id, status, created_at, shoot_date, planned_video_count'),
    service
      .from('client_video_slots')
      .select('id, kanban_status, project_id, models:model_id(id)')
      .returns<{
        id: string
        kanban_status: string | null
        project_id: string | null
        models: { id: string } | null
      }[]>(),
    service.from('clients').select('id, name, whatsapp_number, status, created_at'),
  ])

  const allProjects = (projectsRes.data ?? []) as {
    id: string
    client_id: string
    model_id: string | null
    status: string
    created_at: string
    shoot_date: string | null
    planned_video_count: number
  }[]

  const clientsAll = (clientsRes.data ?? []) as {
    id: string
    name: string
    whatsapp_number: string
    status: string
    created_at: string
  }[]

  const slotsAll = slotsRes.data ?? []

  // --- Delivery series (time-scoped by range) ------------------------------
  const deliveriesFiltered = (statusRes.data ?? []).filter((row) => inRange(row.created_at))

  const statusCounts: Partial<Record<DeliveryStatus, number>> = {}
  const monthly = new Map<string, number>()
  let deliveriesCount = 0
  for (const row of deliveriesFiltered) {
    deliveriesCount += 1
    statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1
    const monthKey = row.created_at.slice(0, 7)
    monthly.set(monthKey, (monthly.get(monthKey) ?? 0) + 1)
  }

  const counts: Partial<Record<DeliveryActivityType, number>> = {}
  const recentActivity: AnalyticsData['recentActivity'] = []
  for (const row of activityRes.data ?? []) {
    if (!inRange(row.created_at)) continue
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

  // --- Production (current state, real data) -------------------------------
  const projectsTotal = allProjects.length
  const projectsCreatedInRange = allProjects.filter((p) => inRange(p.created_at)).length

  const kanbanCounts: Record<string, number> = {}
  let videosTotal = 0
  const videosByClient = new Map<string, number>()
  const videosByModel = new Map<string, number>()
  for (const slot of slotsAll) {
    videosTotal += 1
    const status = slot.kanban_status ?? 'todo'
    kanbanCounts[status] = (kanbanCounts[status] ?? 0) + 1
    const project = allProjects.find((p) => p.id === slot.project_id)
    if (project) {
      videosByClient.set(project.client_id, (videosByClient.get(project.client_id) ?? 0) + 1)
    }
    if (slot.models?.id) {
      videosByModel.set(slot.models.id, (videosByModel.get(slot.models.id) ?? 0) + 1)
    }
  }
  const kanbanRows = Object.entries(kanbanCounts)
    .map(([key, count]) => ({ key, label: KANBAN_LABEL[key] ?? key, count }))
    .sort((a, b) => b.count - a.count)

  const projectStatusCounts: Record<string, number> = {}
  for (const p of allProjects) {
    projectStatusCounts[p.status] = (projectStatusCounts[p.status] ?? 0) + 1
  }
  const projectPills = Object.entries(projectStatusCounts)
    .map(([status, count]) => ({ status, label: PROJECT_STATUS_LABEL[status] ?? status, count }))
    .sort((a, b) => b.count - a.count)

  // --- CRM (clients) -------------------------------------------------------
  const totalClients = clientsAll.length
  const newClientsInRange = clientsAll.filter((c) => inRange(c.created_at)).length
  const activeClients = clientsAll.filter((c) => c.status === 'active').length
  const archivedClients = clientsAll.filter((c) => c.status === 'archived').length

  // Real per-client project + video counts drive "returning" and "top clients"
  const clientProjectCounts = new Map<string, number>()
  for (const p of allProjects) {
    clientProjectCounts.set(p.client_id, (clientProjectCounts.get(p.client_id) ?? 0) + 1)
  }
  // Count deliveries per client through the deliveries activity join
  const deliveryClientCounts = new Map<string, number>()
  for (const activity of activityRes.data ?? []) {
    const name = activity.deliveries?.clients?.name
    if (!name) continue
    const client = clientsAll.find((c) => c.name === name)
    if (client) deliveryClientCounts.set(client.id, (deliveryClientCounts.get(client.id) ?? 0) + 1)
  }

  let returningClients = 0
  const topClients: TopClientRow[] = clientsAll.map((c) => {
    const projects = clientProjectCounts.get(c.id) ?? 0
    const deliveries = deliveryClientCounts.get(c.id) ?? 0
    const videos = videosByClient.get(c.id) ?? 0
    if (projects >= 2 || (projects >= 1 && deliveries >= 1)) returningClients += 1
    return { id: c.id, name: c.name, whatsapp_number: c.whatsapp_number, projects, videos, deliveries }
  })
  topClients.sort((a, b) => b.projects + b.videos - (a.projects + a.videos))

  // --- Models --------------------------------------------------------------
  const totalModels = modelsCountRes.count ?? 0
  const projectsByModel = new Map<string, number>()
  for (const p of allProjects) {
    if (!p.model_id) continue
    projectsByModel.set(p.model_id, (projectsByModel.get(p.model_id) ?? 0) + 1)
  }
  const modelNames = new Map<string, string>()
  const modelsCount = projectsByModel.size
  const modelNameRes = await service
    .from('models')
    .select('id, name')
    .in('id', [...projectsByModel.keys()])
    .returns<{ id: string; name: string }[]>()
  for (const m of modelNameRes.data ?? []) modelNames.set(m.id, m.name)
  const topModels: TopModelRow[] = [...projectsByModel.entries()].map(([id, projects]) => {
    const entries = allProjects.filter((p) => p.model_id === id)
    const upcomingSessions = entries.filter(
      (p) => p.status !== 'archived' && p.status !== 'completed' && p.shoot_date !== null,
    ).length
    return {
      id,
      name: modelNames.get(id) ?? '—',
      projects,
      videos: videosByModel.get(id) ?? 0,
      upcomingSessions,
    }
  })
  topModels.sort((a, b) => b.projects - a.projects)

  return {
    clientsCount: totalClients,
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
    range,
    production: { projectsTotal, projectsCreatedInRange, videosTotal, kanbanRows, projectPills },
    crm: { totalClients, newClientsInRange, returningClients, activeClients, archivedClients, topClients },
    delivery: {
      releasedCount: (statusCounts.download_available ?? 0) + (statusCounts.downloaded ?? 0),
      downloadedCount: statusCounts.downloaded ?? 0,
      expiredCount: statusCounts.expired ?? 0,
    },
    models: { totalModels, modelsUsed: modelsCount, topModels },
  }
}