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

    // Smart identification: Match visitor by persistent Browser Fingerprint FIRST, then by IP Hash
    let existingVisitor = null

    if (fingerprint) {
      const { data: byFp } = await supabase
        .from('visitors')
        .select('id, fingerprint, device_info')
        .eq('fingerprint', fingerprint)
        .maybeSingle()
      existingVisitor = byFp
    }

    if (!existingVisitor) {
      const { data: byIp } = await supabase
        .from('visitors')
        .select('id, fingerprint, device_info')
        .eq('ip_hash', ipHash)
        .maybeSingle()
      existingVisitor = byIp
    }

    let visitorId: string
    if (existingVisitor) {
      // Update last seen, user agent, and save fingerprint/device_info if newly obtained
      await supabase.from('visitors').update({
        last_seen: now,
        user_agent: userAgent,
        fingerprint: fingerprint || existingVisitor.fingerprint,
        device_info: deviceInfo || existingVisitor.device_info,
      }).eq('id', existingVisitor.id)
      visitorId = existingVisitor.id
    } else {
      const { data: nv, error: insertErr } = await supabase
        .from('visitors')
        .insert({
          ip_hash: ipHash,
          user_agent: userAgent,
          fingerprint: fingerprint || null,
          device_info: deviceInfo || null,
        })
        .select('id')
        .single()

      if (insertErr || !nv) {
        console.error('[visitor insert error]', insertErr?.message, insertErr?.details)
        // Fallback query by fingerprint or ip_hash
        const { data: rv } = await supabase
          .from('visitors')
          .select('id')
          .or(`ip_hash.eq.${ipHash}${fingerprint ? `,fingerprint.eq.${fingerprint}` : ''}`)
          .limit(1)
          .maybeSingle()

        if (!rv) {
          return Response.json({ error: `Failed to create visitor: ${insertErr?.message || 'Database error'}` }, { status: 500 })
        }
        visitorId = rv.id
      } else {
        visitorId = nv.id
      }
    }

    // Create session (table: sessions)
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
