import type { PagesFunction } from '@cloudflare/workers-types'
import { html, readAdminData } from './_lib/auth'
import { getAppUser, touchLastLogin } from './_lib/db'
import type { Env } from './_lib/env'
import { hasSupabaseConfig } from './_lib/env'
import { sameOrigin } from './_lib/security'
import { renderLogin } from './_lib/views'

type AdminFunction = PagesFunction<Env, never, Record<string, unknown>>

export const onRequestGet: AdminFunction = (context) => {
  const url = new URL(context.request.url)
  const error = url.searchParams.get('error') ?? undefined
  return html(renderLogin(hasSupabaseConfig(context.env) ? error : 'not_configured'))
}

export const onRequestPost: AdminFunction = async (context) => {
  if (!hasSupabaseConfig(context.env)) return html(renderLogin('not_configured'), 500)
  if (!sameOrigin(context.request)) return html(renderLogin('invalid_origin'), 403)
  const form = await context.request.formData()
  const rawEmail = form.get('email')
  const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : ''
  const rawPassword = form.get('password')
  const password = typeof rawPassword === 'string' ? rawPassword : ''
  if (!email || !password) return html(renderLogin('missing'), 400)
  const data = readAdminData(context)
  if (!data) return html(renderLogin('not_configured'), 500)
  const { data: session, error } = await data.supabase.auth.signInWithPassword({
    email,
    password,
  })
  if (error || !session.user) return html(renderLogin('invalid'), 401)
  const appUser = await getAppUser(data.service, session.user.id)
  if (appUser?.is_active !== true) {
    await data.supabase.auth.signOut()
    return html(renderLogin('disabled'), 403)
  }
  await touchLastLogin(data.service, session.user.id)
  return Response.redirect(new URL('/admin', context.request.url).toString(), 303)
}