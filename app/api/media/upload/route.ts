import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

const ALLOWED_IMAGE = ['image/jpeg','image/png','image/gif','image/webp']
const ALLOWED_VOICE = [
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/ogg',
  'audio/ogg;codecs=opus',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/mp4',
  'audio/aac',
  'audio/x-m4a'
]
const MAX_IMAGE     = 10 * 1024 * 1024
const MAX_VOICE     = 25 * 1024 * 1024
const TTL_MS        = 48 * 60 * 60 * 1000

export async function POST(req: NextRequest) {
  try {
    const fd          = await req.formData()
    const file        = fd.get('file')        as File | null
    const sessionId   = fd.get('sessionId')   as string | null
    const roomId      = fd.get('roomId')      as string | null
    const mediaType   = fd.get('mediaType')   as 'image' | 'voice' | null
    const oneTimeView = fd.get('oneTimeView') === 'true'

    if (!file || !sessionId || !roomId || !mediaType)
      return Response.json({ error: 'Missing required fields' }, { status: 400 })

    const supabase = createAdminClient()

    // Validate active room membership — is_active (boolean column)
    const { data: member } = await supabase.from('room_members')
      .select('id').eq('session_id', sessionId).eq('room_id', roomId).eq('is_active', true).maybeSingle()
    if (!member) return Response.json({ error: 'Not an active member of this room' }, { status: 403 })

    if (mediaType === 'image') {
      if (!ALLOWED_IMAGE.includes(file.type)) return Response.json({ error: 'Invalid image type' }, { status: 400 })
      if (file.size > MAX_IMAGE) return Response.json({ error: 'Image too large (max 10 MB)' }, { status: 400 })
    } else if (mediaType === 'voice') {
      const baseType = file.type.split(';')[0].trim()
      const isAllowed = ALLOWED_VOICE.some((t) => t.split(';')[0].trim() === baseType) || ALLOWED_VOICE.includes(file.type)
      if (!isAllowed) return Response.json({ error: 'Invalid audio type' }, { status: 400 })
      if (file.size > MAX_VOICE) return Response.json({ error: 'Voice note too large (max 25 MB)' }, { status: 400 })
    } else {
      return Response.json({ error: 'Invalid media type' }, { status: 400 })
    }

    const ext         = file.name.split('.').pop() || (mediaType === 'image' ? 'jpg' : 'webm')
    const storagePath = `${roomId}/${mediaType}/${sessionId}-${Date.now()}.${ext}`
    const expiresAt   = new Date(Date.now() + TTL_MS).toISOString()

    const { error: upErr } = await supabase.storage
      .from('chat-media').upload(storagePath, await file.arrayBuffer(), { contentType: file.type, upsert: false })
    if (upErr) {
      console.error('[upload]', upErr.message)
      return Response.json({ error: 'Upload failed' }, { status: 500 })
    }

    return Response.json({ storagePath, expiresAt, oneTimeView: mediaType === 'image' ? oneTimeView : false })
  } catch (err) {
    console.error('[POST /api/media/upload]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
