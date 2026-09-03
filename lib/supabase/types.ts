export type RoomStatus    = 'waiting' | 'active' | 'closed'
export type MessageType   = 'text' | 'image' | 'voice'

// ── Exact DB column shapes ────────────────────────────────────────────────

export interface Room {
  id: string
  name: string
  status: RoomStatus
  expires_at: string | null
  created_at: string
  updated_at: string
}

export interface Visitor {
  id: string
  ip_hash: string | null
  user_agent: string | null
  fingerprint: string | null     // Persistent silent Canvas/WebGL/Hardware hash
  device_info: string | null    // Screen res, language, timezone, CPU cores, RAM, OS
  first_seen: string
  last_seen: string
}

export interface Session {
  id: string
  visitor_id: string
  username: string
  started_at: string
  last_seen: string
  ended_at: string | null
  is_active: boolean
}

export interface RoomMember {
  id: string
  room_id: string
  session_id: string
  username: string
  is_active: boolean           // BOOLEAN column (not a text status)
  joined_at: string
  left_at: string | null
}

export interface Message {
  id: string
  room_id: string
  sender_session_id: string    // actual column name in DB
  message_type: MessageType
  content: string | null
  storage_path: string | null
  created_at: string
  seen_at: string | null       // NULL = unseen; non-null = seen timestamp
  expires_at: string | null
  one_time_view: boolean
  viewed_at: string | null
  admin_preserved: boolean
}

export interface Admin {
  user_id: string
}

// ── UI-enriched ───────────────────────────────────────────────────────────
export interface MessageWithMeta extends Message {
  is_own?: boolean
}

// ── Supabase Database type ────────────────────────────────────────────────
// Row types need to satisfy GenericTable.Row = Record<string, unknown>.
// In TypeScript strict mode, named interfaces don't automatically satisfy
// index signatures, so we use an intersection with Record<string, unknown>.
type AsRow<T> = T & Record<string, unknown>

// Make nullable columns optional in Insert types (they have DB defaults)
type InsertRow<T> = AsRow<{
  [K in keyof T as null extends T[K] ? never : K]: T[K]
} & {
  [K in keyof T as null extends T[K] ? K : never]?: T[K]
}>

export interface Database {
  public: {
    Tables: {
      rooms: {
        Row: AsRow<Room>
        Insert: InsertRow<Omit<Room, 'id' | 'created_at' | 'updated_at'>>
        Update: AsRow<Partial<Omit<Room, 'id'>>>
        Relationships: []
      }
      visitors: {
        Row: AsRow<Visitor>
        Insert: InsertRow<Omit<Visitor, 'id' | 'first_seen' | 'last_seen'>>
        Update: AsRow<Partial<Omit<Visitor, 'id'>>>
        Relationships: []
      }
      sessions: {
        Row: AsRow<Session>
        Insert: InsertRow<Omit<Session, 'id' | 'started_at' | 'last_seen'>>
        Update: AsRow<Partial<Omit<Session, 'id'>>>
        Relationships: []
      }
      room_members: {
        Row: AsRow<RoomMember>
        Insert: InsertRow<Omit<RoomMember, 'id' | 'joined_at'>>
        Update: AsRow<Partial<Omit<RoomMember, 'id'>>>
        Relationships: []
      }
      messages: {
        Row: AsRow<Message>
        Insert: InsertRow<Omit<Message, 'id' | 'created_at'>>
        Update: AsRow<Partial<Omit<Message, 'id'>>>
        Relationships: []
      }
      admins: {
        Row: AsRow<Admin>
        Insert: AsRow<Admin>
        Update: AsRow<Partial<Admin>>
        Relationships: []
      }
    }
    Views: Record<never, never>
    Functions: Record<never, never>
  }
}

// ── Legacy aliases (kept for any remaining references) ────────────────────
/** @deprecated Use Visitor */
export type AnonymousVisitor = Visitor
/** @deprecated Use Session */
export type UserSession = Session
