import type { PagesFunction } from '@cloudflare/workers-types'
import { createServiceClient } from '../_lib/supabase'
import { html, requireOwner, requireSession } from './_lib/auth'
import { sameOrigin } from './_lib/security'
import type { Env } from './_lib/env'
import { renderTeam } from './_lib/team-views'
import {
  createTeamMember,
  listRoles,
  listTeamMembers,
  setUserActive,
  setUserRole,
  type RoleOption,
} from './_lib/team-data'

type AdminFunction = PagesFunction<Env, never, Record<string, unknown>>

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function page(
  appUser: Parameters<typeof renderTeam>[0],
  members: Parameters<typeof renderTeam>[1],
  roles: RoleOption[],
  options: Parameters<typeof renderTeam>[3] = {},
  status = 200,
): Response {
  const response = html(renderTeam(appUser, members, roles, options), status)
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('X-Robots-Tag', 'noindex')
  return response
}

export const onRequestGet: AdminFunction = async (context) => {
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser
  const forbidden = requireOwner(appUser)
  if (forbidden) return forbidden

  const service = createServiceClient(context.env)
  const members = service ? await listTeamMembers(service) : []
  const roles = service ? await listRoles(service) : []
  return page(appUser, members, roles)
}

export const onRequestPost: AdminFunction = async (context) => {
  if (!sameOrigin(context.request)) return html('<p>طلب غير صالح.</p>', 403)
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser
  const forbidden = requireOwner(appUser)
  if (forbidden) return forbidden

  const service = createServiceClient(context.env)
  if (!service) return page(appUser, [], [], { error: 'النظام غير مهيأ.' }, 500)

  const form = await context.request.formData()
  const action = str(form.get('action'))
  const roles = await listRoles(service)
  const roleByKey = new Map(roles.map((role) => [role.key as string, role]))

  let notice: string | undefined
  let error: string | undefined

  if (action === 'create') {
    const email = str(form.get('email')).toLowerCase()
    const password = typeof form.get('password') === 'string' ? (form.get('password') as string) : ''
    const fullName = str(form.get('full_name'))
    const roleKey = str(form.get('role'))
    const role = roleByKey.get(roleKey)

    if (!EMAIL_RE.test(email)) {
      error = 'أدخل بريدًا إلكترونيًا صالحًا.'
    } else if (password.length < 8) {
      error = 'كلمة المرور يجب أن تكون 8 أحرف على الأقل.'
    } else if (!role) {
      error = 'الدور المحدد غير صالح.'
    } else {
      const result = await createTeamMember(service, email, password, fullName, role.id)
      if (result.ok) notice = 'تم إنشاء الحساب بنجاح.'
      else error = result.error
    }

    const members = await listTeamMembers(service)
    return page(
      appUser,
      members,
      roles,
      { notice, error, values: { email, fullName, roleKey: roleKey || 'coordinator' } },
      error ? 400 : 200,
    )
  }

  const userId = str(form.get('user_id'))
  if (!UUID_RE.test(userId)) {
    return page(appUser, await listTeamMembers(service), roles, { error: 'معرّف غير صالح.' }, 400)
  }
  if (userId === appUser.id) {
    return page(
      appUser,
      await listTeamMembers(service),
      roles,
      { error: 'لا يمكنك تعديل حسابك الحالي من هنا.' },
      400,
    )
  }

  if (action === 'toggle') {
    const active = str(form.get('active')) === '1'
    const ok = await setUserActive(service, userId, active)
    if (ok) notice = active ? 'تم تفعيل الحساب.' : 'تم إيقاف الحساب.'
    else error = 'تعذّر تحديث حالة الحساب.'
  } else if (action === 'role') {
    const role = roleByKey.get(str(form.get('role')))
    if (!role) {
      error = 'الدور المحدد غير صالح.'
    } else {
      const ok = await setUserRole(service, userId, role.id)
      if (ok) notice = 'تم تحديث الدور.'
      else error = 'تعذّر تحديث الدور.'
    }
  } else {
    error = 'إجراء غير معروف.'
  }

  const members = await listTeamMembers(service)
  return page(appUser, members, roles, { notice, error }, error ? 400 : 200)
}
