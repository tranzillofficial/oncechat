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

    // Count active members using is_active (boolean column)
    const { count } = await supabase.from('room_members')
      .select('id', { count: 'exact', head: true }).eq('room_id', room.id).eq('is_active', true)
    if ((count ?? 0) >= 2) return Response.json({ error: 'Room is full (max 2 people)' }, { status: 403 })

    // Check for duplicate username using is_active
    const { data: dup } = await supabase.from('room_members')
      .select('id').eq('room_id', room.id).eq('username', trimmedUser).eq('is_active', true).maybeSingle()
    if (dup) return Response.json({ error: 'That username is already active in this room' }, { status: 409 })

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
