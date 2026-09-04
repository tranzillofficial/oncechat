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
    const { data: session } = await supabase.from('sessions').select('id, visitor_id').eq('id', sessionId).maybeSingle()
    if (!session) return Response.json({ error: 'Invalid session' }, { status: 401 })

    const { data: room } = await supabase.from('rooms')
      .select('id, status')
      .eq('name', roomName.trim())
      .in('status', ['waiting', 'active'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!room) return Response.json({ error: `Room "${roomName}" does not exist or is closed` }, { status: 404 })

    // Fetch all visitor sessions for this visitor
    let visitorSessionIds: string[] = [sessionId]
    if (session.visitor_id) {
      const { data: vSessions } = await supabase
        .from('sessions')
        .select('id')
        .eq('visitor_id', session.visitor_id)
      if (vSessions?.length) {
        visitorSessionIds = vSessions.map((s) => s.id)
      }
    }

    // Fetch members of this room
    const { data: allMembers } = await supabase
      .from('room_members')
      .select('id, session_id, username, is_active')
      .eq('room_id', room.id)

    // Auto-clean stale members whose session last_seen is > 5 minutes (300s) old
    const staleThreshold = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const activeMembers: typeof allMembers = []

    if (allMembers?.length) {
      const sessionIds = Array.from(new Set(allMembers.map((m) => m.session_id)))
      const { data: activeSessions } = await supabase
        .from('sessions')
        .select('id, last_seen')
        .in('id', sessionIds)

      const sessionMap = new Map(activeSessions?.map((s) => [s.id, s]))

      for (const m of allMembers) {
        const sess = sessionMap.get(m.session_id)
        const isStale = !sess || !sess.last_seen || sess.last_seen < staleThreshold
        const isCurrentVisitor = visitorSessionIds.includes(m.session_id)

        if (isStale && !isCurrentVisitor && m.is_active) {
          // Deactivate stale member
          await supabase
            .from('room_members')
            .update({ is_active: false, left_at: new Date().toISOString() })
            .eq('id', m.id)
        } else if (m.is_active && !isCurrentVisitor) {
          activeMembers.push(m)
        }
      }
    }

    // Check if requesting user is already in room_members (by session_id or visitor_id)
    const existingMember = allMembers?.find((m) => visitorSessionIds.includes(m.session_id))
    const count = activeMembers.length

    if (!existingMember && count >= 2) {
      return Response.json({ error: 'Room is full (max 2 people)' }, { status: 403 })
    }

    // Check for duplicate username using other active members
    const dup = activeMembers.find((m) => m.username === trimmedUser && !visitorSessionIds.includes(m.session_id))
    if (dup) return Response.json({ error: 'That username is already active in this room' }, { status: 409 })

    if (existingMember) {
      // Refresh username, session_id, and reactivate member
      await supabase
        .from('room_members')
        .update({ username: trimmedUser, session_id: sessionId, is_active: true, left_at: null })
        .eq('id', existingMember.id)
      await supabase
        .from('sessions')
        .update({ username: trimmedUser, last_seen: new Date().toISOString() })
        .eq('id', sessionId)

      if (count + 1 >= 2 && room.status === 'waiting') {
        await supabase.from('rooms').update({ status: 'active' }).eq('id', room.id)
      }

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
    if (count + 1 >= 2)
      await supabase.from('rooms').update({ status: 'active' }).eq('id', room.id)

    return Response.json({ roomId: room.id, memberId: member!.id })
  } catch (err) {
    console.error('[POST /api/room/join]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
