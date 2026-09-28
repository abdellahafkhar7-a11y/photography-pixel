import type { PagesFunction } from '@cloudflare/workers-types'
import { hasSupabaseConfig, siteUrl, type DeliveryEnv } from '../../_lib/env'
import { createServiceClient, type Db } from '../../_lib/supabase'
import type {
  ClientsRow,
  DeliveryActivityType,
  DeliveryMode,
  DeliverySourceType,
  DeliveryStatus,
  DeliveryVideosRow,
} from '../../_lib/db-types'
import { isValidWhatsapp, normalizeWhatsapp } from '../../_lib/whatsapp'

export type DeliveryPageContext = Parameters<
  PagesFunction<DeliveryEnv, never, Record<string, unknown>>
>[0]

type AssetsEnv = DeliveryEnv & {
  ASSETS?: {
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
  }
}

export function serviceFrom(input: {
  env: Pick<DeliveryEnv, 'SUPABASE_URL' | 'SUPABASE_ANON_KEY' | 'SUPABASE_SERVICE_ROLE_KEY'>
}): Db | null {
  if (!hasSupabaseConfig(input.env)) return null
  return createServiceClient(input.env)
}

// Admin pages may carry a freshly generated private token, so they are never
// cached or shared.
export function adminHtml(body: string, status = 200): Response {
  return new Response(`<!doctype html>${body}`, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex',
    },
  })
}

export function redirectTo(request: Request, path: string): Response {
  return Response.redirect(new URL(path, request.url).toString(), 302)
}

// FormData values are either strings or (in rare cases) File objects; the
// delivery forms never carry files, so a non-string value is simply empty.
export function formString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

// Safe integer parse with fallback + upper clamp (plan limits are enforced by
// the caller where meaningful).
export function parseIntOr(value: string, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return fallback
  if (Number.isFinite(max) && parsed > max) return max
  return Math.max(0, parsed)
}

//----------------------------------------------------------------------------
// Payloads (typed explicitly because supabase-js cannot infer reverse
// foreign-key embeddings for delivery_videos/delivery_activity).
//----------------------------------------------------------------------------

export type DeliveryListItem = {
  id: string
  source_type: DeliverySourceType
  delivery_mode: DeliveryMode
  status: DeliveryStatus
  created_at: string
  token_created_at: string
  confirmed_at: string | null
  released_at: string | null
  downloaded_at: string | null
  download_expires_at: string | null
  client_visible_id: string | null
  archived_at: string | null
  clients: { id: string; name: string; whatsapp_number: string } | null
  delivery_videos: {
    id: string
    item_pos: number
    version: number
    is_active: boolean
    source_type: DeliverySourceType
    original_deleted_at: string | null
    confirmed_at: string | null
    download_released_at: string | null
    downloaded_at: string | null
    download_expires_at: string | null
    expired_at: string | null
  }[]
}

export type DeliveryDetail = {
  id: string
  source_type: DeliverySourceType
  delivery_mode: DeliveryMode
  status: DeliveryStatus
  token_created_at: string
  token_expires_at: string | null
  confirmed_at: string | null
  downloaded_at: string | null
  download_expires_at: string | null
  expired_at: string | null
  client_visible_id: string | null
  archived_at: string | null
  created_at: string
  clients: ClientsRow | null
  client_video_slots: { id: string; position: number; title: string; status: string } | null
  delivery_videos: DeliveryVideosRow[]
  delivery_activity: {
    id: string
    type: DeliveryActivityType
    metadata: Record<string, unknown> | null
    created_at: string
  }[]
}

export async function listDeliveries(service: Db): Promise<DeliveryListItem[]> {
  const { data } = await service
    .from('deliveries')
    .select(
      `id, source_type, delivery_mode, status, created_at, token_created_at, confirmed_at,
       downloaded_at, download_expires_at, client_visible_id, archived_at,
       clients ( id, name, whatsapp_number ),
       delivery_videos ( id, item_pos, version, is_active, source_type, original_deleted_at, confirmed_at, download_released_at, downloaded_at, download_expires_at, expired_at )`,
    )
    .order('created_at', { ascending: false })
    .limit(200)
    .returns<DeliveryListItem[]>()
  return data ?? []
}

// "videoCount" counts distinct active items (one active version per item
// position) — this is the number of videos the client actually sees/link.
export function activeVideoCount(videos: DeliveryListItem['delivery_videos']): number {
  return new Set((videos ?? []).filter((video) => video.is_active).map((video) => video.item_pos)).size
}

export async function loadDeliveryDetail(
  service: Db,
  deliveryId: string,
): Promise<DeliveryDetail | null> {
  const { data } = await service
    .from('deliveries')
    .select(
      `id, source_type, delivery_mode, status, token_created_at, token_expires_at, confirmed_at,
       downloaded_at, download_expires_at, expired_at, client_visible_id, archived_at, created_at,
       clients ( * ),
       client_video_slots ( id, position, title, status ),
       delivery_videos ( * ),
       delivery_activity ( id, type, metadata, created_at )`,
    )
    .eq('id', deliveryId)
    .maybeSingle<DeliveryDetail>()
  if (!data) return null
  if (data.delivery_activity) {
    data.delivery_activity.sort((a, b) => b.created_at.localeCompare(a.created_at))
  }
  if (data.delivery_videos) {
    data.delivery_videos.sort((a, b) => a.item_pos - b.item_pos || b.version - a.version)
  }
  return data
}

export const ACTIVITY_LABEL: Record<DeliveryActivityType, string> = {
  delivery_created: 'تم إنشاء التوصيل',
  link_opened: 'تم فتح الرابط',
  preview_viewed: 'تم فتح المعاينة',
  video_confirmed: 'تم تأكيد الفيديو',
  download_started: 'بدأ التحميل',
  download_completed: 'اكتمل التحميل',
  delivery_expired: 'انتهت صلاحية التوصيل',
  original_deleted: 'حُذف الملف الأصلي من التخزين',
  reuploaded: 'تم رفع ملف جديد',
  version_created: 'نسخة جديدة',
  delivery_archived: 'تمت أرشفة التوصيل',
  delivery_unarchived: 'أُعيد تفعيل التوصيل',
  version_archived: 'تمت أرشفة نسخة',
  version_deleted: 'حُذف ملف نسخة',
  delivery_mode_changed: 'تغيّر وضع التوصيل',
  delivery_released: 'تم إطلاق التحميل',
}

//----------------------------------------------------------------------------
// Client upsert (name + normalized WhatsApp number)
//----------------------------------------------------------------------------

export type ClientFormValues = { name: string; whatsapp_number: string }

export type ClientResolveResult =
  | { ok: true; client: ClientsRow }
  | { ok: false; error: string }

export async function resolveClient(
  service: Db,
  userId: string,
  clientId: string | null,
  name: string,
  whatsapp: string,
): Promise<ClientResolveResult> {
  if (clientId && isValidUuid(clientId)) {
    const { data } = await service
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .maybeSingle<ClientsRow>()
    if (data) return { ok: true, client: data }
    return { ok: false, error: 'العميل المحدد غير موجود.' }
  }

  const trimmedName = name.trim()
  if (trimmedName.length < 2) return { ok: false, error: 'أدخل اسم العميل (حرفان على الأقل).' }
  if (!isValidWhatsapp(whatsapp)) {
    return { ok: false, error: 'أدخل رقم واتساب صحيح، مثال: 0663493003' }
  }
  const normalized = normalizeWhatsapp(whatsapp)

  const { data: existing } = await service
    .from('clients')
    .select('*')
    .eq('whatsapp_number', normalized)
    .maybeSingle<ClientsRow>()
  if (existing) return { ok: true, client: existing }

  const { data: created, error } = await service
    .from('clients')
    .insert({ name: trimmedName, whatsapp_number: normalized, created_by: userId })
    .select('*')
    .single<ClientsRow>()
  if (error || !created) return { ok: false, error: 'تعذّر حفظ بيانات العميل.' }
  return { ok: true, client: created }
}

//----------------------------------------------------------------------------
// Portfolio catalog — read from the site's own static /data files.
//----------------------------------------------------------------------------

export type PortfolioOption = {
  category: string
  file: string
  url: string
}

async function readStatic(context: DeliveryPageContext, path: string): Promise<string | null> {
  try {
    const url = new URL(path, context.request.url)
    const assets = (context.env as AssetsEnv).ASSETS
    if (assets) {
      const res = await assets.fetch(url)
      if (res.ok) return await res.text()
    }
  } catch {
    // fall through to same-origin fetch
  }
  try {
    const res = await fetch(new URL(path, context.request.url))
    if (res.ok) return await res.text()
  } catch {
    // catalog unavailable
  }
  return null
}

type CategoryConfig = {
  label?: string
  txtFile?: string
}

export async function loadPortfolioCatalog(
  context: DeliveryPageContext,
): Promise<PortfolioOption[]> {
  const configText = await readStatic(context, '/data/config.json')
  if (!configText) return []
  let categories: Record<string, CategoryConfig> | undefined
  try {
    const parsed = JSON.parse(configText) as { categories?: Record<string, CategoryConfig> }
    categories = parsed.categories
  } catch {
    return []
  }
  if (!categories) return []

  const options: PortfolioOption[] = []
  const seenFiles = new Set<string>()
  for (const [key, category] of Object.entries(categories)) {
    const file = category.txtFile ?? ''
    if (!file || seenFiles.has(file)) continue
    seenFiles.add(file)
    const text = await readStatic(context, `/data/${file}`)
    if (!text) continue
    const label = category.label ?? key
    for (const line of text.split(/\r?\n/)) {
      const url = line.trim()
      if (!/^https?:\/\//.test(url)) continue
      options.push({ category: label, file, url })
    }
  }
  return options
}

//----------------------------------------------------------------------------
// Stable private links — /p/<identifier>-<secret>
//----------------------------------------------------------------------------

// The cosmetic identifier is derived once at creation time and never changes.
// When a client is known the WhatsApp digits (international) become the
// identifier; client-less portfolio links fall back to the delivery id digest.
// The identifier is NOT a secret: the random token after the dash is.
export function stableClientVisibleId(whatsapp: string, deliveryId: string): string {
  const digits = whatsapp.replace(/\D/g, '')
  if (digits) return digits
  return deliveryId.replace(/-/g, '').slice(0, 8)
}

export function privateLinkFor(
  request: Request,
  env: DeliveryEnv,
  token: string,
  identifier: string | null = null,
): string {
  const base = siteUrl(env, request)
  return identifier ? `${base}/p/${identifier}-${token}` : `${base}/p/${token}`
}