import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { paths, sessionId } = await req.json()
    if (!paths?.length || !sessionId) return Response.json({ error: 'Missing required fields' }, { status: 400 })

    const supabase = createAdminClient()

    // Validate session unless it's admin
    if (sessionId !== '__admin__') {
      const { data: session } = await supabase.from('sessions').select('id').eq('id', sessionId).maybeSingle()
      if (!session) return Response.json({ error: 'Invalid session' }, { status: 401 })
    }

    const results: Record<string, string | null> = {}
    await Promise.all(paths.map(async (path: string) => {
      const { data, error } = await supabase.storage.from('chat-media').createSignedUrl(path, 3600)
      results[path] = error ? null : (data?.signedUrl ?? null)
    }))

    return Response.json({ urls: results })
  } catch (err) {
    console.error('[POST /api/media/signed-url]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
