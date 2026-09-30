import type { Db } from '../../_lib/supabase'

export type CalendarEventType = 'shoot' | 'deadline' | 'task' | 'delivery'

export type CalendarEvent = {
  key: string
  type: CalendarEventType
  title: string
  dateKey: string
  time: string | null
  meta: string
  href: string
}

export type CalendarData = {
  ym: string
  prevYm: string
  nextYm: string
  label: string
  todayKey: string
  events: CalendarEvent[]
}

const CASABLANCA = 'Africa/Casablanca'

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

export function casablancaYm(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CASABLANCA,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now)
  const y = parts.find((p) => p.type === 'year')?.value ?? '2026'
  const m = parts.find((p) => p.type === 'month')?.value ?? '01'
  return `${y}-${m}`
}

export function casablancaDateKey(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CASABLANCA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

export function shiftMonth(ym: string, delta: number): string {
  const [yStr, mStr] = ym.split('-')
  const year = Number(yStr ?? '2026')
  const month = Number(mStr ?? '01')
  const total = year * 12 + (month - 1) + delta
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${pad(nm)}`
}

// Keep only the date part of whatever the form stored (date input -> YYYY-MM-DD,
// datetime-local -> YYYY-MM-DDTHH:MM, ISO -> full timestamp). Returns null when
// the value cannot be interpreted as a date.
function datePart(value: string | null): string | null {
  if (!value) return null
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value)
  if (match) return match[1] ?? null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : casablancaDateKey(value)
}

export async function loadCalendarData(service: Db, ym: string): Promise<CalendarData> {
  const labelFormatter = new Intl.DateTimeFormat('ar-MA', {
    year: 'numeric',
    month: 'long',
    numberingSystem: 'latn',
    timeZone: CASABLANCA,
  })
  const label = /^\d{4}-\d{2}$/.test(ym)
    ? labelFormatter.format(new Date(`${ym}-01T12:00:00Z`))
    : ''

  const events: CalendarEvent[] = []
  const monthLike = `${ym}-%`

  const [projectsRes, slotsRes, tasksRes, deliveriesRes] = await Promise.all([
    service
      .from('projects')
      .select('id, name, shoot_date, shoot_time, location, clients ( name )')
      .like('shoot_date', monthLike)
      .is('archived_at', null)
      .returns<
        {
          id: string
          name: string
          shoot_date: string | null
          shoot_time: string | null
          location: string | null
          clients: { name: string } | null
        }[]
      >(),
    service
      .from('client_video_slots')
      .select('id, project_id, position, title, deadline, clients ( name )')
      .not('deadline', 'is', null)
      .returns<
        {
          id: string
          project_id: string | null
          position: number
          title: string
          deadline: string | null
          clients: { name: string } | null
        }[]
      >(),
    service
      .from('project_tasks')
      .select('id, project_id, title, status, due_date, projects ( name )')
      .not('due_date', 'is', null)
      .returns<
        {
          id: string
          project_id: string
          title: string
          status: string
          due_date: string | null
          projects: { name: string } | null
        }[]
      >(),
    service
      .from('deliveries')
      .select('id, status, download_expires_at, clients ( name )')
      .in('status', ['download_available', 'downloaded'])
      .not('download_expires_at', 'is', null)
      .returns<
        {
          id: string
          status: string
          download_expires_at: string | null
          clients: { name: string } | null
        }[]
      >(),
  ])

  const clientName = (row: { clients: { name: string } | null } | null | undefined): string =>
    row?.clients?.name ?? ''

  for (const p of projectsRes.data ?? []) {
    const dateKey = datePart(p.shoot_date)
    if (!dateKey) continue
    const time = p.shoot_time?.trim() ?? null
    const parts = [p.location?.trim(), clientName(p)].filter((x) => x)
    events.push({
      key: `shoot:${p.id}`,
      type: 'shoot',
      title: `جلسة تصوير: ${p.name}`,
      dateKey,
      time,
      meta: parts.join(' · ') || 'لا يوجد تفاصيل',
      href: `/admin/projects/${p.id}`,
    })
  }

  for (const slot of slotsRes.data ?? []) {
    const dateKey = datePart(slot.deadline)
    if (!dateKey) continue
    const targetHref = slot.project_id ? `/admin/projects/${slot.project_id}` : `/admin/clients`
    const timeMatch = /^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2})/.exec(slot.deadline ?? '')
    const time = timeMatch ? timeMatch[1] ?? null : null
    events.push({
      key: `deadline:${slot.id}`,
      type: 'deadline',
      title: `موعد الفيديو ${slot.position}: ${slot.title || ''}`.replace(/: $/, ''),
      dateKey,
      time,
      meta: clientName(slot),
      href: targetHref,
    })
  }

  for (const task of tasksRes.data ?? []) {
    const dateKey = datePart(task.due_date)
    if (!dateKey) continue
    events.push({
      key: `task:${task.id}`,
      type: 'task',
      title: task.title,
      dateKey,
      time: null,
      meta: task.projects?.name ?? '',
      href: `/admin/projects/${task.project_id}`,
    })
  }

  for (const delivery of deliveriesRes.data ?? []) {
    const dateKey = delivery.download_expires_at ? casablancaDateKey(delivery.download_expires_at) : null
    if (!dateKey) continue
    events.push({
      key: `delivery:${delivery.id}`,
      type: 'delivery',
      title: `انتهاء صلاحية تحميل: ${clientName(delivery)}`.replace(/: $/, ''),
      dateKey,
      time: null,
      meta: 'آخر موعد للتحميل',
      href: '/admin/deliveries',
    })
  }

  events.sort((a, b) => (a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0))

  return {
    ym,
    prevYm: shiftMonth(ym, -1),
    nextYm: shiftMonth(ym, 1),
    label,
    todayKey: casablancaYm(),
    events,
  }
}

export function eventsOn(events: CalendarEvent[], dateKey: string): CalendarEvent[] {
  return events.filter((e) => e.dateKey === dateKey)
}