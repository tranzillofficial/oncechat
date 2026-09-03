import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

const ROOM_RE = /^[a-zA-Z0-9][a-zA-Z0-9\-]{0,48}[a-zA-Z0-9]$|^[a-zA-Z0-9]$/
const USER_RE = /^[\p{L}\p{N}_\-. ]{1,30}$/u

export async function POST(req: NextRequest) {
  try {
    const { roomName, username, sessionId } = await req.json()
    if (!roomName || !username || !sessionId) return Response.json({ error: 'Missing required fields' }, { status: 400 })

    const trimmedRoom = roomName.trim()
    const trimmedUser = username.trim()

    if (!ROOM_RE.test(trimmedRoom)) return Response.json({ error: 'Room name: letters, numbers, hyphens only (1–50 chars)' }, { status: 400 })
    if (!USER_RE.test(trimmedUser)) return Response.json({ error: 'Username: 1–30 chars' }, { status: 400 })

    const supabase = createAdminClient()

    // Validate session exists (table: sessions)
    const { data: session } = await supabase.from('sessions').select('id').eq('id', sessionId).maybeSingle()
    if (!session) return Response.json({ error: 'Invalid session' }, { status: 401 })

    const { data: existing } = await supabase.from('rooms').select('id').eq('name', trimmedRoom).maybeSingle()
    if (existing) return Response.json({ error: 'Room name already taken' }, { status: 409 })

    await supabase.from('sessions').update({ username: trimmedUser, last_seen: new Date().toISOString() }).eq('id', sessionId)

    const { data: room, error: roomErr } = await supabase
      .from('rooms').insert({ name: trimmedRoom, status: 'waiting' }).select('id').single()
    if (roomErr || !room) {
      console.error('[create room]', roomErr?.code, roomErr?.message)
      return Response.json({ error: 'Failed to create room', detail: roomErr?.message }, { status: 500 })
    }

    const { data: member, error: mErr } = await supabase
      .from('room_members')
      .insert({ room_id: room.id, session_id: sessionId, username: trimmedUser, is_active: true })
      .select('id')
      .single()
    if (mErr || !member) {
      await supabase.from('rooms').delete().eq('id', room.id)
      return Response.json({ error: 'Failed to join room', detail: mErr?.message }, { status: 500 })
    }

    return Response.json({ roomId: room.id, memberId: member.id })
  } catch (err) {
    console.error('[POST /api/room/create]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
