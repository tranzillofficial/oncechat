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

export interface Database {
  public: {
    Tables: {
      rooms: {
        Row: Room
        Insert: Omit<Room, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Room, 'id'>>
      }
      visitors: {
        Row: Visitor
        Insert: Omit<Visitor, 'id' | 'first_seen' | 'last_seen'>
        Update: Partial<Omit<Visitor, 'id'>>
      }
      sessions: {
        Row: Session
        Insert: Omit<Session, 'id' | 'started_at' | 'last_seen'>
        Update: Partial<Omit<Session, 'id'>>
      }
      room_members: {
        Row: RoomMember
        Insert: Omit<RoomMember, 'id' | 'joined_at'>
        Update: Partial<Omit<RoomMember, 'id'>>
      }
      messages: {
        Row: Message
        Insert: Omit<Message, 'id' | 'created_at'>
        Update: Partial<Omit<Message, 'id'>>
      }
      admins: {
        Row: Admin
        Insert: Admin
        Update: Partial<Admin>
      }
    }
  }
}

// ── Legacy aliases (kept for any remaining references) ────────────────────
/** @deprecated Use Visitor */
export type AnonymousVisitor = Visitor
/** @deprecated Use Session */
export type UserSession = Session
