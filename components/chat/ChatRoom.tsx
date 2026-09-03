'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { MessageWithMeta } from '@/lib/supabase/types'
import MessageList from './MessageList'
import MessageInput from './MessageInput'
import TypingIndicator from './TypingIndicator'
import OnlineStatus from './OnlineStatus'

interface PresencePayload { username: string; online_at: string }

export default function ChatRoom({ roomName }: { roomName: string }) {
  const router   = useRouter()
  const supabase = createClient()

  const [sessionId,   setSessionId]   = useState<string | null>(null)
  const [username,    setUsername]    = useState<string | null>(null)
  const [memberId,    setMemberId]    = useState<string | null>(null)
  const [roomId,      setRoomId]      = useState<string | null>(null)
  const [messages,    setMessages]    = useState<MessageWithMeta[]>([])
  const [otherUser,   setOtherUser]   = useState<string | null>(null)
  const [otherOnline, setOtherOnline] = useState(false)
  const [typingUser,  setTypingUser]  = useState<string | null>(null)
  const [roomClosed,  setRoomClosed]  = useState(false)
  const [loading,     setLoading]     = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [copied,      setCopied]      = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  const channelRef     = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const typingTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unseenIds      = useRef<Set<string>>(new Set())
  const seenFlushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Load session ─────────────────────────────────────────────────────────
  useEffect(() => {
    const sid = sessionStorage.getItem('oncechat_session_id')
    const un  = sessionStorage.getItem('oncechat_username')
    const mid = sessionStorage.getItem('oncechat_member_id')
    if (!sid || !un || !mid) { router.replace('/join'); return }
    setSessionId(sid); setUsername(un); setMemberId(mid)
  }, [router])

  // ── Init room + messages ─────────────────────────────────────────────────
  const initRoom = useCallback(async (sid: string, uname: string) => {
    try {
      const { data: room } = await supabase
        .from('rooms').select('id, status').eq('name', roomName).maybeSingle()
      if (!room) { setError('Room not found'); setLoading(false); return }
      if (room.status === 'closed') { setRoomClosed(true); setLoading(false); return }
      setRoomId(room.id)

      // Fetch messages via service-role API (bypasses RLS, validates membership)
      const msgsRes = await fetch(
        `/api/messages/list?roomId=${room.id}&sessionId=${sid}`
      )
      const msgsData = await msgsRes.json()
      if (!msgsRes.ok) console.error('[initRoom messages]', msgsData.error)
      const msgs: MessageWithMeta[] = msgsData.messages ?? []
      setMessages(msgs)

      // Fetch other active member — is_active (boolean column)
      const { data: members } = await supabase
        .from('room_members').select('username, is_active')
        .eq('room_id', room.id).eq('is_active', true)
      if (members) {
        const other = members.find((m) => m.username !== uname)
        if (other) setOtherUser(other.username)
      }

      // Mark unseen messages from others as seen — seen_at IS NULL means unseen
      const unseen = (msgs ?? []).filter((m) => !m.seen_at && m.sender_session_id !== sid)
      if (unseen.length) markSeen(unseen.map((m) => m.id), sid)

      setLoading(false)
    } catch (e) {
      console.error('[initRoom]', e); setError('Failed to load room'); setLoading(false)
    }
  }, [roomName, supabase])

  useEffect(() => {
    if (sessionId && username) initRoom(sessionId, username)
  }, [sessionId, username, initRoom])

  // ── Realtime ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!roomId || !sessionId || !username) return

    const ch = supabase.channel(`room:${roomId}`, { config: { presence: { key: sessionId } } })
    channelRef.current = ch

    // Presence
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState() as Record<string, PresencePayload[]>
      const others = Object.entries(state).filter(([k]) => k !== sessionId).flatMap(([, p]) => p)
      setOtherOnline(others.length > 0)
      if (others[0]) setOtherUser(others[0].username)
    })
    ch.on('presence', { event: 'join' }, ({ newPresences }) => {
      const j = (newPresences as unknown as PresencePayload[])[0]
      if (j?.username !== username) { setOtherUser(j.username); setOtherOnline(true) }
    })
    ch.on('presence', { event: 'leave' }, ({ leftPresences }) => {
      const l = (leftPresences as unknown as PresencePayload[])[0]
      if (l?.username !== username) setOtherOnline(false)
    })

    // New messages — filter by room_id, use sender_session_id
    ch.on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
      (payload) => {
        const msg = payload.new as MessageWithMeta
        setMessages((prev) => prev.find((m) => m.id === msg.id) ? prev : [...prev, msg])
        if (msg.sender_session_id !== sessionId) {
          unseenIds.current.add(msg.id)
          scheduleSeenFlush(sessionId)
        }
      }
    )

    // Seen updates — update seen_at on the matching message
    ch.on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
      (payload) => {
        const upd = payload.new as MessageWithMeta
        setMessages((prev) =>
          prev.map((m) => m.id === upd.id ? { ...m, seen_at: upd.seen_at, viewed_at: upd.viewed_at } : m)
        )
      }
    )

    // Room closed
    ch.on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
      (payload) => { if (payload.new.status === 'closed') setRoomClosed(true) }
    )

    // Typing broadcast
    ch.on('broadcast', { event: 'typing' }, ({ payload }) => {
      const { username: tu, isTyping } = payload as { username: string; isTyping: boolean }
      if (tu !== username) {
        setTypingUser(isTyping ? tu : null)
        if (typingTimer.current) clearTimeout(typingTimer.current)
        if (isTyping) typingTimer.current = setTimeout(() => setTypingUser(null), 3000)
      }
    })

    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') await ch.track({ username })
    })

    return () => { ch.unsubscribe(); channelRef.current = null }
  }, [roomId, sessionId, username, supabase])

  // Active heartbeat: update session last_seen every 10s while in room
  useEffect(() => {
    if (!sessionId) return
    const ping = () => {
      supabase.from('sessions').update({ last_seen: new Date().toISOString() }).eq('id', sessionId).then(() => {})
    }
    ping()
    const interval = setInterval(ping, 10000)
    return () => clearInterval(interval)
  }, [sessionId, supabase])

  // Beacon on tab close / navigate away so active count drops immediately
  useEffect(() => {
    function handleUnload() {
      if (!memberId || !sessionId || !roomId) return
      const payload = JSON.stringify({ memberId, sessionId, roomId })
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/room/leave', payload)
      }
    }
    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [memberId, sessionId, roomId])

  function scheduleSeenFlush(sid: string) {
    if (seenFlushTimer.current) return
    seenFlushTimer.current = setTimeout(async () => {
      const ids = Array.from(unseenIds.current)
      unseenIds.current.clear(); seenFlushTimer.current = null
      if (ids.length) await markSeen(ids, sid)
    }, 800)
  }

  async function markSeen(ids: string[], sid: string) {
    await fetch('/api/messages/seen', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageIds: ids, sessionId: sid }),
    })
  }

  function broadcastTyping(isTyping: boolean) {
    channelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { username, isTyping } })
  }

  // ── Shared message sender — uses service role via API to bypass RLS ─────────
  async function sendMessage(payload: {
    messageType: 'text' | 'image' | 'voice'
    content: string | null
    storagePath: string | null
    expiresAt: string | null
    oneTimeView: boolean
  }) {
    if (!sessionId || !roomId) return
    const res = await fetch('/api/messages/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, roomId, ...payload }),
    })
    if (!res.ok) {
      const data = await res.json()
      console.error('[sendMessage]', data.error)
    }
  }

  // ── Delete message handler ──────────────────────────────────────────────
  async function handleDeleteMessage(messageId: string) {
    if (!sessionId) return
    try {
      const res = await fetch('/api/messages/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, sessionId }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Failed to delete message')
      } else {
        // Optimistically update local message list
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, content: `__DELETED_BY_USER__::${m.content || ''}` }
              : m
          )
        )
      }
    } catch (err) {
      console.error('[handleDeleteMessage]', err)
    }
  }

  // ── Send handlers ─────────────────────────────────────────────────────────

  async function handleSendText(text: string) {
    await sendMessage({ messageType: 'text', content: text, storagePath: null, expiresAt: null, oneTimeView: false })
  }

  async function handleSendFile(file: File, oneTimeView: boolean) {
    if (!sessionId || !roomId) return
    const mime = file.type || ''
    const isAudio = mime.includes('audio')
    const mediaType: 'voice' | 'image' = isAudio ? 'voice' : 'image';

    void (async () => {
      try {
        const fd = new FormData()
        fd.append('file', file); fd.append('sessionId', sessionId)
        fd.append('roomId', roomId); fd.append('mediaType', mediaType)
        fd.append('oneTimeView', isAudio ? 'false' : `${oneTimeView}`)
        const res  = await fetch('/api/media/upload', { method: 'POST', body: fd })
        const data = await res.json()
        if (!res.ok) { alert(data.error || 'Upload failed'); return }
        await sendMessage({
          messageType: mediaType,
          content: null,
          storagePath: data.storagePath,
          expiresAt: data.expiresAt,
          oneTimeView: data.oneTimeView ?? false,
        })
      } catch (err) {
        console.error('[upload failed]', err)
        alert('Upload failed')
      }
    })()
  }

  async function handleSendVoice(blob: Blob, mimeType: string) {
    if (!sessionId || !roomId || isUploading) return
    setIsUploading(true)
    try {
      const ext  = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp3') ? 'mp3' : mimeType.includes('wav') ? 'wav' : mimeType.includes('m4a') ? 'm4a' : 'webm'
      const file = blob instanceof File ? blob : new File([blob], `voice.${ext}`, { type: mimeType })
      const fd   = new FormData()
      fd.append('file', file); fd.append('sessionId', sessionId)
      fd.append('roomId', roomId); fd.append('mediaType', 'voice')
      const res  = await fetch('/api/media/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'Upload failed'); return }
      await sendMessage({
        messageType: 'voice',
        content: null,
        storagePath: data.storagePath,
        expiresAt: data.expiresAt,
        oneTimeView: false,
      })
    } finally {
      setIsUploading(false)
    }
  }

  async function handleLeave() {
    if (!memberId || !sessionId || !roomId) return
    broadcastTyping(false)
    await fetch('/api/room/leave', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId, sessionId, roomId }),
    })
    sessionStorage.removeItem('oncechat_session_id')
    sessionStorage.removeItem('oncechat_username')
    sessionStorage.removeItem('oncechat_member_id')
    router.push('/')
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex h-full items-center justify-center" style={{ background: 'var(--background)' }}>
      <div className="w-6 h-6 rounded-full border-2 animate-spin"
        style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} role="status" />
    </div>
  )

  if (error) return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-4" style={{ background: 'var(--background)' }}>
      <p style={{ color: 'var(--danger)' }} className="text-sm">{error}</p>
      <Link href="/" className="text-sm" style={{ color: 'var(--accent-light)' }}>← Back home</Link>
    </div>
  )

  if (roomClosed) return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-4" style={{ background: 'var(--background)' }}>
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>This room is closed.</p>
      <Link href="/" className="px-4 py-2 rounded-xl text-sm font-medium" style={{ background: 'var(--accent)', color: '#fff' }}>
        Back home
      </Link>
    </div>
  )

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--background)' }}>
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div className="flex items-center gap-3">
          <Image src="/oncechat-icon.png" alt="Oncechat" width={28} height={28} className="rounded-lg" />
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{roomName}</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(roomName)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }}
                className="p-1 rounded-md transition-colors hover:bg-white/10 text-xs flex items-center gap-1"
                style={{ color: copied ? 'var(--success)' : 'var(--text-secondary)' }}
                aria-label="Copy room name"
                title="Copy room name"
              >
                {copied ? (
                  <span className="text-[10px] font-bold text-emerald-400">✓ Copied</span>
                ) : (
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
              </button>
            </div>
            <OnlineStatus username={otherUser ?? ''} isOnline={!!otherUser && otherOnline} />
          </div>
        </div>
        <button onClick={handleLeave} className="text-xs px-3 py-1.5 rounded-lg"
          style={{ color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.3)' }}>
          Leave
        </button>
      </header>

      <MessageList
        messages={messages}
        sessionId={sessionId ?? ''}
        currentUsername={username ?? ''}
        onDeleteMessage={handleDeleteMessage}
      />
      {typingUser && <TypingIndicator username={typingUser} />}
      <MessageInput
        onSendText={handleSendText} onSendFile={handleSendFile} onSendVoice={handleSendVoice}
        onTypingStart={() => broadcastTyping(true)} onTypingStop={() => broadcastTyping(false)}
        disabled={roomClosed}
      />
    </div>
  )
}

