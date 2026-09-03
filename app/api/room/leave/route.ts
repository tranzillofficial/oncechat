import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { memberId, sessionId, roomId } = await req.json()
    if (!memberId || !sessionId || !roomId) return Response.json({ error: 'Missing required fields' }, { status: 400 })

    const supabase = createAdminClient()

    const { data: member } = await supabase.from('room_members')
      .select('id').eq('id', memberId).eq('session_id', sessionId).maybeSingle()
    if (!member) return Response.json({ error: 'Not found or unauthorized' }, { status: 404 })

    // Deactivate member — is_active (boolean) + left_at timestamp
    await supabase.from('room_members')
      .update({ is_active: false, left_at: new Date().toISOString() }).eq('id', memberId)

    // Update session last_seen (column: last_seen)
    await supabase.from('sessions')
      .update({ last_seen: new Date().toISOString() }).eq('id', sessionId)

    // Close room if no active members remain
    const { count } = await supabase.from('room_members')
      .select('id', { count: 'exact', head: true }).eq('room_id', roomId).eq('is_active', true)
    if ((count ?? 0) === 0)
      await supabase.from('rooms').update({ status: 'closed' }).eq('id', roomId)

    return Response.json({ success: true })
  } catch (err) {
    console.error('[POST /api/room/leave]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
