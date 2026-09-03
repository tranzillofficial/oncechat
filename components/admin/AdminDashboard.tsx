'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Room, Session, RoomMember, Visitor, Message } from '@/lib/supabase/types'
import MessageList from '@/components/chat/MessageList'

type Tab = 'rooms' | 'sessions' | 'visitors' | 'messages' | 'media'

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleString()
}

function hoursLeft(expiresAt: string | null) {
  if (!expiresAt) return null
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 3600000))
}

function Badge({
  children,
  color = 'default',
}: {
  children: React.ReactNode
  color?: 'green' | 'red' | 'yellow' | 'purple' | 'default'
}) {
  const styles: Record<string, { background: string; color: string }> = {
    green:   { background: 'rgba(16,185,129,0.15)',  color: '#10b981' },
    red:     { background: 'rgba(239,68,68,0.15)',   color: '#ef4444' },
    yellow:  { background: 'rgba(245,158,11,0.15)',  color: '#f59e0b' },
    purple:  { background: 'rgba(124,58,237,0.2)',   color: '#8b5cf6' },
    default: { background: 'var(--surface-2)',       color: 'var(--text-secondary)' },
  }
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={styles[color]}>
      {children}
    </span>
  )
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--border)' }}>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
            {headers.map((h) => (
              <th key={h} className="text-left px-4 py-3 text-xs font-semibold whitespace-nowrap"
                style={{ color: 'var(--text-secondary)' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function Tr({ children }: { children: React.ReactNode }) {
  return (
    <tr
      style={{ borderBottom: '1px solid var(--border)' }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = 'var(--surface)')}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
    >
      {children}
    </tr>
  )
}

function Td({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <td className={`px-4 py-3 ${mono ? 'font-mono text-xs' : ''}`} style={{ color: 'var(--text-primary)' }}>
      {children}
    </td>
  )
}

// ─── Room detail modal with message history ────────────────────────────────
function RoomHistoryModal({
  room,
  messages,
  onClose,
}: {
  room: Room
  messages: Message[]
  onClose: () => void
}) {
  const roomMessages = messages.filter((m) => m.room_id === room.id)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="flex flex-col w-full max-w-xl h-[80vh] rounded-2xl overflow-hidden"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
            Room: {room.name}
          </h2>
          <button onClick={onClose} style={{ color: 'var(--text-secondary)' }} aria-label="Close">✕</button>
        </div>
        <MessageList
          messages={roomMessages as never}
          sessionId="__admin__"
          currentUsername="__admin__"
          adminView
        />
      </div>
    </div>
  )
}

export default function AdminDashboard() {
  const router = useRouter()
  const supabase = createClient()

  const [tab, setTab] = useState<Tab>('rooms')
  const [search, setSearch] = useState('')
  const [rooms, setRooms] = useState<Room[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [members, setMembers] = useState<RoomMember[]>([])
  const [visitors, setVisitors] = useState<Visitor[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [preservingId, setPreservingId] = useState<string | null>(null)
  const [deletingId,   setDeletingId]   = useState<string | null>(null)
  const [roomModal, setRoomModal] = useState<Room | null>(null)
  const [authToken, setAuthToken] = useState<string | null>(null)

  // Grab the session token for preserve-media requests
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthToken(data.session?.access_token ?? null)
      if (!data.session) router.push('/admin')
    })
  }, [supabase, router])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [roomsRes, sessionsRes, visitorsRes, membersRes, messagesRes] = await Promise.all([
        supabase.from('rooms').select('*').order('created_at', { ascending: false }).limit(100),
        // Table: sessions, ordered by started_at
        supabase.from('sessions').select('*').order('started_at', { ascending: false }).limit(200),
        // Table: visitors
        supabase.from('visitors').select('*').order('first_seen', { ascending: false }).limit(100),
        supabase.from('room_members').select('*').order('joined_at', { ascending: false }).limit(200),
        supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(500),
      ])
      if (roomsRes.data)    setRooms(roomsRes.data)
      if (sessionsRes.data) setSessions(sessionsRes.data)
      if (visitorsRes.data) setVisitors(visitorsRes.data)
      if (membersRes.data)  setMembers(membersRes.data)
      if (messagesRes.data) setMessages(messagesRes.data)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => { loadData() }, [loadData])

  async function handlePreserve(messageId: string, preserve: boolean) {
    if (!authToken) return
    setPreservingId(messageId)
    try {
      await fetch('/api/admin/preserve-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ messageId, preserve }),
      })
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, admin_preserved: preserve, expires_at: preserve ? null : m.expires_at }
            : m
        )
      )
    } finally {
      setPreservingId(null)
    }
  }

  async function handleDeleteMedia(messageId: string) {
    if (!authToken) return
    if (!confirm('Delete this media permanently? This cannot be undone.')) return
    setDeletingId(messageId)
    try {
      const res = await fetch('/api/admin/delete-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ messageId }),
      })
      if (res.ok) {
        // Remove from local list — storage is gone, no point keeping the row visible
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, storage_path: null, expires_at: null } : m
          )
        )
      }
    } finally {
      setDeletingId(null)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/admin')
  }

  // ── Filtered lists ──────────────────────────────────────────────────────
  const q = search.toLowerCase()
  const filteredRooms    = rooms.filter((r) => !q || r.name.toLowerCase().includes(q))
  const filteredSessions = sessions.filter((s) => !q || s.username.toLowerCase().includes(q) || s.id.includes(q))
  const filteredVisitors = visitors.filter((v) => !q || (v.ip_hash ?? '').toLowerCase().includes(q))
  const filteredMessages = messages.filter(
    (m) => !q || (m.content ?? '').toLowerCase().includes(q)
  )
  const mediaMessages = messages.filter((m) => m.message_type !== 'text')

  const TABS: { id: Tab; label: string; count: number }[] = [
    { id: 'rooms',    label: 'Rooms',    count: rooms.length },
    { id: 'sessions', label: 'Sessions', count: sessions.length },
    { id: 'visitors', label: 'Visitors', count: visitors.length },
    { id: 'messages', label: 'Messages', count: messages.length },
    { id: 'media',    label: 'Media',    count: mediaMessages.length },
  ]

  return (
    <div className="min-h-full flex flex-col" style={{ background: 'var(--background)' }}>
      {/* Top bar */}
      <header
        className="flex items-center justify-between px-6 py-4 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}
      >
        <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          Ranchat Admin
        </h1>
        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            disabled={loading}
            className="text-sm px-3 py-1.5 rounded-lg transition-opacity disabled:opacity-50"
            style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <button
            onClick={handleLogout}
            className="text-sm px-3 py-1.5 rounded-lg"
            style={{ color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.3)' }}
          >
            Logout
          </button>
        </div>
      </header>

      <div className="flex-1 px-6 py-6 flex flex-col gap-6">
        {/* Search */}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search usernames, room names, IP hashes…"
          className="w-full max-w-md h-10 rounded-xl px-3.5 text-sm outline-none"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          aria-label="Search"
        />

        {/* Tabs */}
        <div className="flex gap-1 flex-wrap" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium"
              style={
                tab === t.id
                  ? { background: 'var(--accent)', color: '#fff' }
                  : { background: 'var(--surface)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }
              }
            >
              {t.label}
              <span
                className="px-1.5 py-0.5 rounded-full text-xs"
                style={
                  tab === t.id
                    ? { background: 'rgba(255,255,255,0.2)', color: '#fff' }
                    : { background: 'var(--surface-2)', color: 'var(--text-secondary)' }
                }
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {/* ── ROOMS ── */}
        {tab === 'rooms' && (
          <Table headers={['Name', 'Status', 'Active Members', 'Created', 'Updated', 'History']}>
            {filteredRooms.map((r) => {
              // is_active (boolean) — not status text
              const active = members.filter((m) => m.room_id === r.id && m.is_active).length
              return (
                <Tr key={r.id}>
                  <Td mono>{r.name}</Td>
                  <Td>
                    <Badge color={r.status === 'active' ? 'green' : r.status === 'closed' ? 'red' : 'yellow'}>
                      {r.status}
                    </Badge>
                  </Td>
                  <Td>{active}</Td>
                  <Td><span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{formatDate(r.created_at)}</span></Td>
                  <Td><span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{formatDate(r.updated_at)}</span></Td>
                  <Td>
                    <button
                      onClick={() => setRoomModal(r)}
                      className="text-xs px-2 py-1 rounded-lg"
                      style={{ color: 'var(--accent-light)', border: '1px solid rgba(124,58,237,0.3)' }}
                    >
                      View
                    </button>
                  </Td>
                </Tr>
              )
            })}
            {filteredRooms.length === 0 && <Tr><Td><span style={{ color: 'var(--text-secondary)' }}>No rooms</span></Td></Tr>}
          </Table>
        )}

        {/* ── SESSIONS ── */}
        {tab === 'sessions' && (
          <Table headers={['Username', 'Session ID', 'Visitor ID', 'Started', 'Last Seen', 'Active']}>
            {filteredSessions.map((s) => (
              <Tr key={s.id}>
                <Td><span className="font-medium">{s.username}</span></Td>
                <Td mono>{s.id.slice(0, 8)}…</Td>
                <Td mono>{s.visitor_id.slice(0, 8)}…</Td>
                {/* started_at — correct column name */}
                <Td><span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{formatDate(s.started_at)}</span></Td>
                {/* last_seen — correct column name */}
                <Td><span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{formatDate(s.last_seen)}</span></Td>
                <Td>
                  <Badge color={s.is_active ? 'green' : 'default'}>{s.is_active ? 'Yes' : 'No'}</Badge>
                </Td>
              </Tr>
            ))}
            {filteredSessions.length === 0 && <Tr><Td><span style={{ color: 'var(--text-secondary)' }}>No sessions</span></Td></Tr>}
          </Table>
        )}

        {/* ── VISITORS ── */}
        {tab === 'visitors' && (
          <Table headers={['IP Hash', 'User Agent', 'First Seen', 'Last Seen']}>
            {filteredVisitors.map((v) => (
              <Tr key={v.id}>
                <Td mono>{v.ip_hash}</Td>
                <Td>
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }} title={v.user_agent ?? ''}>
                    {v.user_agent ? v.user_agent.slice(0, 60) + (v.user_agent.length > 60 ? '…' : '') : '—'}
                  </span>
                </Td>
                <Td><span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{formatDate(v.first_seen)}</span></Td>
                <Td><span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{formatDate(v.last_seen)}</span></Td>
              </Tr>
            ))}
            {filteredVisitors.length === 0 && <Tr><Td><span style={{ color: 'var(--text-secondary)' }}>No visitors</span></Td></Tr>}
          </Table>
        )}

        {/* ── MESSAGES ── */}
        {tab === 'messages' && (
          <Table headers={['Room', 'Type', 'Content', 'Seen', 'Sent At']}>
            {filteredMessages.map((m) => {
              const room = rooms.find((r) => r.id === m.room_id)
              // seen_at — non-null means seen
              const seen = !!m.seen_at
              return (
                <Tr key={m.id}>
                  <Td mono>{room?.name ?? m.room_id.slice(0, 8) + '…'}</Td>
                  <Td><Badge color={m.message_type === 'text' ? 'default' : 'yellow'}>{m.message_type}</Badge></Td>
                  <Td>
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {m.message_type === 'text'
                        ? (m.content ?? '').slice(0, 80) + ((m.content?.length ?? 0) > 80 ? '…' : '')
                        : m.storage_path ? '📎 ' + m.storage_path.split('/').pop() : '—'}
                    </span>
                  </Td>
                  <Td><Badge color={seen ? 'green' : 'default'}>{seen ? 'Yes' : 'No'}</Badge></Td>
                  <Td><span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{formatDate(m.created_at)}</span></Td>
                </Tr>
              )
            })}
            {filteredMessages.length === 0 && <Tr><Td><span style={{ color: 'var(--text-secondary)' }}>No messages</span></Td></Tr>}
          </Table>
        )}

        {/* ── MEDIA ── */}
        {tab === 'media' && (
          <Table headers={['Room', 'Type', 'OTV', 'Expires', 'Preserved', 'Save/Release', 'Delete']}>
            {mediaMessages
              .filter((m) => !q || (m.content ?? '').toLowerCase().includes(q))
              .map((m) => {
                const room = rooms.find((r) => r.id === m.room_id)
                const hl   = hoursLeft(m.expires_at)
                const isDeleted = !m.storage_path
                return (
                  <Tr key={m.id}>
                    <Td mono>{room?.name ?? m.room_id.slice(0, 8) + '…'}</Td>
                    <Td><Badge color="yellow">{m.message_type}</Badge></Td>
                    <Td>
                      {m.one_time_view
                        ? <Badge color="purple">Yes</Badge>
                        : <span style={{ color: 'var(--text-secondary)' }} className="text-xs">No</span>}
                    </Td>
                    <Td>
                      {isDeleted
                        ? <span className="text-xs italic" style={{ color: 'var(--text-secondary)' }}>Deleted</span>
                        : m.admin_preserved
                          ? <span className="text-xs" style={{ color: 'var(--success)' }}>Never</span>
                          : hl !== null
                            ? <span className="text-xs" style={{ color: hl < 6 ? 'var(--danger)' : 'var(--text-secondary)' }}>
                                {hl}h left
                              </span>
                            : <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>—</span>
                      }
                    </Td>
                    <Td>
                      <Badge color={m.admin_preserved ? 'green' : 'default'}>
                        {m.admin_preserved ? 'Yes' : 'No'}
                      </Badge>
                    </Td>
                    <Td>
                      {isDeleted ? (
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>—</span>
                      ) : (
                        <button
                          onClick={() => handlePreserve(m.id, !m.admin_preserved)}
                          disabled={preservingId === m.id}
                          className="text-xs px-2 py-1 rounded-lg transition-opacity disabled:opacity-50"
                          style={
                            m.admin_preserved
                              ? { color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.3)' }
                              : { color: 'var(--success)', border: '1px solid rgba(16,185,129,0.3)' }
                          }
                        >
                          {preservingId === m.id ? '…' : m.admin_preserved ? 'Release' : 'Save'}
                        </button>
                      )}
                    </Td>
                    <Td>
                      {isDeleted ? (
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>—</span>
                      ) : (
                        <button
                          onClick={() => handleDeleteMedia(m.id)}
                          disabled={deletingId === m.id}
                          className="text-xs px-2 py-1 rounded-lg transition-opacity disabled:opacity-50"
                          style={{ color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.3)' }}
                        >
                          {deletingId === m.id ? '…' : 'Delete'}
                        </button>
                      )}
                    </Td>
                  </Tr>
                )
              })}
            {mediaMessages.length === 0 && <Tr><Td><span style={{ color: 'var(--text-secondary)' }}>No media</span></Td></Tr>}
          </Table>
        )}
      </div>

      {/* Room history modal */}
      {roomModal && (
        <RoomHistoryModal
          room={roomModal}
          messages={messages}
          onClose={() => setRoomModal(null)}
        />
      )}
    </div>
  )
}
