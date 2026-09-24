import type { PagesFunction } from '@cloudflare/workers-types'
import { html, requireSession } from '../_lib/auth'
import { sameOrigin } from '../_lib/security'
import { siteUrl, type DeliveryEnv } from '../../_lib/env'
import type { RoleKey } from '../../_lib/db-types'
import {
  adminTopbar,
  brandPage,
  escapeHtml,
  icon,
} from '../../_lib/brand'
import { generatePrivateToken, hashPrivateToken } from '../../_lib/tokens'
import {
  formString,
  loadDeliveryDetail,
  loadPortfolioCatalog,
  resolveClient,
  serviceFrom,
  type PortfolioOption,
} from './_helpers'
import { renderDetailPage } from './[id]/index'

type Route = PagesFunction<DeliveryEnv, never, Record<string, unknown>>

type ClientOption = { id: string; name: string; whatsapp_number: string }

function roleOf(roleKey: string): RoleKey {
  return roleKey === 'owner' ? 'owner' : 'coordinator'
}

type FormValues = { clientId: string; name: string; whatsapp: string; source: string; portfolioUrl: string }

function groupedPortfolioHtml(options: PortfolioOption[]): string {
  const byCategory = new Map<string, { count: number; items: string[] }>()
  for (const opt of options) {
    const entry = byCategory.get(opt.category)
    const index = entry ? entry.count : 1
    const optionHtml = `<option value="${escapeHtml(opt.url)}">فيديو ${index} — ${escapeHtml(opt.category)}</option>`
    if (entry) {
      entry.count += 1
      entry.items.push(optionHtml)
    } else {
      byCategory.set(opt.category, { count: 2, items: [optionHtml] })
    }
  }
  if (byCategory.size === 0) {
    return `<option value="">لا توجد فيديوهات (عذرا)</option>`
  }
  return [...byCategory.entries()]
    .map(([category, entry]) => `<optgroup label="${escapeHtml(category)}">${entry.items.join('')}</optgroup>`)
    .join('')
}

function renderNewForm(
  role: RoleKey,
  clients: ClientOption[],
  portfolio: PortfolioOption[],
  values: FormValues,
  error?: string,
): string {
  const isOwner = role === 'owner'
  const clientOptions = clients
    .map(
      (client) =>
        `<option value="${client.id}"${client.id === values.clientId ? ' selected' : ''}>${escapeHtml(client.name)} — <span dir="ltr">${escapeHtml(client.whatsapp_number)}</span></option>`,
    )
    .join('')
  const sourceRadio = (value: string, label: string, hint: string): string =>
    `<label class="card" style="cursor:pointer;display:block;margin-top:0">
       <input type="radio" name="source_type" value="${value}"${values.source === value ? ' checked' : ''} style="accent-color:var(--accent)">
       <strong>${label}</strong><span class="muted" style="display:block">${hint}</span>
     </label>`
  return brandPage(
    'توصيل جديد',
    `${adminTopbar('new', role)}
     <div class="between" style="margin-bottom:1.25rem">
       <div><h1>توصيل جديد</h1><p class="muted">أنشئ رابطاً خاصاً لتسليم فيديو لعميل.</p></div>
     </div>
     ${error ? `<div class="alert error">${escapeHtml(error)}</div>` : ''}
     <form method="post" action="/admin/deliveries/new">
       <div class="card">
         <h2>العميل</h2>
         <label class="field"><span>اختيار عميل موجود</span>
           <select name="client_id">
             <option value="">— عميل جديد —</option>
             ${clientOptions}
           </select>
         </label>
         <div class="grid2">
           <label class="field"><span>اسم العميل</span>
             <input type="text" name="name" value="${escapeHtml(values.name)}" placeholder="مثال: سارة أمين" autocomplete="off">
           </label>
           <label class="field"><span>رقم الواتساب</span>
             <input type="tel" name="whatsapp" value="${escapeHtml(values.whatsapp)}" placeholder="0663493003" dir="ltr" autocomplete="off">
           </label>
         </div>
       </div>
       <div class="card">
         <h2>مصدر الفيديو</h2>
         <div class="grid2">
           ${sourceRadio('portfolio', 'من المعرض العام', 'اختر فيديو من أعمالك المنشورة على الموقع.')}
           ${isOwner ? sourceRadio('r2', 'فيديو خاص', 'الفيديو خاص لا يُعرض على الموقع؛ سيُرفع الملف الأصلي بعد الإنشاء. متاح لصاحب الموقع.') : ''}
         </div>
         <label class="field" style="margin-top:1.25rem" id="portfolio-field"><span>اختر الفيديو</span>
           <select name="portfolio_url">${groupedPortfolioHtml(portfolio)}</select>
           <span class="hint">يفتح عند العميل داخل صفحة العرض الحصري.</span>
         </label>
       </div>
       <div class="actionbar">
         <button class="btn btn-primary" type="submit">${icon('link')} إنشاء رابط التوصيل</button>
         <a class="btn btn-subtle" href="/admin/deliveries">إلغاء</a>
       </div>
     </form>`,
  )
}

export const onRequestGet: Route = async (context) => {
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser
  const role = roleOf(appUser.role_key)
  const service = serviceFrom(context)
  if (!service) return html(renderNewForm(role, [], [], { clientId: '', name: '', whatsapp: '', source: 'portfolio', portfolioUrl: '' }, 'النظام غير مهيأ.'))

  const { data: clients } = await service
    .from('clients')
    .select('id, name, whatsapp_number')
    .order('name')
    .returns<ClientOption[]>()
  const portfolio = await loadPortfolioCatalog(context)
  return html(
    renderNewForm(role, clients ?? [], portfolio, { clientId: '', name: '', whatsapp: '', source: 'portfolio', portfolioUrl: '' }),
  )
}

export const onRequestPost: Route = async (context) => {
  if (!sameOrigin(context.request)) return html('<p>طلب غير صالح.</p>', 403)
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser
  const role = roleOf(appUser.role_key)
  const service = serviceFrom(context)
  const base = siteUrl(context.env, context.request)

  const form = await context.request.formData()
  const values: FormValues = {
    clientId: formString(form.get('client_id')),
    name: formString(form.get('name')),
    whatsapp: formString(form.get('whatsapp')),
    source: formString(form.get('source_type')) || 'portfolio',
    portfolioUrl: formString(form.get('portfolio_url')),
  }

  if (!service) {
    return html(renderNewForm(role, [], [], values, 'النظام غير مهيأ.'))
  }

  const source = values.source === 'r2' ? 'r2' : 'portfolio'
  if (source === 'r2' && role !== 'owner') {
    const clients = (await service.from('clients').select('id, name, whatsapp_number').order('name').returns<ClientOption[]>()).data ?? []
    const portfolio = await loadPortfolioCatalog(context)
    return html(renderNewForm(role, clients, portfolio, values, 'الفيديو الخاص متاح لصاحب الموقع فقط.'))
  }

  if (source === 'portfolio' && !values.portfolioUrl) {
    const clients = (await service.from('clients').select('id, name, whatsapp_number').order('name').returns<ClientOption[]>()).data ?? []
    const portfolio = await loadPortfolioCatalog(context)
    return html(renderNewForm(role, clients, portfolio, values, 'اختر فيديو من المعرض العام.'))
  }

  const clientResult = await resolveClient(service, appUser.id, values.clientId || null, values.name, values.whatsapp)
  if (!clientResult.ok) {
    const clients = (await service.from('clients').select('id, name, whatsapp_number').order('name').returns<ClientOption[]>()).data ?? []
    const portfolio = await loadPortfolioCatalog(context)
    return html(renderNewForm(role, clients, portfolio, values, clientResult.error))
  }

  const token = generatePrivateToken()
  const hash = await hashPrivateToken(token)
  const now = new Date().toISOString()

  const { data: delivery, error: deliveryError } = await service
    .from('deliveries')
    .insert({
      client_id: clientResult.client.id,
      created_by: appUser.id,
      source_type: source,
      private_token_hash: hash,
      token_created_at: now,
    })
    .select('id')
    .single<{ id: string }>()
  if (deliveryError || !delivery) {
    const clients = (await service.from('clients').select('id, name, whatsapp_number').order('name').returns<ClientOption[]>()).data ?? []
    const portfolio = await loadPortfolioCatalog(context)
    return html(renderNewForm(role, clients, portfolio, values, 'تعذّر إنشاء التوصيل.'))
  }

  if (source === 'portfolio') {
    const { error: videoError } = await service.from('delivery_videos').insert({
      delivery_id: delivery.id,
      version: 1,
      source_type: 'portfolio',
      portfolio_url: values.portfolioUrl,
      created_by: appUser.id,
    })
    if (videoError) {
      const clients = (await service.from('clients').select('id, name, whatsapp_number').order('name').returns<ClientOption[]>()).data ?? []
      const portfolio = await loadPortfolioCatalog(context)
      return html(renderNewForm(role, clients, portfolio, values, 'تعذّر حفظ الفيديو.'))
    }
  }

  const detail = await loadDeliveryDetail(service, delivery.id)
  const notice = source === 'r2'
    ? 'تم إنشاء التوصيل. ارفع الفيديو الخاص من صفحة التفاصيل ليتفعّل الرابط.'
    : 'تم إنشاء التوصيل بنجاح.'
  return html(renderDetailPage(role, base, detail ?? null, { freshToken: token, notice }))
}