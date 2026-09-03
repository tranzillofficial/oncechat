'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { generateSilentFingerprint } from '@/lib/fingerprint'

export default function JoinRoomPage() {
  const router   = useRouter()

  const [roomName, setRoomName] = useState('')
  const [username, setUsername] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  const trimmedRoom = roomName.trim()
  const trimmedUser = username.trim()
  const canSubmit   = !loading && trimmedRoom.length > 0 && trimmedUser.length > 0

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setError('')
    setLoading(true)

    try {
      // Step 1: Check room exists (anon key, no service role needed)
      const supabase = createClient()
      const { data: room, error: roomCheckErr } = await supabase
        .from('rooms').select('id, status').eq('name', trimmedRoom).maybeSingle()

      if (roomCheckErr) throw new Error('Could not check room. Try again.')
      if (!room)        throw new Error(`Room "${trimmedRoom}" does not exist.`)
      if (room.status === 'closed') throw new Error('This room is closed.')

      // Step 2: Create visitor session with silent browser fingerprint
      const fpPayload = await generateSilentFingerprint()
      const visitorRes  = await fetch('/api/visitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fpPayload),
      })
      const visitorData = await visitorRes.json()
      if (!visitorRes.ok) throw new Error(visitorData.error || 'Failed to initialize session')
      const { sessionId } = visitorData

      // Step 3: Join the room (server API checks active members & auto-cleans stale slots)
      const joinRes  = await fetch('/api/room/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomName: trimmedRoom, username: trimmedUser, sessionId }),
      })
      const joinData = await joinRes.json()
      if (!joinRes.ok) throw new Error(joinData.error || 'Failed to join room')

      sessionStorage.setItem('oncechat_session_id', sessionId)
      sessionStorage.setItem('oncechat_username',   trimmedUser)
      sessionStorage.setItem('oncechat_member_id',  joinData.memberId)

      router.push(`/room/${encodeURIComponent(trimmedRoom)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-full px-4"
      style={{ background: 'var(--background)' }}>

      <div className="w-full max-w-sm flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/" className="p-2 rounded-lg" style={{ color: 'var(--text-secondary)' }} aria-label="Back">
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"
              viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="flex items-center gap-2">
            <Image src="/oncechat-icon.png" alt="" width={28} height={28} className="rounded-lg" />
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              Join Room
            </h1>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="roomName" className="text-sm font-medium"
              style={{ color: 'var(--text-secondary)' }}>
              Room Name
            </label>
            <input
              id="roomName"
              type="text"
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="Enter the room name"
              maxLength={50}
              required
              autoFocus
              className="h-11 rounded-xl px-3.5 text-sm outline-none"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
              onFocus={(e) => (e.target.style.borderColor = 'var(--accent-light)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="username" className="text-sm font-medium"
              style={{ color: 'var(--text-secondary)' }}>
              Your Username
            </label>
            <input
              id="username"
              type="text"
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. Jordan"
              maxLength={30}
              required
              className="h-11 rounded-xl px-3.5 text-sm outline-none"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
              onFocus={(e) => (e.target.style.borderColor = 'var(--accent-light)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
            />
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Same username as another active member in this room is not allowed.
            </p>
          </div>

          {error && (
            <p className="text-sm px-3 py-2 rounded-lg" role="alert"
              style={{ background: '#2d1111', color: 'var(--danger)', border: '1px solid #3f1515' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="h-12 rounded-xl font-semibold text-sm disabled:opacity-40"
            style={{ background: 'var(--accent)', color: '#ffffff' }}
          >
            {loading ? 'Joining…' : 'Join Room'}
          </button>
        </form>
      </div>
    </main>
  )
}
