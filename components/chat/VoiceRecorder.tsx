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

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/ogg'

      const recorder = new MediaRecorder(stream, { mimeType })
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType })
        onRecorded(blob, mimeType)
        stream.getTracks().forEach((t) => t.stop())
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

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  if (isRecording) {
    return (
      <button
        type="button"
        onClick={stopRecording}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium animate-pulse"
        style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.3)' }}
        aria-label="Stop recording"
        title="Stop recording"
      >
        <span className="w-2 h-2 rounded-full" style={{ background: 'var(--danger)' }} />
        {formatTime(seconds)}
      </button>
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
