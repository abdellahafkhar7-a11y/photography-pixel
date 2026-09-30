import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../_lib/notifications'
import type { NotificationsRow } from '../../_lib/db-types'
import { createServiceClient } from '../../_lib/supabase'
import type { AdminContext } from '../_lib/auth'
import { requireSession } from '../_lib/auth'
import type { AppUserRow } from '../_lib/types'
import { escapeHtml, shell, shellIcon } from '../_lib/shell'

//============================================================================
// /admin/api/notifications — Phase 4R Notifications Center.
// GET  → { unread, items } (JSON) or ?format=page (full page).
// POST → { action: 'mark_read', id } | { action: 'mark_all' } → { ok, unread, items }.
// Authorization is strictly self-scoped: a user can only ever read or mutate
// rows where user_id = their own app_users id. Owner-relevant rows exist
// because the helpers that create them target the owner's user id.
//============================================================================

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

function safeNotification(n: NotificationsRow) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    entity_type: n.entity_type,
    entity_id: n.entity_id,
    read_at: n.read_at,
    created_at: n.created_at,
  }
}

function fmtRelative(iso: string | null): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  const diff = Date.now() - t
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'الآن'
  if (mins < 60) return `منذ ${mins} د`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `منذ ${hours} س`
  const days = Math.floor(hours / 24)
  if (days < 7) return `منذ ${days} يوم`
  return new Date(iso).toLocaleDateString('ar-MA', { day: 'numeric', month: 'long' })
}

function notificationHref(entityType: string, entityId: string | null): string {
  if (!entityId) return '/admin'
  if (entityType === 'project') return `/admin/projects/${entityId}`
  if (entityType === 'delivery') return '/admin/deliveries'
  return '/admin'
}

export async function onRequestGet(context: AdminContext): Promise<Response> {
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser
  const service = createServiceClient(context.env)
  if (!service) return jsonResponse({ error: 'service unavailable' }, 500)

  const data = await listNotifications(service, appUser.id)
  const url = new URL(context.request.url)
  if (url.searchParams.get('format') === 'page') {
    return renderPage(appUser, data.items, data.unread)
  }
  return jsonResponse({ unread: data.unread, items: data.items.map(safeNotification) })
}

export async function onRequestPost(context: AdminContext): Promise<Response> {
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser
  const service = createServiceClient(context.env)
  if (!service) return jsonResponse({ error: 'service unavailable' }, 500)

  let payload: unknown
  try {
    payload = await context.request.json()
  } catch {
    return jsonResponse({ error: 'invalid json' }, 400)
  }
  const body = (payload ?? {}) as { action?: string; id?: string }

  if (body.action === 'mark_read' && typeof body.id === 'string' && body.id) {
    await markNotificationRead(service, appUser.id, body.id)
  } else if (body.action === 'mark_all') {
    await markAllNotificationsRead(service, appUser.id)
  } else {
    return jsonResponse({ error: 'unknown action' }, 400)
  }

  const data = await listNotifications(service, appUser.id)
  return jsonResponse({ ok: true, unread: data.unread, items: data.items.map(safeNotification) })
}

function renderRows(items: NotificationsRow[]): string {
  if (items.length === 0) {
    return `<div class="mini-empty"><div class="muted">لا توجد إشعارات.</div></div>`
  }
  return items
    .map((n) => {
      const rowCls = n.read_at ? 'notif-row read' : 'notif-row unread'
      return `<a class="${rowCls}" href="${notificationHref(n.entity_type, n.entity_id)}">
        <span class="notif-dot"></span>
        <span class="notif-body-c">
          <span class="t">${escapeHtml(n.title)}</span>
          ${n.message ? `<span class="m">${escapeHtml(n.message)}</span>` : ''}
          <span class="d">${fmtRelative(n.created_at)}</span>
        </span>
      </a>`
    })
    .join('')
}

function renderPage(
  appUser: AppUserRow,
  items: NotificationsRow[],
  unread: number,
): Response {
  const content = `
    <div class="page-head">
      <div>
        <h1>الإشعارات</h1>
        <div class="sub">${unread > 0 ? `${unread} غير مقروء` : 'لا توجد إشعارات غير مقروءة'}</div>
      </div>
      <div class="row">
        <span class="pill">${shellIcon('sparkle', 14)} تذكيرات آلية يومية</span>
      </div>
    </div>
    <section class="panel" style="max-width:860px">
      <div class="panel-head"><span class="ico-chip">${shellIcon('bell', 18)}</span><h2>سجل الإشعارات</h2></div>
      <div class="notif-body" style="max-height:none">${renderRows(items)}</div>
    </section>`
  return new Response(shell('الإشعارات', content, { active: 'dashboard', user: appUser, bodyClass: 'notifications' }), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}