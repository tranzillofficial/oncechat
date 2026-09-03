import { NextRequest } from 'next/server'
import { createAdminClient, createAnonServerClient } from '@/lib/supabase/server'

/**
 * Admin-only: manually trigger expired media cleanup.
 * Replaces the Vercel cron job for free-plan deployments.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') ?? ''
    const token = authHeader.replace('Bearer ', '').trim()
    if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const anonClient = createAnonServerClient()
    const { data: { user }, error: authErr } = await anonClient.auth.getUser(token)
    if (authErr || !user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createAdminClient()
    const { data: admin } = await supabase
      .from('admins').select('user_id').eq('user_id', user.id).single()
    if (!admin) return Response.json({ error: 'Forbidden' }, { status: 403 })

    const now = new Date().toISOString()

    const { data: expired } = await supabase
      .from('messages')
      .select('id, storage_path')
      .not('storage_path', 'is', null)
      .not('expires_at', 'is', null)
      .eq('admin_preserved', false)
      .lt('expires_at', now)

    if (!expired?.length) return Response.json({ deleted: 0 })

    const paths = expired.map((m) => m.storage_path as string).filter(Boolean)
    if (paths.length) {
      await supabase.storage.from('chat-media').remove(paths)
    }
    await supabase
      .from('messages')
      .update({ storage_path: null })
      .in('id', expired.map((m) => m.id))

    return Response.json({ deleted: expired.length })
  } catch (err) {
    console.error('[POST /api/admin/run-cleanup]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
