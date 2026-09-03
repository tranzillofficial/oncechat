import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const supabase = createAdminClient()
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
    if (paths.length) await supabase.storage.from('chat-media').remove(paths)

    await supabase.from('messages').update({ storage_path: null })
      .in('id', expired.map((m) => m.id))

    return Response.json({ deleted: expired.length })
  } catch (err) {
    console.error('[GET /api/media/delete-expired]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
