import type { PagesFunction } from '@cloudflare/workers-types'
import { createServiceClient } from '../_lib/supabase'
import { requireSession } from './_lib/auth'
import type { Env } from './_lib/env'
import { renderSearch } from './_lib/search-views'
import { listProjects } from './_lib/projects-data'
import { listDeliveries } from './deliveries/_helpers'

//============================================================================
// /admin/search — global search (Phase 4O + Phase 4R Search 2.0).
// One query searches projects, clients, models, deliveries, production videos
// (client_video_slots) and project tasks. The route serves both:
//   • an HTML results page (default), and
//   • grouped JSON (?format=json) for the Ctrl+K command palette in shell.
// Only safe display fields are ever serialized — never tokens, R2 keys or
// original paths. Guests/coordinators keep the same session-based access as
// the original Phase 4O page (no owner gate).
//============================================================================

type AdminFunction = PagesFunction<Env, never, Record<string, unknown>>

export type SlotSearchRow = {
  id: string
  title: string
  notes: string | null
  kanban_status: string
  project_id: string
}

export type TaskSearchRow = {
  id: string
  title: string
  status: string
  project_id: string
}

export const onRequestGet: AdminFunction = async (context) => {
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser

  const service = createServiceClient(context.env)
  if (!service) return new Response(null, { status: 307, headers: { Location: '/admin' } })

  const q = (new URL(context.request.url).searchParams.get('q') ?? '').trim().slice(0, 80)
  const url = new URL(context.request.url)
  const asJson = url.searchParams.get('format') === 'json'
  const query = q.toLowerCase()

  const matches = (value: string): boolean => value.toLowerCase().includes(query)

  const projects = q ? await listProjects(service, { query: q }) : []

  let clients: { id: string; name: string; whatsapp_number: string; status: string }[] = []
  let models: { id: string; name: string; photo: string | null }[] = []
  let deliveries: ReturnType<typeof listDeliveries> extends Promise<infer T> ? T : never = []
  let slots: SlotSearchRow[] = []
  let tasks: TaskSearchRow[] = []
  if (q) {
    const [clientsRes, modelsRes, deliveriesRes, slotsRes, tasksRes] = await Promise.all([
      service
        .from('clients')
        .select('id, name, whatsapp_number, status')
        .order('name')
        .returns<{ id: string; name: string; whatsapp_number: string; status: string }[]>(),
      service.from('models').select('id, name, photo').order('name').returns<{ id: string; name: string; photo: string | null }[]>(),
      listDeliveries(service),
      service
        .from('client_video_slots')
        .select('id, title, notes, kanban_status, project_id')
        .not('project_id', 'is', null)
        .limit(400)
        .returns<SlotSearchRow[]>(),
      service.from('project_tasks').select('id, title, status, project_id').limit(400).returns<TaskSearchRow[]>(),
    ])
    clients = (clientsRes.data ?? []).filter(
      (c) => matches(c.name) || c.whatsapp_number.replace(/\D/g, '').includes(query.replace(/\D/g, '')),
    )
    models = (modelsRes.data ?? []).filter((m) => matches(m.name))
    deliveries = deliveriesRes.filter(
      (d) =>
        matches(d.clients?.name ?? '') ||
        (d.clients?.whatsapp_number ?? '').replace(/\D/g, '').includes(query.replace(/\D/g, '')),
    )
    slots = (slotsRes.data ?? []).filter((s) => matches(s.title) || (s.notes ? matches(s.notes) : false))
    tasks = (tasksRes.data ?? []).filter((t) => matches(t.title))
  }

  if (asJson) {
    return new Response(JSON.stringify(buildJsonGroups({ query: q, projects, clients, models, deliveries, slots, tasks })), {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' },
    })
  }

  const response = new Response(renderSearch(appUser, { query: q, projects, clients, models, deliveries, slots, tasks }), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' },
  })
  return response
}

type JsonGroup = { label: string; icon: string; items: { title: string; sub: string; href: string }[] }

function buildJsonGroups(r: SearchResultsLike): JsonGroup[] {
  const groups: JsonGroup[] = []

  if (r.clients.length) {
    groups.push({
      label: 'العملاء',
      icon: '•',
      items: r.clients.slice(0, 6).map((c) => ({
        title: c.name,
        sub: c.whatsapp_number,
        href: `/admin/clients/${c.id}`,
      })),
    })
  }
  if (r.projects.length) {
    groups.push({
      label: 'المشاريع',
      icon: '•',
      items: r.projects.slice(0, 6).map((p) => ({
        title: p.project.name,
        sub: `${p.project.project_code}${p.client ? ` · ${p.client.name}` : ''}`,
        href: `/admin/projects/${p.project.id}`,
      })),
    })
  }
  if (r.slots.length) {
    groups.push({
      label: 'الفيديوهات الإنتاجية',
      icon: '•',
      items: r.slots.slice(0, 6).map((s) => ({
        title: s.title,
        sub: s.kanban_status,
        href: `/admin/projects/${s.project_id}`,
      })),
    })
  }
  if (r.tasks.length) {
    groups.push({
      label: 'المهام',
      icon: '•',
      items: r.tasks.slice(0, 6).map((t) => ({
        title: t.title,
        sub: t.status,
        href: `/admin/projects/${t.project_id}`,
      })),
    })
  }
  if (r.deliveries.length) {
    groups.push({
      label: 'التوصيلات',
      icon: '•',
      items: r.deliveries.slice(0, 6).map((d) => ({
        title: d.clients?.name ?? 'توصيل',
        sub: `${d.delivery_mode === 'VIEW_AND_DOWNLOAD' ? 'عرض وتحميل' : 'عرض فقط'} · ${d.status}`,
        href: `/admin/deliveries/${d.id}`,
      })),
    })
  }
  if (r.models.length) {
    groups.push({
      label: 'الموديلات',
      icon: '•',
      items: r.models.slice(0, 6).map((m) => ({
        title: m.name,
        sub: 'ملف موديل',
        href: `/admin/models#${m.id}`,
      })),
    })
  }
  return groups
}

type SearchResultsLike = {
  query: string
  projects: ReturnType<typeof listProjects> extends Promise<infer T> ? T : never
  clients: { id: string; name: string; whatsapp_number: string; status: string }[]
  models: { id: string; name: string; photo: string | null }[]
  deliveries: ReturnType<typeof listDeliveries> extends Promise<infer T> ? T : never
  slots: SlotSearchRow[]
  tasks: TaskSearchRow[]
}