import type { PagesFunction } from '@cloudflare/workers-types'
import { html, readAdminData } from './_lib/auth'
import { hasSupabaseConfig, type Env } from './_lib/env'
import { sameOrigin } from './_lib/security'
import { recoverPage } from './_lib/shell'

type AdminFunction = PagesFunction<Env, never, Record<string, unknown>>

// Password recovery request page: staff/owner enter their email and receive a
// one-time reset link handled entirely by Supabase Auth. No custom tokens are
// stored anywhere in the app.
export const onRequestGet: AdminFunction = (context) => {
  if (!hasSupabaseConfig(context.env)) return html(recoverPage('not_configured'), 500)
  const sent = new URL(context.request.url).searchParams.get('sent')
  return html(recoverPage(undefined, sent ?? undefined))
}

export const onRequestPost: AdminFunction = async (context) => {
  if (!hasSupabaseConfig(context.env)) return html(recoverPage('النظام غير مهيأ.'), 500)
  if (!sameOrigin(context.request)) return html(recoverPage('طلب غير صالح.'), 403)
  const data = readAdminData(context)
  if (!data) return html(recoverPage('النظام غير مهيأ.'), 500)
  const form = await context.request.formData()
  const rawEmail = form.get('email')
  const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : ''
  if (!email) return html(recoverPage('اكتب بريدك الإلكتروني.'), 400)

  const redirectTo = new URL('/admin/reset', context.request.url).toString()
  const { error } = await data.supabase.auth.resetPasswordForEmail(email, { redirectTo })
  if (error) {
    return html(recoverPage('تعذّر إرسال الرابط. تأكد من صحة البريد وحاول مجدداً.'), 400)
  }
  const target = new URL('/admin/recover', context.request.url)
  target.searchParams.set('sent', email)
  return Response.redirect(target.toString(), 303)
}