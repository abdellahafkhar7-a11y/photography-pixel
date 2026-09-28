import type { SupabaseClient } from '@supabase/supabase-js'

export type Db = SupabaseClient<Database>

export type RoleKey = 'owner' | 'coordinator'

export type AppUsersRow = {
  id: string
  email: string
  full_name: string | null
  avatar_key: string | null
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
  avatar_key?: string | null
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

//--------------------------------------------------------------------------
// Phase 4O — project CRM workspace (admin-side types; queries go through the
// shared service client in functions/_lib, but keeping the admin Database
// current lets admin/auth code read the same tables when needed).
//--------------------------------------------------------------------------

export type AdminProjectStatus =
  | 'new'
  | 'contacted'
  | 'booked'
  | 'shooting'
  | 'editing'
  | 'review'
  | 'delivery'
  | 'completed'
  | 'archived'

export type AdminKanbanStatus = 'todo' | 'editing' | 'review' | 'ready' | 'done'

export type AdminTaskStatus = 'todo' | 'in_progress' | 'done'

export type AdminTaskPriority = 'low' | 'medium' | 'high'

export type AdminPaymentStatus = 'unpaid' | 'partial' | 'paid'

export type AdminProjectsRow = {
  id: string
  client_id: string
  name: string
  project_code: string
  status: AdminProjectStatus
  status_prior: AdminProjectStatus | null
  model_id: string | null
  planned_video_count: number
  shoot_date: string | null
  shoot_time: string | null
  location: string | null
  script: string | null
  notes: string | null
  total_price: number | null
  advance: number | null
  payment_status: AdminPaymentStatus
  created_by: string | null
  created_at: string
  updated_at: string
  archived_at: string | null
}

export type AdminClientVideoSlotsRow = {
  id: string
  client_id: string
  position: number
  title: string
  status: string
  project_id: string | null
  kanban_status: AdminKanbanStatus
  kanban_order: number
  notes: string | null
  created_at: string
  updated_at: string
}

export type AdminProjectTasksRow = {
  id: string
  project_id: string
  title: string
  status: AdminTaskStatus
  priority: AdminTaskPriority
  assignee_id: string | null
  due_date: string | null
  sort_order: number
  completed_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type AdminProjectActivityRow = {
  id: string
  project_id: string
  type: string
  metadata: Record<string, unknown> | null
  created_at: string
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
      projects: {
        Row: AdminProjectsRow
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
        Relationships: []
      }
      client_video_slots: {
        Row: AdminClientVideoSlotsRow
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
        Relationships: []
      }
      project_tasks: {
        Row: AdminProjectTasksRow
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
        Relationships: []
      }
      project_activity: {
        Row: AdminProjectActivityRow
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
        Relationships: []
      }
    }
    Views: Record<never, never>
    Functions: Record<never, never>
    Enums: {
      project_status: AdminProjectStatus
      kanban_status: AdminKanbanStatus
      task_status: AdminTaskStatus
      task_priority: AdminTaskPriority
      payment_status: AdminPaymentStatus
    }
    CompositeTypes: Record<never, never>
  }
}

export type AppUserRow = {
  id: string
  email: string
  full_name: string | null
  avatar_key: string | null
  is_active: boolean
  last_login_at: string | null
  created_at: string
  role_key: RoleKey | 'unknown'
  role_name: string
}