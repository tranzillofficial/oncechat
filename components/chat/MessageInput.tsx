'use client'

import { useState, useRef, KeyboardEvent, ChangeEvent, FormEvent, ClipboardEvent } from 'react'
import VoiceRecorder from './VoiceRecorder'

interface MessageInputProps {
  onSendText: (text: string) => void
  onSendFile: (file: File, oneTimeView: boolean) => void
  onSendVoice: (blob: Blob, mimeType: string) => void
  onTypingStart: () => void
  onTypingStop: () => void
  disabled?: boolean
}

export default function MessageInput({
  onSendText,
  onSendFile,
  onSendVoice,
  onTypingStart,
  onTypingStop,
  disabled = false,
}: MessageInputProps) {
  const [text, setText] = useState('')
  const [oneTimeView, setOneTimeView] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isTypingRef = useRef(false)

  function handleTextChange(e: ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value)
    if (!isTypingRef.current) {
      isTypingRef.current = true
      onTypingStart()
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    typingTimerRef.current = setTimeout(() => {
      isTypingRef.current = false
      onTypingStop()
    }, 1500)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submitText()
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const items = Array.from(e.clipboardData?.items ?? [])
    const imageItem = items.find((item) => item.type.startsWith('image/'))
    if (!imageItem) return
    e.preventDefault()

    const file = imageItem.getAsFile()
    if (!file) return

    const ext = file.type.split('/')[1] || 'png'
    const named = new File([file], `paste-${Date.now()}.${ext}`, { type: file.type })
    setPendingFile(named)
  }

  function submitText() {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSendText(trimmed)
    setText('')
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    isTypingRef.current = false
    onTypingStop()
  }

  function handleFormSubmit(e: FormEvent) {
    e.preventDefault()
    if (pendingFile) {
      onSendFile(pendingFile, oneTimeView)
      setPendingFile(null)
      setOneTimeView(false)
    } else {
      submitText()
    }
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      setPendingFile(file)
    }
    e.target.value = ''
  }

  function cancelPendingFile() {
    setPendingFile(null)
    setOneTimeView(false)
  }

  return (
    <div style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
      {/* Pending file preview + one-time-view option */}
      {pendingFile && (
        <div
          className="flex items-center gap-3 px-3 pt-2.5 pb-1"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <span className="text-xs font-medium truncate flex-1" style={{ color: 'var(--text-secondary)' }}>
            📎 {pendingFile.name}
          </span>

          {/* One-time view toggle */}
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              One-time view
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={oneTimeView}
              onClick={() => setOneTimeView((v) => !v)}
              className="relative w-9 h-5 rounded-full transition-colors flex-shrink-0"
              style={{
                background: oneTimeView ? 'var(--accent)' : 'var(--surface-2)',
                border: '1px solid var(--border)',
              }}
              title="Recipient sees image for 30 seconds only"
            >
              <span
                className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform"
                style={{
                  background: '#fff',
                  transform: oneTimeView ? 'translateX(16px)' : 'translateX(0)',
                }}
              />
            </button>
          </label>

          {/* Cancel */}
          <button
            type="button"
            onClick={cancelPendingFile}
            className="text-xs px-2 py-1 rounded-lg"
            style={{ color: 'var(--danger)' }}
            aria-label="Cancel file attachment"
          >
            ✕
          </button>
        </div>
      )}

      <form onSubmit={handleFormSubmit} className="flex items-end gap-1.5 px-3 py-3">
        {/* Media Icons Group (Left Side) */}
        {!pendingFile && (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {/* Camera input */}
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={disabled}
              className="p-2 rounded-xl transition-colors disabled:opacity-40"
              style={{ color: 'var(--text-secondary)' }}
              aria-label="Take photo"
              title="Take photo"
            >
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"
                viewBox="0 0 24 24" aria-hidden="true">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </button>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              className="hidden"
              aria-hidden="true"
              tabIndex={-1}
            />

            {/* File gallery upload */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              className="p-2 rounded-xl transition-colors disabled:opacity-40"
              style={{ color: 'var(--text-secondary)' }}
              aria-label="Attach image"
              title="Attach image"
            >
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"
                viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="m21 15-5-5L5 21" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={handleFileChange}
              className="hidden"
              aria-hidden="true"
              tabIndex={-1}
            />

            {/* Voice recorder */}
            <VoiceRecorder onRecorded={onSendVoice} disabled={disabled} />
          </div>
        )}

        {/* Text area */}
        <textarea
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={pendingFile ? 'Send image…' : 'Message…'}
          disabled={disabled || !!pendingFile}
          rows={1}
          className="flex-1 resize-none rounded-xl px-3 py-2.5 text-sm outline-none min-h-[40px] max-h-[120px] leading-relaxed disabled:opacity-40"
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
          }}
          aria-label="Type a message"
        />

        {/* Send button (Right Side) */}
        <button
          type="submit"
          disabled={disabled || (!text.trim() && !pendingFile)}
          className="p-2.5 rounded-xl transition-colors disabled:opacity-40 flex-shrink-0"
          style={{
            background: (text.trim() || pendingFile) ? 'var(--accent)' : 'var(--surface-2)',
            color: (text.trim() || pendingFile) ? '#fff' : 'var(--text-secondary)',
          }}
          aria-label="Send message"
          title="Send message"
        >
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"
            viewBox="0 0 24 24" aria-hidden="true">
            <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </form>
    </div>
  )
}
