import type { Db } from '../../_lib/supabase'
import type { AppUserRow, AppUsersRow, RoleKey } from './types'

//============================================================================
// Phase 4G — Team data access. All writes go through the service role; the
// Supabase Auth admin API is used to create accounts so no password is ever
// stored or logged by this application.
//============================================================================

const APP_USER_SELECT =
  'id,email,full_name,avatar_key,is_active,last_login_at,created_at,roles(key,name)'

function mapAppUser(row: AppUsersRow): AppUserRow {
  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    avatar_key: row.avatar_key,
    is_active: row.is_active,
    last_login_at: row.last_login_at,
    created_at: row.created_at,
    role_key: (row.roles?.key as RoleKey) ?? 'unknown',
    role_name: row.roles?.name ?? '',
  }
}

export type RoleOption = {
  id: string
  key: RoleKey
  name: string
}

export type CreateTeamResult =
  | { ok: true; userId: string }
  | { ok: false; error: string }

export async function listTeamMembers(client: Db): Promise<AppUserRow[]> {
  const { data, error } = await client
    .from('app_users')
    .select(APP_USER_SELECT)
    .order('created_at', { ascending: true })
  if (error || !data) return []
  return data.map((row) => mapAppUser(row))
}

export async function listRoles(client: Db): Promise<RoleOption[]> {
  const { data, error } = await client.from('roles').select('id,key,name')
  if (error || !data) return []
  return data.map((row) => ({ id: row.id, key: row.key, name: row.name }))
}

export async function setUserActive(client: Db, userId: string, active: boolean): Promise<boolean> {
  const { error } = await client.from('app_users').update({ is_active: active }).eq('id', userId)
  return !error
}

export async function setUserRole(client: Db, userId: string, roleId: string): Promise<boolean> {
  const { error } = await client.from('app_users').update({ role_id: roleId }).eq('id', userId)
  return !error
}

export async function createTeamMember(
  client: Db,
  email: string,
  password: string,
  fullName: string,
  roleId: string,
): Promise<CreateTeamResult> {
  const { data, error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })
  if (error || !data.user) {
    const message = error?.message ?? ''
    if (/already|exist|registered/i.test(message)) {
      return { ok: false, error: 'هذا البريد الإلكتروني مسجّل بالفعل.' }
    }
    return { ok: false, error: 'تعذّر إنشاء الحساب. تحقّق من صحة البيانات وحاول مرة أخرى.' }
  }

  const userId = data.user.id
  const { error: profileError } = await client
    .from('app_users')
    .update({ full_name: fullName || null, role_id: roleId, is_active: true })
    .eq('id', userId)

  if (profileError) {
    return { ok: false, error: 'تم إنشاء الحساب لكن تعذّر ضبط الملف الشخصي.' }
  }
  return { ok: true, userId }
}
