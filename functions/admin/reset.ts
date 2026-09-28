import type { PagesFunction } from '@cloudflare/workers-types'
import { html, readAdminData } from './_lib/auth'
import { hasSupabaseConfig, type Env } from './_lib/env'
import { sameOrigin } from './_lib/security'
import { resetPage } from './_lib/shell'

type AdminFunction = PagesFunction<Env, never, Record<string, unknown>>

// New-password page for the recovery flow. On first GET the Supabase magic link
// arrives as either ?token_hash=&type=recovery or ?access_token=&refresh_token=
// inside the URL; we exchange it for an authenticated session (cookies flow out
// through the middleware's CookieBag) and only then let the staff submit a new
// password. The subsequent POST reuses those cookies via supabase.auth.
export const onRequestGet: AdminFunction = async (context) => {
  if (!hasSupabaseConfig(context.env)) return html(resetPage('النظام غير مهيأ.'), 500)
  const data = readAdminData(context)
  if (!data) return html(resetPage('النظام غير مهيأ.'), 500)

  const url = new URL(context.request.url)
  const code = url.searchParams.get('code') ?? url.searchParams.get('token_hash')
  const accessToken = url.searchParams.get('access_token')
  const refreshToken = url.searchParams.get('refresh_token')
  try {
    if (code) {
      const { error } = await data.supabase.auth.exchangeCodeForSession(code)
      if (error) return html(resetPage('رابط الاستعادة غير صالح أو منتهي.'), 400)
    } else if (accessToken && refreshToken) {
      const { error } = await data.supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })
      if (error) return html(resetPage('رابط الاستعادة غير صالح أو منتهي.'), 400)
    }
  } catch {
    return html(resetPage('تعذّرت معالجة رابط الاستعادة.'), 400)
  }

  // Avoid re-exchange when the browser reloads the page with the same params.
  const { data: sessionCheck } = await data.supabase.auth.getSession()
  if (code || (accessToken && refreshToken)) {
    if (sessionCheck.session) {
      const clean = new URL('/admin/reset', context.request.url)
      return Response.redirect(clean.toString(), 303)
    }
  }
  return html(resetPage())
}

export const onRequestPost: AdminFunction = async (context) => {
  if (!hasSupabaseConfig(context.env)) return html(resetPage('النظام غير مهيأ.'), 500)
  if (!sameOrigin(context.request)) return html(resetPage('طلب غير صالح.'), 403)
  const data = readAdminData(context)
  if (!data) return html(resetPage('النظام غير مهيأ.'), 500)

  const form = await context.request.formData()
  const rawPassword = form.get('password')
  const rawConfirm = form.get('confirm')
  const password = typeof rawPassword === 'string' ? rawPassword : ''
  const confirm = typeof rawConfirm === 'string' ? rawConfirm : ''
  if (!password || password.length < 8) return html(resetPage('كلمة المرور يجب ألا تقل عن 8 أحرف.'), 400)
  if (password !== confirm) return html(resetPage('كلمتا المرور غير متطابقتين.'), 400)

  const { error } = await data.supabase.auth.updateUser({ password })
  if (error) return html(resetPage('تعذّر حفظ كلمة المرور. جرّب مرة أخرى.'), 400)

  // Recovery session is no longer needed; sign out so the staff logs in fresh.
  await data.supabase.auth.signOut()
  const target = new URL('/admin/login', context.request.url)
  return Response.redirect(target.toString(), 303)
}