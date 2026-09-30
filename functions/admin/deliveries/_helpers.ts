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
import { generatePrivateToken, hashPrivateToken } from '../../_lib/tokens'
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
  client_label: string | null
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
  client_label: string | null
  clients: ClientsRow | null
  client_video_slots: { id: string; position: number; title: string; status: string } | null
  delivery_videos: DeliveryVideosRow[]
  delivery_activity: {
    id: string
    type: DeliveryActivityType
    metadata: Record<string, unknown> | null
    created_at: string
  }[]
  created_at: string
}

// The client name of a delivery: the linked client's name when one is
// attached, otherwise the name a coordinator typed in the mobile Team
// Workspace (Phase 5A — WhatsApp is never required there).
// The first non-empty trimmed value, or '' — used for the client name of a
// delivery (a linked client first, then the mobile flow's typed label).
function firstNonEmpty(...values: (string | null | undefined)[]): string {
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed) return trimmed
  }
  return ''
}

export function deliveryClientName(row: {
  clients?: { name: string } | null
  client_label?: string | null
}): string {
  return firstNonEmpty(row.clients?.name, row.client_label)
}

export async function listDeliveries(service: Db): Promise<DeliveryListItem[]> {
  const { data } = await service
    .from('deliveries')
    .select(
      `id, source_type, delivery_mode, status, created_at, token_created_at, confirmed_at,
       downloaded_at, download_expires_at, client_visible_id, archived_at, client_label,
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
       client_label,
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

//----------------------------------------------------------------------------
// Shared delivery creation — one implementation, two presentation layers.
// The admin form (POST /admin/deliveries/new) and the mobile Team Workspace
// (POST /admin/m/new) both call createDelivery(): token generation + hashing,
// the stable /p/<identifier>-<secret> link, the multi-video items, the source
// rules (r2 stays owner-only) and the client resolution are defined once here.
//----------------------------------------------------------------------------

// The typed client name of the mobile flow. WhatsApp is never required there,
// so this is stored on the delivery itself (deliveries.client_label) and only
// used when no real client row is attached. Any HTML-ish input is rejected.
export const CLIENT_LABEL_MAX_CHARS = 80

export function normalizeClientLabel(input: string): { ok: true; value: string } | { ok: false; error: string } {
  const value = input.trim().replace(/\s+/g, ' ')
  if (value.length < 2) return { ok: false, error: 'أدخل اسم العميل (حرفان على الأقل).' }
  if (value.length > CLIENT_LABEL_MAX_CHARS) {
    return { ok: false, error: `اسم العميل طويل جداً (${CLIENT_LABEL_MAX_CHARS} حرف كحد أقصى).` }
  }
  if (/[<>&"']/.test(value)) return { ok: false, error: 'اسم العميل يحتوي رموزاً غير مسموحة.' }
  return { ok: true, value }
}

export type CreateDeliveryParams = {
  service: Db
  actorId: string
  isOwner: boolean
  source: 'portfolio' | 'r2'
  /** Selected portfolio URLs, in the order they should appear to the client. */
  portfolioUrls: string[]
  /** The real portfolio catalog; every selected URL is validated against it. */
  portfolio: PortfolioOption[]
  clientId: string
  name: string
  whatsapp: string
  /** Mobile name-only flow: kept on the delivery when no client is resolved. */
  clientLabel: string
  /**
   * Phase 4L — a portfolio link may be created without any client form only
   * when the caller asked for it (the admin "إنشاء رابط" modal and the mobile
   * app). The classic admin form and the r2 source keep requiring client info.
   */
  allowClientLess: boolean
  mode: string
  /**
   * Optional hard lifetime for the private link, measured from creation.
   * The Phase 5A mobile Coordinator flow passes 24h. When omitted the link
   * keeps the classic behaviour (token_expires_at stays NULL = no link expiry),
   * so the admin form and the desktop delivery workflow are unchanged.
   */
  linkTtlMs?: number
  /** Public base URL used to build the private link. */
  base: string
}

export type CreateDeliverySuccess = {
  ok: true
  deliveryId: string
  token: string
  identifier: string
  link: string
  /** When the link stops working, or null when the link has no lifetime. */
  expiresAt: string | null
  clientId: string | null
  clientName: string
  clientWhatsapp: string
  clientLabel: string
  mode: 'VIEW_ONLY' | 'VIEW_AND_DOWNLOAD'
  /** Number of videos the client will see; null for the r2 source. */
  videoCount: number | null
}

export type CreateDeliveryFailure = {
  ok: false
  status: 400 | 403 | 500
  error: string
  reason:
    | 'not_configured'
    | 'forbidden_source'
    | 'no_videos'
    | 'invalid_video'
    | 'invalid_client'
    | 'delivery_failed'
    | 'videos_failed'
}

export type CreateDeliveryResult = CreateDeliverySuccess | CreateDeliveryFailure

export async function createDelivery(params: CreateDeliveryParams): Promise<CreateDeliveryResult> {
  const { service, actorId, isOwner, portfolio, base } = params
  const source = params.source === 'r2' ? 'r2' : 'portfolio'

  if (source === 'r2' && !isOwner) {
    return { ok: false, status: 403, reason: 'forbidden_source', error: 'الفيديو الخاص متاح لصاحب الموقع فقط.' }
  }

  const portfolioUrls = [...new Set(params.portfolioUrls.map((url) => url.trim()).filter((url) => url.length > 0))]

  if (source === 'portfolio') {
    if (portfolioUrls.length === 0) {
      return { ok: false, status: 400, reason: 'no_videos', error: 'اختر فيديو واحداً على الأقل من المعرض العام.' }
    }
    const validUrls = new Set(portfolio.map((option) => option.url))
    if (portfolioUrls.some((url) => !validUrls.has(url))) {
      return {
        ok: false,
        status: 400,
        reason: 'invalid_video',
        error: 'في أحد الفيديوهات المحددة غير موجود في معرض الموقع العام.',
      }
    }
  }

  // A delivery is client-less when the caller submitted no client form at all
  // (Phase 4L immediate portfolio links, and the Phase 5A mobile flow which
  // supplies only a client NAME via clientLabel).
  let clientId: string | null = null
  let clientName = ''
  let clientWhatsapp = ''
  let clientLabel = ''
  const hasClientInput = Boolean(params.clientId || params.name.trim() || params.whatsapp.trim())
  const canBeClientLess = params.allowClientLess && source === 'portfolio'
  if (hasClientInput || !canBeClientLess) {
    const clientResult = await resolveClient(service, actorId, params.clientId || null, params.name, params.whatsapp)
    if (!clientResult.ok) {
      return { ok: false, status: 400, reason: 'invalid_client', error: clientResult.error }
    }
    clientId = clientResult.client.id
    clientName = clientResult.client.name
    clientWhatsapp = clientResult.client.whatsapp_number
  } else if (params.clientLabel.trim()) {
    // The mobile flow submits ONLY a typed name: it is validated and stored on
    // the delivery. A caller that submits no client information at all (the
    // admin "إنشاء رابط" modal) keeps a valid client-less delivery.
    const label = normalizeClientLabel(params.clientLabel)
    if (!label.ok) return { ok: false, status: 400, reason: 'invalid_client', error: label.error }
    clientLabel = label.value
  }

  const token = generatePrivateToken()
  const hash = await hashPrivateToken(token)
  const now = new Date().toISOString()
  const mode: 'VIEW_ONLY' | 'VIEW_AND_DOWNLOAD' = params.mode === 'VIEW_ONLY' ? 'VIEW_ONLY' : 'VIEW_AND_DOWNLOAD'
  // The delivery id is generated here so the stable /p/<identifier>-<secret>
  // link can be computed immediately (identifier = client WhatsApp digits or
  // an id digest for client-less links).
  const deliveryId = crypto.randomUUID()
  const identifier = stableClientVisibleId(clientWhatsapp, deliveryId)

  // A requested link lifetime is stored on the row itself, so every client
  // endpoint (/p/<token>, /preview, /thumb, /download) enforces it server-side
  // through tokenIsActive() — never in the browser.
  const ttlMs = params.linkTtlMs
  const linkExpiresAt =
    typeof ttlMs === 'number' && Number.isFinite(ttlMs) && ttlMs > 0
      ? new Date(new Date(now).getTime() + ttlMs)
      : null

  const { data: delivery, error: deliveryError } = await service
    .from('deliveries')
    .insert({
      id: deliveryId,
      client_id: clientId,
      client_label: clientLabel || null,
      created_by: actorId,
      source_type: source,
      delivery_mode: mode,
      client_visible_id: identifier,
      private_token_hash: hash,
      token_created_at: now,
      token_expires_at: linkExpiresAt ? linkExpiresAt.toISOString() : null,
    })
    .select('id')
    .single<{ id: string }>()
  if (deliveryError || !delivery) {
    return { ok: false, status: 500, reason: 'delivery_failed', error: 'تعذّر إنشاء التوصيل.' }
  }

  if (source === 'portfolio') {
    // Phase 4M — one delivery, several videos: each selected portfolio video
    // becomes its own item (item_pos 1..N, version 1) behind the same private
    // link. The client sees them all together and the shared 72h window starts
    // on their FIRST download.
    const rows = portfolioUrls.map((url, index) => ({
      delivery_id: delivery.id,
      item_pos: index + 1,
      version: 1,
      source_type: 'portfolio' as const,
      portfolio_url: url,
      created_by: actorId,
    }))
    const { error: videoError } = await service.from('delivery_videos').insert(rows)
    if (videoError) {
      return { ok: false, status: 500, reason: 'videos_failed', error: 'تعذّر حفظ الفيديوهات.' }
    }
  }

  return {
    ok: true,
    deliveryId: delivery.id,
    token,
    identifier,
    link: `${base}/p/${identifier}-${token}`,
    expiresAt: linkExpiresAt ? linkExpiresAt.toISOString() : null,
    clientId,
    clientName,
    clientWhatsapp,
    clientLabel,
    mode,
    videoCount: source === 'portfolio' ? portfolioUrls.length : null,
  }
}