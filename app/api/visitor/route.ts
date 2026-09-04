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
    const body = await req.json().catch(() => ({}))
    const fingerprint = body.fingerprint as string | undefined
    const deviceInfo = body.deviceInfo as string | undefined

    const supabase  = createAdminClient()
    const ipHash    = await hashIp(getIp(req))
    const userAgent = req.headers.get('user-agent') || null
    const now       = new Date().toISOString()

    // Smart identification: Match visitor by IP Hash (standard DB column)
    const { data: existingVisitor } = await supabase
      .from('visitors')
      .select('id')
      .eq('ip_hash', ipHash)
      .maybeSingle()

    let visitorId: string
    if (existingVisitor) {
      // Update last_seen and user_agent
      const updateData: Record<string, unknown> = {
        last_seen: now,
        user_agent: userAgent,
      }
      if (fingerprint) updateData.fingerprint = fingerprint
      if (deviceInfo) updateData.device_info = deviceInfo

      await (async () => {
        try {
          await supabase.from('visitors').update(updateData).eq('id', existingVisitor.id)
        } catch {
          // ignore if fingerprint column is missing
        }
      })()
      visitorId = existingVisitor.id
    } else {
      const insertData: Record<string, unknown> = {
        ip_hash: ipHash,
        user_agent: userAgent,
      }
      if (fingerprint) insertData.fingerprint = fingerprint
      if (deviceInfo) insertData.device_info = deviceInfo

      const { data: nv, error: insertErr } = await supabase
        .from('visitors')
        .insert(insertData as any)
        .select('id')
        .single()

      if (insertErr || !nv) {
        // Fallback without extra columns in case DB columns are missing
        const { data: fallbackNv, error: fallbackErr } = await supabase
          .from('visitors')
          .insert({ ip_hash: ipHash, user_agent: userAgent })
          .select('id')
          .single()

        if (fallbackErr || !fallbackNv) {
          const { data: rv } = await supabase.from('visitors').select('id').eq('ip_hash', ipHash).maybeSingle()
          if (!rv) {
            return Response.json({ error: `Failed to create visitor: ${insertErr?.message || 'Database error'}` }, { status: 500 })
          }
          visitorId = rv.id
        } else {
          visitorId = fallbackNv.id
        }
      } else {
        visitorId = nv.id
      }
    }

    const existingSessionId = body.sessionId as string | undefined

    if (existingSessionId) {
      const { data: existingSess } = await supabase
        .from('sessions')
        .select('id, visitor_id')
        .eq('id', existingSessionId)
        .maybeSingle()

      if (existingSess && existingSess.visitor_id === visitorId) {
        await supabase.from('sessions').update({ last_seen: now, is_active: true }).eq('id', existingSessionId)
        return Response.json({ sessionId: existingSess.id, visitorId })
      }
    }

    // Create new session if no existing session was matched
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
