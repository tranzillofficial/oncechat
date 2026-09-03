'use client'

import { useState, useRef, useCallback } from 'react'

interface VoiceRecorderProps {
  onRecorded: (blob: Blob, mimeType: string) => void
  disabled?: boolean
}

export default function VoiceRecorder({ onRecorded, disabled = false }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const mimeTypeRef = useRef<string>('audio/webm')

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : 'audio/ogg'

      mimeTypeRef.current = mimeType
      const recorder = new MediaRecorder(stream, { mimeType })
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        const type = mimeTypeRef.current
        const blob = new Blob(chunksRef.current, { type })
        onRecorded(blob, type)
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop())
          streamRef.current = null
        }
        setSeconds(0)
      }

      recorder.start(100)
      mediaRecorderRef.current = recorder
      setIsRecording(true)

      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
    } catch {
      alert('Microphone access denied or not available.')
    }
  }, [onRecorded])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current = null
      setIsRecording(false)
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [isRecording])

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.onstop = null // Don't trigger onRecorded
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setIsRecording(false)
    setSeconds(0)
    chunksRef.current = []
  }, [])

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  if (isRecording) {
    return (
      <div className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/30 px-2.5 py-1.5 rounded-xl">
        <button
          type="button"
          onClick={cancelRecording}
          className="p-1 rounded-lg hover:bg-red-500/20 text-red-400"
          aria-label="Cancel recording"
          title="Cancel recording"
        >
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <span className="flex items-center gap-1 text-xs font-medium text-red-500 animate-pulse px-1 select-none">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          {formatTime(seconds)}
        </span>

        <button
          type="button"
          onClick={stopRecording}
          className="p-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
          aria-label="Send voice note"
          title="Send voice note"
        >
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={startRecording}
      disabled={disabled}
      className="p-2 rounded-xl transition-colors disabled:opacity-40"
      style={{ color: 'var(--text-secondary)' }}
      aria-label="Record voice note"
      title="Record voice note"
    >
      <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"
        viewBox="0 0 24 24" aria-hidden="true">
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 10a7 7 0 0 0 14 0M12 19v3M9 22h6" strokeLinecap="round" />
      </svg>
    </button>
  )
}
