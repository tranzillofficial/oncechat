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
// Listens for PrintScreen, Windows Snipping Tool (Win+Shift+S), and Cmd+Shift+3/4.
function useScreenshotProtection(active: boolean) {
  const [blurred, setBlurred] = useState(false)

  useEffect(() => {
    if (!active) return

    function triggerBlur() {
      setBlurred(true)
    }

    function onKeyDown(e: KeyboardEvent) {
      // PrintScreen key
      if (e.key === 'PrintScreen' || e.code === 'PrintScreen') {
        triggerBlur()
      }
      // Windows Snipping Tool: Win + Shift + S
      if (e.shiftKey && (e.key === 'S' || e.key === 's') && (e.metaKey || e.ctrlKey)) {
        triggerBlur()
      }
      // Mac Screenshot: Cmd + Shift + 3/4/5
      if (e.metaKey && e.shiftKey && ['3', '4', '5'].includes(e.key)) {
        triggerBlur()
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.key === 'PrintScreen' || e.code === 'PrintScreen') {
        triggerBlur()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
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
function ProtectedImage({
  src,
  width,
  height,
  className,
  onClick,
  blurred,
}: {
  src: string
  width: number
  height: number
  className?: string
  onClick?: () => void
  blurred: boolean
}) {
  return (
    <div
      className="relative cursor-pointer"
      onClick={onClick}
      style={{
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
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
          filter: blurred ? 'blur(20px) brightness(0.25)' : 'none',
          transition: 'filter 0.15s',
          pointerEvents: 'none',
          WebkitTouchCallout: 'none' as 'none',
        }}
        onContextMenu={(e) => e.preventDefault()}
      />
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
    // eslint-disable-next-line jsx-a11y/media-has-caption
    return <audio controls src={signedUrl!} className="max-w-[200px] h-8" />
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
              className="rounded-xl object-cover max-w-[240px] max-h-[180px]"
              onClick={() => setLightboxOpen(true)}
              blurred={blurred}
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
          className="rounded-xl object-cover max-w-[240px] max-h-[180px]"
          onClick={() => setLightboxOpen(true)}
          blurred={blurred || (oneTimeView && isOwn)}
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
