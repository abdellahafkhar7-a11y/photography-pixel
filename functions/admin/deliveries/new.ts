import type { PagesFunction } from '@cloudflare/workers-types'
import { requireSession } from '../_lib/auth'
import { sameOrigin } from '../_lib/security'
import { siteUrl, type DeliveryEnv } from '../../_lib/env'
import { generatePrivateToken, hashPrivateToken } from '../../_lib/tokens'
import { renderDeliveryNew } from '../_lib/delivery-views'
import {
  adminHtml,
  formString,
  loadDeliveryDetail,
  loadPortfolioCatalog,
  resolveClient,
  serviceFrom,
  stableClientVisibleId,
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

  const form = await context.request.formData()
  const sourceType = formString(form.get('source_type')) || 'portfolio'
  const values: FormValues = {
    clientId: formString(form.get('client_id')),
    name: formString(form.get('name')),
    whatsapp: formString(form.get('whatsapp')),
    source: sourceType,
    portfolioUrls: (form.getAll('portfolio_url') ?? [])
      .map((entry) => (typeof entry === 'string' ? formString(entry) : ''))
      .filter((value) => value.length > 0),
    mode: formString(form.get('delivery_mode')) || 'VIEW_AND_DOWNLOAD',
  }

  const formError = (message: string): Response => {
    if (jsonMode) return jsonResponse({ ok: false, error: message }, 400)
    return adminHtml(renderDeliveryNew(appUser, [], [], values, message))
  }

  if (!service) return formError('النظام غير مهيأ.')

  const source = values.source === 'r2' ? 'r2' : 'portfolio'
  if (source === 'r2' && !isOwner) {
    const clients = await loadClients(service)
    const portfolio = await loadPortfolioCatalog(context)
    return jsonMode
      ? jsonResponse({ ok: false, error: 'الفيديو الخاص متاح لصاحب الموقع فقط.' }, 403)
      : adminHtml(renderDeliveryNew(appUser, clients, portfolio, values, 'الفيديو الخاص متاح لصاحب الموقع فقط.'))
  }

  if (source === 'portfolio' && values.portfolioUrls.length === 0) {
    const clients = await loadClients(service)
    const portfolio = await loadPortfolioCatalog(context)
    return jsonMode
      ? jsonResponse({ ok: false, error: 'اختر فيديو واحداً على الأقل من المعرض العام.' }, 400)
      : adminHtml(renderDeliveryNew(appUser, clients, portfolio, values, 'اختر فيديو واحداً على الأقل من المعرض العام.'))
  }

  if (source === 'portfolio') {
    const portfolio = await loadPortfolioCatalog(context)
    const validUrls = new Set(portfolio.map((option) => option.url))
    const invalidUrls = values.portfolioUrls.filter((url) => !validUrls.has(url))
    if (invalidUrls.length > 0) {
      const clients = await loadClients(service)
      return jsonMode
        ? jsonResponse({ ok: false, error: 'في أحد الفيديوهات المحددة غير موجود في معرض الموقع العام.' }, 400)
        : adminHtml(
            renderDeliveryNew(
              appUser,
              clients,
              portfolio,
              values,
              'في أحد الفيديوهات المحددة غير موجود في معرض الموقع العام — اختر فيديو من القائمة.',
            ),
          )
    }
    // Guard against duplicate selections — each item is a distinct video.
    values.portfolioUrls = [...new Set(values.portfolioUrls)]
  }

  // Phase 4L — Portfolio "إنشاء رابط": the link is created IMMEDIATELY when no
  // client info was submitted (the modal never blocks creation on a client
  // form). No client row is created and none is required; client name/WhatsApp
  // can still be attached afterwards (owner-only set_client). The classic
  // HTML form and the r2 source keep requiring client info as before.
  let clientId: string | null = null
  let clientName = ''
  let clientWhatsapp = ''
  if (source === 'portfolio' && jsonMode && !values.clientId && !values.name.trim() && !values.whatsapp.trim()) {
    clientId = null
  } else {
    const clientResult = await resolveClient(
      service,
      appUser.id,
      values.clientId || null,
      values.name,
      values.whatsapp,
    )
    if (!clientResult.ok) {
      const clients = await loadClients(service)
      const portfolio = await loadPortfolioCatalog(context)
      return jsonMode
        ? jsonResponse({ ok: false, error: clientResult.error }, 400)
        : adminHtml(renderDeliveryNew(appUser, clients, portfolio, values, clientResult.error))
    }
    clientId = clientResult.client.id
    clientName = clientResult.client.name
    clientWhatsapp = clientResult.client.whatsapp_number
  }

  const token = generatePrivateToken()
  const hash = await hashPrivateToken(token)
  const now = new Date().toISOString()
  const mode: 'VIEW_ONLY' | 'VIEW_AND_DOWNLOAD' = values.mode === 'VIEW_ONLY' ? 'VIEW_ONLY' : 'VIEW_AND_DOWNLOAD'
  // The delivery id is generated here so the stable /p/<identifier>-<secret>
  // link can be computed immediately (identifier = client WhatsApp digits or
  // an id digest for client-less portfolio links).
  const deliveryId = crypto.randomUUID()
  const identifier = stableClientVisibleId(clientWhatsapp, deliveryId)

  const { data: delivery, error: deliveryError } = await service
    .from('deliveries')
    .insert({
      id: deliveryId,
      client_id: clientId,
      created_by: appUser.id,
      source_type: source,
      delivery_mode: mode,
      client_visible_id: identifier,
      private_token_hash: hash,
      token_created_at: now,
    })
    .select('id')
    .single<{ id: string }>()
  if (deliveryError || !delivery) return formError('تعذّر إنشاء التوصيل.')

  if (source === 'portfolio') {
    // Phase 4M — one delivery, several videos: each selected portfolio video
    // becomes its own item (item_pos 1..N, version 1) behind the same private
    // link. The client sees them all together and the shared 72h window starts
    // on their FIRST download.
    const rows = values.portfolioUrls.map((url, index) => ({
      delivery_id: delivery.id,
      item_pos: index + 1,
      version: 1,
      source_type: 'portfolio' as const,
      portfolio_url: url,
      created_by: appUser.id,
    }))
    const { error: videoError } = await service.from('delivery_videos').insert(rows)
    if (videoError) return formError('تعذّر حفظ الفيديوهات.')
  }

  if (jsonMode) {
    return jsonResponse({
      ok: true,
      deliveryId: delivery.id,
      token,
      link: `${base}/p/${identifier}-${token}`,
      identifier,
      videoCount: source === 'portfolio' ? values.portfolioUrls.length : undefined,
      clientName,
      whatsapp: clientWhatsapp,
    })
  }

  const detail = await loadDeliveryDetail(service, delivery.id)
  // renderDetailPage draws the add-video card from options.portfolio — the
  // classic POST must feed the same catalog the GET route uses, otherwise the
  // newly created delivery shows "no videos available" right after creation.
  const portfolio = await loadPortfolioCatalog(context)
  const notice =
    source === 'r2'
      ? 'تم إنشاء التوصيل. ارفع الفيديو الخاص من صفحة التفاصيل ليتفعّل الرابط.'
      : 'تم إنشاء التوصيل بنجاح.'
  return adminHtml(
    renderDetailPage(appUser, base, detail ?? null, { freshToken: token, identifier, notice, portfolio }),
  )
}
