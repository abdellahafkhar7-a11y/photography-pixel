export type DeliverySourceType = 'portfolio' | 'r2'

export type DeliveryMode = 'VIEW_ONLY' | 'VIEW_AND_DOWNLOAD'

export type ClientStatus = 'active' | 'archived'

export type SlotStatus = 'planned' | 'active' | 'paused'

export type ProjectStatus =
  | 'new'
  | 'contacted'
  | 'booked'
  | 'shooting'
  | 'editing'
  | 'review'
  | 'delivery'
  | 'completed'
  | 'archived'

export type KanbanStatus = 'todo' | 'editing' | 'review' | 'ready' | 'done'

export type TaskStatus = 'todo' | 'in_progress' | 'done'

export type TaskPriority = 'low' | 'medium' | 'high'

export type PaymentStatus = 'unpaid' | 'partial' | 'paid'

export type DeliveryStatus =
  | 'pending'
  | 'preview_viewed'
  | 'confirmed'
  | 'download_available'
  | 'downloaded'
  | 'expired'

export type DeliveryActivityType =
  | 'delivery_created'
  | 'link_opened'
  | 'preview_viewed'
  | 'video_confirmed'
  | 'download_started'
  | 'download_completed'
  | 'delivery_expired'
  | 'original_deleted'
  | 'reuploaded'
  | 'version_created'
  | 'delivery_archived'
  | 'delivery_unarchived'
  | 'version_archived'
  | 'version_deleted'
  | 'delivery_mode_changed'
  | 'delivery_released'

export type RoleKey = 'owner' | 'coordinator'

export type RolesRow = {
  id: string
  key: RoleKey
  name: string
  description: string | null
  created_at: string
}

export type AppUsersRow = {
  id: string
  email: string
  full_name: string | null
  avatar_key: string | null
  is_active: boolean
  last_login_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  roles: Pick<RolesRow, 'key' | 'name'> | null
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
  email?: string
  full_name?: string | null
  avatar_key?: string | null
  is_active?: boolean
  role_id?: string
  last_login_at?: string | null
  updated_at?: string
}

export type ClientsRow = {
  id: string
  name: string
  whatsapp_number: string
  status: ClientStatus
  model_id: string | null
  video_slots_count: number
  delivery_mode: DeliveryMode
  script: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type ClientsInsert = {
  id?: string
  name: string
  whatsapp_number: string
  status?: ClientStatus
  model_id?: string | null
  video_slots_count?: number
  delivery_mode?: DeliveryMode
  script?: string | null
  created_by?: string | null
  created_at?: string
  updated_at?: string
}

export type ClientsUpdate = {
  name?: string
  whatsapp_number?: string
  status?: ClientStatus
  model_id?: string | null
  video_slots_count?: number
  delivery_mode?: DeliveryMode
  script?: string | null
  updated_at?: string
}

export type ModelsRow = {
  id: string
  name: string
  photo: string | null
  whatsapp_number: string | null
  available: boolean
  created_at: string
  updated_at: string
}

export type ModelsInsert = {
  id?: string
  name: string
  photo?: string | null
  whatsapp_number?: string | null
  available?: boolean
  created_at?: string
  updated_at?: string
}

export type ModelsUpdate = {
  name?: string
  photo?: string | null
  whatsapp_number?: string | null
  available?: boolean
  updated_at?: string
}

export type ClientVideoSlotsRow = {
  id: string
  client_id: string
  position: number
  title: string
  status: SlotStatus
  project_id: string | null
  kanban_status: KanbanStatus
  kanban_order: number
  notes: string | null
  label: string | null
  deadline: string | null
  created_at: string
  updated_at: string
}

export type ClientVideoSlotsInsert = {
  id?: string
  client_id: string
  position: number
  title: string
  status?: SlotStatus
  project_id?: string | null
  kanban_status?: KanbanStatus
  kanban_order?: number
  notes?: string | null
  label?: string | null
  deadline?: string | null
  created_at?: string
  updated_at?: string
}

export type ClientVideoSlotsUpdate = {
  title?: string
  status?: SlotStatus
  project_id?: string | null
  kanban_status?: KanbanStatus
  kanban_order?: number
  notes?: string | null
  label?: string | null
  deadline?: string | null
  updated_at?: string
}

export type DeliveriesRow = {
  id: string
  client_id: string | null
  created_by: string | null
  source_type: DeliverySourceType
  delivery_mode: DeliveryMode
  status: DeliveryStatus
  private_token_hash: string
  token_created_at: string
  token_expires_at: string | null
  confirmed_at: string | null
  downloaded_at: string | null
  download_expires_at: string | null
  expired_at: string | null
  client_visible_id: string | null
  archived_at: string | null
  client_video_slot_id: string | null
  created_at: string
  updated_at: string
}

export type DeliveriesInsert = {
  id?: string
  client_id?: string | null
  created_by?: string | null
  source_type: DeliverySourceType
  delivery_mode?: DeliveryMode
  status?: DeliveryStatus
  private_token_hash: string
  token_created_at?: string
  token_expires_at?: string | null
  confirmed_at?: string | null
  downloaded_at?: string | null
  download_expires_at?: string | null
  expired_at?: string | null
  client_visible_id?: string | null
  archived_at?: string | null
  client_video_slot_id?: string | null
  created_at?: string
  updated_at?: string
}

export type DeliveriesUpdate = {
  client_id?: string | null
  delivery_mode?: DeliveryMode
  status?: DeliveryStatus
  private_token_hash?: string
  token_created_at?: string
  token_expires_at?: string | null
  confirmed_at?: string | null
  downloaded_at?: string | null
  download_expires_at?: string | null
  expired_at?: string | null
  client_visible_id?: string | null
  archived_at?: string | null
  client_video_slot_id?: string | null
  updated_at?: string
}

export type DeliveryVideosRow = {
  id: string
  delivery_id: string
  item_pos: number
  version: number
  is_active: boolean
  source_type: DeliverySourceType
  portfolio_url: string | null
  r2_original_key: string | null
  r2_preview_key: string | null
  r2_thumb_key: string | null
  original_filename: string | null
  mime_type: string | null
  size_bytes: number | null
  original_deleted_at: string | null
  confirmed_at: string | null
  download_released_at: string | null
  downloaded_at: string | null
  download_expires_at: string | null
  expired_at: string | null
  archived_at: string | null
  created_by: string | null
  created_at: string
}

export type DeliveryVideosInsert = {
  id?: string
  delivery_id: string
  item_pos?: number
  version: number
  is_active?: boolean
  source_type: DeliverySourceType
  portfolio_url?: string | null
  r2_original_key?: string | null
  r2_preview_key?: string | null
  r2_thumb_key?: string | null
  original_filename?: string | null
  mime_type?: string | null
  size_bytes?: number | null
  original_deleted_at?: string | null
  confirmed_at?: string | null
  download_released_at?: string | null
  downloaded_at?: string | null
  download_expires_at?: string | null
  expired_at?: string | null
  archived_at?: string | null
  created_by?: string | null
  created_at?: string
}

export type DeliveryVideosUpdate = {
  is_active?: boolean
  r2_preview_key?: string | null
  r2_thumb_key?: string | null
  original_deleted_at?: string | null
  confirmed_at?: string | null
  download_released_at?: string | null
  downloaded_at?: string | null
  download_expires_at?: string | null
  expired_at?: string | null
  archived_at?: string | null
}

export type DeliveryActivityRow = {
  id: string
  delivery_id: string
  type: DeliveryActivityType
  metadata: Record<string, unknown> | null
  created_at: string
}

export type DeliveryActivityInsert = {
  id?: string
  delivery_id: string
  type: DeliveryActivityType
  metadata?: Record<string, unknown> | null
  created_at?: string
}

export type ProjectsRow = {
  id: string
  client_id: string
  name: string
  project_code: string
  status: ProjectStatus
  status_prior: ProjectStatus | null
  model_id: string | null
  planned_video_count: number
  shoot_date: string | null
  shoot_time: string | null
  location: string | null
  script: string | null
  notes: string | null
  total_price: number | null
  advance: number | null
  payment_status: PaymentStatus
  created_by: string | null
  created_at: string
  updated_at: string
  archived_at: string | null
}

export type ProjectsInsert = {
  id?: string
  client_id: string
  name: string
  project_code: string
  status?: ProjectStatus
  status_prior?: ProjectStatus | null
  model_id?: string | null
  planned_video_count?: number
  shoot_date?: string | null
  shoot_time?: string | null
  location?: string | null
  script?: string | null
  notes?: string | null
  total_price?: number | string | null
  advance?: number | string | null
  payment_status?: PaymentStatus
  created_by?: string | null
  created_at?: string
  updated_at?: string
  archived_at?: string | null
}

export type ProjectsUpdate = {
  name?: string
  status?: ProjectStatus
  status_prior?: ProjectStatus | null
  model_id?: string | null
  planned_video_count?: number
  shoot_date?: string | null
  shoot_time?: string | null
  location?: string | null
  script?: string | null
  notes?: string | null
  total_price?: number | string | null
  advance?: number | string | null
  payment_status?: PaymentStatus
  updated_at?: string
  archived_at?: string | null
}

export type ProjectTasksRow = {
  id: string
  project_id: string
  client_video_slot_id: string | null
  title: string
  status: TaskStatus
  priority: TaskPriority
  assignee_id: string | null
  due_date: string | null
  sort_order: number
  completed_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type ProjectTasksInsert = {
  id?: string
  project_id: string
  client_video_slot_id?: string | null
  title: string
  status?: TaskStatus
  priority?: TaskPriority
  assignee_id?: string | null
  due_date?: string | null
  sort_order?: number
  completed_at?: string | null
  created_by?: string | null
  created_at?: string
  updated_at?: string
}

export type ProjectTasksUpdate = {
  title?: string
  status?: TaskStatus
  client_video_slot_id?: string | null
  priority?: TaskPriority
  assignee_id?: string | null
  due_date?: string | null
  sort_order?: number
  completed_at?: string | null
  updated_at?: string
}

export type ProjectActivityRow = {
  id: string
  project_id: string
  type: string
  metadata: Record<string, unknown> | null
  created_at: string
}

export type ProjectActivityInsert = {
  id?: string
  project_id: string
  type: string
  metadata?: Record<string, unknown> | null
  created_at?: string
}

export type Database = {
  public: {
    Tables: {
      roles: {
        Row: RolesRow
        Insert: RolesRow
        Update: never
        Relationships: []
      }
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
      clients: {
        Row: ClientsRow
        Insert: ClientsInsert
        Update: ClientsUpdate
        Relationships: [
          {
            foreignKeyName: 'clients_model_id_fkey'
            columns: ['model_id']
            isOneToOne: false
            referencedRelation: 'models'
            referencedColumns: ['id']
          },
        ]
      }
      models: {
        Row: ModelsRow
        Insert: ModelsInsert
        Update: ModelsUpdate
        Relationships: []
      }
      client_video_slots: {
        Row: ClientVideoSlotsRow
        Insert: ClientVideoSlotsInsert
        Update: ClientVideoSlotsUpdate
        Relationships: [
          {
            foreignKeyName: 'client_video_slots_client_id_fkey'
            columns: ['client_id']
            isOneToOne: false
            referencedRelation: 'clients'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'client_video_slots_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          },
        ]
      }
      projects: {
        Row: ProjectsRow
        Insert: ProjectsInsert
        Update: ProjectsUpdate
        Relationships: [
          {
            foreignKeyName: 'projects_client_id_fkey'
            columns: ['client_id']
            isOneToOne: false
            referencedRelation: 'clients'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'projects_model_id_fkey'
            columns: ['model_id']
            isOneToOne: false
            referencedRelation: 'models'
            referencedColumns: ['id']
          },
        ]
      }
      project_tasks: {
        Row: ProjectTasksRow
        Insert: ProjectTasksInsert
        Update: ProjectTasksUpdate
        Relationships: [
          {
            foreignKeyName: 'project_tasks_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'project_tasks_assignee_id_fkey'
            columns: ['assignee_id']
            isOneToOne: false
            referencedRelation: 'app_users'
            referencedColumns: ['id']
          },
        ]
      }
      project_activity: {
        Row: ProjectActivityRow
        Insert: ProjectActivityInsert
        Update: never
        Relationships: [
          {
            foreignKeyName: 'project_activity_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          },
        ]
      }
      deliveries: {
        Row: DeliveriesRow
        Insert: DeliveriesInsert
        Update: DeliveriesUpdate
        Relationships: [
          {
            foreignKeyName: 'deliveries_client_id_fkey'
            columns: ['client_id']
            isOneToOne: false
            referencedRelation: 'clients'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'deliveries_client_video_slot_id_fkey'
            columns: ['client_video_slot_id']
            isOneToOne: false
            referencedRelation: 'client_video_slots'
            referencedColumns: ['id']
          },
        ]
      }
      delivery_videos: {
        Row: DeliveryVideosRow
        Insert: DeliveryVideosInsert
        Update: DeliveryVideosUpdate
        Relationships: [
          {
            foreignKeyName: 'delivery_videos_delivery_id_fkey'
            columns: ['delivery_id']
            isOneToOne: false
            referencedRelation: 'deliveries'
            referencedColumns: ['id']
          },
        ]
      }
      delivery_activity: {
        Row: DeliveryActivityRow
        Insert: DeliveryActivityInsert
        Update: never
        Relationships: [
          {
            foreignKeyName: 'delivery_activity_delivery_id_fkey'
            columns: ['delivery_id']
            isOneToOne: false
            referencedRelation: 'deliveries'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: Record<never, never>
    Functions: Record<never, never>
    Enums: {
      delivery_source_type: DeliverySourceType
      delivery_status: DeliveryStatus
      delivery_activity_type: DeliveryActivityType
      delivery_mode: DeliveryMode
      client_status: ClientStatus
      slot_status: SlotStatus
      project_status: ProjectStatus
      kanban_status: KanbanStatus
      task_status: TaskStatus
      task_priority: TaskPriority
      payment_status: PaymentStatus
    }
    CompositeTypes: Record<never, never>
  }
}