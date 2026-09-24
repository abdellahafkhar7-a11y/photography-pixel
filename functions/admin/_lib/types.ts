import type { SupabaseClient } from '@supabase/supabase-js'

export type Db = SupabaseClient<Database>

export type RoleKey = 'owner' | 'coordinator'

export type AppUsersRow = {
  id: string
  email: string
  full_name: string | null
  is_active: boolean
  last_login_at: string | null
  created_at: string
  roles: { key: string; name: string } | null
}

export type AppUsersInsert = {
  id: string
  email: string
  role_id: string
  full_name?: string | null
  is_active?: boolean
  last_login_at?: string | null
  created_by?: string | null
  created_at?: string
  updated_at?: string
}

export type AppUsersUpdate = {
  id?: string
  email?: string
  full_name?: string | null
  is_active?: boolean
  last_login_at?: string | null
  created_at?: string
  updated_at?: string
}

export type RolesRow = {
  id: string
  key: string
  name: string
  description: string | null
  created_at: string
}

export type RolesInsert = {
  id?: string
  key: string
  name: string
  description?: string | null
  created_at?: string
}

export type RolesUpdate = {
  id?: string
  key?: string
  name?: string
  description?: string | null
  created_at?: string
}

export type Database = {
  public: {
    Tables: {
      app_users: {
        Row: AppUsersRow
        Insert: AppUsersInsert
        Update: AppUsersUpdate
        Relationships: [
          {
            foreignKeyName: 'app_users_role_id_fkey'
            columns: ['role_id']
            isOneToOne: false
            referencedRelation: 'roles'
            referencedColumns: ['id']
          },
        ]
      }
      roles: {
        Row: RolesRow
        Insert: RolesInsert
        Update: RolesUpdate
        Relationships: []
      }
    }
    Views: Record<never, never>
    Functions: Record<never, never>
    Enums: Record<never, never>
    CompositeTypes: Record<never, never>
  }
}

export type AppUserRow = {
  id: string
  email: string
  full_name: string | null
  is_active: boolean
  last_login_at: string | null
  created_at: string
  role_key: RoleKey | 'unknown'
  role_name: string
}