import { notifyOwner, ownerAppUserId } from './notifications'
import type { Db } from './supabase'

//============================================================================
// Phase 4R — Reminder engine (server-side, idempotent).
// Runs inside the maintenance/cleanup sweep (__cleanup.ts / manual cleanup
// button). Every reminder is keyed by a deterministic dedupe_key so repeated
// sweeps can never duplicate it. Dates are computed in Africa/Casablanca
// (the CRM's business timezone). Browsers are never trusted with scheduling.
//============================================================================

export type DayKey = string // 'YYYY-MM-DD'

export function casablancaDay(date: Date = new Date()): DayKey {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Casablanca',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function casablancaNow(): string {
  return new Date().toISOString()
}

export function addDays(day: DayKey, days: number): DayKey {
  const parts = day.split('-').map(Number)
  const y = parts[0] ?? 0
  const m = parts[1] ?? 1
  const d = parts[2] ?? 1
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() + days)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate(),
  ).padStart(2, '0')}`
}

export type RemindersResult = {
  notifications: number
  errors: string[]
}

// 1. Sessions (shoots) scheduled today or tomorrow.
// 2. Tasks due today/tomorrow and overdue tasks.
// 3. Delivery download windows expiring within the next 24h.
async function runReminderPasses(service: Db): Promise<RemindersResult> {
  const result: RemindersResult = { notifications: 0, errors: [] }
  const today = casablancaDay()
  const tomorrow = addDays(today, 1)
  const now = casablancaNow()
  const expiresSoon = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  // --- Sessions today / tomorrow -------------------------------------------
  const { data: sessions, error: sessionsError } = await service
    .from('projects')
    .select('id, name, project_code, shoot_date')
    .not('shoot_date', 'is', null)
    .in('shoot_date', [today, tomorrow])
    .neq('status', 'archived')
    .limit(100)
  if (sessionsError) result.errors.push(`sessions: ${sessionsError.message}`)
  else if (sessions) {
    for (const session of sessions) {
      const isToday = session.shoot_date === today
      const notified = await notifyOwner(service, {
        type: isToday ? 'project_created' : 'project_due_soon',
        title: isToday ? 'جلسة تصوير اليوم' : 'جلسة تصوير غداً',
        message: `${session.name} (${session.project_code}) — ${isToday ? 'اليوم' : 'غداً'}`,
        entity_type: 'project',
        entity_id: session.id,
        dedupe_key: `session:${isToday ? 'today' : 'tomorrow'}:${session.id}:${session.shoot_date}`,
      })
      if (notified) result.notifications += 1
    }
  }

  // --- Tasks due / overdue ---------------------------------------------------
  const { data: tasks, error: tasksError } = await service
    .from('project_tasks')
    .select('id, title, due_date, status, project_id')
    .in('status', ['todo', 'in_progress'])
    .limit(300)
  if (tasksError) result.errors.push(`tasks: ${tasksError.message}`)
  else if (tasks) {
    for (const task of tasks) {
      if (!task.due_date) continue
      if (task.due_date === today || task.due_date === tomorrow) {
        const notified = await notifyOwner(service, {
          type: 'task_due_soon',
          title: 'مهمة قريبة الاستحقاق',
          message: `"${task.title}" — الاستحقاق ${task.due_date === today ? 'اليوم' : 'غداً'}`,
          entity_type: 'task',
          entity_id: task.id,
          dedupe_key: `task_due:${task.id}:${task.due_date}`,
        })
        if (notified) result.notifications += 1
      } else if (task.due_date < today) {
        const notified = await notifyOwner(service, {
          type: 'task_overdue',
          title: 'مهمة متأخرة',
          message: `"${task.title}" متأخرة عن استحقاقها (${task.due_date})`,
          entity_type: 'task',
          entity_id: task.id,
          dedupe_key: `task_overdue:${task.id}`,
        })
        if (notified) result.notifications += 1
      }
    }
  }

  // --- Delivery download windows expiring -----------------------------------
  const { data: expiring, error: expiringError } = await service
    .from('deliveries')
    .select('id, client_visible_id')
    .in('status', ['confirmed', 'download_available', 'downloaded'])
    .not('download_expires_at', 'is', null)
    .gt('download_expires_at', now)
    .lte('download_expires_at', expiresSoon)
    .limit(100)
  if (expiringError) result.errors.push(`expiring: ${expiringError.message}`)
  else if (expiring) {
    for (const delivery of expiring) {
      const notified = await notifyOwner(service, {
        type: 'delivery_expiring',
        title: 'التحميل سينتهي قريباً',
        message: `رابط التوصيل ${delivery.client_visible_id} تنتهي صلاحيته خلال 24 ساعة`,
        entity_type: 'delivery',
        entity_id: delivery.id,
        dedupe_key: `delivery_expiring:${delivery.id}`,
      })
      if (notified) result.notifications += 1
    }
  }

  return result
}

export async function runReminders(
  service: Db,
  log: (message: string) => void = () => undefined,
): Promise<RemindersResult> {
  const ownerId = await ownerAppUserId(service)
  if (!ownerId) return { notifications: 0, errors: ['no active owner to notify'] }
  const result = await runReminderPasses(service)
  log(`reminders: notifications=${result.notifications} errors=${result.errors.length}`)
  return result
}