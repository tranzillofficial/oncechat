import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { messageId, sessionId } = await req.json()
    if (!messageId || !sessionId) return Response.json({ error: 'Missing required fields' }, { status: 400 })

    const supabase = createAdminClient()

    // Column: sender_session_id (not session_id)
    const { data: msg } = await supabase
      .from('messages')
      .select('id, sender_session_id, one_time_view, viewed_at')
      .eq('id', messageId)
      .maybeSingle()

    if (!msg) return Response.json({ error: 'Message not found' }, { status: 404 })
    if (!msg.one_time_view) return Response.json({ error: 'Not a one-time-view message' }, { status: 400 })
    // Block the sender from marking their own message as viewed
    if (msg.sender_session_id === sessionId) return Response.json({ error: 'Forbidden' }, { status: 403 })
    if (msg.viewed_at) return Response.json({ alreadyViewed: true })

    await supabase.from('messages').update({ viewed_at: new Date().toISOString() }).eq('id', messageId)
    return Response.json({ success: true })
  } catch (err) {
    console.error('[POST /api/media/mark-viewed]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
