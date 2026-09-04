'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'

interface MediaMessageProps {
  messageId: string
  storagePath: string | null
  messageType: 'image' | 'voice'
  sessionId: string
  isOwn: boolean
  oneTimeView?: boolean
  viewedAt?: string | null
  expiresAt?: string | null
  adminView?: boolean
}

const OTV_SECONDS = 30

// ─── Screenshot protection hook ───────────────────────────────────────────
// Detects PrintScreen, Win snipping tool, Mac shortcuts, AND visibilitychange
// (triggered on Android when the system screenshot overlay appears).
function useScreenshotProtection(active: boolean) {
  const [blurred, setBlurred] = useState(false)

  useEffect(() => {
    if (!active) return

    function triggerBlur() {
      setBlurred(true)
    }

    function onKeyDown(e: KeyboardEvent) {
      // PrintScreen key
      if (e.key === 'PrintScreen' || e.code === 'PrintScreen') triggerBlur()
      // Windows Snipping Tool: Win+Shift+S or Ctrl+Shift+S
      if (e.shiftKey && (e.key === 'S' || e.key === 's') && (e.metaKey || e.ctrlKey)) triggerBlur()
      // Mac Screenshot: Cmd+Shift+3/4/5
      if (e.metaKey && e.shiftKey && ['3', '4', '5'].includes(e.key)) triggerBlur()
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.key === 'PrintScreen' || e.code === 'PrintScreen') triggerBlur()
    }

    // On Android, taking a screenshot triggers a brief visibility loss
    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') triggerBlur()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [active])

  // Auto-clear blur after 3 s
  useEffect(() => {
    if (!blurred) return
    const t = setTimeout(() => setBlurred(false), 3000)
    return () => clearTimeout(t)
  }, [blurred])

  return blurred
}

// ─── Lightbox ─────────────────────────────────────────────────────────────
function Lightbox({
  src,
  onClose,
  protected: isProtected,
}: {
  src: string
  onClose: () => void
  protected: boolean
}) {
  const blurred = useScreenshotProtection(isProtected)

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.9)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
    >
      {/* Close button */}
      <button
        className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full text-white z-10"
        style={{ background: 'rgba(255,255,255,0.15)' }}
        onClick={onClose}
        aria-label="Close"
      >
        ✕
      </button>

      {/* Image container — stop propagation so clicking image doesn't close */}
      <div
        className="relative max-w-[92vw] max-h-[88vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
        style={{
          // CSS screenshot protection: prevent selection and long-press save on mobile
          userSelect: 'none',
          WebkitUserSelect: 'none',
          pointerEvents: blurred ? 'none' : 'auto',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt="Full size"
          className="rounded-xl object-contain max-w-[92vw] max-h-[88vh]"
          style={{
            filter: blurred ? 'blur(30px) brightness(0.2)' : 'none',
            transition: 'filter 0.15s',
            // Prevent right-click save / long-press save on iOS
            WebkitTouchCallout: 'none',
            pointerEvents: 'none', // disables right-click and long-press entirely
          }}
          draggable={false}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>
    </div>
  )
}

// ─── Protected image thumbnail ────────────────────────────────────────────
// • Starts blurred by default (screenshot deterrent)
// • Reveals on press-and-hold (pointerdown → pointerup/leave)
// • A transparent overlay blocks right-click save and iOS long-press save
function ProtectedImage({
  src,
  width,
  height,
  className,
  onClick,
  screenshotBlurred,   // blurred due to detected screenshot attempt
  forceBlur,           // always blurred (e.g. OTV during screenshot)
}: {
  src: string
  width: number
  height: number
  className?: string
  onClick?: () => void
  screenshotBlurred: boolean
  forceBlur?: boolean
}) {
  // Image starts hidden; user must press-and-hold to view
  const [revealed, setRevealed] = useState(false)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function onPointerDown() {
    holdTimer.current = setTimeout(() => setRevealed(true), 120)
  }
  function onPointerUp() {
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null }
  }
  function onPointerLeave() {
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null }
    setRevealed(false)
  }

  const isBlurred = forceBlur || screenshotBlurred || !revealed

  return (
    <div
      className="relative"
      style={{ userSelect: 'none', WebkitUserSelect: 'none', cursor: 'pointer' }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onClick={onClick}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Image
        src={src}
        alt="Shared image"
        width={width}
        height={height}
        className={className}
        unoptimized
        draggable={false}
        style={{
          filter: isBlurred ? 'blur(18px) brightness(0.2)' : 'none',
          transition: 'filter 0.2s ease',
          pointerEvents: 'none',
          WebkitTouchCallout: 'none' as 'none',
          display: 'block',
        }}
        onContextMenu={(e) => e.preventDefault()}
      />
      {/* Transparent overlay — blocks right-click, long-press save, and drag on all platforms */}
      <div
        style={{
          position: 'absolute', inset: 0,
          background: 'transparent',
          WebkitTouchCallout: 'none',
          userSelect: 'none',
        } as React.CSSProperties}
        onContextMenu={(e) => e.preventDefault()}
        aria-hidden="true"
      />
      {/* "Hold to view" hint shown while blurred */}
      {isBlurred && !forceBlur && (
        <div
          style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: '4px',
            pointerEvents: 'none',
          }}
        >
          <svg width="20" height="20" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M18 11V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v5m0 0a6 6 0 0 0 12 0m-12 0H4m14 0h2" strokeLinecap="round"/>
            <circle cx="12" cy="17" r="4"/>
          </svg>
          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>Hold to view</span>
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────
export default function MediaMessage({
  messageId,
  storagePath,
  messageType,
  sessionId,
  isOwn,
  oneTimeView = false,
  viewedAt = null,
  expiresAt: _expiresAt,   // kept in props for future use but not shown to users
  adminView = false,
}: MediaMessageProps) {
  const [signedUrl,    setSignedUrl]    = useState<string | null>(null)
  const [loadState,    setLoadState]    = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [lightboxOpen, setLightboxOpen] = useState(false)

  // OTV state
  const [otvRevealed,    setOtvRevealed]    = useState(false)
  const [otvSecondsLeft, setOtvSecondsLeft] = useState(OTV_SECONDS)
  const [otvExpired,     setOtvExpired]     = useState(false)
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const didMarkViewed = useRef(false)

  // Screenshot protection — active whenever the image is visible
  const protectionActive = loadState === 'ready' && !otvExpired
  const blurred = useScreenshotProtection(protectionActive)

  const isExpiredMedia = !storagePath

  // If already viewed before this render, calculate remaining OTV time
  useEffect(() => {
    if (!oneTimeView || isOwn || adminView) return
    if (viewedAt) {
      const elapsed = Math.floor((Date.now() - new Date(viewedAt).getTime()) / 1000)
      if (elapsed >= OTV_SECONDS) {
        setOtvExpired(true)
      } else {
        setOtvRevealed(true)
        setOtvSecondsLeft(OTV_SECONDS - elapsed)
      }
    }
  }, [oneTimeView, isOwn, adminView, viewedAt])

  // OTV countdown
  useEffect(() => {
    if (!otvRevealed || otvExpired) return
    timerRef.current = setInterval(() => {
      setOtvSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timerRef.current!)
          setOtvExpired(true)
          setSignedUrl(null)
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [otvRevealed, otvExpired])

  const fetchSignedUrl = useCallback(async () => {
    if (!storagePath || loadState === 'loading' || loadState === 'ready') return
    setLoadState('loading')
    try {
      const res  = await fetch('/api/media/signed-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: [storagePath], sessionId }),
      })
      const data = await res.json()
      const url  = data.urls?.[storagePath] ?? null
      if (!url) throw new Error('No URL')
      setSignedUrl(url)
      setLoadState('ready')
    } catch {
      setLoadState('error')
    }
  }, [storagePath, sessionId, loadState])

  // Auto-fetch signed URL if image is not a recipient OTV image
  useEffect(() => {
    const isRecipientOtv = oneTimeView && !isOwn && !adminView
    if (!isRecipientOtv && storagePath && loadState === 'idle') {
      fetchSignedUrl()
    }
  }, [oneTimeView, isOwn, adminView, storagePath, loadState, fetchSignedUrl])

  async function handleOtvReveal() {
    if (!didMarkViewed.current && !isOwn) {
      didMarkViewed.current = true
      await fetch('/api/media/mark-viewed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, sessionId }),
      })
    }
    setOtvRevealed(true)
    setOtvSecondsLeft(OTV_SECONDS)
    await fetchSignedUrl()
  }

  // ─── Expired / deleted ────────────────────────────────────────────────
  if (isExpiredMedia) {
    return (
      <span className="text-xs italic" style={{ color: 'var(--text-secondary)' }}>
        {messageType === 'image' ? '🖼 Image expired' : '🎙 Voice note expired'}
      </span>
    )
  }

  // ─── Voice notes ──────────────────────────────────────────────────────
  if (messageType === 'voice') {
    if (loadState === 'idle') {
      return (
        <button
          onClick={fetchSignedUrl}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium"
          style={{ background: 'rgba(124,58,237,0.2)', color: 'var(--accent-light)' }}
          aria-label="Play voice note"
        >
          <MicIcon /> Play voice note
        </button>
      )
    }
    if (loadState === 'loading')
      return <span className="text-xs animate-pulse" style={{ color: 'var(--text-secondary)' }}>Loading…</span>
    if (loadState === 'error')
      return <span className="text-xs" style={{ color: 'var(--danger)' }}>Failed to load audio</span>
    return <CustomAudioPlayer src={signedUrl!} isOwn={isOwn} />
  }

  // ─── Images ───────────────────────────────────────────────────────────

  // OTV: already expired
  if (oneTimeView && !isOwn && !adminView && otvExpired) {
    return (
      <span className="text-xs italic" style={{ color: 'var(--text-secondary)' }}>
        🔥 Image expired (one-time view)
      </span>
    )
  }

  // OTV: not yet revealed
  if (oneTimeView && !isOwn && !adminView && !otvRevealed) {
    return (
      <button
        onClick={handleOtvReveal}
        className="flex flex-col items-center justify-center gap-1 w-36 h-24 rounded-xl text-xs font-medium"
        style={{
          background: 'rgba(124,58,237,0.15)',
          color: 'var(--accent-light)',
          border: '1px solid rgba(124,58,237,0.3)',
        }}
        aria-label="Tap to view image (one-time, 30 seconds)"
      >
        <EyeIcon />
        <span>Tap to view</span>
        <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Visible for 30 s</span>
      </button>
    )
  }

  // OTV: revealed & counting down
  if (oneTimeView && !isOwn && !adminView && otvRevealed && !otvExpired) {
    return (
      <>
        <div className="relative">
          {loadState !== 'ready' ? (
            <div className="w-36 h-24 rounded-xl flex items-center justify-center animate-pulse"
              style={{ background: 'var(--surface-2)' }}>
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Loading…</span>
            </div>
          ) : (
            <ProtectedImage
              src={signedUrl!}
              width={240}
              height={180}
              className="rounded-xl object-cover w-full max-w-[210px] max-h-[160px]"
              onClick={() => setLightboxOpen(true)}
              screenshotBlurred={blurred}
              forceBlur={false}
            />
          )}
          {/* Countdown overlay */}
          <div
            className="absolute top-1 right-1 flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-bold"
            style={{ background: 'rgba(0,0,0,0.65)', color: '#fff', pointerEvents: 'none' }}
            aria-live="polite"
            aria-label={`${otvSecondsLeft} seconds remaining`}
          >
            {otvSecondsLeft}
          </div>
        </div>

        {lightboxOpen && signedUrl && (
          <Lightbox src={signedUrl} onClose={() => setLightboxOpen(false)} protected />
        )}
      </>
    )
  }

  // Normal image (sender view, admin view, non-OTV)
  if (loadState === 'idle') {
    return (
      <button
        onClick={fetchSignedUrl}
        className="flex items-center justify-center w-36 h-24 rounded-xl text-xs font-medium"
        style={{
          background: 'rgba(124,58,237,0.15)',
          color: 'var(--accent-light)',
          border: '1px solid rgba(124,58,237,0.3)',
        }}
        aria-label="Load image"
      >
        <ImagePlaceholderIcon />
      </button>
    )
  }
  if (loadState === 'loading') {
    return (
      <div className="w-36 h-24 rounded-xl flex items-center justify-center animate-pulse"
        style={{ background: 'var(--surface-2)' }}>
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Loading…</span>
      </div>
    )
  }
  if (loadState === 'error') {
    return <span className="text-xs" style={{ color: 'var(--danger)' }}>Failed to load image</span>
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        {oneTimeView && isOwn && (
          <span className="text-[10px] font-medium" style={{ color: 'var(--accent-light)' }}>🔥 One-time view</span>
        )}
        {/* Click opens lightbox — no external tab link */}
        <ProtectedImage
          src={signedUrl!}
          width={240}
          height={180}
          className="rounded-xl object-cover w-full max-w-[210px] max-h-[160px]"
          onClick={() => setLightboxOpen(true)}
          screenshotBlurred={blurred}
          forceBlur={oneTimeView && isOwn}
        />
      </div>

      {lightboxOpen && signedUrl && (
        <Lightbox src={signedUrl} onClose={() => setLightboxOpen(false)} protected={!adminView} />
      )}
    </>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────
function MicIcon() {
  return (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"
      viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0M12 19v3M9 22h6" strokeLinecap="round" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5"
      viewBox="0 0 24 24" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function ImagePlaceholderIcon() {
  return (
    <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5"
      viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  )
}

function CustomAudioPlayer({ src, isOwn }: { src: string; isOwn: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    function onLoadedMetadata() {
      if (audio) setDuration(audio.duration || 0)
    }
    function onTimeUpdate() {
      if (audio) setCurrentTime(audio.currentTime || 0)
    }
    function onEnded() {
      setIsPlaying(false)
      setCurrentTime(0)
    }

    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('ended', onEnded)

    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('ended', onEnded)
    }
  }, [src])

  function togglePlay() {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      audioRef.current.play()
      setIsPlaying(true)
    }
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const newTime = parseFloat(e.target.value)
    if (audioRef.current) {
      audioRef.current.currentTime = newTime
      setCurrentTime(newTime)
    }
  }

  function fmtSecs(s: number) {
    if (isNaN(s) || !isFinite(s)) return '0:00'
    const mins = Math.floor(s / 60)
    const secs = Math.floor(s % 60)
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`
  }

  return (
    <div className="flex items-center gap-2 w-full max-w-[200px] py-0.5 overflow-hidden" onContextMenu={(e) => e.preventDefault()}>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        controlsList="nodownload noplaybackrate"
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* Play / Pause button */}
      <button
        type="button"
        onClick={togglePlay}
        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-transform active:scale-95 shadow"
        style={{
          background: isOwn ? '#fff' : 'var(--accent)',
          color: isOwn ? 'var(--accent)' : '#fff',
        }}
        aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
      >
        {isPlaying ? (
          <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24" className="ml-0.5">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      {/* Progress & duration */}
      <div className="flex-1 flex flex-col gap-1 min-w-0">
        <input
          type="range"
          min={0}
          max={duration || 100}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
          className="w-full h-1 rounded-lg appearance-none cursor-pointer bg-white/20 accent-purple-400"
        />
        <div className="flex items-center justify-between text-[10px] opacity-80" style={{ color: 'var(--text-primary)' }}>
          <span>{fmtSecs(currentTime)}</span>
          <span>{fmtSecs(duration)}</span>
        </div>
      </div>
    </div>
  )
}

