import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { sessionId, roomId, messageType, content, storagePath, expiresAt, oneTimeView } = body as {
      sessionId: string
      roomId: string
      messageType: 'text' | 'image' | 'voice'
      content: string | null
      storagePath: string | null
      expiresAt: string | null
      oneTimeView: boolean
    }

    if (!sessionId || !roomId || !messageType)
      return Response.json({ error: 'Missing required fields' }, { status: 400 })

    const supabase = createAdminClient()

    // Verify the session exists
    const { data: session } = await supabase
      .from('sessions').select('id').eq('id', sessionId).maybeSingle()
    if (!session) return Response.json({ error: 'Invalid session' }, { status: 401 })

    // Verify the caller is an active member of the room
    const { data: member } = await supabase
      .from('room_members')
      .select('id')
      .eq('session_id', sessionId)
      .eq('room_id', roomId)
      .eq('is_active', true)
      .maybeSingle()
    if (!member) return Response.json({ error: 'Not an active member of this room' }, { status: 403 })

    // Insert via service role — bypasses RLS
    const { data: msg, error: insertErr } = await supabase
      .from('messages')
      .insert({
        room_id: roomId,
        sender_session_id: sessionId,
        message_type: messageType,
        content: content ?? null,
        storage_path: storagePath ?? null,
        seen_at: null,
        expires_at: expiresAt ?? null,
        one_time_view: oneTimeView ?? false,
        viewed_at: null,
        admin_preserved: false,
      })
      .select('id')
      .single()

    if (insertErr) {
      console.error('[POST /api/messages/send]', insertErr.message)
      return Response.json({ error: 'Failed to send message', detail: insertErr.message }, { status: 500 })
    }

    return Response.json({ messageId: msg.id })
  } catch (err) {
    console.error('[POST /api/messages/send]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
