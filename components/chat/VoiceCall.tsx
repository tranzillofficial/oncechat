'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

// ── Types ─────────────────────────────────────────────────────────────────────
type CallState = 'idle' | 'calling' | 'ringing' | 'connected'

interface Props {
  roomId: string
  sessionId: string
  username: string
  otherUsername: string | null
  otherOnline: boolean
}

// ── Config ────────────────────────────────────────────────────────────────────
const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]
const RING_TIMEOUT_MS = 30_000

// ── Component ─────────────────────────────────────────────────────────────────
export default function VoiceCall({ roomId, sessionId, username, otherUsername, otherOnline }: Props) {
  const supabase = createClient()

  // ── State ──────────────────────────────────────────────────────────────────
  const [callState, setCallState] = useState<CallState>('idle')
  const [muted,     setMuted]     = useState(false)
  const [duration,  setDuration]  = useState(0)
  const [micError,  setMicError]  = useState<string | null>(null)
  const [rejected,  setRejected]  = useState(false)   // flash "Call declined" briefly

  // ── Refs (stable across renders, safe to use inside callbacks) ─────────────
  const callStateRef  = useRef<CallState>('idle')
  const channelRef    = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const pcRef         = useRef<RTCPeerConnection | null>(null)
  const localRef      = useRef<MediaStream | null>(null)
  const remoteAudio   = useRef<HTMLAudioElement | null>(null)
  const pendingOffer  = useRef<RTCSessionDescriptionInit | null>(null)
  const pendingIces   = useRef<RTCIceCandidateInit[]>([])
  const ringTimer     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const durTimer      = useRef<ReturnType<typeof setInterval> | null>(null)
  // Stable fn refs — let channel-effect callbacks always call the latest version
  const closePCRef    = useRef<() => void>(() => {})
  const setStateRef   = useRef<(s: CallState) => void>(() => {})

  // ── Helpers ───────────────────────────────────────────────────────────────
  /** Update both the ref (for use in callbacks) and the React state */
  const setS = useCallback((s: CallState) => {
    callStateRef.current = s
    setCallState(s)
  }, [])

  const stopDur = useCallback(() => {
    if (durTimer.current) { clearInterval(durTimer.current); durTimer.current = null }
    setDuration(0)
  }, [])

  const startDur = useCallback(() => {
    let s = 0
    durTimer.current = setInterval(() => setDuration(++s), 1000)
  }, [])

  /** Tear down the WebRTC peer connection and all associated resources */
  const closePC = useCallback(() => {
    pcRef.current?.close();         pcRef.current     = null
    localRef.current?.getTracks().forEach(t => t.stop()); localRef.current = null
    if (remoteAudio.current) remoteAudio.current.srcObject = null
    if (ringTimer.current)   { clearTimeout(ringTimer.current); ringTimer.current = null }
    pendingIces.current  = []
    pendingOffer.current = null
    stopDur()
    setMuted(false)
    setMicError(null)
  }, [stopDur])

  // Keep stable fn refs always pointing to the latest version
  useEffect(() => { closePCRef.current = closePC }, [closePC])
  useEffect(() => { setStateRef.current = setS },   [setS])

  /** Request microphone access */
  const getMic = useCallback(async (): Promise<MediaStream | null> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      localRef.current = stream
      setMicError(null)
      return stream
    } catch (e: unknown) {
      const err = e as Error
      setMicError(
        err.name === 'NotAllowedError'
          ? 'Microphone blocked — allow access and retry'
          : 'Cannot access microphone'
      )
      return null
    }
  }, [])

  /** Create a configured RTCPeerConnection */
  const makePC = useCallback((): RTCPeerConnection => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })

    // Send ICE candidates to other peer via Supabase broadcast
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        channelRef.current?.send({
          type: 'broadcast', event: 'call-ice',
          payload: { from: sessionId, c: e.candidate.toJSON() },
        })
      }
    }

    // Attach remote audio stream
    pc.ontrack = (e) => {
      if (remoteAudio.current && e.streams[0]) {
        remoteAudio.current.srcObject = e.streams[0]
      }
    }

    // React to connection state changes
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState
      if (s === 'connected') {
        setStateRef.current('connected')
        startDur()
      }
      if (s === 'disconnected' || s === 'failed' || s === 'closed') {
        closePCRef.current()
        setStateRef.current('idle')
      }
    }

    return pc
  }, [sessionId, startDur])

  // ── Actions ───────────────────────────────────────────────────────────────

  /** Caller: initiate an outgoing call */
  const startCall = useCallback(async () => {
    if (!otherOnline || callStateRef.current !== 'idle') return
    const stream = await getMic(); if (!stream) return

    setS('calling')
    const pc = makePC(); pcRef.current = pc
    stream.getTracks().forEach(t => pc.addTrack(t, stream))

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    channelRef.current?.send({
      type: 'broadcast', event: 'call-offer',
      payload: { from: sessionId, name: username, sdp: offer },
    })

    // Auto-cancel if no answer within timeout
    ringTimer.current = setTimeout(() => {
      channelRef.current?.send({ type: 'broadcast', event: 'call-end', payload: { from: sessionId } })
      closePCRef.current()
      setStateRef.current('idle')
    }, RING_TIMEOUT_MS)
  }, [otherOnline, getMic, makePC, setS, sessionId, username])

  /** Callee: accept an incoming call */
  const acceptCall = useCallback(async () => {
    if (!pendingOffer.current) return
    if (ringTimer.current) { clearTimeout(ringTimer.current); ringTimer.current = null }

    const stream = await getMic(); if (!stream) return
    const pc = makePC(); pcRef.current = pc
    stream.getTracks().forEach(t => pc.addTrack(t, stream))

    await pc.setRemoteDescription(new RTCSessionDescription(pendingOffer.current))

    // Drain any ICE candidates that arrived before remote desc was set
    for (const c of pendingIces.current) {
      await pc.addIceCandidate(new RTCIceCandidate(c))
    }
    pendingIces.current = []

    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    channelRef.current?.send({
      type: 'broadcast', event: 'call-answer',
      payload: { from: sessionId, sdp: answer },
    })

    pendingOffer.current = null
    // onconnectionstatechange → 'connected' will trigger startDur
  }, [getMic, makePC, sessionId])

  /** Callee: decline an incoming call */
  const rejectCall = useCallback(() => {
    if (ringTimer.current) { clearTimeout(ringTimer.current); ringTimer.current = null }
    channelRef.current?.send({ type: 'broadcast', event: 'call-reject', payload: { from: sessionId } })
    closePC()
    setS('idle')
  }, [sessionId, closePC, setS])

  /** Either side: end an active or outgoing call */
  const endCall = useCallback(() => {
    channelRef.current?.send({ type: 'broadcast', event: 'call-end', payload: { from: sessionId } })
    closePC()
    setS('idle')
  }, [sessionId, closePC, setS])

  /** Toggle microphone mute */
  const toggleMute = useCallback(() => {
    const track = localRef.current?.getAudioTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    setMuted(!track.enabled)
  }, [])

  // ── Signaling channel ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!roomId || !sessionId) return

    // Create a dedicated channel for WebRTC signaling only
    const ch = supabase.channel(`voice:${roomId}`)
    channelRef.current = ch

    // ── Incoming call ────────────────────────────────────────────────────────
    ch.on('broadcast', { event: 'call-offer' }, ({ payload }) => {
      if (payload.from === sessionId) return             // ignore own echo
      if (callStateRef.current !== 'idle') {
        // Already in a call → auto-reject
        ch.send({ type: 'broadcast', event: 'call-reject', payload: { from: sessionId } })
        return
      }
      pendingOffer.current = payload.sdp
      setStateRef.current('ringing')
      // Auto-decline after timeout
      ringTimer.current = setTimeout(() => {
        ch.send({ type: 'broadcast', event: 'call-reject', payload: { from: sessionId } })
        closePCRef.current()
        setStateRef.current('idle')
      }, RING_TIMEOUT_MS)
    })

    // ── Caller received answer ────────────────────────────────────────────────
    ch.on('broadcast', { event: 'call-answer' }, async ({ payload }) => {
      if (payload.from === sessionId || !pcRef.current) return
      if (ringTimer.current) { clearTimeout(ringTimer.current); ringTimer.current = null }
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.sdp))
      for (const c of pendingIces.current) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(c))
      }
      pendingIces.current = []
    })

    // ── ICE candidate ─────────────────────────────────────────────────────────
    ch.on('broadcast', { event: 'call-ice' }, async ({ payload }) => {
      if (payload.from === sessionId) return
      if (pcRef.current?.remoteDescription) {
        try { await pcRef.current.addIceCandidate(new RTCIceCandidate(payload.c)) } catch { /* ignore */ }
      } else {
        // Buffer until remote description is set
        pendingIces.current.push(payload.c)
      }
    })

    // ── Remote ended call ─────────────────────────────────────────────────────
    ch.on('broadcast', { event: 'call-end' }, ({ payload }) => {
      if (payload.from === sessionId) return
      closePCRef.current()
      setStateRef.current('idle')
    })

    // ── Remote rejected call ──────────────────────────────────────────────────
    ch.on('broadcast', { event: 'call-reject' }, ({ payload }) => {
      if (payload.from === sessionId) return
      closePCRef.current()
      setStateRef.current('idle')
      // Flash "declined" notice to caller
      setRejected(true)
      setTimeout(() => setRejected(false), 3000)
    })

    ch.subscribe()

    return () => {
      ch.unsubscribe()
      channelRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, sessionId])  // stable — refs handle mutable state

  // Create the remote audio element once (can't use JSX <audio> with srcObject)
  useEffect(() => {
    const audio = new Audio()
    audio.autoplay = true
    remoteAudio.current = audio
    return () => { audio.pause() }
  }, [])

  // Full cleanup on unmount
  useEffect(() => () => { closePC() }, [closePC])

  // ── Formatters ────────────────────────────────────────────────────────────
  const fmtDur = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  const initial = (otherUsername ?? '?')[0].toUpperCase()

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Call trigger button (shown in header when idle) ───────────────── */}
      <button
        onClick={callState === 'idle' ? startCall : undefined}
        disabled={callState === 'idle' ? !otherOnline : false}
        title={
          callState !== 'idle'   ? undefined :
          otherOnline            ? `Voice call with ${otherUsername ?? 'user'}` :
                                   'User is offline'
        }
        aria-label="Voice call"
        style={{
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'center',
          width:           '32px',
          height:          '32px',
          borderRadius:    '8px',
          border:          'none',
          cursor:          callState !== 'idle' || !otherOnline ? 'not-allowed' : 'pointer',
          background:
            callState === 'connected' ? 'rgba(16,185,129,0.15)' :
            callState === 'calling'   ? 'rgba(124,58,237,0.15)' :
            callState === 'ringing'   ? 'rgba(239,68,68,0.15)'  :
            'transparent',
          color:
            callState === 'connected' ? '#10b981' :
            callState !== 'idle'      ? '#ef4444' :
            otherOnline               ? '#10b981' :
            'var(--text-secondary)',
          opacity:    callState === 'idle' && !otherOnline ? 0.4 : 1,
          transition: 'background 0.2s, color 0.2s',
        }}
      >
        {callState === 'connected' ? <PhoneActiveIcon /> : <PhoneIcon />}
      </button>

      {/* ── "Call declined" toast ────────────────────────────────────────── */}
      {rejected && (
        <div
          style={{
            position:   'fixed',
            top:        '16px',
            left:       '50%',
            transform:  'translateX(-50%)',
            zIndex:     100,
            background: 'var(--surface)',
            border:     '1px solid rgba(239,68,68,0.4)',
            borderRadius: '10px',
            padding:    '10px 18px',
            fontSize:   '13px',
            color:      '#ef4444',
            boxShadow:  '0 8px 30px rgba(0,0,0,0.4)',
            display:    'flex',
            alignItems: 'center',
            gap:        '8px',
          }}
        >
          <PhoneOffIcon size={14} />
          {otherUsername ?? 'User'} declined the call
        </div>
      )}

      {/* ── Call overlay (calling / ringing / connected) ──────────────────── */}
      {callState !== 'idle' && (
        <div
          style={{
            position:       'fixed',
            inset:          0,
            zIndex:         50,
            display:        'flex',
            alignItems:     'flex-end',
            justifyContent: 'center',
            paddingBottom:  '40px',
            background:     'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(6px)',
          }}
        >
          <div
            style={{
              background:   'var(--surface)',
              border:       '1px solid var(--border)',
              borderRadius: '24px',
              padding:      '32px 28px',
              display:      'flex',
              flexDirection: 'column',
              alignItems:   'center',
              gap:          '20px',
              width:        '280px',
              boxShadow:    '0 24px 80px rgba(0,0,0,0.6)',
            }}
          >
            {/* Avatar */}
            <div
              style={{
                width:          '72px',
                height:         '72px',
                borderRadius:   '50%',
                background:     'var(--accent)',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                fontSize:       '28px',
                fontWeight:     700,
                color:          '#fff',
                boxShadow:
                  callState === 'ringing'
                    ? '0 0 0 8px rgba(124,58,237,0.15), 0 0 0 16px rgba(124,58,237,0.07)'
                    : callState === 'connected'
                    ? '0 0 0 8px rgba(16,185,129,0.2)'
                    : '0 0 0 8px rgba(124,58,237,0.15)',
                transition: 'box-shadow 0.4s ease',
                animation:
                  callState === 'ringing' || callState === 'calling'
                    ? 'vcPulse 1.6s ease-in-out infinite'
                    : 'none',
              }}
            >
              {initial}
            </div>

            {/* Name + status */}
            <div style={{ textAlign: 'center' }}>
              <p style={{ margin: 0, fontWeight: 600, fontSize: '16px', color: 'var(--text-primary)' }}>
                {otherUsername ?? 'Unknown'}
              </p>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                {callState === 'calling'   && 'Ringing…'}
                {callState === 'ringing'   && 'Incoming call'}
                {callState === 'connected' && fmtDur(duration)}
              </p>
            </div>

            {/* Mic error */}
            {micError && (
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--danger)', textAlign: 'center' }}>
                {micError}
              </p>
            )}

            {/* Action buttons */}
            {callState === 'ringing' && (
              <div style={{ display: 'flex', gap: '20px' }}>
                {/* Reject */}
                <CallBtn color="#ef4444" label="Decline" onClick={rejectCall}>
                  <PhoneOffIcon size={22} />
                </CallBtn>
                {/* Accept */}
                <CallBtn color="#10b981" label="Accept" onClick={acceptCall}>
                  <PhoneIcon size={22} />
                </CallBtn>
              </div>
            )}

            {callState === 'calling' && (
              <CallBtn color="#ef4444" label="Cancel" onClick={endCall}>
                <PhoneOffIcon size={22} />
              </CallBtn>
            )}

            {callState === 'connected' && (
              <div style={{ display: 'flex', gap: '20px' }}>
                {/* Mute toggle */}
                <CallBtn
                  color={muted ? '#ef4444' : 'var(--surface-2)'}
                  label={muted ? 'Unmute' : 'Mute'}
                  onClick={toggleMute}
                  border={!muted}
                >
                  {muted ? <MicOffIcon size={22} /> : <MicIcon size={22} />}
                </CallBtn>
                {/* End */}
                <CallBtn color="#ef4444" label="End" onClick={endCall}>
                  <PhoneOffIcon size={22} />
                </CallBtn>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Keyframe animation injected as a style tag */}
      <style>{`
        @keyframes vcPulse {
          0%, 100% { box-shadow: 0 0 0 8px rgba(124,58,237,0.15), 0 0 0 16px rgba(124,58,237,0.07); }
          50%       { box-shadow: 0 0 0 12px rgba(124,58,237,0.2), 0 0 0 24px rgba(124,58,237,0.05); }
        }
      `}</style>
    </>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface CallBtnProps {
  color: string
  label: string
  onClick: () => void
  border?: boolean
  children: React.ReactNode
}

function CallBtn({ color, label, onClick, border = false, children }: CallBtnProps) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{
        width:           '60px',
        height:          '60px',
        borderRadius:    '50%',
        border:          border ? '1px solid var(--border)' : 'none',
        background:      color,
        color:           '#fff',
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        cursor:          'pointer',
        transition:      'transform 0.15s, opacity 0.15s',
        flexShrink:      0,
      }}
      onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
      onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
      onMouseDown={e  => (e.currentTarget.style.transform = 'scale(0.93)')}
      onMouseUp={e    => (e.currentTarget.style.transform = 'scale(1)')}
    >
      {children}
    </button>
  )
}

// ── SVG Icons ─────────────────────────────────────────────────────────────────

function PhoneIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24 11.47 11.47 0 003.58.57 1 1 0 011 1V21a1 1 0 01-1 1A17 17 0 012 5a1 1 0 011-1h3.5a1 1 0 011 1 11.36 11.36 0 00.57 3.58 1 1 0 01-.25 1.01l-2.2 2.2z" />
    </svg>
  )
}

function PhoneActiveIcon() {
  return (
    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.8 19.79 19.79 0 01.07 1.18 2 2 0 012.06 0h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 14.92z" />
      <path d="M23 7l-3-3m0 0L17 7m3-3v6" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

function PhoneOffIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7 2 2 0 011.72 2v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.42 19.42 0 013.43 9.37 19.79 19.79 0 01.36 .75 2 2 0 012.36 0h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.35 7.91" />
      <path d="M1 1l22 22" />
    </svg>
  )
}

function MicIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10a7 7 0 0014 0M12 19v3M8 22h8" />
    </svg>
  )
}

function MicOffIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M1 1l22 22M9 9v3a3 3 0 005.12 2.12M15 9.34V5a3 3 0 00-5.94-.6" />
      <path d="M17 16.95A7 7 0 015 10v-1M12 19v3M8 22h8" />
    </svg>
  )
}
