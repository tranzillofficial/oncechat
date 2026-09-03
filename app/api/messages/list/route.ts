import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const roomId   = searchParams.get('roomId')
    const sessionId = searchParams.get('sessionId')

    if (!roomId || !sessionId)
      return Response.json({ error: 'Missing required fields' }, { status: 400 })

    const supabase = createAdminClient()

    // Verify the session is an active member of this room
    const { data: member } = await supabase
      .from('room_members')
      .select('id')
      .eq('session_id', sessionId)
      .eq('room_id', roomId)
      .eq('is_active', true)
      .maybeSingle()
    if (!member) return Response.json({ error: 'Not an active member of this room' }, { status: 403 })

    // Fetch all messages for this room ordered oldest first
    const { data: messages, error } = await supabase
      .from('messages')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[GET /api/messages/list]', error.message)
      return Response.json({ error: 'Failed to fetch messages' }, { status: 500 })
    }

    return Response.json({ messages: messages ?? [] })
  } catch (err) {
    console.error('[GET /api/messages/list]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
