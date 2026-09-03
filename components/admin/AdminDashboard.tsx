'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Room, Session, RoomMember, Visitor, Message } from '@/lib/supabase/types'
import MessageList from '@/components/chat/MessageList'

type Tab = 'rooms' | 'messages' | 'sessions' | 'visitors' | 'media'

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
  sessions,
  onClose,
}: {
  room: Room
  messages: Message[]
  sessions: Session[]
  onClose: () => void
}) {
  // Sort messages chronologically (oldest to newest)
  const roomMessages = [...messages]
    .filter((m) => m.room_id === room.id)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  // Map session_id to username
  const sessionMap = new Map<string, string>()
  sessions.forEach((s) => sessionMap.set(s.id, s.username))

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="flex flex-col w-full max-w-2xl h-[85vh] rounded-2xl overflow-hidden"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
            🏠 Room Log: {room.name}
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

// ─── Admin Image Lightbox Modal ────────────────────────────────────────────
function AdminImageModal({
  url,
  onClose,
}: {
  url: string
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)' }}
      onClick={onClose}
    >
      <div className="relative max-w-4xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 text-white bg-white/20 px-3 py-1 rounded-lg text-sm font-semibold"
        >
          Close ✕
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="Admin preview" className="max-w-full max-h-[85vh] rounded-xl object-contain" />
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
  const [cleaningUp,   setCleaningUp]   = useState(false)
  const [roomModal, setRoomModal] = useState<Room | null>(null)
  const [authToken, setAuthToken] = useState<string | null>(null)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [signedUrlsMap, setSignedUrlsMap] = useState<Record<string, string>>({})

  // Accordion Expand states
  const [expandedRoomChats, setExpandedRoomChats] = useState<Record<string, boolean>>({})
  const [expandedVisitorProfiles, setExpandedVisitorProfiles] = useState<Record<string, boolean>>({})
  const [expandedSessions, setExpandedSessions] = useState<Record<string, boolean>>({})

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
      const [rRes, sRes, mRes, vRes, msgRes] = await Promise.all([
        supabase.from('rooms').select('*').order('created_at', { ascending: false }),
        supabase.from('sessions').select('*').order('started_at', { ascending: false }),
        supabase.from('room_members').select('*').order('joined_at', { ascending: false }),
        supabase.from('visitors').select('*').order('last_seen', { ascending: false }),
        supabase.from('messages').select('*').order('created_at', { ascending: false }),
      ])

      setRooms(rRes.data     ?? [])
      setSessions(sRes.data  ?? [])
      setMembers(mRes.data   ?? [])
      setVisitors(vRes.data  ?? [])
      setMessages(msgRes.data ?? [])

      // Fetch signed URLs for media messages
      const mediaPaths = (msgRes.data ?? [])
        .filter((m) => m.storage_path)
        .map((m) => m.storage_path!)

      if (mediaPaths.length) {
        const urlRes = await fetch('/api/media/signed-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paths: mediaPaths, sessionId: '__admin__' }),
        })
        if (urlRes.ok) {
          const urlData = await urlRes.json()
          setSignedUrlsMap(urlData.urls ?? {})
        }
      }
    } catch (e) {
      console.error('[AdminDashboard loadData]', e)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => { loadData() }, [loadData])

  async function handlePreserve(messageId: string, preserve: boolean) {
    if (!authToken) return
    setPreservingId(messageId)
    try {
      const res = await fetch('/api/admin/preserve-media', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ messageId, preserve }),
      })
      if (res.ok) {
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, admin_preserved: preserve } : m))
        )
      }
    } finally {
      setPreservingId(null)
    }
  }

  async function handleDeleteMedia(messageId: string) {
    if (!authToken || !confirm('Permanently delete this media from storage?')) return
    setDeletingId(messageId)
    try {
      const res = await fetch('/api/admin/delete-media', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ messageId }),
      })
      if (res.ok) {
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, storage_path: null } : m))
        )
      }
    } finally {
      setDeletingId(null)
    }
  }

  async function handleRunCleanup() {
    if (!authToken || cleaningUp) return
    setCleaningUp(true)
    try {
      const res = await fetch('/api/admin/run-cleanup', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      })
      if (res.ok) {
        const data = await res.json()
        alert(`Cleanup finished. Purged ${data.purgedCount ?? 0} expired media files.`)
        await loadData()
      }
    } finally {
      setCleaningUp(false)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/admin')
  }

  // Filter lists based on search
  const q = search.toLowerCase().trim()
  const filteredRooms = rooms.filter((r) => {
    if (!q) return true
    const roomMembers = members.filter((m) => m.room_id === r.id)
    const memberUsernames = roomMembers.map((m) => m.username.toLowerCase())
    return (
      r.name.toLowerCase().includes(q) ||
      r.id.toLowerCase().includes(q) ||
      memberUsernames.some((u) => u.includes(q))
    )
  })

  const filteredSessions = sessions.filter(
    (s) => !q || s.username.toLowerCase().includes(q) || s.id.toLowerCase().includes(q) || s.visitor_id.toLowerCase().includes(q)
  )

  const filteredVisitors = visitors.filter((v) => {
    if (!q) return true
    const visitorSessions = sessions.filter((s) => s.visitor_id === v.id)
    const names = visitorSessions.map((s) => s.username.toLowerCase())
    return (
      (v.ip_hash ?? '').toLowerCase().includes(q) ||
      (v.fingerprint ?? '').toLowerCase().includes(q) ||
      (v.user_agent ?? '').toLowerCase().includes(q) ||
      names.some((n) => n.includes(q))
    )
  })

  const mediaMessages = messages.filter((m) => m.message_type === 'image' || m.message_type === 'voice')

  // Group sessions by visitor_id
  const groupedVisitorSessionsMap = new Map<string, Session[]>()
  sessions.forEach((s) => {
    const list = groupedVisitorSessionsMap.get(s.visitor_id) || []
    list.push(s)
    groupedVisitorSessionsMap.set(s.visitor_id, list)
  })

  const TABS: { id: Tab; label: string; count: number }[] = [
    { id: 'rooms',    label: 'Rooms',    count: rooms.length },
    { id: 'messages', label: 'Rooms & Messages', count: rooms.length },
    { id: 'sessions', label: 'User Sessions', count: groupedVisitorSessionsMap.size },
    { id: 'visitors', label: 'Visitors (Smart Profile)', count: visitors.length },
    { id: 'media',    label: 'Media Gallery', count: mediaMessages.length },
  ]

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
        <p className="text-sm animate-pulse" style={{ color: 'var(--text-secondary)' }}>Loading dashboard…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)' }}>
      {/* Header */}
      <header
        className="flex items-center justify-between px-6 py-4 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}
      >
        <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          Oncechat Admin
        </h1>
        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
            style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)' }}
          >
            Refresh
          </button>
          <button
            onClick={handleRunCleanup}
            disabled={cleaningUp}
            className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50"
            style={{ background: 'var(--surface-2)', color: 'var(--warning)', border: '1px solid rgba(245,158,11,0.3)' }}
          >
            {cleaningUp ? 'Running…' : 'Run Cleanup'}
          </button>
          <button
            onClick={handleLogout}
            className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
            style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 p-6 max-w-7xl w-full mx-auto flex flex-col gap-6">
        {/* Search */}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search usernames, room names, IP hashes, fingerprints…"
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
                      className="text-xs px-2.5 py-1 rounded-lg font-medium"
                      style={{ color: 'var(--accent-light)', border: '1px solid rgba(124,58,237,0.3)', background: 'var(--surface-2)' }}
                    >
                      View Chat Log ({messages.filter(m => m.room_id === r.id).length})
                    </button>
                  </Td>
                </Tr>
              )
            })}
            {filteredRooms.length === 0 && <Tr><Td><span style={{ color: 'var(--text-secondary)' }}>No rooms</span></Td></Tr>}
          </Table>
        )}

        {/* ── ROOMS & MESSAGES (Collapsible Grouped Rooms) ── */}
        {tab === 'messages' && (
          <div className="flex flex-col gap-4">
            {filteredRooms.map((r) => {
              const roomMsgs = messages.filter((m) => m.room_id === r.id)
              const roomMembers = members.filter((m) => m.room_id === r.id)
              const isExpanded = !!expandedRoomChats[r.id]

              // Group room members by IP Hash to show usernames used by each distinct user
              const memberIpMap = new Map<string, string[]>()
              roomMembers.forEach((rm) => {
                const sess = sessions.find((s) => s.id === rm.session_id)
                const vis = visitors.find((v) => v.id === sess?.visitor_id)
                const ipKey = vis?.ip_hash ? `${vis.ip_hash.slice(0, 10)}…` : 'Unknown IP'
                const names = memberIpMap.get(ipKey) || []
                if (!names.includes(rm.username)) names.push(rm.username)
                memberIpMap.set(ipKey, names)
              })

              return (
                <div key={r.id} className="p-4 rounded-xl flex flex-col gap-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-between border-b pb-2 flex-wrap gap-2" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-base" style={{ color: 'var(--accent-light)' }}>🏠 Room: {r.name}</span>
                      <Badge color={r.status === 'active' ? 'green' : r.status === 'closed' ? 'red' : 'yellow'}>
                        {r.status}
                      </Badge>
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Messages: ({roomMsgs.length})</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setExpandedRoomChats((prev) => ({ ...prev, [r.id]: !prev[r.id] }))}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                        style={{ background: 'var(--accent)', color: '#fff' }}
                      >
                        {isExpanded ? 'Fold Chat 🔼' : 'Extend Chat 🔽'}
                      </button>
                      <button
                        onClick={() => setRoomModal(r)}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium"
                        style={{ background: 'var(--surface-2)', color: 'var(--accent-light)', border: '1px solid var(--border)' }}
                      >
                        Live Log View
                      </button>
                    </div>
                  </div>

                  {/* Room Members grouped by User (showing all aliases per user) */}
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>Distinct Users ({memberIpMap.size}):</span>
                    {Array.from(memberIpMap.entries()).map(([ipHash, names]) => (
                      <span key={ipHash} className="px-2.5 py-1 rounded-md flex items-center gap-1.5" style={{ background: 'var(--surface-2)', color: 'var(--text-primary)' }}>
                        <span className="font-bold text-purple-400">👤 User ({ipHash}):</span>
                        <span className="font-semibold text-white">{names.join(', ')}</span>
                      </span>
                    ))}
                    {memberIpMap.size === 0 && <span style={{ color: 'var(--text-secondary)' }}>No members joined yet</span>}
                  </div>

                  {/* Collapsible Room Messages List */}
                  {isExpanded && (
                    <Table headers={['Sender', 'Type', 'Content / Media Preview', 'Seen', 'Sent At']}>
                      {roomMsgs.map((m) => {
                        const sess = sessions.find((s) => s.id === m.sender_session_id)
                        const url = m.storage_path ? signedUrlsMap[m.storage_path] : null
                        return (
                          <Tr key={m.id}>
                            <Td><span className="font-semibold text-xs" style={{ color: 'var(--accent-light)' }}>{sess?.username ?? 'Unknown'}</span> <span className="text-[10px] font-mono opacity-60">({m.sender_session_id.slice(0, 6)}…)</span></Td>
                            <Td><Badge color={m.message_type === 'text' ? 'default' : 'yellow'}>{m.message_type}</Badge></Td>
                            <Td>
                              {m.message_type === 'text' ? (
                                <span className="text-xs" style={{ color: 'var(--text-primary)' }}>{m.content}</span>
                              ) : m.message_type === 'image' && url ? (
                                <div className="flex items-center gap-2">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={url} alt="Thumb" className="w-10 h-10 rounded-md object-cover border border-purple-500/30" />
                                  <button
                                    onClick={() => setPreviewImage(url)}
                                    className="text-xs px-2.5 py-1 rounded-md font-medium"
                                    style={{ background: 'var(--accent)', color: '#fff' }}
                                  >
                                    View Full
                                  </button>
                                </div>
                              ) : m.message_type === 'voice' && url ? (
                                <audio controls src={url} className="h-8 max-w-[200px]" />
                              ) : (
                                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>📎 {m.storage_path ?? 'Media'}</span>
                              )}
                            </Td>
                            <Td><Badge color={m.seen_at ? 'green' : 'default'}>{m.seen_at ? 'Yes' : 'No'}</Badge></Td>
                            <Td><span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{formatDate(m.created_at)}</span></Td>
                          </Tr>
                        )
                      })}
                      {roomMsgs.length === 0 && <Tr><Td><span style={{ color: 'var(--text-secondary)' }}>No messages in this room</span></Td></Tr>}
                    </Table>
                  )}
                </div>
              )
            })}
            {filteredRooms.length === 0 && <p className="text-sm text-center py-6" style={{ color: 'var(--text-secondary)' }}>No rooms found</p>}
          </div>
        )}

        {/* ── SESSIONS (Grouped by User Tile) ── */}
        {tab === 'sessions' && (
          <div className="flex flex-col gap-4">
            {Array.from(groupedVisitorSessionsMap.entries())
              .filter(([vId, sList]) => {
                if (!q) return true
                const vis = visitors.find((v) => v.id === vId)
                return (
                  sList.some((s) => s.username.toLowerCase().includes(q)) ||
                  (vis?.ip_hash ?? '').toLowerCase().includes(q) ||
                  (vis?.fingerprint ?? '').toLowerCase().includes(q)
                )
              })
              .map(([vId, sList]) => {
                const vis = visitors.find((v) => v.id === vId)
                const isExpanded = !!expandedSessions[vId]
                const uniqueNames = Array.from(new Set(sList.map((s) => s.username)))
                const activeSession = sList.find((s) => s.is_active)

                return (
                  <div key={vId} className="p-4 rounded-xl flex flex-col gap-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <div className="flex items-center justify-between border-b pb-2 flex-wrap gap-2" style={{ borderColor: 'var(--border)' }}>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-sm" style={{ color: 'var(--accent-light)' }}>
                          👤 User Profile ({sList.length} Sessions)
                        </span>
                        <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: 'var(--surface-2)', color: 'var(--text-primary)' }}>
                          IP Hash: {vis?.ip_hash ? `${vis.ip_hash.slice(0, 10)}…` : 'Unknown'}
                        </span>
                        <Badge color={activeSession ? 'green' : 'default'}>
                          {activeSession ? 'Currently Active' : 'Offline'}
                        </Badge>
                      </div>

                      <button
                        onClick={() => setExpandedSessions((prev) => ({ ...prev, [vId]: !prev[vId] }))}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                        style={{ background: 'var(--surface-2)', color: 'var(--accent-light)', border: '1px solid var(--border)' }}
                      >
                        {isExpanded ? 'Hide Sessions 🔼' : 'Extend Sessions 🔽'}
                      </button>
                    </div>

                    {/* Summary Badges */}
                    <div className="flex items-center gap-2 text-xs flex-wrap">
                      <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>Usernames used:</span>
                      {uniqueNames.map((n) => (
                        <span key={n} className="px-2 py-0.5 rounded text-[11px] font-bold" style={{ background: 'var(--accent)', color: '#fff' }}>
                          {n}
                        </span>
                      ))}
                    </div>

                    {/* Collapsible Session List */}
                    {isExpanded && (
                      <Table headers={['Username', 'Session ID', 'Started At', 'Last Seen', 'State']}>
                        {sList.map((s) => (
                          <Tr key={s.id}>
                            <Td><span className="font-medium text-xs" style={{ color: 'var(--text-primary)' }}>{s.username}</span></Td>
                            <Td mono>{s.id.slice(0, 14)}…</Td>
                            <Td><span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{formatDate(s.started_at)}</span></Td>
                            <Td><span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{formatDate(s.last_seen)}</span></Td>
                            <Td><Badge color={s.is_active ? 'green' : 'default'}>{s.is_active ? 'Active' : 'Ended'}</Badge></Td>
                          </Tr>
                        ))}
                      </Table>
                    )}
                  </div>
                )
              })}
            {groupedVisitorSessionsMap.size === 0 && <p className="text-sm text-center py-6" style={{ color: 'var(--text-secondary)' }}>No user sessions</p>}
          </div>
        )}

        {/* ── VISITORS (Smart Analytics Profile with Expand) ── */}
        {tab === 'visitors' && (
          <div className="flex flex-col gap-4">
            {filteredVisitors.map((v) => {
              const visitorSessions = sessions.filter((s) => s.visitor_id === v.id)
              const userNames = Array.from(new Set(visitorSessions.map((s) => s.username)))
              const userMemberRoomIds = Array.from(new Set(members.filter((m) => visitorSessions.some((s) => s.id === m.session_id)).map((m) => m.room_id)))
              const joinedRooms = rooms.filter((r) => userMemberRoomIds.includes(r.id))
              const isExpanded = !!expandedVisitorProfiles[v.id]

              return (
                <div key={v.id} className="p-4 rounded-xl flex flex-col gap-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-between border-b pb-2 flex-wrap gap-2" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono px-2.5 py-1 rounded font-bold" style={{ background: 'var(--accent)', color: '#fff' }}>
                        🧬 Device Fingerprint: {v.fingerprint ? `${v.fingerprint.slice(0, 16)}…` : 'Generating…'}
                      </span>
                      <span className="text-xs font-mono px-2 py-1 rounded" style={{ background: 'var(--surface-2)', color: 'var(--accent-light)' }}>
                        🌐 IP Hash: {v.ip_hash}
                      </span>
                    </div>

                    <button
                      onClick={() => setExpandedVisitorProfiles((prev) => ({ ...prev, [v.id]: !prev[v.id] }))}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                      style={{ background: 'var(--surface-2)', color: 'var(--accent-light)', border: '1px solid var(--border)' }}
                    >
                      {isExpanded ? 'Hide Details 🔼' : 'Expand Smart Profile 🔽'}
                    </button>
                  </div>

                  {/* Summary Bar */}
                  <div className="flex items-center justify-between text-xs text-secondary flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>Usernames:</span>
                      {userNames.map((u) => (
                        <span key={u} className="px-2 py-0.5 rounded text-[11px] font-bold" style={{ background: 'var(--accent)', color: '#fff' }}>
                          {u}
                        </span>
                      ))}
                    </div>
                    <span>First Seen: {formatDate(v.first_seen)} | Last Active: {formatDate(v.last_seen)}</span>
                  </div>

                  {/* Collapsible Smart Profile Details */}
                  {isExpanded && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs mt-2">
                      {/* Device & Browser Specs */}
                      <div className="flex flex-col gap-2 p-3 rounded-lg" style={{ background: 'var(--surface-2)' }}>
                        <span className="font-semibold text-white">💻 Hardware Fingerprint Specs:</span>
                        {v.device_info ? (
                          (() => {
                            try {
                              const info = JSON.parse(v.device_info)
                              return (
                                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono" style={{ color: 'var(--text-secondary)' }}>
                                  <div>📱 Screen: <span className="text-white font-bold">{info.screen}</span></div>
                                  <div>🌍 Timezone: <span className="text-white font-bold">{info.timeZone}</span></div>
                                  <div>🗣️ Language: <span className="text-white font-bold">{info.language}</span></div>
                                  <div>⚡ CPU Cores: <span className="text-white font-bold">{info.cpuCores}</span></div>
                                  <div>💾 RAM (Est): <span className="text-white font-bold">{info.ramGB} GB</span></div>
                                  <div>🖥️ Platform: <span className="text-white font-bold">{info.platform}</span></div>
                                  <div className="col-span-2 pt-1">🎮 GPU: <span className="text-purple-300 font-bold">{info.gpu}</span></div>
                                </div>
                              )
                            } catch {
                              return <span className="font-mono text-[11px] break-all">{v.device_info}</span>
                            }
                          })()
                        ) : (
                          <span className="font-mono text-[11px] break-all" style={{ color: 'var(--text-secondary)' }}>
                            {v.user_agent ?? 'Unknown Device'}
                          </span>
                        )}
                      </div>

                      {/* Smart Activity Tracking */}
                      <div className="flex flex-col gap-2 p-3 rounded-lg" style={{ background: 'var(--surface-2)' }}>
                        <span className="font-semibold text-white">🏠 Room Activity & History:</span>
                        <div className="flex flex-wrap gap-1">
                          {joinedRooms.map((r) => (
                            <span key={r.id} className="px-2.5 py-1 rounded text-[11px]" style={{ background: 'var(--surface)', color: 'var(--accent-light)', border: '1px solid var(--border)' }}>
                              🏠 {r.name} ({r.status})
                            </span>
                          ))}
                          {joinedRooms.length === 0 && <span style={{ color: 'var(--text-secondary)' }}>No rooms participated</span>}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            {filteredVisitors.length === 0 && <p className="text-sm text-center py-6" style={{ color: 'var(--text-secondary)' }}>No visitor profiles</p>}
          </div>
        )}

        {/* ── MEDIA GALLERY ── */}
        {tab === 'media' && (
          <Table headers={['Preview', 'Room Log', 'Type', 'OTV', 'Expires', 'Preserved', 'Save/Release', 'Delete']}>
            {mediaMessages
              .filter((m) => !q || (m.content ?? '').toLowerCase().includes(q))
              .map((m) => {
                const room = rooms.find((r) => r.id === m.room_id)
                const hl   = hoursLeft(m.expires_at)
                const isDeleted = !m.storage_path
                const url = m.storage_path ? signedUrlsMap[m.storage_path] : null

                return (
                  <Tr key={m.id}>
                    <Td>
                      {m.message_type === 'image' && url ? (
                        <div className="flex items-center gap-2">
                          {/* Thumbnail */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt="Media" className="w-12 h-12 rounded-lg object-cover border border-purple-500/30" />
                          <button
                            onClick={() => setPreviewImage(url)}
                            className="text-xs px-2.5 py-1 rounded-md font-medium"
                            style={{ background: 'var(--accent)', color: '#fff' }}
                          >
                            View Full
                          </button>
                        </div>
                      ) : m.message_type === 'voice' && url ? (
                        <audio controls src={url} className="h-8 max-w-[200px]" />
                      ) : (
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>—</span>
                      )}
                    </Td>
                    <Td>
                      {room ? (
                        <button
                          onClick={() => setRoomModal(room)}
                          className="text-xs font-mono underline hover:text-purple-400"
                          style={{ color: 'var(--accent-light)' }}
                        >
                          🏠 {room.name}
                        </button>
                      ) : (
                        <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{m.room_id.slice(0, 8)}…</span>
                      )}
                    </Td>
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
                          ? <span className="text-xs font-bold" style={{ color: 'var(--success)' }}>Never (Preserved)</span>
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
                          className="text-xs px-2 py-1 rounded-lg transition-opacity disabled:opacity-50 font-semibold"
                          style={
                            m.admin_preserved
                              ? { color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)' }
                              : { color: 'var(--success)', border: '1px solid rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.1)' }
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
          sessions={sessions}
          onClose={() => setRoomModal(null)}
        />
      )}

      {/* Admin Image Lightbox Modal */}
      {previewImage && (
        <AdminImageModal
          url={previewImage}
          onClose={() => setPreviewImage(null)}
        />
      )}
    </div>
  )
}
