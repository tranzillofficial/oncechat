import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

async function hashIp(ip: string): Promise<string> {
  const salt = process.env.IP_HASH_SALT || 'oncechat-salt'
  const buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip + salt))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function getIp(req: NextRequest) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip') || '0.0.0.0'
}

export async function POST(req: NextRequest) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY === 'your-service-role-key-here')
    return Response.json({ error: 'Server misconfiguration' }, { status: 503 })

  try {
    const supabase  = createAdminClient()
    const ipHash    = await hashIp(getIp(req))
    const userAgent = req.headers.get('user-agent') || null
    const now       = new Date().toISOString()

    // Find or create visitor (table: visitors)
    const { data: existing } = await supabase
      .from('visitors').select('id').eq('ip_hash', ipHash).maybeSingle()

    let visitorId: string
    if (existing) {
      await supabase.from('visitors').update({ last_seen: now, user_agent: userAgent }).eq('id', existing.id)
      visitorId = existing.id
    } else {
      const { data: nv, error: insertErr } = await supabase
        .from('visitors').insert({ ip_hash: ipHash, user_agent: userAgent }).select('id').single()
      if (insertErr || !nv) {
        // race — try fetch again
        const { data: rv } = await supabase.from('visitors').select('id').eq('ip_hash', ipHash).maybeSingle()
        if (!rv) {
          console.error('[visitor]', insertErr?.message)
          return Response.json({ error: 'Failed to create visitor' }, { status: 500 })
        }
        visitorId = rv.id
      } else {
        visitorId = nv.id
      }
    }

    // Create session (table: sessions, columns: visitor_id, username, is_active)
    const { data: session, error: sErr } = await supabase
      .from('sessions')
      .insert({ visitor_id: visitorId, username: 'anonymous', is_active: true })
      .select('id')
      .single()
    if (sErr || !session) {
      console.error('[session]', sErr?.message)
      return Response.json({ error: 'Failed to create session' }, { status: 500 })
    }

    return Response.json({ sessionId: session.id, visitorId })
  } catch (err) {
    console.error('[POST /api/visitor]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
