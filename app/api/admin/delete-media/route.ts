import { NextRequest } from 'next/server'
import { createAdminClient, createAnonServerClient } from '@/lib/supabase/server'

/**
 * Admin-only endpoint.
 * POST { messageId }
 * Deletes the storage object and nulls storage_path on the message row.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') ?? ''
    const token = authHeader.replace('Bearer ', '').trim()
    if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const anonClient = createAnonServerClient()
    const { data: { user }, error: authErr } = await anonClient.auth.getUser(token)
    if (authErr || !user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const adminClient = createAdminClient()
    const { data: admin } = await adminClient
      .from('admins').select('user_id').eq('user_id', user.id).single()
    if (!admin) return Response.json({ error: 'Forbidden' }, { status: 403 })

    const { messageId } = await req.json() as { messageId: string }
    if (!messageId) return Response.json({ error: 'Missing messageId' }, { status: 400 })

    // Fetch current storage_path
    const { data: msg } = await adminClient
      .from('messages').select('id, storage_path').eq('id', messageId).maybeSingle()
    if (!msg) return Response.json({ error: 'Message not found' }, { status: 404 })

    // Delete from storage bucket if a path exists
    if (msg.storage_path) {
      const { error: storageErr } = await adminClient.storage
        .from('chat-media').remove([msg.storage_path])
      if (storageErr) console.error('[delete-media storage]', storageErr.message)
    }

    // Null out the path and clear expiry so cron doesn't try again
    await adminClient.from('messages').update({
      storage_path: null,
      expires_at: null,
      admin_preserved: false,
    }).eq('id', messageId)

    return Response.json({ success: true })
  } catch (err) {
    console.error('[POST /api/admin/delete-media]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
