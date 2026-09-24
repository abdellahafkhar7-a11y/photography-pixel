import type { AppUsersRow, AppUserRow, RoleKey } from './types'
import type { Db } from './supabase'

const APP_USER_SELECT =
  'id,email,full_name,is_active,last_login_at,created_at,roles(key,name)'

function mapAppUser(row: AppUsersRow): AppUserRow {
  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    is_active: row.is_active,
    last_login_at: row.last_login_at,
    created_at: row.created_at,
    role_key: (row.roles?.key as RoleKey) ?? 'unknown',
    role_name: row.roles?.name ?? '',
  }
}

export async function getAppUser(client: Db, userId: string): Promise<AppUserRow | null> {
  const { data, error } = await client
    .from('app_users')
    .select(APP_USER_SELECT)
    .eq('id', userId)
    .maybeSingle<AppUsersRow>()
  if (error || !data) return null
  return mapAppUser(data)
}

export async function listTeam(client: Db): Promise<AppUserRow[]> {
  const { data, error } = await client
    .from('app_users')
    .select(APP_USER_SELECT)
    .order('created_at', { ascending: true })
  if (error || !data) return []
  return data.map((row) => mapAppUser(row))
}

export async function touchLastLogin(client: Db, userId: string): Promise<void> {
  await client.from('app_users').update({ last_login_at: new Date().toISOString() }).eq('id', userId)
}