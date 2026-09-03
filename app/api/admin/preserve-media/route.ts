import { NextRequest } from 'next/server'
import { createAdminClient, createAnonServerClient } from '@/lib/supabase/server'

/**
 * Admin-only endpoint.
 * POST { messageId, preserve: true|false }
 *   preserve=true  → sets admin_preserved=true, clears expires_at (never deleted)
 *   preserve=false → restores expires_at to 48 h from now, clears admin_preserved
 */
export async function POST(req: NextRequest) {
  try {
    // Verify the caller is an authenticated Supabase admin user via the Authorization header
    const authHeader = req.headers.get('authorization') ?? ''
    const token = authHeader.replace('Bearer ', '')
    if (!token) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const anonClient = createAnonServerClient()
    const { data: { user }, error: authErr } = await anonClient.auth.getUser(token)
    if (authErr || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Confirm the user is in the admins table — PK is user_id (no email column)
    const adminClient = createAdminClient()
    const { data: admin } = await adminClient
      .from('admins')
      .select('user_id')
      .eq('user_id', user.id)
      .single()

    if (!admin) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const { messageId, preserve } = body as { messageId: string; preserve: boolean }

    if (!messageId || typeof preserve !== 'boolean') {
      return Response.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (preserve) {
      // Preserve: clear expiry so media is never auto-deleted
      await adminClient
        .from('messages')
        .update({ admin_preserved: true, expires_at: null })
        .eq('id', messageId)
    } else {
      // Un-preserve: reset to 48 h from now
      const newExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
      await adminClient
        .from('messages')
        .update({ admin_preserved: false, expires_at: newExpiry })
        .eq('id', messageId)
    }

    return Response.json({ success: true })
  } catch (err) {
    console.error('[POST /api/admin/preserve-media]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
