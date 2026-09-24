import type { PagesFunction } from '@cloudflare/workers-types'
import { getAppUser } from './db'
import { hasSupabaseConfig, type Env } from './env'
import type { Db } from './supabase'
import type { AppUserRow } from './types'

export type AdminContext = Parameters<
  PagesFunction<Env, never, Record<string, unknown>>
>[0]

export type AdminData = {
  supabase: Db
  service: Db
  bag: import('./cookies').CookieBag
}

export function readAdminData(context: AdminContext): AdminData | null {
  const data = context.data as unknown as Partial<AdminData>
  if (!data.supabase || !data.service || !data.bag) return null
  return data as AdminData
}

export function html(body: string, status = 200): Response {
  return new Response(`<!doctype html>${body}`, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

export function redirectToLogin(request: Request, reason?: string): Response {
  const url = new URL(request.url)
  const target = new URL('/admin/login', url.origin)
  if (reason) target.searchParams.set('error', reason)
  return Response.redirect(target.toString(), 302)
}

export async function requireSession(
  context: AdminContext,
): Promise<AppUserRow | Response> {
  if (!hasSupabaseConfig(context.env)) return redirectToLogin(context.request, 'not_configured')
  const data = readAdminData(context)
  if (!data) return redirectToLogin(context.request, 'not_configured')
  const { data: session, error } = await data.supabase.auth.getUser()
  if (error || !session.user) return redirectToLogin(context.request)
  const appUser = await getAppUser(data.service, session.user.id)
  if (appUser?.is_active !== true) {
    await data.supabase.auth.signOut()
    return redirectToLogin(context.request, 'disabled')
  }
  return appUser
}

export function requireOwner(
  appUser: AppUserRow,
): Response | null {
  if (appUser.role_key === 'owner') return null
  return html(
    `<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>غير مصرح</title><style>body{font-family:system-ui,sans-serif;background:#111;color:#eee;max-width:40rem;margin:10vh auto;padding:2rem;text-align:center}</style></head><body><h1>403</h1><p>هذه الصفحة متاحة لصاحب الموقع فقط.</p><p><a href="/admin">رجوع</a></p></body></html>`,
    403,
  )
}