import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

/**
 * Server-side Supabase client using the service role key.
 * NEVER import this in client components or expose to the browser.
 * Only use inside API routes (app/api/**\/route.ts) and Server Components.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Missing Supabase server-side environment variables')
  }

  return createSupabaseClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

/**
 * Server-side Supabase client using the anon key (for auth-checked server operations).
 */
export function createAnonServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error('Missing Supabase environment variables')
  }

  return createSupabaseClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

/**
 * Resolves a room_member for the given sessionId + roomId.
 *
 * Strategy:
 *  1. Direct lookup by session_id (fast path — matches 99% of the time)
 *  2. Fallback: look up all sessions belonging to the same visitor and search
 *     room_members by any of those session_ids.
 *  3. If found via fallback, heal the mismatch by updating room_members.session_id
 *     to the current sessionId so future requests hit the fast path.
 *
 * This fixes the "not a member" error that occurs when the session_id stored
 * in the browser (sessionStorage) drifts from the one saved in room_members
 * (e.g., after mobile browser restarts, IP change, or repeated visitor API calls).
 */
export async function resolveMember(
  supabase: SupabaseClient,
  sessionId: string,
  roomId: string,
): Promise<{ id: string; is_active: boolean } | null> {
  // ── Fast path ────────────────────────────────────────────────────────────
  const { data: direct } = await supabase
    .from('room_members')
    .select('id, is_active')
    .eq('session_id', sessionId)
    .eq('room_id', roomId)
    .maybeSingle()
  if (direct) return direct

  // ── Fallback: visitor-based lookup ───────────────────────────────────────
  const { data: sess } = await supabase
    .from('sessions')
    .select('visitor_id')
    .eq('id', sessionId)
    .maybeSingle()
  if (!sess?.visitor_id) return null

  const { data: vSessions } = await supabase
    .from('sessions')
    .select('id')
    .eq('visitor_id', sess.visitor_id)
  if (!vSessions?.length) return null

  const vIds = vSessions.map((s) => s.id)
  const { data: vMember } = await supabase
    .from('room_members')
    .select('id, is_active')
    .in('session_id', vIds)
    .eq('room_id', roomId)
    .maybeSingle()
  if (!vMember) return null

  // Heal the session_id mismatch so next request hits the fast path
  await supabase
    .from('room_members')
    .update({ session_id: sessionId, is_active: true, left_at: null })
    .eq('id', vMember.id)

  return { id: vMember.id, is_active: true }
}
