import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { messageId, sessionId } = await req.json()
    if (!messageId || !sessionId) {
      return Response.json({ error: 'Missing messageId or sessionId' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Fetch existing message to verify sender
    const { data: message } = await supabase
      .from('messages')
      .select('id, sender_session_id, content')
      .eq('id', messageId)
      .maybeSingle()

    if (!message) {
      return Response.json({ error: 'Message not found' }, { status: 404 })
    }

    if (message.sender_session_id !== sessionId) {
      return Response.json({ error: 'Unauthorized to delete this message' }, { status: 403 })
    }

    const currentContent = message.content || ''
    const updatedContent = currentContent.startsWith('__DELETED_BY_USER__::')
      ? currentContent
      : `__DELETED_BY_USER__::${currentContent}`

    const { error: updateErr } = await supabase
      .from('messages')
      .update({ content: updatedContent })
      .eq('id', messageId)

    if (updateErr) {
      console.error('[POST /api/messages/delete]', updateErr)
      return Response.json({ error: 'Failed to delete message' }, { status: 500 })
    }

    return Response.json({ success: true })
  } catch (err) {
    console.error('[POST /api/messages/delete]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
