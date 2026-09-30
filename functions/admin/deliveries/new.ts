import type { PagesFunction } from '@cloudflare/workers-types'
import { requireSession } from '../_lib/auth'
import { sameOrigin } from '../_lib/security'
import { siteUrl, type DeliveryEnv } from '../../_lib/env'
import { renderDeliveryNew } from '../_lib/delivery-views'
import {
  adminHtml,
  createDelivery,
  formString,
  loadDeliveryDetail,
  loadPortfolioCatalog,
  serviceFrom,
} from './_helpers'
import { renderDetailPage } from './[id]/index'

type Route = PagesFunction<DeliveryEnv, never, Record<string, unknown>>

// The portfolio "إنشاء رابط" modal POSTs with Accept: application/json and
// expects the private link back without a page reload. Classic form posts
// (Accept: text/html) keep the existing full-page behaviour.
function wantsJson(request: Request): boolean {
  return (request.headers.get('accept') ?? '').includes('application/json')
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  })
}

type ClientOption = { id: string; name: string; whatsapp_number: string }

type FormValues = {
  clientId: string
  name: string
  whatsapp: string
  source: string
  portfolioUrls: string[]
  mode: string
}

// The desktop modal posts multipart/form-data with Accept: application/json, and
// the classic form posts urlencoded, but this route is also a documented JSON
// endpoint. Calling formData() on a JSON body throws and 500s, so the body is
// read according to its own content type and both spellings are accepted.
const FIELD_ALIASES: Record<keyof FormValues, string[]> = {
  clientId: ['client_id', 'clientId'],
  name: ['name'],
  whatsapp: ['whatsapp', 'whatsapp_number', 'whatsappNumber'],
  source: ['source_type', 'sourceType', 'source'],
  portfolioUrls: ['portfolio_url', 'portfolio_urls', 'portfolioUrl', 'portfolioUrls', 'videos'],
  mode: ['delivery_mode', 'deliveryMode', 'mode'],
}

// A body reader that works for multipart, urlencoded and JSON payloads alike.
type BodyFields = {
  get(name: string): string | null
  getAll(name: string): string[]
}

function withDefault(value: string, fallback: string): string {
  return value.trim().length > 0 ? value : fallback
}

function valuesFrom(source: BodyFields): FormValues {
  const read = (keys: string[]): string[] => {
    const out: string[] = []
    for (const key of keys) {
      for (const value of source.getAll(key)) out.push(formString(value))
    }
    return out.filter((value) => value.length > 0)
  }
  const first = (keys: string[]): string => {
    for (const key of keys) {
      const value = source.get(key)
      if (typeof value === 'string') return formString(value)
    }
    return ''
  }
  return {
    clientId: first(FIELD_ALIASES.clientId),
    name: first(FIELD_ALIASES.name),
    whatsapp: first(FIELD_ALIASES.whatsapp),
    source: withDefault(first(FIELD_ALIASES.source), 'portfolio'),
    portfolioUrls: read(FIELD_ALIASES.portfolioUrls),
    mode: withDefault(first(FIELD_ALIASES.mode), 'VIEW_AND_DOWNLOAD'),
  }
}

async function readValues(request: Request): Promise<FormValues> {
  const contentType = (request.headers.get('content-type') ?? '').toLowerCase()
  if (contentType.includes('application/json')) {
    let body: Record<string, unknown> = {}
    try {
      const parsed: unknown = await request.json()
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        body = parsed as Record<string, unknown>
      }
    } catch {
      body = {}
    }
    const single = (name: string): string | null => {
      const value = body[name]
      return typeof value === 'string' ? value : null
    }
    return valuesFrom({
      get: single,
      getAll: (name) => {
        const value = body[name]
        if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string')
        return single(name) === null ? [] : [String(value)]
      },
    })
  }
  const formData: FormData = await request.formData()
  const form: BodyFields = {
    get: (name) => {
      const value = formData.get(name)
      return typeof value === 'string' ? value : null
    },
    getAll: (name) => {
      const values: string[] = []
      for (const value of formData.getAll(name)) {
        if (typeof value === 'string') values.push(value)
      }
      return values
    },
  }
  return valuesFrom(form)
}

async function loadClients(service: NonNullable<ReturnType<typeof serviceFrom>>): Promise<ClientOption[]> {
  const { data } = await service
    .from('clients')
    .select('id, name, whatsapp_number')
    .order('name')
    .returns<ClientOption[]>()
  return data ?? []
}

export const onRequestGet: Route = async (context) => {
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser

  const service = serviceFrom(context)
  if (!service) {
    return adminHtml(
      renderDeliveryNew(
        appUser,
        [],
        [],
        { clientId: '', name: '', whatsapp: '', source: 'portfolio', portfolioUrls: [], mode: 'VIEW_AND_DOWNLOAD' },
        'النظام غير مهيأ.',
      ),
    )
  }
  const clients = await loadClients(service)
  const portfolio = await loadPortfolioCatalog(context)

  // Support /admin/deliveries/new?portfolio_url=… (multi-value; choosing videos
  // from the Portfolio module) and ?client_id=… preselects. Both are validated
  // server side against the real catalog; invalid values are silently ignored.
  const params = new URL(context.request.url).searchParams
  const preselectUrls = (params.getAll('portfolio_url') ?? [])
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && portfolio.some((option) => option.url === value))
  const preselectClient = params.get('client_id') ?? ''
  const selectedClient = clients.some((client) => client.id === preselectClient) ? preselectClient : ''

  return adminHtml(
    renderDeliveryNew(appUser, clients, portfolio, {
      clientId: selectedClient,
      name: '',
      whatsapp: '',
      source: 'portfolio',
      portfolioUrls: preselectUrls,
      mode: 'VIEW_AND_DOWNLOAD',
    }),
  )
}

export const onRequestPost: Route = async (context) => {
  if (!sameOrigin(context.request)) {
    return wantsJson(context.request)
      ? jsonResponse({ ok: false, error: 'طلب غير صالح.' }, 403)
      : adminHtml('<p>طلب غير صالح.</p>', 403)
  }
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser
  const isOwner = appUser.role_key === 'owner'
  const service = serviceFrom(context)
  const base = siteUrl(context.env, context.request)
  const jsonMode = wantsJson(context.request)

  const values = await readValues(context.request)

  const renderError = async (message: string, status = 200): Promise<Response> => {
    if (jsonMode) return jsonResponse({ ok: false, error: message }, 400)
    const clients = service ? await loadClients(service) : []
    const portfolio = await loadPortfolioCatalog(context)
    return adminHtml(renderDeliveryNew(appUser, clients, portfolio, values, message), status)
  }

  if (!service) return renderError('النظام غير مهيأ.')

  const source = values.source === 'r2' ? 'r2' : 'portfolio'
  // The catalog is the single source of truth for which videos may be
  // delivered; the shared creator validates every selected URL against it.
  const portfolio = source === 'portfolio' ? await loadPortfolioCatalog(context) : []

  const result = await createDelivery({
    service,
    actorId: appUser.id,
    isOwner,
    source,
    portfolioUrls: values.portfolioUrls,
    portfolio,
    clientId: values.clientId,
    name: values.name,
    whatsapp: values.whatsapp,
    clientLabel: '',
    // Phase 4L: only the JSON "إنشاء رابط" modal may skip the client form.
    allowClientLess: jsonMode,
    mode: values.mode,
    base,
  })

  if (!result.ok) {
    if (jsonMode) return jsonResponse({ ok: false, error: result.error }, result.status)
    // The classic form keeps its longer, more helpful wording.
    const message =
      result.reason === 'invalid_video'
        ? 'في أحد الفيديوهات المحددة غير موجود في معرض الموقع العام — اختر فيديو من القائمة.'
        : result.error
    return renderError(message, result.status)
  }

  if (jsonMode) {
    return jsonResponse({
      ok: true,
      deliveryId: result.deliveryId,
      token: result.token,
      link: result.link,
      identifier: result.identifier,
      videoCount: result.videoCount ?? undefined,
      clientName: result.clientName,
      whatsapp: result.clientWhatsapp,
    })
  }

  const detail = await loadDeliveryDetail(service, result.deliveryId)
  // renderDetailPage draws the add-video card from options.portfolio — the
  // classic POST must feed the same catalog the GET route uses, otherwise the
  // newly created delivery shows "no videos available" right after creation.
  const catalog = source === 'portfolio' ? portfolio : await loadPortfolioCatalog(context)
  const notice =
    source === 'r2'
      ? 'تم إنشاء التوصيل. ارفع الفيديو الخاص من صفحة التفاصيل ليتفعّل الرابط.'
      : 'تم إنشاء التوصيل بنجاح.'
  return adminHtml(
    renderDetailPage(appUser, base, detail ?? null, {
      freshToken: result.token,
      identifier: result.identifier,
      notice,
      portfolio: catalog,
    }),
  )
}
