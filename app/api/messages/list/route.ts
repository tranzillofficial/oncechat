import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Lazy media cleanup — runs fire-and-forget after each message fetch.
 * Replaces the Vercel cron job (not available on free plan).
 * Deletes expired, non-preserved storage objects and nulls their storage_path.
 */
async function cleanupExpiredMedia(supabase: SupabaseClient) {
  try {
    const now = new Date().toISOString()
    const { data: expired } = await supabase
      .from('messages')
      .select('id, storage_path')
      .not('storage_path', 'is', null)
      .not('expires_at', 'is', null)
      .eq('admin_preserved', false)
      .lt('expires_at', now)

    if (!expired?.length) return

    const paths = expired.map((m) => m.storage_path as string).filter(Boolean)
    if (paths.length) {
      await supabase.storage.from('chat-media').remove(paths)
    }
    await supabase
      .from('messages')
      .update({ storage_path: null })
      .in('id', expired.map((m) => m.id))
  } catch (err) {
    // Never let cleanup errors bubble up to the caller
    console.error('[cleanupExpiredMedia]', err)
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const roomId    = searchParams.get('roomId')
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

    // Fire-and-forget lazy cleanup — doesn't block the response
    cleanupExpiredMedia(supabase)

    return Response.json({ messages: messages ?? [] })
  } catch (err) {
    console.error('[GET /api/messages/list]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
