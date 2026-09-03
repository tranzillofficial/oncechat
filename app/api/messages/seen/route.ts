import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { messageIds, sessionId } = await req.json()
    if (!messageIds?.length || !sessionId) return Response.json({ error: 'Missing required fields' }, { status: 400 })

    const supabase = createAdminClient()

    // Validate session (table: sessions)
    const { data: session } = await supabase.from('sessions').select('id').eq('id', sessionId).maybeSingle()
    if (!session) return Response.json({ error: 'Invalid session' }, { status: 401 })

    // Mark seen_at = now only for messages NOT sent by this session and not yet seen
    // Column: sender_session_id (not session_id), seen_at (not seen boolean)
    await supabase
      .from('messages')
      .update({ seen_at: new Date().toISOString() })
      .in('id', messageIds)
      .neq('sender_session_id', sessionId)
      .is('seen_at', null)

    return Response.json({ success: true })
  } catch (err) {
    console.error('[POST /api/messages/seen]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
