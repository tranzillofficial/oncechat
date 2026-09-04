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

    // Verify session is a member of this room
    const { data: member } = await supabase
      .from('room_members')
      .select('id, is_active')
      .eq('session_id', sessionId)
      .eq('room_id', roomId)
      .maybeSingle()
    if (!member) return Response.json({ error: 'Not a member of this room' }, { status: 403 })

    // Auto-reactivate member if inactive
    if (!member.is_active) {
      await supabase.from('room_members').update({ is_active: true, left_at: null }).eq('id', member.id)
    }

    // Fetch visitor_id to find all session IDs belonging to this user
    const visitorSessionIds = new Set<string>([sessionId])
    const { data: sessionData } = await supabase
      .from('sessions')
      .select('visitor_id')
      .eq('id', sessionId)
      .maybeSingle()

    if (sessionData?.visitor_id) {
      const { data: vSessions } = await supabase
        .from('sessions')
        .select('id')
        .eq('visitor_id', sessionData.visitor_id)

      if (vSessions?.length) {
        vSessions.forEach((s) => visitorSessionIds.add(s.id))
      }
    }

    // Fetch all messages for this room ordered oldest first
    const { data: rawMessages, error } = await supabase
      .from('messages')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[GET /api/messages/list]', error.message)
      return Response.json({ error: 'Failed to fetch messages' }, { status: 500 })
    }

    const messages = (rawMessages ?? []).map((m) => ({
      ...m,
      is_own: visitorSessionIds.has(m.sender_session_id),
    }))

    // Fire-and-forget lazy cleanup — doesn't block the response
    cleanupExpiredMedia(supabase)

    return Response.json({ messages })
  } catch (err) {
    console.error('[GET /api/messages/list]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
