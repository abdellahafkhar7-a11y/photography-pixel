export type DeliverySourceType = 'portfolio' | 'r2'

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
  is_active?: boolean
  role_id?: string
  last_login_at?: string | null
  updated_at?: string
}

export type ClientsRow = {
  id: string
  name: string
  whatsapp_number: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export type ClientsInsert = {
  id?: string
  name: string
  whatsapp_number: string
  created_by?: string | null
  created_at?: string
  updated_at?: string
}

export type ClientsUpdate = {
  name?: string
  whatsapp_number?: string
  updated_at?: string
}

export type DeliveriesRow = {
  id: string
  client_id: string
  created_by: string | null
  source_type: DeliverySourceType
  status: DeliveryStatus
  private_token_hash: string
  token_created_at: string
  token_expires_at: string | null
  confirmed_at: string | null
  downloaded_at: string | null
  download_expires_at: string | null
  expired_at: string | null
  created_at: string
  updated_at: string
}

export type DeliveriesInsert = {
  id?: string
  client_id: string
  created_by?: string | null
  source_type: DeliverySourceType
  status?: DeliveryStatus
  private_token_hash: string
  token_created_at?: string
  token_expires_at?: string | null
  confirmed_at?: string | null
  downloaded_at?: string | null
  download_expires_at?: string | null
  expired_at?: string | null
  created_at?: string
  updated_at?: string
}

export type DeliveriesUpdate = {
  status?: DeliveryStatus
  private_token_hash?: string
  token_created_at?: string
  token_expires_at?: string | null
  confirmed_at?: string | null
  downloaded_at?: string | null
  download_expires_at?: string | null
  expired_at?: string | null
  updated_at?: string
}

export type DeliveryVideosRow = {
  id: string
  delivery_id: string
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
  created_by: string | null
  created_at: string
}

export type DeliveryVideosInsert = {
  id?: string
  delivery_id: string
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
  created_by?: string | null
  created_at?: string
}

export type DeliveryVideosUpdate = {
  is_active?: boolean
  r2_preview_key?: string | null
  r2_thumb_key?: string | null
  original_deleted_at?: string | null
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
        Relationships: []
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
    }
    CompositeTypes: Record<never, never>
  }
}