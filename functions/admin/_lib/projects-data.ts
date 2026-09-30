import type { Db } from '../../_lib/supabase'
import type {
  ClientsRow,
  ClientVideoSlotsRow,
  ClientVideoSlotsUpdate,
  DeliveryMode,
  DeliveryStatus,
  KanbanStatus,
  ModelsRow,
  PaymentStatus,
  ProjectStatus,
  ProjectTasksRow,
  ProjectsRow,
  ProjectsUpdate,
  SlotStatus,
  TaskPriority,
  TaskStatus,
  VideoRevisionsRow,
} from '../../_lib/db-types'
import type { DeliveryActivityRow } from '../../_lib/db-types'
import { createSlotDelivery } from './clients-data'

//============================================================================
// Phase 4O — projects data: list + workspace detail, create, profile, status
// (archive/unarchive), kanban slot moves, task lifecycle and the
// project-scoped activity timeline.
//
// Data-safety rules (carried from Phase 4N):
//   * project slots REUSE client_video_slots — never a parallel slot table.
//   * lowering the planned count pauses the extra slots; it NEVER deletes
//     slots, deliveries, versions or R2 files.
//   * archive/unarchive never touches videos/deliveries; stable /p links keep
//     working.
//   * project slots keep the client-global unique (client_id, position) rule
//     by continuing the client's numbering; kanban_order drives board order.
//============================================================================

export const CANONICAL_PROJECT_STATUSES: readonly ProjectStatus[] = [
  'new',
  'contacted',
  'booked',
  'shooting',
  'editing',
  'review',
  'delivery',
  'completed',
]

export const ALL_PROJECT_STATUSES: readonly ProjectStatus[] = [
  ...CANONICAL_PROJECT_STATUSES,
  'archived',
]

export const KANBAN_STATUSES: readonly KanbanStatus[] = [
  'todo',
  'editing',
  'review',
  'ready',
  'done',
]

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  new: 'جديد',
  contacted: 'تم التواصل',
  booked: 'تم الحجز',
  shooting: 'قيد التصوير',
  editing: 'قيد المونتاج',
  review: 'المراجعة',
  delivery: 'التسليم',
  completed: 'مكتمل',
  archived: 'مؤرشف',
}

export const KANBAN_LABEL: Record<KanbanStatus, string> = {
  todo: 'جديد',
  editing: 'قيد المونتاج',
  review: 'المراجعة',
  ready: 'جاهز',
  done: 'مكتمل',
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'جديدة',
  in_progress: 'قيد التنفيذ',
  done: 'مكتملة',
}

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: 'منخفضة',
  medium: 'متوسطة',
  high: 'عالية',
}

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  unpaid: 'غير مدفوع',
  partial: 'مدفوع جزئياً',
  paid: 'مدفوع',
}

export const PROJECT_ACTIVITY_LABEL: Record<string, string> = {
  project_created: 'تم إنشاء المشروع',
  project_updated: 'تم تحديث المشروع',
  status_changed: 'تغيّرت حالة المشروع',
  model_changed: 'تغيّر الموديل',
  count_changed: 'تغيّر عدد الفيديوهات',
  script_updated: 'تم تعديل السكربت',
  notes_updated: 'تم تعديل الملاحظات',
  shoot_updated: 'تم تعديل موعد/مكان التصوير',
  name_updated: 'تم تعديل اسم المشروع',
  payment_updated: 'تم تحديث بيانات الدفع',
  message_sent: 'تم تسجيل إرسال رسالة واتساب',
  slot_prepared: 'تم تجهيز رابط فيديو',
  slot_moved: 'نُقل فيديو على اللوحة',
  slot_paused: 'تم تجميد فيديو (خارج الخطة)',
  slot_created: 'أُضيفت بطاقة فيديو',
  slot_updated: 'عُدّلت بطاقة فيديو',
  task_created: 'تمت إضافة مهمة',
  task_updated: 'تم تعديل مهمة',
  task_status: 'تغيّرت حالة مهمة',
  task_deleted: 'تم حذف مهمة',
  project_archived: 'تمت أرشفة المشروع',
  project_unarchived: 'أُعيد تفعيل المشروع',
  revision_requested: 'طُلب تعديل فيديو',
  revision_approved: 'اعتُمدت نسخة جديدة',
}

//----------------------------------------------------------------------------
// Workbench (Phase 4Q): /admin/projects daily command center aggregates.
// Dates use the app's Africa/Casablanca timezone; aggregation is batched
// (single query per table) — never N+1 per project.
//----------------------------------------------------------------------------

export function todayCasablancaDate(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Casablanca',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  return parts
}

export function shiftDate(date: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) return date
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function casablancaDay(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Casablanca',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
  return parts
}

export type WorkbenchSlotStats = {
  total: number
  todo: number
  editing: number
  review: number
  ready: number
  done: number
}

export type WorkbenchTaskInfo = {
  total: number
  open: number
  due: { date: string; title: string } | null
}

export type WorkbenchProject = {
  project: ProjectsRow
  client: { id: string; name: string; whatsapp_number: string } | null
  model: { id: string; name: string } | null
  slots: WorkbenchSlotStats
  filled: number
  deliveries: number
  tasks: WorkbenchTaskInfo
  hostedOnDate: boolean
  workedOnDate: boolean
  latestActivityAt: string | null
}

export type WorkbenchData = {
  date: string
  all: WorkbenchProject[]
  projects: WorkbenchProject[]
}

export function emptyWorkbench(date: string): WorkbenchData {
  return { date, all: [], projects: [] }
}

export async function loadProjectsWorkbench(
  service: Db,
  opts: { date?: string; query?: string; clientId?: string } = {},
): Promise<WorkbenchData> {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(opts.date ?? '') ? opts.date! : todayCasablancaDate()

  const projectsRes = await service
    .from('projects')
    .select('*')
    .not('status', 'eq', 'archived')
    .order('created_at', { ascending: false })
    .limit(500)
    .returns<ProjectsRow[]>()
  const projects = projectsRes.data ?? []

  const ids = projects.map((p) => p.id)
  const clientIds = [...new Set(projects.map((p) => p.client_id).filter((id): id is string => Boolean(id)))]
  const modelIds = [...new Set(projects.map((p) => p.model_id).filter((id): id is string => Boolean(id)))]

  const [slotsRes, tasksRes, clientsRes, modelsRes, activityRes] = await Promise.all([
    ids.length
      ? service
          .from('client_video_slots')
          .select('id, project_id, status, kanban_status')
          .in('project_id', ids)
          .returns<{ id: string; project_id: string | null; status: SlotStatus; kanban_status: KanbanStatus }[]>()
      : Promise.resolve({ data: [] as { id: string; project_id: string | null; status: SlotStatus; kanban_status: KanbanStatus }[] }),
    ids.length
      ? service
          .from('project_tasks')
          .select('project_id, status, title, due_date')
          .in('project_id', ids)
          .returns<{ project_id: string; status: TaskStatus; title: string; due_date: string | null }[]>()
      : Promise.resolve({ data: [] as { project_id: string; status: TaskStatus; title: string; due_date: string | null }[] }),
    clientIds.length
      ? service
          .from('clients')
          .select('id, name, whatsapp_number')
          .in('id', clientIds)
          .returns<{ id: string; name: string; whatsapp_number: string }[]>()
      : Promise.resolve({ data: [] as { id: string; name: string; whatsapp_number: string }[] }),
    modelIds.length
      ? service
          .from('models')
          .select('id, name')
          .in('id', modelIds)
          .returns<{ id: string; name: string }[]>()
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ids.length
      ? service
          .from('project_activity')
          .select('project_id, created_at')
          .gte('created_at', `${shiftDate(date, -2)}T00:00:00Z`)
          .lt('created_at', `${shiftDate(date, 3)}T00:00:00Z`)
          .returns<{ project_id: string; created_at: string }[]>()
      : Promise.resolve({ data: [] as { project_id: string; created_at: string }[] }),
  ])

  const slotStats = new Map<string, WorkbenchSlotStats>()
  const slotIdToProject = new Map<string, string>()
  for (const s of slotsRes.data ?? []) {
    if (!s.project_id) continue
    slotIdToProject.set(s.id, s.project_id)
    const st = slotStats.get(s.project_id) ?? { total: 0, todo: 0, editing: 0, review: 0, ready: 0, done: 0 }
    st.total += 1
    if (s.kanban_status === 'todo') st.todo += 1
    else if (s.kanban_status === 'editing') st.editing += 1
    else if (s.kanban_status === 'review') st.review += 1
    else if (s.kanban_status === 'ready') st.ready += 1
    else if (s.kanban_status === 'done') st.done += 1
    slotStats.set(s.project_id, st)
  }

  const filledByProject = new Map<string, number>()
  const deliveryCounts = new Map<string, number>()
  const slotIds = (slotsRes.data ?? []).filter((s) => s.project_id).map((s) => s.id)
  if (slotIds.length) {
    const delivRes = await service
      .from('deliveries')
      .select('id, client_video_slot_id')
      .in('client_video_slot_id', slotIds)
      .returns<{ id: string; client_video_slot_id: string | null }[]>()
    const rows = delivRes.data ?? []
    const deliveryIds = rows.map((d) => d.id)
    const activeVideoDeliveries = new Set<string>()
    if (deliveryIds.length) {
      const vids = await service
        .from('delivery_videos')
        .select('delivery_id')
        .in('delivery_id', deliveryIds)
        .eq('is_active', true)
        .returns<{ delivery_id: string }[]>()
      for (const v of vids.data ?? []) activeVideoDeliveries.add(v.delivery_id)
    }
    for (const d of rows) {
      const pid = d.client_video_slot_id ? slotIdToProject.get(d.client_video_slot_id) : undefined
      if (!pid) continue
      deliveryCounts.set(pid, (deliveryCounts.get(pid) ?? 0) + 1)
      if (activeVideoDeliveries.has(d.id)) {
        filledByProject.set(pid, (filledByProject.get(pid) ?? 0) + 1)
      }
    }
  }

  const taskByProject = new Map<string, WorkbenchTaskInfo>()
  for (const t of tasksRes.data ?? []) {
    const entry = taskByProject.get(t.project_id) ?? { total: 0, open: 0, due: null }
    entry.total += 1
    if (t.status !== 'done') {
      entry.open += 1
      if (t.due_date && /^\d{4}-\d{2}-\d{2}$/.test(t.due_date)) {
        if (!entry.due || t.due_date < entry.due.date) entry.due = { date: t.due_date, title: t.title }
      }
    }
    taskByProject.set(t.project_id, entry)
  }

  const workedOnDate = new Set<string>()
  const latestByProject = new Map<string, string>()
  for (const a of activityRes.data ?? []) {
    if (casablancaDay(a.created_at) === date) workedOnDate.add(a.project_id)
    const cur = latestByProject.get(a.project_id)
    if (!cur || a.created_at > cur) latestByProject.set(a.project_id, a.created_at)
  }

  const clientsById = new Map((clientsRes.data ?? []).map((c) => [c.id, c]))
  const modelsById = new Map((modelsRes.data ?? []).map((m) => [m.id, m]))

  const list: WorkbenchProject[] = projects.map((project) => {
    const slots = slotStats.get(project.id) ?? { total: 0, todo: 0, editing: 0, review: 0, ready: 0, done: 0 }
    return {
      project,
      client: project.client_id ? clientsById.get(project.client_id) ?? null : null,
      model: project.model_id ? modelsById.get(project.model_id) ?? null : null,
      slots,
      filled: filledByProject.get(project.id) ?? 0,
      deliveries: deliveryCounts.get(project.id) ?? 0,
      tasks: taskByProject.get(project.id) ?? { total: 0, open: 0, due: null },
      hostedOnDate: project.shoot_date === date,
      workedOnDate: workedOnDate.has(project.id),
      latestActivityAt: latestByProject.get(project.id) ?? null,
    }
  })

  const all = opts.clientId ? list.filter((item) => item.project.client_id === opts.clientId) : list

  const query = (opts.query ?? '').trim().toLowerCase()
  const q = query ? (value: string) => value.toLowerCase().includes(query) : () => true
  const projectsFiltered = all.filter(({ project, client, model }) =>
    q(`${project.name} ${project.project_code} ${client?.name ?? ''} ${model?.name ?? ''}`),
  )

  return { date, all, projects: projectsFiltered }
}

//----------------------------------------------------------------------------
// List page
//----------------------------------------------------------------------------

export type ProjectListItem = {
  project: ProjectsRow
  client: { id: string; name: string; whatsapp_number: string } | null
  model: { id: string; name: string } | null
  slotCount: number
  doneSlots: number
  filledSlots: number
  taskCount: number
  openTaskCount: number
  deliveryCount: number
  latestActivityAt: string | null
}

export async function listProjects(
  service: Db,
  filter: { query?: string; status?: ProjectStatus | ''; modelId?: string; clientId?: string } = {},
): Promise<ProjectListItem[]> {
  const [projectsRes, slotsRes, tasksRes, projectActivityRes] = await Promise.all([
    service.from('projects').select('*').order('created_at', { ascending: false }).returns<ProjectsRow[]>(),
    service
      .from('client_video_slots')
      .select('id, project_id, status, kanban_status')
      .not('project_id', 'is', null)
      .returns<{ id: string; project_id: string | null; status: SlotStatus; kanban_status: KanbanStatus }[]>(),
    service
      .from('project_tasks')
      .select('project_id, status, id')
      .returns<{ project_id: string; status: TaskStatus; id: string }[]>(),
    service
      .from('project_activity')
      .select('project_id, created_at')
      .order('created_at', { ascending: false })
      .returns<{ project_id: string; created_at: string }[]>(),
  ])

  const projects = projectsRes.data ?? []
  const slots = slotsRes.data ?? []
  const slotIds = slots.map((s) => s.id)
  const slotIdToProject = new Map<string, string>()
  for (const slot of slots) {
    if (slot.project_id) slotIdToProject.set(slot.id, slot.project_id)
  }

  const clientIds = [...new Set(projects.map((p) => p.client_id))]
  const modelIds = [...new Set(projects.map((p) => p.model_id).filter((m): m is string => Boolean(m)))]
  const [clientsRes, modelsRes] = await Promise.all([
    clientIds.length
      ? service
          .from('clients')
          .select('id, name, whatsapp_number')
          .in('id', clientIds)
          .returns<{ id: string; name: string; whatsapp_number: string }[]>()
      : Promise.resolve({ data: [] as { id: string; name: string; whatsapp_number: string }[] }),
    modelIds.length
      ? service.from('models').select('id, name').in('id', modelIds).returns<{ id: string; name: string }[]>()
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ])

  let deliveryRows: { id: string; status: DeliveryStatus; client_video_slot_id: string | null }[] = []
  const activeVideoDeliveries = new Set<string>()
  const deliveryActivityMaxById = new Map<string, string>()
  if (slotIds.length > 0) {
    const delivRes = await service
      .from('deliveries')
      .select('id, status, client_video_slot_id')
      .in('client_video_slot_id', slotIds)
      .returns<{ id: string; status: DeliveryStatus; client_video_slot_id: string | null }[]>()
    deliveryRows = delivRes.data ?? []
    const deliveryIds = deliveryRows.map((d) => d.id)
    if (deliveryIds.length > 0) {
      const [vidsRes, dactRes] = await Promise.all([
        service
          .from('delivery_videos')
          .select('delivery_id')
          .in('delivery_id', deliveryIds)
          .eq('is_active', true)
          .returns<{ delivery_id: string }[]>(),
        service
          .from('delivery_activity')
          .select('delivery_id, created_at')
          .in('delivery_id', deliveryIds)
          .limit(500)
          .returns<{ delivery_id: string; created_at: string }[]>(),
      ])
      for (const v of vidsRes.data ?? []) activeVideoDeliveries.add(v.delivery_id)
      for (const a of dactRes.data ?? []) {
        const cur = deliveryActivityMaxById.get(a.delivery_id)
        if (!cur || a.created_at > cur) deliveryActivityMaxById.set(a.delivery_id, a.created_at)
      }
    }
  }

  const clientsById = new Map((clientsRes.data ?? []).map((c) => [c.id, c]))
  const modelsById = new Map((modelsRes.data ?? []).map((m) => [m.id, m]))

  const slotCounts = new Map<string, number>()
  const doneCounts = new Map<string, number>()
  for (const slot of slots) {
    const pid = slot.project_id
    if (!pid) continue
    slotCounts.set(pid, (slotCounts.get(pid) ?? 0) + 1)
    if (slot.kanban_status === 'done' && slot.status !== 'paused') {
      doneCounts.set(pid, (doneCounts.get(pid) ?? 0) + 1)
    }
  }

  const deliveryCounts = new Map<string, number>()
  const filledCounts = new Map<string, number>()
  for (const delivery of deliveryRows) {
    if (!delivery.client_video_slot_id) continue
    const pid = slotIdToProject.get(delivery.client_video_slot_id)
    if (!pid) continue
    deliveryCounts.set(pid, (deliveryCounts.get(pid) ?? 0) + 1)
    if (activeVideoDeliveries.has(delivery.id)) {
      filledCounts.set(pid, (filledCounts.get(pid) ?? 0) + 1)
    }
  }

  const taskCounts = new Map<string, number>()
  const openTaskCounts = new Map<string, number>()
  for (const task of tasksRes.data ?? []) {
    taskCounts.set(task.project_id, (taskCounts.get(task.project_id) ?? 0) + 1)
    if (task.status !== 'done') openTaskCounts.set(task.project_id, (openTaskCounts.get(task.project_id) ?? 0) + 1)
  }

  const latestByProject = new Map<string, string>()
  const consider = (pid: string, at: string) => {
    const cur = latestByProject.get(pid)
    if (!cur || at > cur) latestByProject.set(pid, at)
  }
  for (const a of projectActivityRes.data ?? []) consider(a.project_id, a.created_at)
  for (const a of deliveryActivityMaxById) {
    const delivery = deliveryRows.find((d) => d.id === a[0])
    const pid = delivery?.client_video_slot_id ? slotIdToProject.get(delivery.client_video_slot_id) : undefined
    if (pid) consider(pid, a[1])
  }

  const query = (filter.query ?? '').trim().toLowerCase()
  const q = query ? (value: string) => value.toLowerCase().includes(query) : () => true

  const items: ProjectListItem[] = projects
    .map((project) => ({
      project,
      client: project.client_id ? clientsById.get(project.client_id) ?? null : null,
      model: project.model_id ? modelsById.get(project.model_id) ?? null : null,
      slotCount: slotCounts.get(project.id) ?? 0,
      doneSlots: doneCounts.get(project.id) ?? 0,
      filledSlots: filledCounts.get(project.id) ?? 0,
      taskCount: taskCounts.get(project.id) ?? 0,
      openTaskCount: openTaskCounts.get(project.id) ?? 0,
      deliveryCount: deliveryCounts.get(project.id) ?? 0,
      latestActivityAt: latestByProject.get(project.id) ?? null,
    }))
    .filter(({ project, client, model }) => {
      if (filter.modelId && project.model_id !== filter.modelId) return false
      if (filter.clientId && project.client_id !== filter.clientId) return false
      if (filter.status && project.status !== filter.status) return false
      return q(`${project.name} ${project.project_code} ${client?.name ?? ''} ${model?.name ?? ''}`)
    })

  return items.sort((a, b) => {
    const aArch = a.project.status === 'archived' ? 1 : 0
    const bArch = b.project.status === 'archived' ? 1 : 0
    if (aArch !== bArch) return aArch - bArch
    return b.project.created_at.localeCompare(a.project.created_at)
  })
}

//----------------------------------------------------------------------------
// Workspace detail
//----------------------------------------------------------------------------

export type ProjectSlotDetail = {
  slot: ClientVideoSlotsRow
  delivery: {
    id: string
    status: DeliveryStatus
    delivery_mode: DeliveryMode
    client_visible_id: string | null
    archived_at: string | null
    created_at: string
    hasVideo: boolean
    activeVersion: number | null
    versionCount: number
  } | null
}

export type ProjectActivityItem = {
  id: string
  kind: 'project' | 'delivery'
  type: string
  metadata: Record<string, unknown> | null
  created_at: string
}

export type ProjectDetail = {
  project: ProjectsRow
  client: Pick<ClientsRow, 'id' | 'name' | 'whatsapp_number' | 'status'> | null
  model: ModelsRow | null
  slots: ProjectSlotDetail[]
  tasks: ProjectTasksRow[]
  activity: ProjectActivityItem[]
  assignees: { id: string; name: string; email: string }[]
  models: { id: string; name: string; photo: string | null }[]
}

export async function loadProjectDetail(service: Db, projectId: string): Promise<ProjectDetail | null> {
  const { data: project } = await service
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .maybeSingle<ProjectsRow>()
  if (!project) return null

  const slots = await service
    .from('client_video_slots')
    .select('*')
    .eq('project_id', projectId)
    .order('kanban_order')
    .order('position')
    .returns<ClientVideoSlotsRow[]>()
  const slotList = slots.data ?? []

  const [clientRes, modelRes, tasksRes, assigneesRes, modelsRes] = await Promise.all([
    project.client_id
      ? service
          .from('clients')
          .select('id, name, whatsapp_number, status')
          .eq('id', project.client_id)
          .maybeSingle<{ id: string; name: string; whatsapp_number: string; status: string }>()
      : Promise.resolve({ data: null }),
    project.model_id
      ? service
          .from('models')
          .select('*')
          .eq('id', project.model_id)
          .maybeSingle<ModelsRow>()
      : Promise.resolve({ data: null }),
    service
      .from('project_tasks')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order')
      .returns<ProjectTasksRow[]>(),
    service
      .from('app_users')
      .select('id, full_name, email')
      .eq('is_active', true)
      .order('full_name')
      .returns<{ id: string; full_name: string | null; email: string }[]>(),
    service.from('models').select('id, name, photo').order('name').returns<{ id: string; name: string; photo: string | null }[]>(),
  ])

  const taskList = tasksRes.data ?? []
  const assignees = (assigneesRes.data ?? [])
    .map((u) => ({ id: u.id, name: u.full_name ?? u.email, email: u.email }))
    .sort((a, b) => (a.id === project.created_by ? -1 : b.id === project.created_by ? 1 : 0))

  // slot -> delivery map
  const deliveryListBySlot = new Map<string, ProjectSlotDetail['delivery']>()
  if (slotList.length > 0) {
    const deliveries = await service
      .from('deliveries')
      .select(
        'id, status, delivery_mode, client_visible_id, archived_at, created_at, client_video_slot_id',
      )
      .in('client_video_slot_id', slotList.map((s) => s.id))
      .returns<
        {
          id: string
          status: DeliveryStatus
          delivery_mode: DeliveryMode
          client_visible_id: string | null
          archived_at: string | null
          created_at: string
          client_video_slot_id: string | null
        }[]
      >()
    const list = deliveries.data ?? []
    const versionByDelivery = new Map<string, { count: number; activeVersion: number | null }>()
    if (list.length > 0) {
      const videos = await service
        .from('delivery_videos')
        .select('delivery_id, version, is_active')
        .in('delivery_id', list.map((d) => d.id))
        .returns<{ delivery_id: string; version: number; is_active: boolean }[]>()
      for (const v of videos.data ?? []) {
        const entry = versionByDelivery.get(v.delivery_id) ?? { count: 0, activeVersion: null }
        entry.count += 1
        if (v.is_active) entry.activeVersion = v.version
        versionByDelivery.set(v.delivery_id, entry)
      }
    }
    for (const delivery of list) {
      if (!delivery.client_video_slot_id) continue
      const versions = versionByDelivery.get(delivery.id) ?? { count: 0, activeVersion: null }
      const hasVideo = versions.count > 0 && versions.activeVersion !== null
      deliveryListBySlot.set(delivery.client_video_slot_id, {
        id: delivery.id,
        status: delivery.status,
        delivery_mode: delivery.delivery_mode,
        client_visible_id: delivery.client_visible_id,
        archived_at: delivery.archived_at,
        created_at: delivery.created_at,
        hasVideo,
        activeVersion: versions.activeVersion,
        versionCount: versions.count,
      })
    }
  }

  const slotsDetail: ProjectSlotDetail[] = slotList.map((slot) => ({
    slot,
    delivery: deliveryListBySlot.get(slot.id) ?? null,
  }))

  // unified activity timeline: project-scoped + delivery-scoped for this project's slots
  const activity: ProjectActivityItem[] = []
  const projectActivity = await service
    .from('project_activity')
    .select('id, type, metadata, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(150)
    .returns<{ id: string; type: string; metadata: Record<string, unknown> | null; created_at: string }[]>()
  for (const a of projectActivity.data ?? []) {
    activity.push({ id: `p-${a.id}`, kind: 'project', type: a.type, metadata: a.metadata, created_at: a.created_at })
  }
  const slotDeliveryRows = [...deliveryListBySlot.values()]
    .map((d) => d?.id)
    .filter((id): id is string => typeof id === 'string')
  if (slotDeliveryRows.length > 0) {
    const deliveryActivity = await service
      .from('delivery_activity')
      .select('id, type, metadata, created_at')
      .in('delivery_id', slotDeliveryRows)
      .order('created_at', { ascending: false })
      .limit(150)
      .returns<DeliveryActivityRow[]>()
    for (const a of deliveryActivity.data ?? []) {
      activity.push({ id: `d-${a.id}`, kind: 'delivery', type: a.type, metadata: a.metadata, created_at: a.created_at })
    }
  }
  activity.sort((a, b) => b.created_at.localeCompare(a.created_at))

  return {
    project,
    client: clientRes.data
      ? {
          id: clientRes.data.id,
          name: clientRes.data.name,
          whatsapp_number: clientRes.data.whatsapp_number,
          status: clientRes.data.status as ClientsRow['status'],
        }
      : null,
    model: modelRes.data ?? null,
    slots: slotsDetail,
    tasks: taskList,
    activity: activity.slice(0, 150),
    assignees,
    models: modelsRes.data ?? [],
  }
}

export function inPlanSlots(detail: ProjectDetail): ProjectSlotDetail[] {
  return detail.slots.filter((item) => item.slot.status !== 'paused')
}

export function projectProgress(detail: ProjectDetail): { count: number; done: number; filled: number } {
  const inPlan = inPlanSlots(detail)
  return {
    count: inPlan.length,
    done: inPlan.filter((item) => item.slot.kanban_status === 'done').length,
    filled: inPlan.filter((item) => item.delivery?.hasVideo).length,
  }
}

//----------------------------------------------------------------------------
// Activity
//----------------------------------------------------------------------------

export async function recordProjectActivity(
  service: Db,
  projectId: string,
  type: string,
  metadata: Record<string, unknown> | null = null,
): Promise<void> {
  await service.from('project_activity').insert({ project_id: projectId, type, metadata: metadata ?? {} })
}

//----------------------------------------------------------------------------
// Create project (+ its slot set, reusing client_video_slots)
//----------------------------------------------------------------------------

export type ProjectCreateInput = {
  clientId: string
  name: string
  modelId: string | null
  count: number
  userId: string
}

export type ProjectWriteResult =
  | { ok: true; project: ProjectsRow }
  | { ok: false; error: string }

function makeProjectCode(used: Set<string>): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  for (let attempt = 0; attempt < 8; attempt += 1) {
    let code = 'PX-'
    for (let i = 0; i < 6; i += 1) {
      code += chars[Math.floor(Math.random() * chars.length)]
    }
    if (!used.has(code)) return code
  }
  return `PX-${Date.now().toString(36).toUpperCase().slice(-6)}`
}

async function nextPositions(service: Db, clientId: string): Promise<number> {
  const { data } = await service
    .from('client_video_slots')
    .select('position')
    .eq('client_id', clientId)
    .order('position', { ascending: false })
    .limit(1)
    .returns<{ position: number }[]>()
  const max = data?.[0]?.position ?? 0
  return max + 1
}

export async function createProject(
  service: Db,
  input: ProjectCreateInput,
): Promise<ProjectWriteResult> {
  const name = input.name.trim()
  if (name.length < 2) return { ok: false, error: 'أدخل اسم المشروع (حرفان على الأقل).' }
  const count = Number.isInteger(input.count) && input.count >= 0 && input.count <= 50 ? input.count : 0

  const { data: client } = await service
    .from('clients')
    .select('id, model_id')
    .eq('id', input.clientId)
    .maybeSingle<{ id: string; model_id: string | null }>()
  if (!client) return { ok: false, error: 'العميل غير موجود.' }

  const modelId = input.modelId ?? client.model_id ?? null
  if (modelId) {
    const { data: model } = await service
      .from('models')
      .select('id')
      .eq('id', modelId)
      .maybeSingle<{ id: string }>()
    if (!model) return { ok: false, error: 'الموديل غير موجود.' }
  }

  const { data: existing } = await service
    .from('projects')
    .select('project_code')
    .returns<{ project_code: string }[]>()
  const used = new Set((existing ?? []).map((p) => p.project_code))
  const projectCode = makeProjectCode(used)

  const { data: project, error } = await service
    .from('projects')
    .insert({
      client_id: input.clientId,
      name,
      project_code: projectCode,
      status: 'new',
      model_id: modelId,
      planned_video_count: count,
      created_by: input.userId,
    })
    .select('*')
    .single<ProjectsRow>()
  if (error || !project) return { ok: false, error: 'تعذّر إنشاء المشروع. حاول مجدداً.' }

  await reconcileProjectSlots(service, project, count, true)
  await recordProjectActivity(service, project.id, 'project_created', {
    project_code: projectCode,
    video_count: count,
  })
  return { ok: true, project }
}

// Create/activate/pause the project's slot set. Slots are NEVER deleted:
// positions beyond the plan are paused (their content stays reachable), and
// re-including a paused slot returns it to planned/active. returns the final
// list of in-plan slots for the count change activity.
async function reconcileProjectSlots(
  service: Db,
  project: ProjectsRow,
  count: number,
  isNew: boolean,
): Promise<void> {
  const { data: existing } = await service
    .from('client_video_slots')
    .select('*')
    .eq('project_id', project.id)
    .order('position')
    .returns<ClientVideoSlotsRow[]>()
  const slots = existing ?? []

  if (count > slots.length) {
    const startPosition = await nextPositions(service, project.client_id)
    const maxOrder = slots.reduce((acc, slot) => Math.max(acc, slot.kanban_order), -1)
    const inserts: {
      client_id: string
      project_id: string
      position: number
      title: string
      status: SlotStatus
      kanban_status: KanbanStatus
      kanban_order: number
    }[] = []
    for (let i = slots.length; i < count; i += 1) {
      inserts.push({
        client_id: project.client_id,
        project_id: project.id,
        position: startPosition + (i - slots.length),
        title: `فيديو ${i + 1}`,
        status: 'planned',
        kanban_status: 'todo',
        kanban_order: maxOrder + 1 + (i - slots.length),
      })
    }
    await service.from('client_video_slots').insert(inserts)
  } else if (count < slots.length) {
    // pause extras (positional order = creation order since positions ascend)
    const toPause = slots.slice(count)
    for (const slot of toPause) {
      if (slot.status === 'paused') continue
      await service
        .from('client_video_slots')
        .update({ status: 'paused', updated_at: new Date().toISOString() })
        .eq('id', slot.id)
    }
    if (!isNew && toPause.length > 0) {
      await recordProjectActivity(service, project.id, 'slot_paused', {
        paused: toPause.length,
        count,
      })
    }
  }
}

//----------------------------------------------------------------------------
// Profile / workflow status
//----------------------------------------------------------------------------

export type ProjectProfileInput = {
  name: string
  status: ProjectStatus
  modelId: string | null
  count: number
  shootDate: string | null
  shootTime: string | null
  location: string | null
  script: string | null
  notes: string | null
  totalPrice: number | null
  advance: number | null
  paymentStatus: PaymentStatus
}

export async function setProjectProfile(
  service: Db,
  projectId: string,
  input: ProjectProfileInput,
): Promise<ProjectWriteResult> {
  const { data: project } = await service
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .maybeSingle<ProjectsRow>()
  if (!project) return { ok: false, error: 'المشروع غير موجود.' }

  const name = input.name.trim()
  if (name.length < 2) return { ok: false, error: 'أدخل اسم المشروع (حرفان على الأقل).' }
  const status: ProjectStatus = ALL_PROJECT_STATUSES.includes(input.status) && input.status !== 'archived' ? input.status : project.status
  const count = Number.isInteger(input.count) && input.count >= 0 && input.count <= 50 ? input.count : project.planned_video_count
  const modelId = input.modelId ?? null
  if (modelId) {
    const { data: model } = await service
      .from('models')
      .select('id')
      .eq('id', modelId)
      .maybeSingle<{ id: string }>()
    if (!model) return { ok: false, error: 'الموديل غير موجود.' }
  }

  const patch: ProjectsUpdate = {
    name,
    status,
    model_id: modelId,
    planned_video_count: count,
    shoot_date: input.shootDate ?? null,
    shoot_time: input.shootTime?.trim() ?? null,
    location: input.location?.trim() ?? null,
    script: input.script?.trim() ?? null,
    notes: input.notes?.trim() ?? null,
    total_price: input.totalPrice,
    advance: input.advance,
    payment_status: input.paymentStatus === 'partial' || input.paymentStatus === 'paid' ? input.paymentStatus : 'unpaid',
    updated_at: new Date().toISOString(),
  }

  const { data: updated, error } = await service
    .from('projects')
    .update(patch)
    .eq('id', projectId)
    .select('*')
    .single<ProjectsRow>()
  if (error || !updated) return { ok: false, error: 'تعذّر حفظ بيانات المشروع.' }

  // Activity deltas (each only when the value actually changed).
  if (updated.status !== project.status) {
    await recordProjectActivity(service, projectId, 'status_changed', {
      from: project.status,
      to: updated.status,
    })
  }
  if (updated.model_id !== project.model_id) {
    await recordProjectActivity(service, projectId, 'model_changed', {
      from: project.model_id,
      to: updated.model_id,
    })
  }
  if (updated.planned_video_count !== project.planned_video_count) {
    await recordProjectActivity(service, projectId, 'count_changed', {
      from: project.planned_video_count,
      to: updated.planned_video_count,
    })
  }
  if (updated.script !== project.script) {
    await recordProjectActivity(service, projectId, 'script_updated', {})
  }
  if (updated.notes !== project.notes) {
    await recordProjectActivity(service, projectId, 'notes_updated', {})
  }
  if (
    updated.shoot_date !== project.shoot_date ||
    updated.shoot_time !== project.shoot_time ||
    updated.location !== project.location
  ) {
    await recordProjectActivity(service, projectId, 'shoot_updated', {})
  }
  if (updated.name !== project.name) {
    await recordProjectActivity(service, projectId, 'name_updated', {
      from: project.name,
      to: updated.name,
    })
  }
  if (updated.payment_status !== project.payment_status) {
    await recordProjectActivity(service, projectId, 'payment_updated', {
      to: updated.payment_status,
    })
  }

  await reconcileProjectSlots(service, updated, count, false)
  return { ok: true, project: updated }
}

export async function setProjectStatus(
  service: Db,
  projectId: string,
  status: ProjectStatus,
): Promise<ProjectWriteResult> {
  if (!ALL_PROJECT_STATUSES.includes(status)) return { ok: false, error: 'حالة غير معروفة.' }
  const { data: project } = await service
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .maybeSingle<ProjectsRow>()
  if (!project) return { ok: false, error: 'المشروع غير موجود.' }

  let patch: ProjectsUpdate
  let activityType: string
  let activityMeta: Record<string, unknown>

  if (status === 'archived' && project.status !== 'archived') {
    patch = {
      status: 'archived',
      status_prior: project.status,
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    activityType = 'project_archived'
    activityMeta = { from: project.status }
  } else if (project.status === 'archived' && status !== 'archived') {
    patch = {
      status: project.status_prior ?? 'booked',
      status_prior: null,
      archived_at: null,
      updated_at: new Date().toISOString(),
    }
    activityType = 'project_unarchived'
    activityMeta = { to: patch.status ?? '' }
  } else if (status !== 'archived') {
    patch = {
      status,
      status_prior: project.status_prior,
      archived_at: project.archived_at,
      updated_at: new Date().toISOString(),
    }
    activityType = status === project.status ? '' : 'status_changed'
    activityMeta = status === project.status ? {} : { from: project.status, to: status }
  } else {
    patch = {
      status: 'archived',
      status_prior: project.status_prior,
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    activityType = 'project_archived'
    activityMeta = {}
  }

  const { data: updated, error } = await service
    .from('projects')
    .update(patch)
    .eq('id', projectId)
    .select('*')
    .single<ProjectsRow>()
  if (error || !updated) return { ok: false, error: 'تعذّر تحديث حالة المشروع.' }
  if (activityType) await recordProjectActivity(service, projectId, activityType, activityMeta)
  return { ok: true, project: updated }
}

//----------------------------------------------------------------------------
// Kanban moves (project slots)
//----------------------------------------------------------------------------

export type MoveSlotInput = {
  projectId: string
  slotId: string
  status: KanbanStatus
  order?: string[]
}

export async function moveSlot(
  service: Db,
  input: MoveSlotInput,
): Promise<{ ok: boolean; error?: string }> {
  if (!KANBAN_STATUSES.includes(input.status)) return { ok: false, error: 'عمود غير معروف.' }

  const { data: slot } = await service
    .from('client_video_slots')
    .select('id, project_id, kanban_status, status')
    .eq('id', input.slotId)
    .maybeSingle<{ id: string; project_id: string | null; kanban_status: KanbanStatus; status: SlotStatus }>()
  if (slot?.project_id !== input.projectId) return { ok: false, error: 'اللقطة غير موجودة في هذا المشروع.' }

  const orderedSlotIds = input.order?.length ? input.order : null
  const targetStatus: KanbanStatus = input.status

  if (orderedSlotIds) {
    if (!orderedSlotIds.includes(input.slotId)) orderedSlotIds.push(input.slotId)
    const { data: projectSlots } = await service
      .from('client_video_slots')
      .select('id')
      .eq('project_id', input.projectId)
      .returns<{ id: string }[]>()
    const allowed = new Set((projectSlots ?? []).map((s) => s.id))
    if (!orderedSlotIds.every((id) => allowed.has(id))) {
      return { ok: false, error: 'ترتيب غير صالح.' }
    }
    const now = new Date().toISOString()
    for (const slotId of orderedSlotIds) {
      await service
        .from('client_video_slots')
        .update({ kanban_status: targetStatus, kanban_order: orderedSlotIds.indexOf(slotId), updated_at: now })
        .eq('id', slotId)
    }
  } else {
    const { data: current } = await service
      .from('client_video_slots')
      .select('id')
      .eq('project_id', input.projectId)
      .eq('kanban_status', targetStatus)
      .order('kanban_order')
      .returns<{ id: string }[]>()
    const order = (current ?? []).map((s) => s.id)
    if (!order.includes(input.slotId)) order.push(input.slotId)
    const now = new Date().toISOString()
    for (const slotId of order) {
      await service
        .from('client_video_slots')
        .update({ kanban_status: targetStatus, kanban_order: order.indexOf(slotId), updated_at: now })
        .eq('id', slotId)
    }
  }

  if (input.status !== slot.kanban_status) {
    await recordProjectActivity(service, input.projectId, 'slot_moved', {
      slot_id: input.slotId,
      from: slot.kanban_status,
      to: input.status,
    })
  }
  return { ok: true }
}

//----------------------------------------------------------------------------
// Tasks
//----------------------------------------------------------------------------

export type TaskCreateInput = {
  projectId: string
  title: string
  priority: TaskPriority
  assigneeId: string | null
  dueDate: string | null
  slotId: string | null
  userId: string
}

export async function createTask(service: Db, input: TaskCreateInput): Promise<{ ok: boolean; error?: string }> {
  const title = input.title.trim()
  if (title.length < 2) return { ok: false, error: 'أدخل عنوان المهمة (حرفان على الأقل).' }
  const priority: TaskPriority = input.priority === 'low' || input.priority === 'high' ? input.priority : 'medium'
  const { data: tasks } = await service
    .from('project_tasks')
    .select('sort_order')
    .eq('project_id', input.projectId)
    .returns<{ sort_order: number }[]>()
  const maxSort = (tasks ?? []).reduce((acc, t) => Math.max(acc, t.sort_order), -1)

  const { data: task, error } = await service
    .from('project_tasks')
    .insert({
      project_id: input.projectId,
      client_video_slot_id: input.slotId ?? null,
      title,
      priority,
      assignee_id: input.assigneeId ?? null,
      due_date: input.dueDate ?? null,
      sort_order: maxSort + 1,
      created_by: input.userId,
    })
    .select('*')
    .single<ProjectTasksRow>()
  if (error || !task) return { ok: false, error: 'تعذّر إضافة المهمة.' }
  await recordProjectActivity(service, input.projectId, 'task_created', {
    task_id: task.id,
    title,
    ...(input.slotId ? { slot_id: input.slotId } : {}),
  })
  return { ok: true }
}

export async function updateTask(
  service: Db,
  input: { projectId: string; taskId: string; title: string; priority: TaskPriority; assigneeId: string | null; dueDate: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const title = input.title.trim()
  if (title.length < 2) return { ok: false, error: 'أدخل عنوان المهمة (حرفان على الأقل).' }
  const priority: TaskPriority = input.priority === 'low' || input.priority === 'high' ? input.priority : 'medium'
  const { data: task, error } = await service
    .from('project_tasks')
    .update({
      title,
      priority,
      assignee_id: input.assigneeId ?? null,
      due_date: input.dueDate ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.taskId)
    .eq('project_id', input.projectId)
    .select('*')
    .single<ProjectTasksRow>()
  if (error || !task) return { ok: false, error: 'تعذّر تعديل المهمة.' }
  await recordProjectActivity(service, input.projectId, 'task_updated', {
    task_id: task.id,
    title,
    ...(task.client_video_slot_id ? { slot_id: task.client_video_slot_id } : {}),
  })
  return { ok: true }
}

export async function setTaskStatus(
  service: Db,
  input: { projectId: string; taskId: string; status: TaskStatus },
): Promise<{ ok: boolean; error?: string }> {
  if (input.status !== 'todo' && input.status !== 'in_progress' && input.status !== 'done') {
    return { ok: false, error: 'حالة غير معروفة.' }
  }
  const now = input.status === 'done' ? new Date().toISOString() : null
  const { data: task, error } = await service
    .from('project_tasks')
    .update({
      status: input.status,
      completed_at: now,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.taskId)
    .eq('project_id', input.projectId)
    .select('id, title, status, client_video_slot_id')
    .single<{ id: string; title: string; status: TaskStatus; client_video_slot_id: string | null }>()
  if (error || !task) return { ok: false, error: 'تعذّر تحديث المهمة.' }
  await recordProjectActivity(service, input.projectId, 'task_status', {
    task_id: task.id,
    title: task.title,
    to: task.status,
    ...(task.client_video_slot_id ? { slot_id: task.client_video_slot_id } : {}),
  })
  return { ok: true }
}

export async function deleteTask(
  service: Db,
  input: { projectId: string; taskId: string },
): Promise<{ ok: boolean; error?: string }> {
  const { data: task } = await service
    .from('project_tasks')
    .select('id, title')
    .eq('id', input.taskId)
    .eq('project_id', input.projectId)
    .maybeSingle<{ id: string; title: string }>()
  if (!task) return { ok: false, error: 'المهمة غير موجودة.' }
  const { error } = await service.from('project_tasks').delete().eq('id', input.taskId)
  if (error) return { ok: false, error: 'تعذّر حذف المهمة.' }
  await recordProjectActivity(service, input.projectId, 'task_deleted', { task_id: task.id, title: task.title })
  return { ok: true }
}

//----------------------------------------------------------------------------
// Board cards (Phase 4P): add / update one card; load card detail for the
// Trello-style modal (fields + checklist + activity + delivery).
//----------------------------------------------------------------------------

export type SlotWriteResult = { ok: true; slotId: string } | { ok: false; error: string }

export type AddSlotInput = {
  projectId: string
  status?: KanbanStatus
  title?: string
  notes?: string | null
  label?: string | null
  deadline?: string | null
}

export async function addSlot(service: Db, input: AddSlotInput): Promise<SlotWriteResult> {
  const status: KanbanStatus = input.status && KANBAN_STATUSES.includes(input.status) ? input.status : 'todo'
  const { data: project } = await service
    .from('projects')
    .select('id, client_id, planned_video_count')
    .eq('id', input.projectId)
    .maybeSingle<{ id: string; client_id: string; planned_video_count: number }>()
  if (!project) return { ok: false, error: 'المشروع غير موجود.' }

  const startPosition = await nextPositions(service, project.client_id)
  const { data: bottom } = await service
    .from('client_video_slots')
    .select('kanban_order')
    .eq('project_id', project.id)
    .eq('kanban_status', status)
    .order('kanban_order', { ascending: false })
    .limit(1)
    .returns<{ kanban_order: number }[]>()
  const maxOrder = bottom?.[0]?.kanban_order ?? -1
  const title = (input.title ?? '').trim() || `فيديو ${project.planned_video_count + 1}`

  const { data: slot, error } = await service
    .from('client_video_slots')
    .insert({
      client_id: project.client_id,
      project_id: project.id,
      position: startPosition,
      title,
      status: 'planned',
      kanban_status: status,
      kanban_order: maxOrder + 1,
      notes: (input.notes ?? '').trim() || null,
      label: (input.label ?? '').trim() || null,
      deadline: input.deadline ?? null,
    })
    .select('id')
    .single<{ id: string }>()
  if (error || !slot) return { ok: false, error: 'تعذّرت إضافة البطاقة.' }

  // Keep the planned count in sync so a later reconcile never pauses the new card.
  await service
    .from('projects')
    .update({ planned_video_count: project.planned_video_count + 1, updated_at: new Date().toISOString() })
    .eq('id', project.id)

  await recordProjectActivity(service, project.id, 'slot_created', {
    slot_id: slot.id,
    title,
    to: status,
  })
  return { ok: true, slotId: slot.id }
}

export type SlotUpdateInput = {
  projectId: string
  slotId: string
  title?: string
  notes?: string | null
  label?: string | null
  deadline?: string | null
}

export async function updateSlot(
  service: Db,
  input: SlotUpdateInput,
): Promise<{ ok: boolean; error?: string }> {
  const title = (input.title ?? '').trim()
  if (title.length < 2) return { ok: false, error: 'أدخل عنوان البطاقة (حرفان على الأقل).' }
  const { data: slot } = await service
    .from('client_video_slots')
    .select('id, project_id, title, notes, label, deadline')
    .eq('id', input.slotId)
    .eq('project_id', input.projectId)
    .maybeSingle<{ id: string; project_id: string | null; title: string; notes: string | null; label: string | null; deadline: string | null }>()
  if (!slot) return { ok: false, error: 'البطاقة غير موجودة.' }

  const patch: ClientVideoSlotsUpdate = {
    title,
    notes: (input.notes ?? '').trim() || null,
    label: (input.label ?? '').trim() || null,
    deadline: input.deadline ?? null,
    updated_at: new Date().toISOString(),
  }
  const { error } = await service.from('client_video_slots').update(patch).eq('id', input.slotId)
  if (error) return { ok: false, error: 'تعذّر حفظ البطاقة.' }
  const changed =
    title !== slot.title ||
    patch.notes !== slot.notes ||
    patch.label !== slot.label ||
    patch.deadline !== slot.deadline
  if (changed) {
    await recordProjectActivity(service, input.projectId, 'slot_updated', { slot_id: input.slotId, title })
  }
  return { ok: true }
}

//----------------------------------------------------------------------------
// Card detail (Phase 4P modal)
//----------------------------------------------------------------------------

export type CardDetail = {
  project: ProjectsRow
  client: Pick<ClientsRow, 'id' | 'name' | 'whatsapp_number'> | null
  model: ModelsRow | null
  slot: ProjectSlotDetail
  tasks: ProjectTasksRow[]
  activity: ProjectActivityItem[]
  assignees: { id: string; name: string }[]
  revisions: VideoRevisionsRow[]
}

export async function loadCardDetail(
  service: Db,
  projectId: string,
  slotId: string,
): Promise<CardDetail | null> {
  const { data: project } = await service
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .maybeSingle<ProjectsRow>()
  if (!project) return null

  const { data: slotRow } = await service
    .from('client_video_slots')
    .select('*')
    .eq('id', slotId)
    .eq('project_id', projectId)
    .maybeSingle<ClientVideoSlotsRow>()
  if (!slotRow) return null

  // delivery for this slot (same shape as loadProjectDetail)
  let delivery: ProjectSlotDetail['delivery'] = null
  const delivered = await service
    .from('deliveries')
    .select('id, status, delivery_mode, client_visible_id, archived_at, created_at, client_video_slot_id')
    .eq('client_video_slot_id', slotId)
    .maybeSingle<{
      id: string
      status: DeliveryStatus
      delivery_mode: DeliveryMode
      client_visible_id: string | null
      archived_at: string | null
      created_at: string
      client_video_slot_id: string | null
    }>()
  if (delivered.data) {
    const videos = await service
      .from('delivery_videos')
      .select('version, is_active')
      .eq('delivery_id', delivered.data.id)
      .returns<{ version: number; is_active: boolean }[]>()
    let count = 0
    let activeVersion: number | null = null
    for (const v of videos.data ?? []) {
      count += 1
      if (v.is_active) activeVersion = v.version
    }
    delivery = {
      id: delivered.data.id,
      status: delivered.data.status,
      delivery_mode: delivered.data.delivery_mode,
      client_visible_id: delivered.data.client_visible_id,
      archived_at: delivered.data.archived_at,
      created_at: delivered.data.created_at,
      hasVideo: count > 0 && activeVersion !== null,
      activeVersion,
      versionCount: count,
    }
  }

  const [clientRes, modelRes, tasksRes, assigneesRes, revisionsRes] = await Promise.all([
    project.client_id
      ? service.from('clients').select('id, name, whatsapp_number').eq('id', project.client_id).maybeSingle<{ id: string; name: string; whatsapp_number: string }>()
      : Promise.resolve({ data: null }),
    project.model_id
      ? service.from('models').select('*').eq('id', project.model_id).maybeSingle<ModelsRow>()
      : Promise.resolve({ data: null }),
    service
      .from('project_tasks')
      .select('*')
      .eq('project_id', projectId)
      .eq('client_video_slot_id', slotId)
      .order('sort_order')
      .returns<ProjectTasksRow[]>(),
    service
      .from('app_users')
      .select('id, full_name, email')
      .eq('is_active', true)
      .order('full_name')
      .returns<{ id: string; full_name: string | null; email: string }[]>(),
    service
      .from('video_revisions')
      .select('*')
      .eq('client_video_slot_id', slotId)
      .order('created_at', { ascending: false })
      .returns<VideoRevisionsRow[]>(),
  ])

  // slot-scoped activity: project_activity rows carrying metadata.slot_id, plus
  // delivery_activity for this card's delivery (kept visual, merged + sorted).
  const activity: ProjectActivityItem[] = []
  const projectActivity = await service
    .from('project_activity')
    .select('id, type, metadata, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(120)
    .returns<{ id: string; type: string; metadata: Record<string, unknown> | null; created_at: string }[]>()
  for (const a of projectActivity.data ?? []) {
    if (a.metadata?.slot_id !== slotId) continue
    activity.push({ id: `p-${a.id}`, kind: 'project', type: a.type, metadata: a.metadata, created_at: a.created_at })
  }
  if (delivery) {
    const deliveryActivity = await service
      .from('delivery_activity')
      .select('id, type, metadata, created_at')
      .eq('delivery_id', delivery.id)
      .order('created_at', { ascending: false })
      .limit(40)
      .returns<DeliveryActivityRow[]>()
    for (const a of deliveryActivity.data ?? []) {
      activity.push({ id: `d-${a.id}`, kind: 'delivery', type: a.type, metadata: a.metadata, created_at: a.created_at })
    }
  }
  activity.sort((a, b) => b.created_at.localeCompare(a.created_at))

  return {
    project,
    client: clientRes.data ?? null,
    model: modelRes.data ?? null,
    slot: { slot: slotRow, delivery },
    tasks: tasksRes.data ?? [],
    activity,
    assignees: (assigneesRes.data ?? []).map((u) => ({ id: u.id, name: u.full_name ?? u.email })),
    revisions: revisionsRes.data ?? [],
  }
}

export { createSlotDelivery }