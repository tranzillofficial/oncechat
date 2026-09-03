import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

const USER_RE = /^[\p{L}\p{N}_\-. ]{1,30}$/u

export async function POST(req: NextRequest) {
  try {
    const { roomName, username, sessionId } = await req.json()
    if (!roomName || !username || !sessionId) return Response.json({ error: 'Missing required fields' }, { status: 400 })

    const trimmedUser = username.trim()
    if (!USER_RE.test(trimmedUser)) return Response.json({ error: 'Username: 1–30 chars' }, { status: 400 })

    const supabase = createAdminClient()

    // Validate session exists (table: sessions)
    const { data: session } = await supabase.from('sessions').select('id').eq('id', sessionId).maybeSingle()
    if (!session) return Response.json({ error: 'Invalid session' }, { status: 401 })

    const { data: room } = await supabase.from('rooms').select('id, status').eq('name', roomName.trim()).maybeSingle()
    if (!room)                    return Response.json({ error: `Room "${roomName}" does not exist` }, { status: 404 })
    if (room.status === 'closed') return Response.json({ error: 'This room is closed' }, { status: 403 })

    // Fetch active members
    const { data: activeMembers } = await supabase
      .from('room_members')
      .select('id, session_id, username')
      .eq('room_id', room.id)
      .eq('is_active', true)

    // Auto-clean stale members whose session last_seen is > 30 seconds old
    const staleThreshold = new Date(Date.now() - 30 * 1000).toISOString()
    const trulyActiveMembers: typeof activeMembers = []

    if (activeMembers?.length) {
      const sessionIds = activeMembers.map((m) => m.session_id)
      const { data: activeSessions } = await supabase
        .from('sessions')
        .select('id, last_seen')
        .in('id', sessionIds)

      const sessionMap = new Map(activeSessions?.map((s) => [s.id, s]))

      for (const m of activeMembers) {
        const sess = sessionMap.get(m.session_id)
        const isStale = !sess || !sess.last_seen || sess.last_seen < staleThreshold

        if (isStale && m.session_id !== sessionId) {
          // Deactivate stale member
          await supabase
            .from('room_members')
            .update({ is_active: false, left_at: new Date().toISOString() })
            .eq('id', m.id)
        } else {
          trulyActiveMembers?.push(m)
        }
      }
    }

    const count = trulyActiveMembers?.length ?? 0
    const existingMember = trulyActiveMembers?.find((m) => m.session_id === sessionId)

    if (!existingMember && count >= 2) {
      return Response.json({ error: 'Room is full (max 2 people)' }, { status: 403 })
    }

    // Check for duplicate username using truly active members
    const dup = trulyActiveMembers?.find((m) => m.username === trimmedUser && m.session_id !== sessionId)
    if (dup) return Response.json({ error: 'That username is already active in this room' }, { status: 409 })

    if (existingMember) {
      // Refresh username and return existing member ID
      await supabase.from('room_members').update({ username: trimmedUser, is_active: true }).eq('id', existingMember.id)
      await supabase.from('sessions').update({ username: trimmedUser, last_seen: new Date().toISOString() }).eq('id', sessionId)
      return Response.json({ roomId: room.id, memberId: existingMember.id })
    }

    await supabase.from('sessions').update({ username: trimmedUser, last_seen: new Date().toISOString() }).eq('id', sessionId)

    const { data: member, error: mErr } = await supabase
      .from('room_members')
      .insert({ room_id: room.id, session_id: sessionId, username: trimmedUser, is_active: true })
      .select('id')
      .single()
    if (mErr) {
      if (mErr.code === '23505') return Response.json({ error: 'That username is already active in this room' }, { status: 409 })
      if (mErr.code === '23514') return Response.json({ error: 'Room is full' }, { status: 403 })
      return Response.json({ error: 'Failed to join room', detail: mErr.message }, { status: 500 })
    }

    // Activate room when 2nd member joins
    if ((count ?? 0) + 1 >= 2)
      await supabase.from('rooms').update({ status: 'active' }).eq('id', room.id)

    return Response.json({ roomId: room.id, memberId: member!.id })
  } catch (err) {
    console.error('[POST /api/room/join]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
